/**
 * Formats des clés d'idempotence (identiques côté SQL, contrainte UNIQUE). Deux requêtes identiques produisent
 * la même clé, donc une seule écriture : la seconde rejoue le résultat de la première.
 *
 *  pf:<bénéficiaire>:<action>:<source>[:<auteur>]   attribution de PF (auteur seulement pour une action « peer »)
 *  reward:<user>:<rewardId>[:<jour>]                 récompense (jour seulement si répétable)
 *  purchase:<user>:<requestId>                       achat (requestId généré une fois par intention d'achat)
 *  refund:<transactionId>                            remboursement (au plus un par achat)
 *  migration:<version>:<user>                        solde d'ouverture issu de l'ancienne monnaie
 */
import type { ActionType } from '../progression/types';

export function progressionAwardKey(beneficiaryId: string, action: ActionType, sourceId: string, actorId: string | null): string {
  return `pf:${beneficiaryId}:${action}:${sourceId}` + (actorId ? `:${actorId}` : '');
}

export function rewardClaimKey(userId: string, rewardId: string, periodKey: string | null): string {
  return `reward:${userId}:${rewardId}` + (periodKey ? `:${periodKey}` : '');
}

/** Identifiant d'intention d'achat fourni par l'app (UUID ou équivalent). */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function purchaseKey(userId: string, requestId: string): string {
  return `purchase:${userId}:${requestId}`;
}

export function refundKey(transactionId: string): string {
  return `refund:${transactionId}`;
}

export function migrationKey(version: string, userId: string): string {
  return `migration:${version}:${userId}`;
}
