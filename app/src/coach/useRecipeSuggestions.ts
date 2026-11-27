/** Branche le classement des recettes (pur) sur les vraies données du téléphone : goûts, journal, objectif, calories. */
import { useMemo } from 'react';
import { useCalories, useGame } from '@/store/useGame';
import { useRecipes } from '@/store/useRecipes';
import { currentWeight } from '@/store/profile';
import { dayKey } from '@/store/economy';
import type { RecipeMoment } from '@/data/recipes';
import { goalOf, journalTastes, rankRecipes, type Suggestion } from './recipes';

export function useRecipeSuggestions(opts: { moment?: RecipeMoment; favoritesOnly?: boolean } = {}): Suggestion[] {
  const meals = useGame((s) => s.meals);
  const profile = useGame((s) => s.profile);
  const weights = useGame((s) => s.weights);
  const { remaining } = useCalories();
  const diet = useRecipes((s) => s.diet);
  const likes = useRecipes((s) => s.likes);
  const dislikes = useRecipes((s) => s.dislikes);
  const favorites = useRecipes((s) => s.favorites);
  const hidden = useRecipes((s) => s.hidden);
  const hour = new Date().getHours();
  const { moment, favoritesOnly } = opts;
  return useMemo(() => {
    const goal = goalOf(profile.targetKg, currentWeight(profile, weights));
    const todayNames = (meals[dayKey()] ?? []).map((m) => m.name);
    return rankRecipes({ prefs: { diet, likes, dislikes, favorites, hidden }, tastes: journalTastes(meals), goal, remainingKcal: remaining, hour, todayNames, moment, favoritesOnly });
  }, [meals, profile, weights, remaining, diet, likes, dislikes, favorites, hidden, hour, moment, favoritesOnly]);
}
