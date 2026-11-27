/**
 * Gains quotidiens affichés : une seule source (src/economy/dailyEarnings.ts), cohérente avec le moteur.
 * Régression du 27/11/2026 : l'app annonçait 60 Fitcoins à un endroit et des conditions valant 70 à un autre.
 */
import { REWARD_DEFINITIONS } from '../src/economy/rewardCatalog';
import { DAILY_MAX, dailyEarnable, dailyRuleText } from '../src/economy/dailyEarnings';
import type { RewardStatus } from '../src/economy/types';
import { runSuite } from './helpers/check';

const st = (id: string, state: RewardStatus['state']): RewardStatus => ({
  reward: REWARD_DEFINITIONS.find((r) => r.id === id)!,
  state,
  periodKey: '2026-11-27',
  progress: { current: 0, required: 1 },
});

runSuite('gains-quotidiens', async (t) => {
  const ch = REWARD_DEFINITIONS.find((r) => r.id === 'daily_challenge')!.amount;
  const me = REWARD_DEFINITIONS.find((r) => r.id === 'daily_meal')!.amount;
  t.equal(DAILY_MAX, ch + me, 'maximum par jour = défi du jour + premier repas (daily_goal, jamais déclenché, ne compte pas)');
  t.equal(dailyEarnable([st('daily_challenge', 'locked'), st('daily_meal', 'locked'), st('daily_goal', 'locked')]), ch + me, 'rien de fait : 60, pas 70');
  t.equal(dailyEarnable([st('daily_challenge', 'claimed'), st('daily_meal', 'locked')]), me, 'défi fait : reste le repas');
  t.equal(dailyEarnable([st('daily_challenge', 'claimed'), st('daily_meal', 'claimed')]), 0, 'tout fait : 0');
  t.equal(dailyEarnable([st('first_challenge', 'locked')]), 0, 'un bonus unique de Parcours n’est pas un gain quotidien');
  t.ok(dailyRuleText().includes(String(DAILY_MAX)), 'la phrase affichée reprend le même total');
});
