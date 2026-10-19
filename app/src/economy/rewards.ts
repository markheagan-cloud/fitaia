/**
 * Récompenses : éligibilité, motif du registre, état affichable. Pur : le serveur fournit le compte de
 * progression à jour et les réclamations existantes.
 */
import { stageRank } from '../progression/stages';
import type { ProgressionAccount, ProgressionEvent, StageDefinition } from '../progression/types';
import type { LedgerReason, RewardClaim, RewardDefinition, RewardStatus } from './types';

export type EligibilityContext = {
  account: ProgressionAccount;
  stages: readonly StageDefinition[];
  /** Attributions de PF du jour (pour les conditions « action du jour »). */
  eventsToday: readonly ProgressionEvent[];
};

export function progressTowards(def: RewardDefinition, ctx: EligibilityContext): { current: number; required: number } {
  const c = def.unlockCondition;
  switch (c.kind) {
    case 'lifetime_points':
      return { current: ctx.account.lifetimePoints, required: c.atLeast };
    case 'stage_reached': {
      const required = stageRank(ctx.stages, c.stageId);
      // Étape inconnue de la configuration : jamais atteignable.
      return { current: stageRank(ctx.stages, ctx.account.highestHistoricalStage), required: required === 0 ? Number.MAX_SAFE_INTEGER : required };
    }
    case 'action_completed_today':
      return { current: ctx.eventsToday.some((e) => e.actionType === c.action) ? 1 : 0, required: 1 };
  }
}

export function isEligible(def: RewardDefinition, ctx: EligibilityContext): boolean {
  const p = progressTowards(def, ctx);
  return p.current >= p.required;
}

export function ledgerReasonFor(def: RewardDefinition): LedgerReason {
  switch (def.unlockCondition.kind) {
    case 'lifetime_points':
      return 'progression_milestone';
    case 'stage_reached':
      return 'stage_reward';
    case 'action_completed_today':
      return 'daily_reward';
  }
}

/** Période d'une réclamation : le jour serveur pour une récompense répétable, sinon aucune. */
export function claimPeriod(def: RewardDefinition, dayKey: string): string | null {
  return def.repeatable ? dayKey : null;
}

export function rewardStatuses(
  definitions: readonly RewardDefinition[],
  claims: readonly RewardClaim[],
  ctx: EligibilityContext,
  dayKey: string,
): RewardStatus[] {
  return definitions
    .filter((d) => d.enabled)
    .map((reward) => {
      const periodKey = claimPeriod(reward, dayKey);
      const claimed = claims.some((c) => c.rewardId === reward.id && c.periodKey === periodKey);
      const progress = progressTowards(reward, ctx);
      const state = claimed ? 'claimed' : progress.current >= progress.required ? 'claimable' : 'locked';
      return { reward, state, periodKey, progress };
    });
}

/** Définition cohérente : montant entier positif, objet présent seulement pour « cosmetic », répétable seulement par jour. */
export function validateRewardDefinition(def: RewardDefinition, knownItemIds: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9_]{2,64}$/.test(def.id)) errors.push(def.id + ' : identifiant invalide');
  if (!Number.isSafeInteger(def.amount) || def.amount <= 0) errors.push(def.id + ' : montant invalide');
  if ((def.type === 'cosmetic') !== (def.cosmeticItemId !== undefined)) errors.push(def.id + ' : objet attendu seulement pour une récompense cosmétique');
  if (def.type === 'cosmetic' && def.amount !== 1) errors.push(def.id + ' : un objet cosmétique se donne à l’unité');
  if (def.cosmeticItemId !== undefined && !knownItemIds.has(def.cosmeticItemId)) errors.push(def.id + ' : objet inconnu');
  if (def.repeatable && def.unlockCondition.kind !== 'action_completed_today') errors.push(def.id + ' : seule une récompense quotidienne est répétable');
  return errors;
}
