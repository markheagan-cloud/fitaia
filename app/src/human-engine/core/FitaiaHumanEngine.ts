/**
 * FitaiaHumanEngine — la façade unique. Les écrans parlent au moteur, jamais aux morphs :
 *
 *   fitaiaHumanEngine.setBody({ weight: 0.65, bellyFat: 0.45, muscle: 0.30 });
 *   await fitaiaHumanEngine.animateTo({ weight: 0.30, bellyFat: 0.20, muscle: 0.35 }, { durationMs: 1600 });
 *
 * Couches : Identity (qui) · Face (visage) · Body (corps) · Animation (transitions) · Renderer (three.js / expo-gl).
 * Le moteur ne dépend ni de React ni du rendu : le renderer appelle update(now) à chaque image et lit l'état.
 */
import type * as THREE from 'three';
import { MorphAnimator } from '../animation/MorphAnimator';
import { BodyEngine } from '../body/BodyEngine';
import { NEUTRAL_BODY, PROTOTYPE_DRIVERS, sanitizeBody, toMorphWeights } from '../body/BodyParameterMapper';
import { MorphController } from '../body/MorphController';
import { FaceEngine } from '../face/FaceEngine';
import { IdentityEngine } from '../identity/IdentityEngine';
import type { AnimateOptions, BodyParameters, EngineSnapshot, LoadState, MeshStats, MorphDriver, MorphStrategy, RenderStats } from './types';

type Listener = (s: EngineSnapshot) => void;

export const DEFAULT_ANIMATION_MS = 1600;

export class FitaiaHumanEngine {
  readonly identity = new IdentityEngine();
  readonly face = new FaceEngine();
  readonly body = new BodyEngine();
  private animator = new MorphAnimator();
  private pending: ((completed: boolean) => void) | null = null;
  private listeners = new Set<Listener>();
  private load: LoadState = { status: 'idle' };
  private mesh: MeshStats | null = null;
  private render: RenderStats | null = null;
  private strategy: MorphStrategy = 'gpu';
  private dirty = true;

  // ---------- avatar ----------

  /**
   * Branche un avatar chargé (scène GLB) avec ses drivers (BodyParameters → morphs de CE mesh).
   * Retourne les stats, dont les morphs attendus mais absents du fichier.
   */
  attachAvatar(
    root: THREE.Object3D,
    strategy: MorphStrategy,
    stats: Omit<MeshStats, 'morphTargets' | 'missingMorphs'>,
    drivers: MorphDriver[] = PROTOTYPE_DRIVERS,
  ): MeshStats {
    this.body.detach();
    const controller = new MorphController(root, strategy, drivers.map((d) => d.morph));
    this.strategy = strategy;
    this.body.attach(controller, drivers);
    this.mesh = { ...stats, morphTargets: controller.available, missingMorphs: controller.missing };
    this.dirty = true;
    this.emit();
    return this.mesh;
  }

  detachAvatar() {
    this.cancelAnimation();
    this.body.detach();
    this.mesh = null;
    this.render = null;
    this.load = { status: 'idle' };
    this.emit();
  }

  setLoadState(load: LoadState) {
    this.load = load;
    this.emit();
  }

  setRenderStats(stats: RenderStats) {
    this.render = stats;
    this.emit();
  }

  // ---------- corps ----------

  /** Change le corps immédiatement (annule une animation en cours). */
  setBody(p: Partial<BodyParameters>) {
    this.cancelAnimation();
    this.body.set(p);
    this.dirty = true;
    this.emit();
  }

  /**
   * Anime le corps jusqu'à `target`. Résout `true` à l'arrivée, `false` si une autre action l'interrompt.
   * Le départ est le corps affiché à cet instant (ou `opts.from`).
   */
  animateTo(target: Partial<BodyParameters>, opts: AnimateOptions = {}): Promise<boolean> {
    this.cancelAnimation();
    const current = this.body.get();
    const from = sanitizeBody(opts.from ?? {}, current);
    const to = sanitizeBody(target, current);
    const duration = opts.durationMs ?? DEFAULT_ANIMATION_MS;
    if (opts.from) this.body.set(from);
    return new Promise<boolean>((resolve) => {
      this.pending = resolve;
      this.animator.start(from, to, now(), duration);
      this.dirty = true;
      this.emit();
    });
  }

  cancelAnimation() {
    if (!this.animator.active) return;
    this.animator.cancel();
    const p = this.pending;
    this.pending = null;
    p?.(false);
  }

  /** Appelé par le renderer à chaque image. Retourne true si l'image doit être redessinée. */
  update(t: number = now()): boolean {
    const step = this.animator.step(t);
    if (step) {
      this.body.set(step.value);
      this.dirty = true;
      if (step.done) {
        const p = this.pending;
        this.pending = null;
        p?.(true);
      }
      this.emit();
    }
    const d = this.dirty;
    this.dirty = false;
    return d;
  }

  // ---------- état ----------

  getBody(): BodyParameters {
    return this.body.get();
  }

  snapshot(): EngineSnapshot {
    return {
      body: this.body.get(),
      morphs: this.body.morphs(),
      animating: this.animator.active,
      strategy: this.strategy,
      load: this.load,
      mesh: this.mesh,
      render: this.render,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    if (!this.listeners.size) return;
    const s = this.snapshot();
    this.listeners.forEach((l) => l(s));
  }
}

export function now(): number {
  const p = (globalThis as { performance?: { now?: () => number } }).performance;
  return p?.now ? p.now() : Date.now();
}

/** Instance partagée par l'app. */
export const fitaiaHumanEngine = new FitaiaHumanEngine();

export { NEUTRAL_BODY, toMorphWeights };
