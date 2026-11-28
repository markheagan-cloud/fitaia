/**
 * Grand moment de célébration (fin de défi, tenue débloquée). Déclenché uniquement par un résultat réel accordé
 * par le registre : jamais au hasard, jamais pour pousser à l'achat. Store minimal, sans module natif.
 */
import { create } from 'zustand';

import type { Rarity } from '@/inventory/types';

export type CelebrationAction = { label: string; onPress: () => void; primary?: boolean };
/**
 * `rarity` règle l'intensité d'une révélation de tenue : commune rapide, légendaire = petite séquence (≈ 2 s).
 * `actions` : choix proposés à la fin (porter maintenant / garder au vestiaire) ; la carte attend alors le choix.
 */
export type Celebration = { title: string; sub?: string; coins?: number; points?: number; image?: string; kind?: 'achat'; rarity?: Rarity; actions?: CelebrationAction[] };
type S = { id: number; event: Celebration | null; celebrate: (e: Celebration) => void; close: () => void };

export const useCelebrate = create<S>((set) => ({
  id: 0,
  event: null,
  celebrate: (event) => set((s) => ({ id: s.id + 1, event })),
  close: () => set({ event: null }),
}));
