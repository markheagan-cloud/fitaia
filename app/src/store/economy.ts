/**
 * Règles de l'économie FITAIA — pures, testables, sans dépendance React.
 * Monnaie gagnée en jouant : FIT Crédits (earn). Aucune monnaie payante : seuls des cosmétiques se vendent (App Store).
 */

export const RULES = {
  challengeReward: 500,
  challengeBurn: 8,
  mealRewardGood: 300,
  mealRewardBasic: 100,
  mealGoodScore: 70,
  mealsRewardedPerDay: 3,
  streakBonus3: 100,
  streakBonus7: 250,
  chestActiveDays: 5,
  chestReward: 5000,
  proteinGoal: 140,
  carbsGoal: 230,
  fatGoal: 70,
} as const;

export type DayStats = { challenges: number; meals: number; earned: number };
export type LedgerEntry = { id: string; ts: number; amount: number; cur: 'earn'; reason: string };

/** Clé de jour locale YYYY-MM-DD. */
export function dayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Lundi (00:00 local) de la semaine contenant d. */
export function weekStart(d = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // 0 = lundi
  x.setDate(x.getDate() - dow);
  return x;
}

export function weekKey(d = new Date()): string {
  return dayKey(weekStart(d));
}

/** Les 7 clés de jour de la semaine courante, lundi → dimanche. */
export function weekDays(d = new Date()): string[] {
  const start = weekStart(d);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start);
    x.setDate(start.getDate() + i);
    return dayKey(x);
  });
}

export function isActiveDay(s: DayStats | undefined): boolean {
  return !!s && (s.challenges > 0 || s.meals > 0);
}

/** Nombre de jours actifs consécutifs se terminant aujourd'hui (ou hier si aujourd'hui est vide). */
export function streak(history: Record<string, DayStats>, today = new Date()): number {
  let n = 0;
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!isActiveDay(history[dayKey(cursor)])) cursor.setDate(cursor.getDate() - 1);
  while (isActiveDay(history[dayKey(cursor)])) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
    if (n > 3650) break;
  }
  return n;
}

/** Bonus de série appliqué à un défi réussi. */
export function streakBonus(streakDays: number): number {
  if (streakDays >= 7) return RULES.streakBonus7;
  if (streakDays >= 3) return RULES.streakBonus3;
  return 0;
}

export function mealReward(score: number): number {
  return score >= RULES.mealGoodScore ? RULES.mealRewardGood : RULES.mealRewardBasic;
}

/**
 * Score nutritionnel 0–100 d'un repas saisi à la main (heuristique explicable) :
 * part de protéines, densité calorique, excès de lipides.
 */
export function mealScore(kcal: number, p: number, g: number, l: number): number {
  const k = Math.max(kcal, 1);
  const protShare = (p * 4) / k; // part des calories venant des protéines
  const fatShare = (l * 9) / k;
  let score = 45 + protShare * 160; // 25 % de protéines ≈ +40
  if (fatShare > 0.45) score -= (fatShare - 0.45) * 100; // gras très dominant
  if (kcal > 700) score -= (kcal - 700) / 15; // repas très lourd
  if (g > 100) score -= (g - 100) / 4; // beaucoup de glucides
  return Math.max(5, Math.min(98, Math.round(score)));
}

export function activeDaysThisWeek(history: Record<string, DayStats>, d = new Date()): number {
  return weekDays(d).filter((k) => isActiveDay(history[k])).length;
}

/** Saison : 8 semaines à partir du 1er octobre 2026 ; un palier tous les 1 000 FIT Crédits gagnés (50 paliers). */
export const SEASON = { name: 'Saison 1 : Origines', start: '2026-10-01', weeks: 8, tiers: 50, perTier: 1000 } as const;

export function seasonProgress(history: Record<string, DayStats>, today = new Date()) {
  const start = new Date(SEASON.start + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + SEASON.weeks * 7);
  const earned = Object.entries(history)
    .filter(([k]) => k >= SEASON.start)
    .reduce((a, [, d]) => a + d.earned, 0);
  const tier = Math.min(SEASON.tiers, Math.floor(earned / SEASON.perTier));
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86_400_000));
  return { earned, tier, daysLeft, pct: tier / SEASON.tiers, toNext: SEASON.perTier - (earned % SEASON.perTier) };
}
