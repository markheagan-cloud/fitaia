/**
 * Textes destinés au membre pour chaque refus (prêts pour l'intégration UI ; aucun écran n'est branché en Phase 2).
 */
import type { AwardRejectionCode } from '../progression/types';
import type { EquipRejectionCode } from '../inventory/types';
import type { ClaimRejectionCode, SpendRejectionCode } from './types';

export type UserFacingCode = AwardRejectionCode | ClaimRejectionCode | SpendRejectionCode | EquipRejectionCode;

export function rejectionMessage(code: UserFacingCode): string {
  switch (code) {
    case 'UNKNOWN_ACTION':
    case 'ACTION_DISABLED':
    case 'WRONG_GRANT_MODE':
      return 'Cette action ne rapporte pas de Points FITAIA.';
    case 'INVALID_SOURCE':
    case 'INVALID_REQUEST_ID':
    case 'INVALID_SLOT':
      return 'Demande incomplète, réessaie.';
    case 'NOT_VERIFIED':
      return 'Action introuvable de notre côté, elle n’a pas été comptée.';
    case 'DAILY_CAP_REACHED':
      return 'Maximum du jour atteint pour cette action. Reviens demain.';
    case 'SELF_PEER_FORBIDDEN':
      return 'Tu ne peux pas te l’accorder toi-même.';
    case 'UNKNOWN_TARGET':
      return 'Ce membre n’existe plus.';
    case 'BLOCKED':
      return 'Action impossible avec ce membre.';
    case 'UNKNOWN_REWARD':
    case 'REWARD_DISABLED':
      return 'Cette récompense n’est plus disponible.';
    case 'NOT_ELIGIBLE':
      return 'Pas encore débloquée : continue ton Parcours.';
    case 'ITEM_UNAVAILABLE':
    case 'ITEM_NOT_FOUND':
    case 'ITEM_DISABLED':
      return 'Cet objet n’est plus disponible.';
    case 'NOT_FOR_SALE':
      return 'Cet objet ne s’achète pas : il se mérite.';
    case 'IDEMPOTENCY_KEY_REUSED':
      return 'Achat déjà traité pour un autre objet, réessaie.';
    case 'ALREADY_OWNED':
      return 'Tu possèdes déjà cet objet.';
    case 'INSUFFICIENT_FUNDS':
      return 'Il te manque des Fitcoins pour cet objet.';
    case 'NOT_OWNED':
      return 'Tu ne possèdes pas encore cet objet.';
  }
}
