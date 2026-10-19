/**
 * FitMatch — compatibilité entre deux parcours (0 à 100). Ce n'est pas une application de rencontre :
 * on rapproche des personnes qui vivent un parcours comparable pour s'entraider.
 *
 * Pondération : progression 30, objectif 25, langue 20, disponibilités 10, activités 5, type de soutien 5, fuseau 5.
 * Le niveau utilisé est le MEILLEUR niveau historique : impossible de « redescendre » pour ne rencontrer que des débutants.
 * Le poids, l'IMC, les calories et les mensurations n'entrent jamais dans le calcul.
 */
import { AGE_RANGES, stageOf } from '../../community/models/types';
import type { CommunityProfile, FitMatchCandidate, ReasonCode } from '../../community/models/types';

export const WEIGHTS = {
  progression: 30,
  goal: 25,
  language: 20,
  availability: 10,
  activity: 5,
  support: 5,
  timezone: 5,
} as const;

/** Écart d'âge toléré (années, entre milieux de tranches). */
export const AGE_TOLERANCE = 5;

/** « Actif maintenant » : vu dans les 15 dernières minutes. */
export const ACTIVE_MS = 15 * 60 * 1000;

function jaccard<T>(a: T[], b: T[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  let inter = 0;
  for (const x of new Set(b)) if (sa.has(x)) inter++;
  return inter / (sa.size + new Set(b).size - inter);
}

function ageMid(p: CommunityProfile): number {
  return AGE_RANGES.find((a) => a.id === p.ageRange)?.mid ?? 30;
}

/** Niveau de référence : meilleur niveau atteint (protection contre la descente volontaire). */
export function referencePoints(p: CommunityProfile): number {
  return Math.max(p.points, p.highestHistoricalPoints);
}

export function ageCompatible(a: CommunityProfile, b: CommunityProfile): boolean {
  return Math.abs(ageMid(a) - ageMid(b)) <= AGE_TOLERANCE + 2.5; // tranches de 5 à 9 ans : tolérance au milieu de tranche
}

/** Proximité de progression : même étape = 1 ; une étape d'écart = 0,5 ; au-delà = 0. Affinée par les points. */
export function progressionSimilarity(a: CommunityProfile, b: CommunityProfile): number {
  const pa = referencePoints(a);
  const pb = referencePoints(b);
  const sa = stageOf(pa).id;
  const sb = stageOf(pb).id;
  const d = Math.abs(sa - sb);
  if (d >= 2) return 0;
  const ratio = Math.min(pa, pb) / Math.max(pa, pb, 1);
  return d === 0 ? 0.7 + 0.3 * ratio : 0.5 * ratio + 0.15;
}

export type MatchResult = { score: number; reasons: ReasonCode[]; eligible: boolean };

/** Critères du score, dans l'ordre de leur poids. Chaque facteur vaut de 0 à 1. */
export type CriterionKey = keyof typeof WEIGHTS;
export const CRITERIA: CriterionKey[] = ['progression', 'goal', 'language', 'availability', 'activity', 'support', 'timezone'];

/** Facteurs bruts (0 à 1) : source unique du score, de ses raisons et de son explication. */
export function factors(me: CommunityProfile, other: CommunityProfile): Record<CriterionKey, number> {
  const dtz = Math.abs(me.utcOffset - other.utcOffset);
  return {
    progression: progressionSimilarity(me, other),
    goal: me.goalCategory === other.goalCategory ? 1 : 0,
    language: me.language === other.language ? 1 : 0,
    availability: jaccard(me.slots, other.slots),
    activity: jaccard(me.activities, other.activities),
    support: jaccard(me.support, other.support),
    timezone: dtz <= 1 ? 1 : dtz <= 3 ? 0.5 : 0,
  };
}

export function compatibility(me: CommunityProfile, other: CommunityProfile, now = Date.now()): MatchResult {
  const reasons: ReasonCode[] = [];
  const eligible =
    other.userId !== me.userId &&
    other.privacy.profileVisible &&
    other.privacy.allowFitMatch &&
    me.privacy.allowFitMatch &&
    ageCompatible(me, other);

  const f = factors(me, other);
  if (f.progression >= 0.7) reasons.push('meme_niveau');
  if (f.goal) reasons.push('meme_objectif');
  if (f.language) reasons.push('meme_langue');
  if (f.availability >= 0.5) reasons.push('memes_horaires');
  if (f.activity > 0) reasons.push('meme_activite');
  if (f.support > 0) reasons.push('meme_soutien');
  if (f.timezone === 1) reasons.push('meme_fuseau');
  if (now - other.lastActiveAt < ACTIVE_MS) reasons.push('actif_maintenant');

  const score = CRITERIA.reduce((a, k) => a + WEIGHTS[k] * f[k], 0);
  return { score: Math.round(Math.max(0, Math.min(100, score))), reasons, eligible };
}

// ---------------------------------------------------------------------------------------------------------------
// Explication du score (« Pourquoi 94 % ? ») : mêmes facteurs que le score, arrondis pour que la somme des points
// affichés soit EXACTEMENT le pourcentage affiché (méthode du plus grand reste).
// ---------------------------------------------------------------------------------------------------------------

export const CRITERION_LABELS: Record<CriterionKey, string> = {
  progression: 'Étape de parcours',
  goal: 'Objectif',
  language: 'Langue',
  availability: 'Moments dispo',
  activity: 'Activités',
  support: 'Soutien recherché',
  timezone: 'Fuseau horaire',
};

export type BreakdownPart = { key: CriterionKey; label: string; points: number; max: number; ratio: number };
export type Breakdown = { score: number; parts: BreakdownPart[] };

export function compatibilityBreakdown(me: CommunityProfile, other: CommunityProfile): Breakdown {
  const f = factors(me, other);
  const raw = CRITERIA.map((k) => ({ k, v: WEIGHTS[k] * Math.max(0, Math.min(1, f[k])) }));
  const total = raw.reduce((a, r) => a + r.v, 0);
  const score = Math.round(Math.max(0, Math.min(100, total)));
  const points = raw.map((r) => Math.floor(r.v + 1e-9));
  let rest = score - points.reduce((a, b) => a + b, 0);
  // reste distribué aux plus grandes parties fractionnaires (à égalité : le critère le plus lourd d'abord)
  const order = raw
    .map((r, i) => ({ i, frac: r.v - points[i] }))
    .filter((x) => x.frac > 1e-9)
    .sort((a, b) => b.frac - a.frac || WEIGHTS[raw[b.i].k] - WEIGHTS[raw[a.i].k]);
  for (const o of order) {
    if (rest <= 0) break;
    points[o.i] += 1;
    rest -= 1;
  }
  return {
    score,
    parts: raw.map((r, i) => ({ key: r.k, label: CRITERION_LABELS[r.k], points: points[i], max: WEIGHTS[r.k], ratio: f[r.k] })),
  };
}

const SUMMARY_BITS: Record<CriterionKey, string> = {
  progression: 'vous en êtes à la même étape',
  goal: 'vous visez la même chose',
  language: 'vous parlez la même langue',
  availability: 'vous êtes dispo aux mêmes moments',
  activity: 'vous aimez les mêmes activités',
  support: 'vous cherchez le même soutien',
  timezone: 'vous vivez sur le même fuseau',
};

const GAP_BITS: Record<CriterionKey, string> = {
  progression: 'vos étapes de parcours',
  goal: 'vos objectifs',
  language: 'la langue',
  availability: 'vos moments dispo',
  activity: 'vos activités',
  support: 'le soutien que vous cherchez',
  timezone: 'le fuseau horaire',
};

function joinFr(bits: string[]): string {
  if (bits.length <= 1) return bits.join('');
  return bits.slice(0, -1).join(', ') + ' et ' + bits[bits.length - 1];
}

/** Explication simple, sans chiffres : les trois critères les plus forts, puis ce qui vous sépare le plus. */
export function breakdownSummary(b: Breakdown): { strong: string; gap: string | null } {
  const strong = b.parts
    .filter((p) => p.ratio >= 0.7)
    .sort((x, y) => y.points - x.points)
    .slice(0, 3)
    .map((p) => SUMMARY_BITS[p.key]);
  // un critère déjà fort (même étape, par exemple) n'est jamais présenté comme « ce qui sépare »
  const missing = b.parts
    .map((p) => ({ p, lost: p.max - p.points }))
    .filter((x) => x.lost >= 3 && x.p.ratio < 0.7)
    .sort((x, y) => y.lost - x.lost)[0];
  const s = strong.length ? joinFr(strong) + '.' : 'vous avez encore peu de points communs.';
  return {
    strong: s.charAt(0).toUpperCase() + s.slice(1),
    gap: missing ? 'Ce qui vous sépare le plus : ' + GAP_BITS[missing.p.key] + '.' : null,
  };
}

const SLOT_REASON: Record<string, string> = {
  soir: 'Souvent en ligne le soir',
  matin: 'Souvent là le matin',
  midi: 'Souvent là le midi',
  nuit: 'En ligne aussi la nuit',
};
const ACTIVITY_REASON: Record<string, string> = {
  marche: 'Aime aussi la marche',
  course: 'Court aussi',
  salle: 'Va aussi à la salle',
  maison: 'S’entraîne aussi à la maison',
  velo: 'Fait aussi du vélo',
  natation: 'Nage aussi',
  collectif: 'Aime aussi le sport collectif',
};

/**
 * Raisons humaines (4 au maximum), dans l'ordre d'importance, toutes issues des mêmes facteurs que le score.
 */
export function humanReasons(me: CommunityProfile, other: CommunityProfile, now = Date.now(), max = 4): string[] {
  const f = factors(me, other);
  const out: string[] = [];
  if (f.goal) out.push('Même objectif');
  if (f.availability >= 0.5) out.push('Même rythme');
  if (f.progression >= 0.7) out.push('Niveau proche du tien');
  const slot = other.slots.find((s) => me.slots.includes(s));
  if (slot && SLOT_REASON[slot]) out.push(SLOT_REASON[slot]);
  const act = other.activities.find((a) => me.activities.includes(a));
  if (act && ACTIVITY_REASON[act]) out.push(ACTIVITY_REASON[act]);
  if (f.support > 0) out.push('Cherche le même soutien');
  if (now - other.lastActiveAt < ACTIVE_MS) out.push('En ligne maintenant');
  if (f.language) out.push('Parle ta langue');
  return out.slice(0, max);
}

/** Une phrase humaine qui résume le rapprochement. */
export function humanSentence(me: CommunityProfile, other: CommunityProfile): string {
  const f = factors(me, other);
  const prog = f.progression >= 0.7;
  if (prog && f.goal) return 'Vous êtes tous les deux dans une phase similaire de votre parcours.';
  if (f.goal) return 'Vous visez la même chose, chacun à son étape.';
  if (prog) return 'Vous en êtes au même point, avec des objectifs différents.';
  if (f.availability >= 0.5) return 'Vous êtes souvent dispo aux mêmes moments.';
  return 'Vous avez quelques points communs pour vous motiver.';
}

export const REASON_LABELS: Record<ReasonCode, string> = {
  meme_niveau: 'Même étape de parcours',
  meme_objectif: 'Même objectif général',
  meme_langue: 'Même langue',
  memes_horaires: 'Mêmes moments dispo',
  meme_activite: 'Une activité en commun',
  meme_soutien: 'Cherche le même soutien',
  meme_fuseau: 'Même fuseau horaire',
  actif_maintenant: 'Connecté maintenant',
};

/**
 * Suggestions : profils éligibles, hors personnes bloquées (dans les deux sens), déjà amies ou déjà passées,
 * triés par compatibilité puis activité récente.
 */
export function suggest(
  me: CommunityProfile,
  pool: CommunityProfile[],
  exclude: Set<string>,
  now = Date.now(),
  limit = 10,
): FitMatchCandidate[] {
  return pool
    .filter((p) => !exclude.has(p.userId))
    .map((p) => ({ p, r: compatibility(me, p, now) }))
    .filter(({ r }) => r.eligible && r.score >= 35)
    .sort((x, y) => y.r.score - x.r.score || y.p.lastActiveAt - x.p.lastActiveAt)
    .slice(0, limit)
    .map(({ p, r }) => ({ userId: p.userId, compatibilityScore: r.score, reasonCodes: r.reasons, generatedAt: now }));
}
