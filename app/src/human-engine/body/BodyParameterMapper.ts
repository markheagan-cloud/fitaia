/**
 * BodyParameterMapper — deux conversions, pures et testables :
 *  1. UserProfile (sexe, taille, poids, activité) → BodyParameters (0 → 1) : ce que le corps « devrait » montrer ;
 *  2. BodyParameters → MorphWeights : calibration propre à un mesh (un nouveau GLB = une nouvelle table, l'UI ne change pas).
 */
import { shapeFromBody, type BodyShape } from './BodyShape';
import type { Activity, Profile } from '@/store/profile';
import type { BodyParameters, MorphDriver, MorphValues, MorphWeights } from '../core/types';

export const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export const NEUTRAL_BODY: BodyParameters = { weight: 0.3, bellyFat: 0.2, muscle: 0.3 };

/** Muscle de base selon l'activité déclarée (repère visuel, pas une mesure). */
const MUSCLE_BY_ACTIVITY: Record<Activity, number> = {
  sedentaire: 0.15,
  leger: 0.25,
  modere: 0.35,
  actif: 0.5,
  intense: 0.6,
};

/** IMC → masse visuelle : 20 → 0, 38 → 1 (lisible de « mince » à « obésité sévère »). */
const WEIGHT_BMI = { lo: 20, hi: 38 };
/** IMC → ventre : 22 → 0, 36 → 1. */
const BELLY_BMI = { lo: 22, hi: 36 };

export function bmiOf(heightCm: number, kg: number): number {
  const m = heightCm / 100;
  return m > 0 ? kg / (m * m) : 0;
}

/** Corps affiché pour un profil à un poids donné. */
export function bodyFromProfile(p: Pick<Profile, 'sex' | 'heightCm' | 'activity'>, kg: number, opts: { muscleBonus?: number } = {}): BodyParameters {
  const bmi = bmiOf(p.heightCm, kg);
  const weight = clamp01((bmi - WEIGHT_BMI.lo) / (WEIGHT_BMI.hi - WEIGHT_BMI.lo));
  // Répartition moyenne : chez les femmes, une part plus faible de la masse se loge sur le ventre.
  const bellyShare = p.sex === 'f' ? 0.8 : 1;
  const bellyFat = clamp01(((bmi - BELLY_BMI.lo) / (BELLY_BMI.hi - BELLY_BMI.lo)) * bellyShare);
  const muscle = clamp01(MUSCLE_BY_ACTIVITY[p.activity] + (opts.muscleBonus ?? 0));
  return { weight, bellyFat, muscle };
}

/** Corps actuel (dernier poids) et corps objectif (poids cible, un peu plus de muscle : on s'entraîne en maigrissant). */
export function currentAndTarget(p: Profile, currentKg: number): { current: BodyParameters; target: BodyParameters } {
  return {
    current: bodyFromProfile(p, currentKg),
    target: bodyFromProfile(p, p.targetKg, { muscleBonus: 0.05 }),
  };
}

/** Calibration d'un mesh : facteur et décalage par morph (prototype : identité). */
export type MorphCalibration = Record<keyof MorphWeights, { scale: number; offset: number }>;

export const PROTOTYPE_CALIBRATION: MorphCalibration = {
  body_weight: { scale: 1, offset: 0 },
  belly_fat: { scale: 1, offset: 0 },
  muscle: { scale: 1, offset: 0 },
};

export function toMorphWeights(b: BodyParameters, cal: MorphCalibration = PROTOTYPE_CALIBRATION): MorphWeights {
  const f = (v: number, k: keyof MorphWeights) => clamp01(clamp01(v) * cal[k].scale + cal[k].offset);
  return {
    body_weight: f(b.weight, 'body_weight'),
    belly_fat: f(b.bellyFat, 'belly_fat'),
    muscle: f(b.muscle, 'muscle'),
  };
}

export function sanitizeBody(b: Partial<BodyParameters>, base: BodyParameters): BodyParameters {
  return {
    weight: clamp01(b.weight ?? base.weight),
    bellyFat: clamp01(b.bellyFat ?? base.bellyFat),
    muscle: clamp01(b.muscle ?? base.muscle),
  };
}

/** Drivers du prototype : correspondance directe (body_weight ← weight, belly_fat ← bellyFat, muscle ← muscle). */
export const PROTOTYPE_DRIVERS: MorphDriver[] = [
  { morph: 'body_weight', input: 'weight', points: [[0, 0], [1, 1]] },
  { morph: 'belly_fat', input: 'bellyFat', points: [[0, 0], [1, 1]] },
  { morph: 'muscle', input: 'muscle', points: [[0, 0], [1, 1]] },
];

/** Évalue une courbe linéaire par morceaux. */
export function piecewise(points: [number, number][], x: number): number {
  if (!points.length) return 0;
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

/** BodyParameters → poids de morphs pour un avatar donné. Plusieurs drivers sur un même morph s'additionnent. */
export function evaluateDrivers(b: BodyParameters, drivers: MorphDriver[]): MorphValues {
  const out: MorphValues = {};
  // réglages détaillés corrélés calculés seulement si un driver en a besoin
  let shape: BodyShape | null = null;
  for (const d of drivers) {
    let v: number;
    if (d.input === 'weight' || d.input === 'bellyFat' || d.input === 'muscle') v = b[d.input];
    else v = (shape ??= shapeFromBody(b))[d.input];
    out[d.morph] = clamp01((out[d.morph] ?? 0) + piecewise(d.points, clamp01(v)));
  }
  return out;
}
