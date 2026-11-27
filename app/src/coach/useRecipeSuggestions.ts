/** Branche le moteur de recettes (pur) sur les vraies données du téléphone : goûts, journal, objectif, calories, activité. */
import { useMemo } from 'react';
import { useCalories, useGame } from '@/store/useGame';
import { useRecipes } from '@/store/useRecipes';
import { currentWeight } from '@/store/profile';
import { dayKey } from '@/store/economy';
import type { RecipeMoment } from '@/data/recipes';
import { goalOf, journalTastes, rankRecipes, recentRecipeIds, type RankInput, type RecipePrefs, type Suggestion } from './recipes';

/** Heure actuelle (ms), lue au moment du calcul. */
const clock = () => Date.now();

/** Préférences actuelles (sélecteurs fins : l'écran ne se redessine que si elles changent). */
export function usePrefs(): RecipePrefs {
  const diet = useRecipes((s) => s.diet);
  const likes = useRecipes((s) => s.likes);
  const dislikes = useRecipes((s) => s.dislikes);
  const favorites = useRecipes((s) => s.favorites);
  const hidden = useRecipes((s) => s.hidden);
  const allergies = useRecipes((s) => s.allergies);
  const snoozed = useRecipes((s) => s.snoozed);
  const negatives = useRecipes((s) => s.negatives);
  const tooHard = useRecipes((s) => s.tooHard);
  return useMemo(
    () => ({ diet, likes, dislikes, favorites, hidden, allergies, snoozed, negatives, tooHard }),
    [diet, likes, dislikes, favorites, hidden, allergies, snoozed, negatives, tooHard],
  );
}

/** Contexte du jour, sans les options d'affichage. */
export function useKitchenContext(): Omit<RankInput, 'moment' | 'favoritesOnly' | 'shown' | 'maxMinutes'> {
  const meals = useGame((s) => s.meals);
  const profile = useGame((s) => s.profile);
  const weights = useGame((s) => s.weights);
  const history = useGame((s) => s.history);
  const pushDone = useGame((s) => s.pushDone);
  const { remaining } = useCalories();
  const prefs = usePrefs();
  const hour = new Date().getHours();
  const key = dayKey();
  const trained = pushDone || (history[key]?.challenges ?? 0) > 0;
  return useMemo(() => {
    const now = clock();
    return {
      prefs,
      tastes: journalTastes(meals, now),
      goal: goalOf(profile.targetKg, currentWeight(profile, weights)),
      remainingKcal: remaining,
      hour,
      now,
      todayNames: (meals[key] ?? []).map((m) => m.name),
      recentIds: recentRecipeIds(meals, now),
      trainedToday: trained,
    };
  }, [meals, profile, weights, remaining, prefs, hour, key, trained]);
}

export function useRecipeSuggestions(opts: { moment?: RecipeMoment; favoritesOnly?: boolean; shown?: string[]; maxMinutes?: number } = {}): Suggestion[] {
  const ctx = useKitchenContext();
  const { moment, favoritesOnly, shown, maxMinutes } = opts;
  return useMemo(() => rankRecipes({ ...ctx, moment, favoritesOnly, shown, maxMinutes: maxMinutes || undefined }), [ctx, moment, favoritesOnly, shown, maxMinutes]);
}
