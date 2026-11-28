/**
 * Repas récents : les derniers repas distincts du journal (jusqu'à 60 jours gardés sur le téléphone), les plus récents
 * d'abord, pour les ré-enregistrer d'un geste. Pur, testé (tests/recent-meals.test.ts).
 */
import type { Meal, MealEntry } from '@/data/content';

export function recentMeals(meals: Record<string, MealEntry[]>, max = 6): Meal[] {
  const seen = new Set<string>();
  const out: Meal[] = [];
  const all = Object.values(meals).flat().sort((a, b) => b.at - a.at);
  for (const m of all) {
    const key = m.name.trim().toLowerCase() + '|' + m.kcal;
    if (!m.name.trim() || m.kcal <= 0 || m.id.startsWith('reprise-') || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: m.name, kcal: m.kcal, p: m.p, g: m.g, l: m.l, score: m.score, items: m.items, origin: m.origin });
    if (out.length >= max) break;
  }
  return out;
}
