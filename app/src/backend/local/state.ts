/**
 * État d'un utilisateur dans le serveur LOCAL de démonstration : un seul document par utilisateur, écrit en une
 * fois (atomicité de l'écriture) sous le verrou de cet utilisateur.
 */
import type { EconomyTransaction, FitcoinWallet, RewardClaim } from '../../economy/types';
import type { EquippedCosmetics, InventoryEntry } from '../../inventory/types';
import type { ProgressionAccount, ProgressionEvent } from '../../progression/types';

export const LOCAL_STATE_VERSION = 1;

export type UserState = {
  schemaVersion: typeof LOCAL_STATE_VERSION;
  userId: string;
  progression: ProgressionAccount | null;
  progressionEvents: ProgressionEvent[];
  wallet: FitcoinWallet | null;
  transactions: EconomyTransaction[];
  claims: RewardClaim[];
  inventory: InventoryEntry[];
  equipped: EquippedCosmetics;
};

export function emptyUserState(userId: string): UserState {
  return {
    schemaVersion: LOCAL_STATE_VERSION,
    userId,
    progression: null,
    progressionEvents: [],
    wallet: null,
    transactions: [],
    claims: [],
    inventory: [],
    equipped: {},
  };
}

export class LocalStateError extends Error {}

/** Relit un document ; une donnée illisible n'est JAMAIS remplacée en silence par un état vide (perte de solde). */
export function decodeUserState(raw: string, userId: string): UserState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LocalStateError('Données locales illisibles');
  }
  const s = parsed as Partial<UserState> | null;
  const arrays: (keyof UserState)[] = ['progressionEvents', 'transactions', 'claims', 'inventory'];
  if (
    !s ||
    typeof s !== 'object' ||
    s.schemaVersion !== LOCAL_STATE_VERSION ||
    s.userId !== userId ||
    arrays.some((k) => !Array.isArray(s[k])) ||
    typeof s.equipped !== 'object' ||
    s.equipped === null
  ) {
    throw new LocalStateError('Données locales incompatibles');
  }
  return s as UserState;
}
