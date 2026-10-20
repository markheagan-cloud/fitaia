/**
 * AvatarLoader — charge un GLB (fichier du projet, URL ou octets) et mesure ce qu'il coûte.
 *
 * Textures : sur le web, three.js décode les images embarquées. Sur iPhone/Android (expo-gl n'a pas de décodeur
 * d'images pour three), les images sont retirées du GLB avant parsing, décodées en JavaScript (jpeg-js, UPNG — MIT)
 * puis envoyées comme DataTexture RGBA : c'est la voie d'upload WebGL standard, supportée partout.
 *
 * Changer d'avatar = changer la définition passée à la vue (voir src/human-engine/avatars et docs/HUMAN-ENGINE.md).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import type { MeshStats } from '../core/types';
import * as jpeg from 'jpeg-js';
import UPNG from 'upng-js';
import { installThreePolyfills } from './polyfills';

/**
 * Un `require('…glb')` (numéro d'asset sur iPhone/Android, URL texte ou objet sur le web), une URL, ou des octets.
 */
export type AvatarSource = number | string | { uri: string } | { default: string } | ArrayBuffer;

type BytesFile = { bytes?: () => Promise<Uint8Array> };

async function fetchBytes(uri: string): Promise<ArrayBuffer> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error('GLB introuvable (' + res.status + ')');
  return res.arrayBuffer();
}

async function readUri(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS !== 'web' && uri.startsWith('file:')) {
    try {
      const f = new File(uri) as unknown as BytesFile;
      if (typeof f.bytes === 'function') {
        const b = await f.bytes();
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      }
    } catch {
      // repli ci-dessous
    }
  }
  return fetchBytes(uri);
}

export async function readAvatarBytes(source: AvatarSource): Promise<ArrayBuffer> {
  if (source instanceof ArrayBuffer) return source;
  // GLB personnel enregistré sur le téléphone (file://) ou servi par le serveur FITAIA (https://)
  if (typeof source === 'string') return readUri(source);
  if (typeof source === 'object') return readUri('uri' in source ? source.uri : source.default);
  const asset = Asset.fromModule(source);
  if (Platform.OS === 'web') return fetchBytes(asset.uri);
  await asset.downloadAsync();
  return readUri(asset.localUri ?? asset.uri);
}

export function measureScene(root: THREE.Object3D): Omit<MeshStats, 'morphTargets' | 'missingMorphs'> {
  let vertices = 0;
  let triangles = 0;
  let meshes = 0;
  let geometryBytes = 0;
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    const pos = g.getAttribute('position');
    vertices += pos ? pos.count : 0;
    triangles += g.index ? g.index.count / 3 : pos ? pos.count / 3 : 0;
    const attrs = [...Object.values(g.attributes), ...(g.index ? [g.index] : [])];
    Object.values(g.morphAttributes).forEach((list) => attrs.push(...list));
    for (const a of attrs) {
      const arr = (a as THREE.BufferAttribute).array as ArrayLike<number> & { byteLength?: number };
      geometryBytes += arr && typeof arr.byteLength === 'number' ? arr.byteLength : 0;
    }
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      materials.add(mat);
      for (const v of Object.values(mat as unknown as Record<string, unknown>)) {
        if (v && (v as THREE.Texture).isTexture) textures.add(v as THREE.Texture);
      }
    }
  });
  return { vertices, triangles: Math.round(triangles), meshes, materials: materials.size, textures: textures.size, geometryBytes };
}

export type LoadedAvatar = {
  scene: THREE.Group;
  bytes: number;
  ms: number;
  /** Temps de décodage des textures sur iPhone/Android (0 sur le web). */
  textureMs: number;
  stats: Omit<MeshStats, 'morphTargets' | 'missingMorphs'>;
};

// ---------- GLB : lecture / réécriture minimale (pour retirer les images sur mobile) ----------

type GltfJson = {
  images?: { bufferView?: number; mimeType?: string; extras?: { width?: number; height?: number } }[];
  textures?: { source?: number }[];
  samplers?: unknown[];
  materials?: {
    name?: string;
    pbrMetallicRoughness?: { baseColorTexture?: { index: number } };
    normalTexture?: { index: number; scale?: number };
    extras?: { fallbackColor?: number[] };
  }[];
  bufferViews: { byteOffset?: number; byteLength: number }[];
};

function readGlb(buf: ArrayBuffer): { json: GltfJson; bin: Uint8Array } {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('Fichier GLB invalide');
  const jsonLen = dv.getUint32(12, true);
  const jsonBytes = new Uint8Array(buf, 20, jsonLen);
  installThreePolyfills();
  const text = new TextDecoder().decode(jsonBytes);
  const binStart = 20 + jsonLen + 8;
  const binLen = dv.getUint32(20 + jsonLen, true);
  return { json: JSON.parse(text) as GltfJson, bin: new Uint8Array(buf, binStart, binLen) };
}

