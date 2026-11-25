/** Estimation d'un repas à partir de la réponse du service photo (MealVision). Pur, sans module natif, testé. */
import { mealScore } from '@/store/economy';
import type { Meal } from '@/data/content';

export type MealItem = { name: string; grams: number; kcal: number; p: number; g: number; l: number };
export type MealEstimate = { name: string; items: MealItem[] };

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);

/** Lit la réponse du service ; null si aucun aliment reconnu. Pur, testé. */
export function parseMealEstimate(text: string): MealEstimate | null {
  let j: { ok?: boolean; name?: unknown; items?: unknown; error?: unknown };
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error('Réponse illisible du service repas.');
  }
  if (j.ok === false) throw new Error(typeof j.error === 'string' ? j.error : 'Le service repas a échoué.');
  const items = (Array.isArray(j.items) ? j.items : [])
    .map((it: Record<string, unknown>) => ({
      name: typeof it?.name === 'string' ? it.name.trim() : '',
      grams: Math.round(num(it?.grams)),
      kcal: Math.round(num(it?.kcal)),
      p: Math.round(num(it?.p)),
      g: Math.round(num(it?.g)),
      l: Math.round(num(it?.l)),
    }))
    .filter((it) => it.name && it.kcal > 0);
  if (!items.length) return null;
  const name = typeof j.name === 'string' && j.name.trim() ? j.name.trim() : items.map((i) => i.name).join(', ');
  return { name, items };
}

/** Estimation × facteur de portion (0.7 petite, 1 normale, 1.3 grande) → repas du journal. Pur, testé. */
export function estimateToMeal(e: MealEstimate, factor = 1): Meal {
  const sum = (k: 'kcal' | 'p' | 'g' | 'l') => Math.round(e.items.reduce((s, i) => s + i[k], 0) * factor);
  const kcal = sum('kcal'), p = sum('p'), g = sum('g'), l = sum('l');
  return {
    name: e.name,
    kcal, p, g, l,
    score: mealScore(kcal, p, g, l),
    items: e.items.map((i) => i.name + ', ' + Math.round(i.grams * factor) + ' g'),
    origin: 'photo',
  };
}

