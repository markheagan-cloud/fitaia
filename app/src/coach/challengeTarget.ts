/**
 * Cible du défi pompes du jour : 5 au départ, puis une pompe de plus toutes les 3 journées réussies, jusqu'à 20.
 * La progression est gratuite et automatique ; elle ne redescend pas. Pur, testé (tests/challenge-target.test.ts).
 */
import { dayKey, type DayStats } from '@/store/economy';

export const TARGET_MIN = 5;
export const TARGET_MAX = 20;

export function challengeTarget(history: Record<string, DayStats>, today = new Date()): number {
  const k = dayKey(today);
  const wins = Object.entries(history).filter(([d, s]) => d !== k && (s?.challenges ?? 0) > 0).length;
  return Math.min(TARGET_MAX, TARGET_MIN + Math.floor(wins / 3));
}

/** Ce qu'il reste avant la prochaine hausse, pour l'afficher. */
export function nextRaise(history: Record<string, DayStats>, today = new Date()): string {
  const k = dayKey(today);
  const wins = Object.entries(history).filter(([d, s]) => d !== k && (s?.challenges ?? 0) > 0).length;
  if (TARGET_MIN + Math.floor(wins / 3) >= TARGET_MAX) return 'Cible maximale atteinte.';
  const left = 3 - (wins % 3);
  return 'Encore ' + left + ' jour' + (left > 1 ? 's' : '') + ' réussi' + (left > 1 ? 's' : '') + ' et le défi passe à ' + (challengeTarget(history, today) + 1) + ' pompes.';
}
