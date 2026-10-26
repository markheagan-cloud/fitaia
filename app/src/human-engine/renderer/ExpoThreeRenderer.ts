/**
 * ExpoThreeRenderer — three.js sur un contexte expo-gl (iPhone, Android, web), sans dépendance « expo-three ».
 *
 * Rôle : scène, lumières, caméra orbitale, boucle d'images, mesures (FPS, temps de rendu, appels de dessin, mémoire).
 * À chaque image il demande au moteur `update(now)` ; en mode « onDemand », il ne redessine que si quelque chose a changé
 * (corps, caméra) — c'est le mode prévu en production pour économiser la batterie.
 */
import * as THREE from 'three';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Platform } from 'react-native';
import { now, type FitaiaHumanEngine } from '../core/FitaiaHumanEngine';

export type RenderMode = 'continuous' | 'onDemand';

export type RendererOptions = {
  background?: string;
  /** 'clay' : prototype (lumières plates) ; 'studio' : avatar premium (tone mapping filmique, key chaude / fill froide / rim). */
  look?: 'clay' | 'studio';
  mode?: RenderMode;
  /** Fenêtre de mesure des FPS (ms). */
  statsEveryMs?: number;
  /** Respiration idle extrêmement légère (≈ 0,4 % d'amplitude, 4,2 s par cycle). Défaut : oui en look studio. */
  breathe?: boolean;
};

type GL = ExpoWebGLRenderingContext & { canvas?: HTMLCanvasElement };

const TARGET_Y = 0.95;

