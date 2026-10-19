/**
 * MorphController — le seul endroit qui touche aux morph targets du GLB.
 * Il trouve, dans toute la scène chargée, les meshes qui portent des morphs (corps, vêtements, cheveux, yeux…)
 * et applique des valeurs par NOM : un même nom (« body_weight ») déforme le corps ET les vêtements accrochés.
 *
 * Deux stratégies (voir MorphStrategy) :
 *  - 'gpu' : écrit mesh.morphTargetInfluences (three mélange dans le shader) ;
 *  - 'cpu' : copie les deltas une fois, retire les morphs de la géométrie, puis recalcule positions + normales
 *    à chaque changement (quelques dixièmes de milliseconde à 2 ms selon l'avatar).
 */
import * as THREE from 'three';
import type { MorphStrategy, MorphValues } from '../core/types';

type GpuEntry = { mesh: THREE.Mesh; index: Record<string, number> };

type CpuEntry = {
  names: string[];
  basePos: Float32Array;
  baseNrm: Float32Array | null;
  dPos: (Float32Array | null)[];
  dNrm: (Float32Array | null)[];
  outPos: THREE.BufferAttribute;
  outNrm: THREE.BufferAttribute | null;
};

function toArray(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Float32Array {
  const out = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) {
    out[i * 3] = attr.getX(i);
    out[i * 3 + 1] = attr.getY(i);
    out[i * 3 + 2] = attr.getZ(i);
  }
  return out;
}

export class MorphController {
  readonly strategy: MorphStrategy;
  readonly available: string[];
  readonly missing: string[];
  private gpu: GpuEntry[] = [];
  private cpu: CpuEntry[] = [];

  /** `expected` : noms que les drivers de l'avatar vont piloter (pour signaler les manquants). */
  constructor(root: THREE.Object3D, strategy: MorphStrategy, expected: string[]) {
    this.strategy = strategy;
    const found = new Set<string>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // La forme change : on évite que three cache le corps sur une boîte englobante devenue fausse.
      mesh.frustumCulled = false;
      const dict = mesh.morphTargetDictionary;
      if (!dict || !mesh.morphTargetInfluences) return;
      Object.keys(dict).forEach((k) => found.add(k));
      if (strategy === 'gpu') this.gpu.push({ mesh, index: dict });
      else this.cpu.push(this.prepareCpu(mesh, dict));
    });
    this.available = [...found];
    this.missing = [...new Set(expected)].filter((n) => !found.has(n));
  }

  private prepareCpu(mesh: THREE.Mesh, dict: Record<string, number>): CpuEntry {
    const g = mesh.geometry;
    const names = Object.keys(dict).sort((a, b) => dict[a] - dict[b]);
    const basePos = toArray(g.getAttribute('position'));
    const nrm = g.getAttribute('normal');
    const baseNrm = nrm ? toArray(nrm) : null;
    const relative = g.morphTargetsRelative;
    const pick = (list: (THREE.BufferAttribute | THREE.InterleavedBufferAttribute)[] | undefined, base: Float32Array | null, i: number) => {
      const a = list ? list[i] : undefined;
      if (!a || !base) return null;
      const arr = toArray(a);
      if (!relative) for (let k = 0; k < arr.length; k++) arr[k] -= base[k];
      return arr;
    };
    const dPos = names.map((_, i) => pick(g.morphAttributes.position, basePos, i));
    const dNrm = names.map((_, i) => pick(g.morphAttributes.normal, baseNrm, i));
    // Géométrie « plate » que l'on réécrit nous-mêmes : plus aucun morph côté GPU.
    g.morphAttributes = {};
    mesh.morphTargetInfluences = undefined;
    const outPos = new THREE.BufferAttribute(basePos.slice(), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', outPos);
    let outNrm: THREE.BufferAttribute | null = null;
    if (baseNrm) {
      outNrm = new THREE.BufferAttribute(baseNrm.slice(), 3).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('normal', outNrm);
    }
    return { names, basePos, baseNrm, dPos, dNrm, outPos, outNrm };
  }

  apply(values: MorphValues) {
    if (this.strategy === 'gpu') {
      for (const e of this.gpu) {
        const inf = e.mesh.morphTargetInfluences;
        if (!inf) continue;
        for (const name in values) {
          const i = e.index[name];
          if (i !== undefined) inf[i] = values[name];
        }
      }
      return;
    }
    for (const e of this.cpu) {
      const ws = e.names.map((n) => values[n] ?? 0);
      const out = e.outPos.array as Float32Array;
      out.set(e.basePos);
      for (let k = 0; k < ws.length; k++) {
        const d = e.dPos[k];
        const wk = ws[k];
        if (!d || wk === 0) continue;
        for (let i = 0; i < out.length; i++) out[i] += d[i] * wk;
      }
      e.outPos.needsUpdate = true;
      if (e.outNrm && e.baseNrm) {
        const on = e.outNrm.array as Float32Array;
        on.set(e.baseNrm);
        for (let k = 0; k < ws.length; k++) {
          const d = e.dNrm[k];
          const wk = ws[k];
          if (!d || wk === 0) continue;
          for (let i = 0; i < on.length; i++) on[i] += d[i] * wk;
        }
        for (let i = 0; i < on.length; i += 3) {
          const l = Math.hypot(on[i], on[i + 1], on[i + 2]) || 1;
          on[i] /= l;
          on[i + 1] /= l;
          on[i + 2] /= l;
        }
        e.outNrm.needsUpdate = true;
      }
    }
  }

  dispose() {
    this.gpu = [];
    this.cpu = [];
  }
}
