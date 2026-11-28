/**
 * Récompenses de départ (configuration ; même contenu que `reward_definitions` dans la migration 0002).
 *
 * Paliers du Parcours FITAIA repris de la spécification (C, point 10) : 900 PF +50 Fitcoins, 1 000 PF Capsule,
 * 1 150 PF Accessoire, 1 300 PF +100 Fitcoins. `daily_goal` illustre une récompense répétable par jour
 * (clé reward:<user>:daily_goal:<jour>) : 10 Fitcoins, valeur de démonstration à équilibrer.
 */
import type { RewardDefinition } from './types';

export const REWARD_DEFINITIONS: readonly RewardDefinition[] = [
  { id: 'milestone_900', type: 'fitcoins', amount: 50, unlockCondition: { kind: 'lifetime_points', atLeast: 900 }, repeatable: false, enabled: true },
  { id: 'milestone_1000', type: 'capsule', amount: 1, unlockCondition: { kind: 'lifetime_points', atLeast: 1000 }, repeatable: false, enabled: true },
  {
    id: 'milestone_1150',
    type: 'cosmetic',
    amount: 1,
    cosmeticItemId: 'accessory_montre_parcours',
    unlockCondition: { kind: 'lifetime_points', atLeast: 1150 },
    repeatable: false,
    enabled: true,
  },
  // Rythme de déblocage (26/11/2026, docs/ECONOMIE.md) : un premier gain tout de suite, puis un bonus à chaque étape
  // du Parcours, de plus en plus gros pour que les étapes lointaines restent motivantes.
  { id: 'first_challenge', type: 'fitcoins', amount: 100, unlockCondition: { kind: 'lifetime_points', atLeast: 50 }, repeatable: false, enabled: true },
  { id: 'stage_elan', type: 'fitcoins', amount: 150, unlockCondition: { kind: 'stage_reached', stageId: 'elan' }, repeatable: false, enabled: true },
  { id: 'stage_regulier', type: 'fitcoins', amount: 250, unlockCondition: { kind: 'stage_reached', stageId: 'regulier' }, repeatable: false, enabled: true },
  { id: 'stage_engage', type: 'fitcoins', amount: 400, unlockCondition: { kind: 'stage_reached', stageId: 'engage' }, repeatable: false, enabled: true },
  { id: 'stage_confirme', type: 'fitcoins', amount: 600, unlockCondition: { kind: 'stage_reached', stageId: 'confirme' }, repeatable: false, enabled: true },
  { id: 'stage_pilier', type: 'fitcoins', amount: 1000, unlockCondition: { kind: 'stage_reached', stageId: 'pilier' }, repeatable: false, enabled: true },
  { id: 'milestone_1300', type: 'fitcoins', amount: 100, unlockCondition: { kind: 'lifetime_points', atLeast: 1300 }, repeatable: false, enabled: true },
  { id: 'daily_goal', type: 'fitcoins', amount: 10, unlockCondition: { kind: 'action_completed_today', action: 'daily_goal_completed' }, repeatable: true, enabled: true },
  // Revenu quotidien du jeu gratuit : un défi réussi (50) et un repas enregistré (10), une fois par jour chacun.
  { id: 'daily_challenge', type: 'fitcoins', amount: 50, unlockCondition: { kind: 'action_completed_today', action: 'challenge_completed' }, repeatable: true, enabled: true },
  { id: 'daily_meal', type: 'fitcoins', amount: 10, unlockCondition: { kind: 'action_completed_today', action: 'meal_logged' }, repeatable: true, enabled: true },
];
