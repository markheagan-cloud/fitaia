/**
 * Grand moment de célébration (fin de défi, tenue débloquée). Déclenché uniquement par un résultat réel accordé
 * par le registre : jamais au hasard, jamais pour pousser à l'achat. Store minimal, sans module natif.
 */
import { create } from 'zustand';

export type Celebration = { title: string; sub?: string; coins?: number; points?: number; image?: string; kind?: 'achat' };
type S = { id: number; event: Celebration | null; celebrate: (e: Celebration) => void; close: () => void };

export const useCelebrate = create<S>((set) => ({
  id: 0,
  event: null,
  celebrate: (event) => set((s) => ({ id: s.id + 1, event })),
  close: () => set({ event: null }),
}));
