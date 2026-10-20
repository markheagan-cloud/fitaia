/**
 * Moteur de profil FITAIA — pur, testable : besoins caloriques, paliers de poids, niveaux et stats.
 * Formules : Mifflin-St Jeor (métabolisme de base), facteur d'activité, déficit selon le rythme choisi.
 */
import type { DayStats } from './economy';

export type Sex = 'f' | 'm' | 'x';
export type Activity = 'sedentaire' | 'leger' | 'modere' | 'actif' | 'intense';
export type Pace = 'doux' | 'normal' | 'rapide';

export type Profile = {
  sex: Sex;
  age: number;
  heightCm: number;
  startKg: number; // poids de départ (premier enregistrement)
  targetKg: number;
  activity: Activity;
  pace: Pace;
  autoGoal: boolean; // objectif kcal calculé automatiquement
};

export type WeightEntry = { day: string; kg: number };

export const ACTIVITY: Record<Activity, { label: string; factor: number; hint: string }> = {
  sedentaire: { label: 'Sédentaire', factor: 1.2, hint: 'Bureau, peu de marche' },
  leger: { label: 'Léger', factor: 1.375, hint: '1–3 séances / semaine' },
  modere: { label: 'Modéré', factor: 1.55, hint: '3–5 séances / semaine' },
  actif: { label: 'Actif', factor: 1.725, hint: '6–7 séances / semaine' },
  intense: { label: 'Intense', factor: 1.9, hint: 'Physique + sport quotidien' },
};

export const PACE: Record<Pace, { label: string; deficit: number; hint: string }> = {
  doux: { label: 'Doux', deficit: 250, hint: '≈ 0,25 kg / semaine' },
  normal: { label: 'Normal', deficit: 500, hint: '≈ 0,5 kg / semaine' },
  rapide: { label: 'Rapide', deficit: 750, hint: '≈ 0,75 kg / semaine' },
};

export const DEFAULT_PROFILE: Profile = { sex: 'm', age: 30, heightCm: 178, startKg: 92, targetKg: 78, activity: 'modere', pace: 'normal', autoGoal: true };

export const TIERS = 5;

/** Métabolisme de base (kcal/jour). Sexe « x » : moyenne des deux formules. */
export function bmr(sex: Sex, age: number, heightCm: number, weightKg: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === 'm') return base + 5;
  if (sex === 'f') return base - 161;
  return base - 78;
}

export function tdee(p: Profile, weightKg: number): number {
  return bmr(p.sex, p.age, p.heightCm, weightKg) * ACTIVITY[p.activity].factor;
}

/**
 * Objectif calorique du jour. Perte : déficit selon le rythme, jamais sous un plancher de sécurité
 * (1 200 kcal femmes / 1 500 hommes). Maintien si l'objectif est atteint ; prise de masse : +250.
 */
/** Plancher de sécurité, aussi appliqué à un objectif saisi à la main. */
export function minGoal(sex: Profile['sex']): number {
  return sex === 'f' ? 1200 : sex === 'm' ? 1500 : 1350;
}

export function dailyGoal(p: Profile, weightKg: number): number {
  const maintenance = tdee(p, weightKg);
  const floor = minGoal(p.sex);
  let goal: number;
  if (p.targetKg < weightKg - 0.3) goal = maintenance - PACE[p.pace].deficit;
  else if (p.targetKg > weightKg + 0.3) goal = maintenance + 250;
  else goal = maintenance;
  return Math.max(floor, Math.round(goal / 10) * 10);
}

/** Dernier poids connu (ou poids de départ). */
export function currentWeight(p: Profile, weights: WeightEntry[]): number {
  return weights.length ? weights[weights.length - 1].kg : p.startKg;
}

/** Paliers : le chemin départ → objectif est découpé en 5 étapes égales. */
export function tiers(p: Profile, weights: WeightEntry[]) {
  const now = currentWeight(p, weights);
  const total = Math.abs(p.startKg - p.targetKg);
  const done = Math.max(0, Math.min(total, p.startKg > p.targetKg ? p.startKg - now : now - p.startKg));
  const progress = total > 0 ? done / total : 1;
  const step = total / TIERS;
  const current = total > 0 ? Math.min(TIERS, Math.floor(progress * TIERS + 1e-9) + 1) : TIERS; // 1..5
  const nextAt = total > 0 && current < TIERS + 1 ? step * current : 0;
  const toNext = total > 0 ? Math.max(0, +(nextAt - done).toFixed(1)) : 0;
  const remaining = Math.max(0, +(total - done).toFixed(1));
  return { current: Math.min(current, TIERS), progress, toNext, remaining, done: +done.toFixed(1), total: +total.toFixed(1), reached: remaining === 0 };
}

/** Insère/remplace le poids du jour, trié par date. Le poids de départ est fixé au premier enregistrement. */
export function logWeight(weights: WeightEntry[], day: string, kg: number): WeightEntry[] {
  const v = Math.round(kg * 10) / 10;
  const rest = weights.filter((w) => w.day !== day);
  return [...rest, { day, kg: v }].sort((a, b) => (a.day < b.day ? -1 : 1)).slice(-400);
}

/** Niveau à partir d'un total d'actions : courbe douce (niveau 1 à 0, 10 ≈ 45 actions, 20 ≈ 180). */
export function levelFrom(total: number): { level: number; pct: number } {
  const lvl = Math.floor(Math.sqrt(Math.max(0, total) / 0.45)) + 1;
  const start = 0.45 * (lvl - 1) ** 2;
  const next = 0.45 * lvl ** 2;
  return { level: lvl, pct: Math.round(((total - start) / (next - start)) * 100) };
}

/** Stats du perso, dérivées de l'historique réel. */
export function stats(history: Record<string, DayStats>, streakDays: number, mealsLogged: number, pushTotal: number, extrasTotal: number) {
  const days = Object.values(history);
  const challenges = days.reduce((a, d) => a + d.challenges, 0) + extrasTotal;
  const force = levelFrom(pushTotal / 5 + challenges * 0.6);
  const forme = levelFrom(challenges * 0.8 + streakDays * 1.5);
  const energie = levelFrom(days.filter((d) => d.challenges > 0 || d.meals > 0).length * 1.2);
  const discipline = levelFrom(mealsLogged * 0.5 + streakDays * 2);
  return {
    force, forme, energie, discipline,
    level: Math.max(1, Math.round((force.level + forme.level + energie.level + discipline.level) / 4)),
  };
}
