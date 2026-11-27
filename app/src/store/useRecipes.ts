/**
 * Préférences cuisine et progression du mode cuisine. Gardées sur le téléphone seulement (rien n'est envoyé) : goûts,
 * régime, allergies déclarées, favoris, refus et ce qu'ils ont appris, frigo, recettes en cours. Tout se consulte, se
 * modifie et se remet à zéro depuis l'écran Recettes. Aucune allergie n'est jamais déduite du journal.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { EMPTY_PREFS, mainFamily, type Diet, type RecipePrefs } from '@/coach/recipes';
import type { Allergen } from '@/kitchen/allergens';
import type { Subs } from '@/kitchen/nutrition';
import { RECIPES } from '@/data/recipes';

/** Avis sur une famille : neutre → j'aime → pas pour moi → neutre. */
export type Taste = 'neutre' | 'aime' | 'non';

/** Raisons facultatives d'un « Pas pour moi » : chacune a une conséquence différente (refuse). */
export type RefuseReason = 'aucune' | 'ingredient' | 'complique' | 'manque' | 'envie' | 'autre';

export type CookState = {
  step: number;
  servings: number;
  subs: Subs;
  /** Fin du minuteur en cours (heure absolue, ms) : juste même si l'app passe en arrière-plan. */
  timerEnd: number | null;
  timerStep: number | null;
  checked: number[];
  updatedAt: number;
};

type RecipesState = RecipePrefs & {
  /** Aliments que j'ai (frigo, placard), par nom d'aliment de la base. */
  fridge: string[];
  cooking: Record<string, CookState>;
  /** Temps disponible choisi (minutes) ou 0. */
  maxMinutes: number;
  toggleDiet: (d: Diet) => void;
  toggleAllergy: (a: Allergen) => void;
  cycleFamily: (id: string) => Taste;
  toggleFavorite: (recipeId: string) => boolean;
  /** « Pas pour moi » : `family` sert à « Je n'aime pas cet ingrédient ». Rend une phrase pour la personne. */
  refuse: (recipeId: string, reason: RefuseReason, family?: string, now?: number) => string;
  /** Annule le dernier refus (si l'on s'est trompé). */
  undoRefuse: () => void;
  hide: (recipeId: string) => void;
  unhideAll: () => void;
  toggleFridge: (food: string) => void;
  clearFridge: () => void;
  setMaxMinutes: (m: number) => void;
  saveCook: (recipeId: string, s: Partial<CookState>) => void;
  endCook: (recipeId: string) => void;
  resetPrefs: () => void;
};

const without = (list: string[], x: string) => list.filter((y) => y !== x);
const DAY = 86_400_000;

export function tasteOf(p: Pick<RecipePrefs, 'likes' | 'dislikes'>, id: string): Taste {
  return p.likes.includes(id) ? 'aime' : p.dislikes.includes(id) ? 'non' : 'neutre';
}

function endOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

type Undo = Pick<RecipePrefs, 'dislikes' | 'snoozed' | 'negatives' | 'tooHard'> | null;
let lastUndo: Undo = null;

export const useRecipes = create<RecipesState>()(
  persist(
    (set, get) => ({
      ...EMPTY_PREFS,
      fridge: [],
      cooking: {},
      maxMinutes: 0,
      toggleDiet: (d) => set({ diet: get().diet.includes(d) ? get().diet.filter((x) => x !== d) : [...get().diet, d] }),
      toggleAllergy: (a) => set({ allergies: get().allergies.includes(a) ? get().allergies.filter((x) => x !== a) : [...get().allergies, a] }),
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
        const snoozed = { ...get().snoozed };
        delete snoozed[rid];
        set({ favorites: on ? [...get().favorites, rid] : without(get().favorites, rid), hidden: without(get().hidden, rid), snoozed });
        return on;
      },
      refuse: (rid, reason, family, now = Date.now()) => {
        const s = get();
        lastUndo = { dislikes: s.dislikes, snoozed: s.snoozed, negatives: s.negatives, tooHard: s.tooHard };
        const r = RECIPES.find((x) => x.id === rid);
        const snooze = (until: number) => ({ ...s.snoozed, [rid]: until });
        switch (reason) {
          case 'ingredient':
            if (family) {
              set({ dislikes: [...without(s.dislikes, family), family], likes: without(s.likes, family) });
              return 'Noté : plus de recettes avec cet aliment';
            }
            set({ snoozed: snooze(now + 14 * DAY) });
            return 'On te la proposera moins';
          case 'complique':
            set({ tooHard: s.tooHard + 1, snoozed: snooze(now + 30 * DAY) });
            return 'Noté : des recettes plus simples d’abord';
          case 'manque':
            set({ snoozed: snooze(now + 3 * DAY) });
            return 'Elle reviendra dans quelques jours';
          case 'envie':
            set({ snoozed: snooze(endOfDay(now)) });
            return 'Pas aujourd’hui, c’est noté';
          case 'autre': {
            const fam = r ? mainFamily(r) : '';
            set({ negatives: fam ? { ...s.negatives, [fam]: (s.negatives[fam] ?? 0) + 1 } : s.negatives, snoozed: snooze(now + 7 * DAY) });
            return 'Noté : on varie davantage';
          }
          default:
            set({ snoozed: snooze(now + 14 * DAY) });
            return 'On te la proposera moins';
        }
      },
      undoRefuse: () => {
        if (!lastUndo) return;
        set(lastUndo);
        lastUndo = null;
      },
      hide: (rid) => set({ hidden: [...without(get().hidden, rid), rid], favorites: without(get().favorites, rid) }),
      unhideAll: () => set({ hidden: [], snoozed: {} }),
      toggleFridge: (food) => set({ fridge: get().fridge.includes(food) ? without(get().fridge, food) : [...get().fridge, food] }),
      clearFridge: () => set({ fridge: [] }),
      setMaxMinutes: (m) => set({ maxMinutes: m }),
      saveCook: (rid, patch) => {
        const prev: CookState = get().cooking[rid] ?? { step: 0, servings: 1, subs: {}, timerEnd: null, timerStep: null, checked: [], updatedAt: 0 };
        set({ cooking: { ...get().cooking, [rid]: { ...prev, ...patch, updatedAt: Date.now() } } });
      },
      endCook: (rid) => {
        const c = { ...get().cooking };
        delete c[rid];
        set({ cooking: c });
      },
      resetPrefs: () => set({ ...EMPTY_PREFS, maxMinutes: 0 }),
    }),
    {
      name: 'fitaia-recettes',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        diet: s.diet, likes: s.likes, dislikes: s.dislikes, favorites: s.favorites, hidden: s.hidden, allergies: s.allergies,
        snoozed: s.snoozed, negatives: s.negatives, tooHard: s.tooHard, fridge: s.fridge, cooking: s.cooking, maxMinutes: s.maxMinutes,
      }),
      // v2 : allergies, refus appris, frigo, mode cuisine. Les goûts de la v1 sont gardés tels quels.
      migrate: (persisted) => ({ ...EMPTY_PREFS, fridge: [], cooking: {}, maxMinutes: 0, ...((persisted ?? {}) as object) }) as unknown as RecipesState,
    },
  ),
);
