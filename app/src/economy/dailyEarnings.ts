/**
 * Source de vérité unique des gains quotidiens AFFICHÉS (boutique, défis, coach).
 *
 * Seules comptent les récompenses quotidiennes dont l'action est réellement déclenchée par l'app : le premier défi
 * réussi du jour (challenge_completed) et le premier repas enregistré du jour (meal_logged). `daily_goal` existe dans
 * le moteur (tests de clés par jour) mais aucun écran ne le déclenche : l'additionner annonçait 70 Fitcoins par jour
 * alors qu'on ne peut en gagner que 60. Pur, testé dans tests/daily-earnings.test.ts.
 */
import { REWARD_DEFINITIONS } from './rewardCatalog';
import type { RewardStatus } from './types';

/** Actions que l'app déclenche vraiment (voir useGame.reward). */
export const LIVE_DAILY_ACTIONS = ['challenge_completed', 'meal_logged'] as const;

const isLiveDaily = (r: RewardStatus['reward']) =>
  r.enabled && r.repeatable && r.type === 'fitcoins' && r.unlockCondition.kind === 'action_completed_today' && (LIVE_DAILY_ACTIONS as readonly string[]).includes(r.unlockCondition.action);

/** Fitcoins encore gagnables aujourd'hui (0 si tout est déjà pris). */
export function dailyEarnable(statuses: readonly RewardStatus[]): number {
  return statuses.filter((s) => isLiveDaily(s.reward) && s.state !== 'claimed').reduce((n, s) => n + s.reward.amount, 0);
}

/** Maximum gagnable en une journée avec les gains quotidiens (hors bonus de Parcours). */
export const DAILY_MAX = REWARD_DEFINITIONS.filter(isLiveDaily).reduce((n, r) => n + r.amount, 0);

/** Phrase unique qui explique les gains quotidiens, calculée depuis le catalogue (jamais écrite en dur ailleurs). */
export function dailyRuleText(cur = 'Fitcoins'): string {
  const ch = REWARD_DEFINITIONS.find((r) => r.id === 'daily_challenge');
  const me = REWARD_DEFINITIONS.find((r) => r.id === 'daily_meal');
  return '+' + (ch?.amount ?? 0) + ' ' + cur + ' pour le premier défi réussi du jour, +' + (me?.amount ?? 0) + ' pour le premier repas enregistré, soit ' + DAILY_MAX + ' par jour au plus, plus les bonus d’étape du Parcours.';
}
