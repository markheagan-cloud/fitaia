/**
 * BodyShape — les 13 réglages détaillés du corps, CORRÉLÉS entre eux.
 *
 * L'utilisateur (et le moteur) ne pilotent que BodyParameters (poids, ventre, muscle). Ce module en déduit une
 * morphologie cohérente : quand un homme prend du poids, le visage, le cou, le ventre, la taille, les bras et les
 * cuisses évoluent ensemble selon des coefficients réalistes — jamais un gros ventre sur des bras de mannequin.
 * Des ajustements fins restent possibles (overrides), toujours bornés à [0, 1].
 *
 * Valeurs 0 → 1 = quantité de volume ajoutée par rapport au corps de base. Les amincissements (sous l'IMC de base)
 * passent par body_weight_low / muscle_low dans les drivers de l'avatar.
 */
import type { BodyParameters } from '../core/types';

export type BodyShape = {
  bodyFat: number;
  visceralBelly: number;
  waist: number;
  hips: number;
  chest: number;
  shoulders: number;
  upperArm: number;
  forearm: number;
  thigh: number;
  calf: number;
  faceFat: number;
  neckFat: number;
  muscleMass: number;
};

export const BODY_SHAPE_KEYS: readonly (keyof BodyShape)[] = [
  'bodyFat', 'visceralBelly', 'waist', 'hips', 'chest', 'shoulders', 'upperArm', 'forearm', 'thigh', 'calf', 'faceFat', 'neckFat', 'muscleMass',
];

export type Sex = 'm' | 'f';

const c01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * Corrélations (homme). Ordres de grandeur issus de la répartition typique des graisses masculines :
 * tronc et ventre d'abord, puis bras/cuisses, visage et cou plus tard (seuil). Femme : hanches/cuisses plus, ventre moins.
 */
export function shapeFromBody(b: BodyParameters, sex: Sex = 'm'): BodyShape {
  const w = c01(b.weight);
  const belly = c01(b.bellyFat);
  const m = c01(b.muscle);
  const f = sex === 'f';
  return {
    bodyFat: w,
    visceralBelly: c01((f ? 0.4 : 0.55) * belly + (f ? 0.3 : 0.45) * w),
    waist: c01(0.5 * w + 0.5 * belly),
    hips: c01((f ? 1.0 : 0.8) * w),
    chest: c01(0.6 * w + 0.4 * m),
    shoulders: c01(m),
    upperArm: c01(0.75 * w + 0.25 * m),
    forearm: c01(0.6 * w + 0.2 * m),
    thigh: c01((f ? 0.95 : 0.8) * w + 0.15 * m),
    calf: c01(0.6 * w + 0.15 * m),
    faceFat: c01(Math.pow(w, 1.2)),
    neckFat: c01((w - 0.3) / 0.7),
    muscleMass: m,
  };
}

/** Ajustements fins (ex. réglage manuel, futur scan) appliqués par-dessus la corrélation, toujours bornés. */
export function withOverrides(shape: BodyShape, overrides: Partial<BodyShape> = {}): BodyShape {
  const out = { ...shape };
  for (const k of BODY_SHAPE_KEYS) if (overrides[k] !== undefined) out[k] = c01(overrides[k] as number);
  return out;
}
