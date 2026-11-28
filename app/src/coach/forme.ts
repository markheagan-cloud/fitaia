/**
 * « Forme » : trois niveaux sur 4, calculés uniquement à partir de ce que la personne a réellement fait
 * (pompes validées par la caméra, repas enregistrés, jours actifs d'affilée), et la fenêtre d'entraînement du jour.
 * Pur, testé (tests/forme.test.ts). Rien n'est tiré au hasard, aucun compte à rebours artificiel : la fenêtre est
 * simplement le temps qu'il reste aujourd'hui pour valider le défi du jour.
 */
import { dayKey, type DayStats } from '@/store/economy';

export type Jauge = { id: 'force' | 'carburant' | 'regularite'; label: string; level: number; hint: string };

const palier = (v: number, seuils: [number, number, number]) => (v >= seuils[2] ? 4 : v >= seuils[1] ? 3 : v >= seuils[0] ? 2 : 1);
const reste = (v: number, seuils: [number, number, number]) => seuils.find((s) => v < s);

export function forme(pushTotal: number, history: Record<string, DayStats>, streakDays: number, now = new Date()): Jauge[] {
  let repasJours = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if ((history[dayKey(d)]?.meals ?? 0) > 0) repasJours++;
  }
  const f: [number, number, number] = [25, 100, 300];
  const c: [number, number, number] = [2, 4, 6];
  const r: [number, number, number] = [2, 4, 7];
  const fn = reste(pushTotal, f), cn = reste(repasJours, c), rn = reste(streakDays, r);
  return [
    { id: 'force', label: 'Force', level: palier(pushTotal, f), hint: fn ? 'encore ' + (fn - pushTotal) + ' pompes' : 'niveau max' },
    { id: 'carburant', label: 'Carburant', level: palier(repasJours, c), hint: cn ? repasJours + '/7 jours notés' : 'niveau max' },
    { id: 'regularite', label: 'Régularité', level: palier(streakDays, r), hint: rn ? 'encore ' + (rn - streakDays) + ' j. d’affilée' : 'niveau max' },
  ];
}

/** Fenêtre d'entraînement du jour : ouverte jusqu'à minuit tant que le défi n'est pas validé. */
export function fenetre(doneToday: boolean, now = new Date()): { open: boolean; text: string; pct: number } {
  if (doneToday) return { open: false, text: 'Séance validée. Mange, dors : prochaine fenêtre demain.', pct: 1 };
  const minutes = (24 - now.getHours()) * 60 - now.getMinutes();
  const h = Math.floor(minutes / 60);
  return { open: true, text: 'Fenêtre d’entraînement ouverte : encore ' + (h >= 1 ? h + ' h' : minutes + ' min') + ' aujourd’hui.', pct: 1 - minutes / 1440 };
}
