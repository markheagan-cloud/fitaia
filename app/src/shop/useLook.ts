/**
 * Le look porté : un mélange de pièces (vestiaire) dessiné sur le perso, ou rien (alors c'est la tenue équipée qui
 * se voit). Gardé sur le téléphone. Les images des mélanges vivent avec le perso (caricature.outfits[clé]).
 * Mettre une tenue entière (boutique, fiche) enlève le mélange : on voit ce qu'on vient de choisir.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Mix } from './melange';

export type SavedLook = { key: string; mix: Mix; at: number };

type LookState = {
  /** Clé du mélange porté (m-…), ou null. */
  worn: string | null;
  /** Mélanges déjà dessinés, du plus récent au plus ancien (12 au plus). */
  saved: SavedLook[];
  wear: (key: string, mix: Mix) => void;
  clear: () => void;
  forget: (key: string) => void;
};

export const useLook = create<LookState>()(
  persist(
    (set, get) => ({
      worn: null,
      saved: [],
      wear: (key, mix) => set({ worn: key, saved: [{ key, mix, at: Date.now() }, ...get().saved.filter((s) => s.key !== key)].slice(0, 12) }),
      clear: () => set({ worn: null }),
      forget: (key) => set({ worn: get().worn === key ? null : get().worn, saved: get().saved.filter((s) => s.key !== key) }),
    }),
    { name: 'fitaia-look', version: 1, storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ worn: s.worn, saved: s.saved }) },
  ),
);
