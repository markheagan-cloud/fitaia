/**
 * Compte de progression : création, application d'une attribution, normalisation à la lecture.
 * Permanent (lifetimePoints, highestHistoricalStage) : ne descend jamais. Hebdomadaire et saisonnier : remis à
 * zéro au changement de période (paresseusement, à la prochaine attribution ou lecture).
 */
import { higherStage, stageForPoints } from './stages';
import type { ProgressionAccount, ProgressionEvent, StageChange, StageDefinition } from './types';

export type Period = { weekKey: string; seasonKey: string };

export function newAccount(userId: string, stages: readonly StageDefinition[], period: Period, at: string): ProgressionAccount {
  const first = stageForPoints(stages, 0).id;
  return {
    userId,
    lifetimePoints: 0,
    weeklyPoints: 0,
    seasonPoints: 0,
    weekKey: period.weekKey,
    seasonKey: period.seasonKey,
    currentStage: first,
    highestHistoricalStage: first,
    createdAt: at,
    updatedAt: at,
  };
}

/** Vue à jour pour la période courante, sans écriture (mêmes règles que `_progression_json` en SQL). */
export function normalizeAccount(account: ProgressionAccount, stages: readonly StageDefinition[], period: Period): ProgressionAccount {
  const live = stageForPoints(stages, account.lifetimePoints).id;
  return {
    ...account,
    weeklyPoints: account.weekKey === period.weekKey ? account.weeklyPoints : 0,
    seasonPoints: account.seasonKey === period.seasonKey ? account.seasonPoints : 0,
    weekKey: period.weekKey,
    seasonKey: period.seasonKey,
    currentStage: live,
    highestHistoricalStage: higherStage(stages, account.highestHistoricalStage, live),
  };
}

export function applyAward(
  account: ProgressionAccount,
  event: ProgressionEvent,
  stages: readonly StageDefinition[],
): { account: ProgressionAccount; stageChange: StageChange | null } {
  if (!Number.isSafeInteger(event.points) || event.points <= 0) throw new Error('Attribution de PF invalide');
  const lifetimePoints = account.lifetimePoints + event.points;
  const currentStage = stageForPoints(stages, lifetimePoints).id;
  const next: ProgressionAccount = {
    ...account,
    lifetimePoints,
    weeklyPoints: (account.weekKey === event.weekKey ? account.weeklyPoints : 0) + event.points,
    seasonPoints: (account.seasonKey === event.seasonKey ? account.seasonPoints : 0) + event.points,
    weekKey: event.weekKey,
    seasonKey: event.seasonKey,
    currentStage,
    highestHistoricalStage: higherStage(stages, account.highestHistoricalStage, currentStage),
    updatedAt: event.createdAt,
  };
  const stageChange = currentStage !== account.currentStage ? { from: account.currentStage, to: currentStage } : null;
  return { account: next, stageChange };
}