function writeGlb(json: GltfJson, bin: Uint8Array): ArrayBuffer {
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const enc: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      c = 0x10000 + ((c - 0xd800) << 10) + (text.charCodeAt(++i) - 0xdc00);
    }
    if (c < 0x80) enc.push(c);
    else if (c < 0x800) enc.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) enc.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else enc.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  while (enc.length % 4) enc.push(0x20);
  const total = 12 + 8 + enc.length + 8 + bin.byteLength;
  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, enc.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(out, 20, enc.length).set(enc);
  dv.setUint32(20 + enc.length, bin.byteLength, true);
  dv.setUint32(24 + enc.length, 0x004e4942, true);
  new Uint8Array(out, 28 + enc.length, bin.byteLength).set(bin);
  return out;
}

type Decoded = { width: number; height: number; data: Uint8Array<ArrayBuffer> };

function decodeImage(bytes: Uint8Array, mime: string | undefined): Decoded {
  if (mime === 'image/png' || (bytes[0] === 0x89 && bytes[1] === 0x50)) {
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const img = UPNG.decode(ab);
    return { width: img.width, height: img.height, data: new Uint8Array(UPNG.toRGBA8(img)[0]) as Uint8Array<ArrayBuffer> };
  }
  const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
  return { width: img.width, height: img.height, data: new Uint8Array(img.data.buffer as ArrayBuffer, img.data.byteOffset, img.data.byteLength) };
}

function makeTexture(d: Decoded, srgb: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.flipY = false; // convention glTF
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Mobile : retire les images du GLB (three ne sait pas les décoder sous expo-gl), les décode en JS
 * et renvoie, par nom de matière, les textures à brancher après parsing.
 */
function extractTextures(buf: ArrayBuffer): { glb: ArrayBuffer; byMaterial: Map<string, { map?: THREE.DataTexture; normalMap?: THREE.DataTexture; normalScale?: number }> } {
  const { json, bin } = readGlb(buf);
  const byMaterial = new Map<string, { map?: THREE.DataTexture; normalMap?: THREE.DataTexture; normalScale?: number }>();
  if (!json.images?.length || !json.textures?.length) return { glb: buf, byMaterial };
  const cache = new Map<number, Decoded>();
  const texture = (index: number): Decoded | null => {
    const src = json.textures?.[index]?.source;
    if (src === undefined) return null;
    if (!cache.has(src)) {
      const img = json.images?.[src];
      const bv = img && img.bufferView !== undefined ? json.bufferViews[img.bufferView] : null;
      if (!img || !bv) return null;
      cache.set(src, decodeImage(bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength), img.mimeType));
    }
    return cache.get(src) ?? null;
  };
  for (const m of json.materials ?? []) {
    const name = m.name ?? '';
    const slot: { map?: THREE.DataTexture; normalMap?: THREE.DataTexture; normalScale?: number } = {};
    const base = m.pbrMetallicRoughness?.baseColorTexture?.index;
    if (base !== undefined) {
      const d = texture(base);
      if (d) slot.map = makeTexture(d, true);
      delete m.pbrMetallicRoughness?.baseColorTexture;
    }
    if (m.normalTexture) {
      const d = texture(m.normalTexture.index);
      if (d) {
        slot.normalMap = makeTexture(d, false);
        slot.normalScale = m.normalTexture.scale ?? 1;
      }
      delete m.normalTexture;
    }
    byMaterial.set(name, slot);
  }
  delete json.images;
  delete json.textures;
  delete json.samplers;
  return { glb: writeGlb(json, bin), byMaterial };
}

export async function loadAvatar(source: AvatarSource): Promise<LoadedAvatar> {
  installThreePolyfills();
  const t0 = Date.now();
  const data = await readAvatarBytes(source);
  let glb = data;
  let byMaterial: ReturnType<typeof extractTextures>['byMaterial'] | null = null;
  let textureMs = 0;
  if (Platform.OS !== 'web') {
    const t1 = Date.now();
    const r = extractTextures(data);
    glb = r.glb;
    byMaterial = r.byMaterial;
    textureMs = Date.now() - t1;
  }
  const gltf = await new GLTFLoader().parseAsync(glb, '');
  const scene = gltf.scene;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (!mat || !mat.isMeshStandardMaterial) return;
    mat.metalness = 0;
    if (byMaterial) {
      const slot = byMaterial.get(mat.name);
      if (slot?.map) mat.map = slot.map;
      if (slot?.normalMap) {
        mat.normalMap = slot.normalMap;
        mat.normalScale.set(slot.normalScale ?? 1, slot.normalScale ?? 1);
      }
      mat.needsUpdate = true;
    }
    // Alpha découpé (cheveux, yeux) : bords plus doux avec le MSAA quand il est disponible.
    if (mat.alphaTest > 0) mat.alphaToCoverage = true;
    // Transparents (sourcils, cils) : jamais d'écriture de profondeur, dessinés après le reste.
    if (mat.transparent) {
      mat.depthWrite = false;
      m.renderOrder = 2;
    }
  });
  return { scene, bytes: data.byteLength, ms: Date.now() - t0, textureMs, stats: measureScene(scene) };
}
