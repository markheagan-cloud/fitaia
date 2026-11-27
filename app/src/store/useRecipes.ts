/**
 * Goûts pour les recettes : régime, familles aimées ou écartées, favoris, recettes écartées. Gardés sur le téléphone
 * seulement (rien n'est envoyé). Le classement est calculé par src/coach/recipes.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { EMPTY_PREFS, type Diet, type RecipePrefs } from '@/coach/recipes';

/** Avis sur une famille : neutre → j'aime → pas pour moi → neutre. */
export type Taste = 'neutre' | 'aime' | 'non';

type RecipesState = RecipePrefs & {
  toggleDiet: (d: Diet) => void;
  cycleFamily: (id: string) => Taste;
  toggleFavorite: (recipeId: string) => boolean;
  hide: (recipeId: string) => void;
  unhideAll: () => void;
};

const without = (list: string[], x: string) => list.filter((y) => y !== x);

export function tasteOf(p: Pick<RecipePrefs, 'likes' | 'dislikes'>, id: string): Taste {
  return p.likes.includes(id) ? 'aime' : p.dislikes.includes(id) ? 'non' : 'neutre';
}

export const useRecipes = create<RecipesState>()(
  persist(
    (set, get) => ({
      ...EMPTY_PREFS,
      toggleDiet: (d) => set({ diet: get().diet.includes(d) ? get().diet.filter((x) => x !== d) : [...get().diet, d] }),
      cycleFamily: (id) => {
        const s = get();
        const now = tasteOf(s, id);
        const next: Taste = now === 'neutre' ? 'aime' : now === 'aime' ? 'non' : 'neutre';
        set({
          likes: next === 'aime' ? [...without(s.likes, id), id] : without(s.likes, id),
          dislikes: next === 'non' ? [...without(s.dislikes, id), id] : without(s.dislikes, id),
        });
        return next;
      },
      toggleFavorite: (rid) => {
        const on = !get().favorites.includes(rid);
        set({ favorites: on ? [...get().favorites, rid] : without(get().favorites, rid), hidden: without(get().hidden, rid) });
        return on;
      },
      hide: (rid) => set({ hidden: [...without(get().hidden, rid), rid], favorites: without(get().favorites, rid) }),
      unhideAll: () => set({ hidden: [] }),
    }),
    {
      name: 'fitaia-recettes',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ diet: s.diet, likes: s.likes, dislikes: s.dislikes, favorites: s.favorites, hidden: s.hidden }),
    },
  ),
);
