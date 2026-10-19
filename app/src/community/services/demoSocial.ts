/**
 * DONNÉES DE DÉMONSTRATION (vie sociale simulée) — complète devData.ts pour les 8 profils fictifs.
 * Tout ce qui sort d'ici est signalé à l'écran (« démo », « simulé ») : état du jour, besoin du jour,
 * statistiques de progression, présence en ligne. Aucune de ces personnes n'existe.
 * Module pur (sans image ni React Native) : testable directement.
 */
import type { NeedId, StatusId } from '../models/intentions';
import type { Slot } from '../models/types';
import type { SocialStats } from './highlights';

export type DemoSocial = {
  status: StatusId | null;
  need: NeedId | null;
  stats: SocialStats;
  /** Minutes depuis la dernière connexion, dans ses moments habituels. */
  baseMinutes: number;
};

export const DEMO_SOCIAL: Record<string, DemoSocial> = {
  demo_sarah: { status: 'dispo', need: 'motivation', stats: { regular: true, challengesDone: 4, demo: true }, baseMinutes: 4 },
  demo_nassim: { status: 'entrainement', need: 'entrainement', stats: { regular: true, challengesDone: 3, demo: true }, baseMinutes: 1 },
  demo_ines: { status: 'repas', need: 'repas', stats: { regular: false, challengesDone: 1, demo: true }, baseMinutes: 7 },
  demo_adam: { status: 'aide', need: 'aider', stats: { regular: true, challengesDone: 9, demo: true }, baseMinutes: 9 },
  demo_leila: { status: 'nuit', need: 'ecoute', stats: { regular: true, challengesDone: 5, demo: true }, baseMinutes: 12 },
  demo_karim: { status: 'motive', need: 'motivation', stats: { regular: false, challengesDone: 0, demo: true }, baseMinutes: 3 },
  demo_julie: { status: null, need: 'regularite', stats: { regular: false, challengesDone: 2, demo: true }, baseMinutes: 6 },
  demo_thomas: { status: 'aide', need: 'aider', stats: { regular: true, challengesDone: 12, demo: true }, baseMinutes: 10 },
};

/** Moment de la journée (heure locale) → créneau FitMatch. */
export function slotOfHour(hour: number): Slot {
  if (hour >= 5 && hour < 11) return 'matin';
  if (hour >= 11 && hour < 17) return 'midi';
  if (hour >= 17 && hour < 23) return 'soir';
  return 'nuit';
}

/**
 * Présence simulée : un profil de démonstration est « en ligne » pendant ses moments habituels, hors ligne sinon.
 * Si personne n'est dans son moment habituel, les deux plus assidus restent en ligne (la démo n'est jamais vide).
 * Renvoie la date de dernière activité de chaque profil.
 */
export function demoPresence(people: { userId: string; slots: Slot[] }[], hour: number, now: number): Record<string, number> {
  const slot = slotOfHour(hour);
  const inSlot = new Set(people.filter((p) => p.slots.includes(slot)).map((p) => p.userId));
  if (inSlot.size < 2) {
    const byBase = [...people].sort((a, b) => (DEMO_SOCIAL[a.userId]?.baseMinutes ?? 99) - (DEMO_SOCIAL[b.userId]?.baseMinutes ?? 99));
    for (const p of byBase) {
      if (inSlot.size >= 2) break;
      inSlot.add(p.userId);
    }
  }
  const out: Record<string, number> = {};
  for (const p of people) {
    const base = DEMO_SOCIAL[p.userId]?.baseMinutes ?? 30;
    out[p.userId] = now - (inSlot.has(p.userId) ? base : 60 + base * 17) * 60000;
  }
  return out;
}
