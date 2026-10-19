/**
 * Calcul serveur d'une attribution de Points FITAIA : règle, source, clé d'idempotence, plafond quotidien.
 * Fonction pure : le serveur (local ou SQL) fournit l'état, elle décide ; elle n'écrit rien.
 */
import { progressionAwardKey } from '../platform/idempotency';
import type { ActionRule, ActionType, AwardRejectionCode, ProgressionEvent, ProgressionRules } from './types';

/** Identifiant de source accepté (repas, activité, défi, encouragement, conseil). */
export const SOURCE_ID_PATTERN = /^[A-Za-z0-9:_.-]{1,128}$/;

export function ruleFor(rules: ProgressionRules, action: string): (ActionRule & { grantMode: 'self' | 'peer' }) | undefined {
  return Object.prototype.hasOwnProperty.call(rules, action) ? rules[action as ActionType] : undefined;
}

export type AwardRequest = {
  beneficiaryId: string;
  actorId: string | null;
  actionType: string;
  sourceId: string | null;
  grantMode: 'self' | 'peer';
  dayKey: string;
};

export type AwardPlan =
  | { ok: true; actionType: ActionType; rule: ActionRule; sourceId: string; idempotencyKey: string }
  | { ok: false; code: AwardRejectionCode };

/**
 * Résout la règle, la source et la clé d'idempotence. Le serveur cherche ensuite un rejeu AVANT de regarder si la
 * règle est encore active (même demande → même réponse), puis applique le plafond du jour sous verrou.
 */
export function planAward(rules: ProgressionRules, request: AwardRequest): AwardPlan {
  const rule = ruleFor(rules, request.actionType);
  if (!rule) return { ok: false, code: 'UNKNOWN_ACTION' };
  if (rule.grantMode !== request.grantMode) return { ok: false, code: 'WRONG_GRANT_MODE' };
  if (request.grantMode === 'peer' && request.actorId === request.beneficiaryId) return { ok: false, code: 'SELF_PEER_FORBIDDEN' };
  let sourceId: string;
  if (rule.dedupe === 'day') sourceId = request.dayKey;
  else if (request.sourceId !== null && SOURCE_ID_PATTERN.test(request.sourceId)) sourceId = request.sourceId;
  else return { ok: false, code: 'INVALID_SOURCE' };
  const actionType = request.actionType as ActionType;
  const idempotencyKey = progressionAwardKey(request.beneficiaryId, actionType, sourceId, request.grantMode === 'peer' ? request.actorId : null);
  return { ok: true, actionType, rule, sourceId, idempotencyKey };
}

/** PF déjà attribués aujourd'hui pour cette action. */
export function pointsToday(events: readonly ProgressionEvent[], actionType: ActionType, dayKey: string): number {
  let sum = 0;
  for (const e of events) if (e.actionType === actionType && e.dayKey === dayKey) sum += e.points;
  return sum;
}

/** Montant attribuable : la valeur de la règle, tronquée au reste du plafond du jour ; 0 = plafond atteint. */
export function cappedPoints(rule: ActionRule, alreadyToday: number): number {
  return Math.max(0, Math.min(rule.points, rule.dailyCap - alreadyToday));
}
