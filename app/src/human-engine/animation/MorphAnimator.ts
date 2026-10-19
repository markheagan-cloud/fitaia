/**
 * MorphAnimator — interpolation fluide entre deux corps. Pur (aucune dépendance), piloté par l'horloge du rendu :
 * le moteur appelle step(now) à chaque image. Une nouvelle animation repart de l'état affiché (pas de saut).
 */
import type { BodyParameters } from '../core/types';

export type Easing = (t: number) => number;

/** Accélère puis ralentit : naturel pour un « avant → après ». */
export const easeInOutCubic: Easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function mixBody(a: BodyParameters, b: BodyParameters, t: number): BodyParameters {
  return { weight: lerp(a.weight, b.weight, t), bellyFat: lerp(a.bellyFat, b.bellyFat, t), muscle: lerp(a.muscle, b.muscle, t) };
}

export class MorphAnimator {
  private from: BodyParameters | null = null;
  private to: BodyParameters | null = null;
  private startAt = 0;
  private duration = 0;
  private easing: Easing = easeInOutCubic;

  get active(): boolean {
    return this.to !== null;
  }

  start(from: BodyParameters, to: BodyParameters, now: number, durationMs: number, easing: Easing = easeInOutCubic) {
    this.from = { ...from };
    this.to = { ...to };
    this.startAt = now;
    this.duration = Math.max(0, durationMs);
    this.easing = easing;
  }

  /** Valeur à l'instant `now` ; `done` passe à true une seule fois, à la dernière image. */
  step(now: number): { value: BodyParameters; done: boolean } | null {
    if (!this.from || !this.to) return null;
    const t = this.duration === 0 ? 1 : Math.min(1, Math.max(0, (now - this.startAt) / this.duration));
    const value = mixBody(this.from, this.to, this.easing(t));
    if (t >= 1) {
      this.from = this.to = null;
      return { value, done: true };
    }
    return { value, done: false };
  }

  cancel() {
    this.from = this.to = null;
  }
}
