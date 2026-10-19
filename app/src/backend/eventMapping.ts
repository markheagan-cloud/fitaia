/**
 * Traduction résultat d'opération → événements métier. Partagée par l'adaptateur local et l'adaptateur Supabase
 * pour que l'interface reçoive exactement les mêmes événements quel que soit le serveur derrière.
 * Règle : un rejeu idempotent (replayed) ne publie rien, rien n'a changé.
 */
import type { ClaimOutcome, EconomyTransaction, MigrationOutcome, RefundOutcome, SpendOutcome } from '../economy/types';
import type { CosmeticCategory, EquipOutcome } from '../inventory/types';
import type { PendingEvent } from '../platform/events';
import { ALLOWED_ACTION_TYPES } from '../progression/progressionRules';
import type { ActionType, AwardOutcome, PeerAwardOutcome } from '../progression/types';

/**
 * Un refus ne recopie jamais un texte libre envoyé par le téléphone dans les journaux : action hors liste
 * blanche → « unknown », identifiant de récompense mal formé → « invalid ».
 */
function safeActionType(actionType: string): ActionType | 'unknown' {
  return ALLOWED_ACTION_TYPES.find((allowed) => allowed === actionType) ?? 'unknown';
}

function safeRewardId(rewardId: string): string {
  return /^[a-z0-9_]{2,64}$/.test(rewardId) ? rewardId : 'invalid';
}

export function awardEvents(userId: string, actionType: string, outcome: AwardOutcome): PendingEvent[] {
  if (!outcome.ok) return [{ type: 'reward.rejected', payload: { userId, subject: { kind: 'action', actionType: safeActionType(actionType) }, code: outcome.code } }];
  if (outcome.replayed) return [];
  const { award, account, stageChange } = outcome;
  const events: PendingEvent[] = [
    {
      type: 'progression.points_awarded',
      payload: { userId: award.userId, actionType: award.actionType, points: award.points, lifetimePoints: account.lifetimePoints, dayKey: award.dayKey },
    },
  ];
  if (stageChange) {
    events.push({
      type: 'progression.stage_changed',
      payload: {
        userId: award.userId,
        fromStage: stageChange.from,
        toStage: stageChange.to,
        highestHistoricalStage: account.highestHistoricalStage,
        lifetimePoints: account.lifetimePoints,
      },
    });
  }
  return events;
}

/** Action accordée à un autre membre : seul un refus concerne le membre qui la demande. */
export function peerAwardEvents(actorId: string, actionType: string, outcome: PeerAwardOutcome): PendingEvent[] {
  return outcome.ok ? [] : [{ type: 'reward.rejected', payload: { userId: actorId, subject: { kind: 'action', actionType: safeActionType(actionType) }, code: outcome.code } }];
}

export function claimEvents(userId: string, rewardId: string, outcome: ClaimOutcome): PendingEvent[] {
  if (!outcome.ok) return [{ type: 'reward.rejected', payload: { userId, subject: { kind: 'reward', rewardId: safeRewardId(rewardId) }, code: outcome.code } }];
  if (outcome.replayed) return [];
  const { claim, transaction, item } = outcome;
  const events: PendingEvent[] = [];
  if (transaction) events.push(earnedEvent(transaction));
  if (item && !item.duplicate) {
    events.push({ type: 'inventory.item_acquired', payload: { userId, itemId: item.itemId, category: item.category, via: 'reward' } });
  }
  events.push({ type: 'reward.claimed', payload: { userId, rewardId: claim.rewardId, rewardType: outcome.rewardType, claimId: claim.id } });
  return events;
}

export function spendEvents(outcome: SpendOutcome): PendingEvent[] {
  if (!outcome.ok || outcome.replayed) return [];
  const t = outcome.transaction;
  return [
    { type: 'economy.fitcoins_spent', payload: { userId: t.userId, transactionId: t.id, amount: -t.amount, balanceAfter: t.balanceAfter, reason: t.reason, sourceId: t.sourceId } },
    { type: 'inventory.item_acquired', payload: { userId: t.userId, itemId: outcome.item.itemId, category: outcome.item.category, via: 'purchase' } },
  ];
}

export function refundEvents(outcome: RefundOutcome): PendingEvent[] {
  return outcome.ok && !outcome.replayed ? [earnedEvent(outcome.transaction)] : [];
}

export function migrationEvents(outcome: MigrationOutcome): PendingEvent[] {
  return outcome.ok && !outcome.replayed && outcome.transaction ? [earnedEvent(outcome.transaction)] : [];
}

/** Équipement réussi : l'emplacement est celui où l'objet apparaît désormais. Un déséquipement ne publie rien. */
export function equipEvents(userId: string, itemId: string, outcome: EquipOutcome): PendingEvent[] {
  if (!outcome.ok || !outcome.changed) return [];
  const slot = (Object.keys(outcome.equipped) as CosmeticCategory[]).find((s) => outcome.equipped[s] === itemId);
  return slot ? [{ type: 'inventory.item_equipped', payload: { userId, itemId, slot, unequipped: outcome.unequipped } }] : [];
}

function earnedEvent(t: EconomyTransaction): PendingEvent {
  if (t.type === 'spend') throw new Error('Une dépense n’est pas un gain');
  return {
    type: 'economy.fitcoins_earned',
    payload: { userId: t.userId, transactionId: t.id, transactionType: t.type, amount: t.amount, balanceAfter: t.balanceAfter, reason: t.reason, sourceId: t.sourceId },
  };
}