export class ExpoThreeRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private gl: GL;
  private engine: FitaiaHumanEngine;
  private mode: RenderMode;
  private raf: number | null = null;
  private running = false;
  private viewDirty = true;
  private avatar: THREE.Object3D | null = null;
  private yaw = 0.35;
  private pitch = 0.06;
  private distance = 4.6;
  private target = new THREE.Vector3(0, TARGET_Y, 0);
  // mesures
  private statsEvery: number;
  private windowStart = 0;
  private frames = 0;
  private renderTime = 0;
  private lastFrame = 0;
  private gapSum = 0;
  private breathe: boolean;

  constructor(gl: ExpoWebGLRenderingContext, engine: FitaiaHumanEngine, opts: RendererOptions = {}) {
    this.gl = gl as GL;
    this.engine = engine;
    this.mode = opts.mode ?? 'continuous';
    this.statsEvery = opts.statsEveryMs ?? 500;
    this.breathe = opts.breathe ?? opts.look === 'studio';
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;

    if (Platform.OS !== 'web') {
      // expo-gl n'accepte qu'une partie des paramètres pixelStorei ; three en envoie d'autres (sans effet ici).
      const pixelStorei = gl.pixelStorei.bind(gl);
      gl.pixelStorei = ((pname: number, param: number) => {
        if (pname === gl.UNPACK_FLIP_Y_WEBGL) pixelStorei(pname, param);
      }) as typeof gl.pixelStorei;
    }

    // Web : le vrai <canvas> d'expo-gl. iPhone/Android : un « faux canvas » minimal (three n'en lit que la taille).
    const canvas =
      Platform.OS === 'web' && this.gl.canvas
        ? this.gl.canvas
        : ({
            width: w,
            height: h,
            style: {},
            clientWidth: w,
            clientHeight: h,
            addEventListener: () => {},
            removeEventListener: () => {},
            getContext: () => gl,
        } as unknown as HTMLCanvasElement);

    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGLRenderingContext, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(new THREE.Color(opts.background ?? '#1D1F22'), 1);
    this.renderer.info.autoReset = true;

    this.camera = new THREE.PerspectiveCamera(28, w / Math.max(1, h), 0.05, 50);
    if (opts.look === 'studio') {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.85;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.buildStudio();
    } else this.buildStage();
    this.placeCamera();
  }

  private buildStage() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xffffff, 0x4a4640, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(-1.6, 3.2, 2.6);
    s.add(key);
    const fill = new THREE.DirectionalLight(0xfff3e6, 0.55);
    fill.position.set(2.2, 1.2, 1.8);
    s.add(fill);
    const rim = new THREE.DirectionalLight(0xc8f03c, 0.9);
    rim.position.set(1.4, 2.4, -2.8);
    s.add(rim);
    // Ombre de contact (disque sombre, pas de shadow map : coût nul).
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 40),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.002;
    disc.scale.set(1, 0.7, 1);
    s.add(disc);
  }

  /**
   * Éclairage « studio photo » pour l'avatar premium : grande key chaude 3/4 avant, fill froide douce, deux rims
   * qui détachent la silhouette du fond, ambiance hémisphérique. Pas de shadow map (coût mobile) : ombre de contact.
   */
  private buildStudio() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xf4f1ec, 0x3a3631, 1.35));
    const key = new THREE.DirectionalLight(0xfff1e0, 2.6);
    key.position.set(-1.8, 3.0, 2.8);
    s.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.8);
    fill.position.set(2.4, 1.4, 2.0);
    s.add(fill);
    const rimL = new THREE.DirectionalLight(0xffffff, 1.6);
    rimL.position.set(-2.2, 2.2, -2.4);
    s.add(rimL);
    const rimR = new THREE.DirectionalLight(0xffffff, 0.7);
    rimR.position.set(2.2, 2.0, -2.2);
    s.add(rimR);
    const front = new THREE.DirectionalLight(0xffffff, 0.35);
    front.position.set(0, 1.6, 4);
    s.add(front);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.46, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.002;
    disc.scale.set(1, 0.62, 1);
    s.add(disc);
  }

  setAvatar(root: THREE.Object3D) {
    if (this.avatar) this.scene.remove(this.avatar);
    this.avatar = root;
    this.baseY = root.position.y;
    this.scene.add(root);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    this.target.set(0, box.min.y + size.y * 0.5, 0);
    this.distance = Math.max(2.4, size.y * 2.85);
    this.viewDirty = true;
  }

  // ---------- caméra orbitale (pilotée par les gestes de la vue React) ----------

  orbit(dYaw: number, dPitch: number) {
    this.yaw += dYaw;
    this.pitch = Math.min(0.9, Math.max(-0.35, this.pitch + dPitch));
    this.placeCamera();
  }

  zoom(factor: number) {
    this.distance = Math.min(8, Math.max(1.2, this.distance * factor));
    this.placeCamera();
  }

  resetView() {
    this.yaw = 0.35;
    this.pitch = 0.06;
    if (this.avatar) this.setAvatar(this.avatar);
    this.placeCamera();
  }

  private placeCamera() {
    const c = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + this.distance * c * Math.sin(this.yaw),
      this.target.y + this.distance * Math.sin(this.pitch),
      this.target.z + this.distance * c * Math.cos(this.yaw),
    );
    this.camera.lookAt(this.target);
    this.viewDirty = true;
  }

  // ---------- boucle ----------

  start() {
    if (this.running) return;
    this.running = true;
    this.windowStart = now();
    this.lastFrame = this.windowStart;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  setMode(mode: RenderMode) {
    this.mode = mode;
    this.viewDirty = true;
  }

  private frame = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const t = now();
    const changed = this.engine.update(t);
    const breathing = this.breathe && this.applyBreath(t);
    if (this.mode === 'continuous' || changed || this.viewDirty || breathing) {
      const r0 = now();
      this.renderer.render(this.scene, this.camera);
      this.gl.endFrameEXP?.();
      this.renderTime += now() - r0;
      this.gapSum += t - this.lastFrame;
      this.lastFrame = t;
      this.frames++;
      this.viewDirty = false;
    }
    const elapsed = t - this.windowStart;
    if (elapsed >= this.statsEvery) {
      const info = this.renderer.info;
      this.engine.setRenderStats({
        fps: Math.round((this.frames * 1000) / elapsed),
        frameMs: this.frames ? +(this.gapSum / this.frames).toFixed(1) : 0,
        renderMs: this.frames ? +(this.renderTime / this.frames).toFixed(2) : 0,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      });
      this.windowStart = t;
      this.frames = 0;
      this.renderTime = 0;
      this.gapSum = 0;
    }
  };

  /**
   * Respiration : le buste s'ouvre à peine (largeur/profondeur), le corps monte d'un millimètre.
   * Appliquée à l'objet avatar (pas aux morphs) : le corps choisi par le moteur n'est jamais modifié.
   */
  private applyBreath(t: number): boolean {
    const a = this.avatar;
    if (!a) return false;
    const s = Math.sin((t / 4200) * Math.PI * 2);
    const k = 0.5 + 0.5 * s;
    a.scale.set(1 + 0.0035 * k, 1 + 0.0012 * k, 1 + 0.005 * k);
    a.position.y = this.baseY + 0.001 * k;
    return true;
  }

  private baseY = 0;

  /**
   * Portrait du perso : vue de face légèrement tournée, une image dessinée puis lue dans le tampon GL (PNG).
   * Le point de vue de la personne est rétabli juste après. Sur le téléphone : fichier temporaire (file:) ;
   * sur le web : image en mémoire (data:). Sert à montrer le même avatar personnel sur Accueil, Mon perso, Communauté.
   */
  async snapshot(): Promise<string> {
    const keep = { yaw: this.yaw, pitch: this.pitch, distance: this.distance, scale: this.avatar?.scale.clone(), y: this.avatar?.position.y };
    this.yaw = 0.22;
    this.pitch = 0.04;
    this.distance = Math.max(1.2, keep.distance * 0.8); // corps entier qui remplit le cadre 4:5
    if (this.avatar) {
      this.avatar.scale.set(1, 1, 1);
      this.avatar.position.y = this.baseY;
    }
    this.placeCamera();
    this.engine.update(now());
    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP?.();
    try {
      const shot = await GLView.takeSnapshotAsync(this.gl, { format: 'png' });
      if (!shot.uri) throw new Error('Portrait vide.');
      return await snapshotUri(shot.uri);
    } finally {
      this.yaw = keep.yaw;
      this.pitch = keep.pitch;
      this.distance = keep.distance;
      if (this.avatar && keep.scale) {
        this.avatar.scale.copy(keep.scale);
        this.avatar.position.y = keep.y ?? this.baseY;
      }
      this.placeCamera();
    }
  }

  /**
   * Banc d'essai : dessine `frames` images d'affilée en faisant varier le corps à chaque image, puis attend la fin
   * du travail GPU (lecture d'un pixel). Donne le coût moyen réel d'une image, indépendamment du rythme de l'écran
   * (utile quand l'écran est caché ou bridé, et pour comparer GPU / CPU sur iPhone).
   */
  benchmark(frames = 120): { msPerFrame: number; maxFps: number } {
    const gl = this.gl;
    const px = new Uint8Array(4);
    const start = this.engine.getBody();
    const t0 = now();
    for (let i = 0; i < frames; i++) {
      const k = (i % 60) / 59;
      this.engine.setBody({ weight: k, bellyFat: 1 - k, muscle: 0.5 * k });
      this.engine.update(now());
      this.renderer.render(this.scene, this.camera);
      gl.endFrameEXP?.();
    }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const ms = (now() - t0) / frames;
    this.engine.setBody(start);
    this.viewDirty = true;
    return { msPerFrame: +ms.toFixed(2), maxFps: Math.round(1000 / Math.max(ms, 0.01)) };
  }

  dispose() {
    this.stop();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => mat.dispose());
    });
    this.renderer.dispose();
  }
}

/** expo-gl rend un chemin de fichier sur le téléphone et un Blob sur le web : on normalise en adresse d'image. */
function snapshotUri(uri: string | Blob): Promise<string> {
  if (typeof uri === 'string') return Promise.resolve(uri);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Lecture du portrait impossible.'));
    reader.readAsDataURL(uri);
  });
}
