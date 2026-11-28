/**
 * « Ma liste » : les articles que le membre garde de côté (en vente ou à venir). Gardée sur le téléphone seulement.
 * Quand un article de la liste devient disponible, la boutique le montre en haut ; rien n'est envoyé ailleurs.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type WishState = {
  ids: string[];
  toggle: (id: string) => boolean;
  has: (id: string) => boolean;
};

export const useWishlist = create<WishState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) => {
        const on = !get().ids.includes(id);
        set({ ids: on ? [...get().ids, id] : get().ids.filter((x) => x !== id) });
        return on;
      },
      has: (id) => get().ids.includes(id),
    }),
    { name: 'fitaia-liste', version: 1, storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ ids: s.ids }) },
  ),
);
