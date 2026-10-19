/**
 * Économie FITAIA — types du domaine Fitcoins (monnaie virtuelle) et récompenses.
 *
 * Règle d'or : le téléphone ne décide jamais d'un montant. Il demande une récompense (rewardId), une action
 * (actionType + sourceId) ou un achat (itemId) ; le serveur vérifie, calcule, écrit la transaction et renvoie
 * le nouvel état. Les PF ne sont PAS une monnaie : ils n'apparaissent jamais dans ce registre.
 */
import type { AwardRejectionCode, ActionType, StageId } from '../progression/types';
import type { CosmeticCategory } from '../inventory/types';

export type Currency = 'FITCOIN';

/** Sens du mouvement : crédit (earn, refund, migration) ou débit (spend). */
export type TransactionType = 'earn' | 'spend' | 'refund' | 'migration';

/** Motif métier lisible dans le registre (« pourquoi j'avais 800 et j'en ai 300 »). */
export type LedgerReason =
  | 'progression_milestone'
  | 'stage_reward'
  | 'daily_reward'
  | 'cosmetic_purchase'
  | 'purchase_refund'
  | 'legacy_migration';

export type SourceType = 'reward' | 'cosmetic_item' | 'transaction' | 'migration';

export const TRANSACTION_TYPES: readonly TransactionType[] = ['earn', 'spend', 'refund', 'migration'];
export const LEDGER_REASONS: readonly LedgerReason[] = ['progression_milestone', 'stage_reward', 'daily_reward', 'cosmetic_purchase', 'purchase_refund', 'legacy_migration'];
export const SOURCE_TYPES: readonly SourceType[] = ['reward', 'cosmetic_item', 'transaction', 'migration'];

export type TransactionMetadata = Readonly<Record<string, string | number | boolean | null>>;

export type FitcoinWallet = {
  userId: string;
  balance: number;
  /** Gains cumulés (récompenses + solde d'ouverture migré). */
  lifetimeEarned: number;
  /** Dépenses nettes cumulées (un remboursement annule la dépense correspondante). */
  lifetimeSpent: number;
  createdAt: string;
  updatedAt: string;
};

/** Ligne du registre : immuable une fois écrite. `amount` est signé (+ crédit, − débit). */
export type EconomyTransaction = {
  id: string;
  userId: string;
  /** Rang dans le registre de l'utilisateur (1, 2, 3…) : ordre exact de rejeu. */
  sequence: number;
  type: TransactionType;
  currency: Currency;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: LedgerReason;
  sourceType: SourceType;
  sourceId: string;
  idempotencyKey: string;
  metadata: TransactionMetadata;
  createdAt: string;
};

/** Types de récompense prévus dès maintenant (capsule : ouverture construite en Phase 5). */
export type RewardType = 'fitcoins' | 'cosmetic' | 'badge' | 'capsule';

export type UnlockCondition =
  | { kind: 'lifetime_points'; atLeast: number }
  | { kind: 'stage_reached'; stageId: StageId }
  | { kind: 'action_completed_today'; action: ActionType };

export type RewardDefinition = {
  id: string;
  type: RewardType;
  /** Fitcoins crédités, nombre de capsules ; 1 pour un objet ou un badge. */
  amount: number;
  cosmeticItemId?: string;
  unlockCondition: UnlockCondition;
  /** Répétable = une fois par jour (seulement avec `action_completed_today`). */
  repeatable: boolean;
  enabled: boolean;
};

/** `pending` : récompense due mais pas encore remise (capsule en attente d'ouverture, Phase 5). */
export type RewardClaimStatus = 'fulfilled' | 'pending';

export type RewardClaim = {
  id: string;
  userId: string;
  rewardId: string;
  status: RewardClaimStatus;
  /** Jour de la réclamation pour une récompense répétable, sinon null. */
  periodKey: string | null;
  claimedAt: string;
  idempotencyKey: string;
  transactionId: string | null;
  /** Objet déjà possédé au moment de la récompense (aucun doublon créé). */
  duplicateItem: boolean;
};

export type RewardState = 'locked' | 'claimable' | 'claimed';

export type RewardStatus = {
  reward: RewardDefinition;
  state: RewardState;
  periodKey: string | null;
  /** Progression vers la condition (PF pour un palier, rang pour une étape, 0/1 pour une action du jour). */
  progress: { current: number; required: number };
};

export type ClaimRejectionCode = 'UNKNOWN_REWARD' | 'REWARD_DISABLED' | 'NOT_ELIGIBLE' | 'ITEM_UNAVAILABLE';

export type SpendRejectionCode =
  | 'INVALID_REQUEST_ID'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'ITEM_NOT_FOUND'
  | 'ITEM_DISABLED'
  | 'NOT_FOR_SALE'
  | 'ALREADY_OWNED'
  | 'INSUFFICIENT_FUNDS';

export type RefundRejectionCode = 'TRANSACTION_NOT_FOUND' | 'NOT_REFUNDABLE' | 'INVALID_REASON';

export type RejectionCode = AwardRejectionCode | ClaimRejectionCode;

export type ClaimOutcome =
  | {
      ok: true;
      replayed: boolean;
      rewardType: RewardType;
      claim: RewardClaim;
      transaction: EconomyTransaction | null;
      wallet: FitcoinWallet;
      item: { itemId: string; category: CosmeticCategory; duplicate: boolean } | null;
    }
  | { ok: false; code: ClaimRejectionCode; wallet: FitcoinWallet };

export type SpendRequest = { itemId: string; requestId: string };

export type SpendOutcome =
  | { ok: true; replayed: boolean; transaction: EconomyTransaction; wallet: FitcoinWallet; item: { itemId: string; category: CosmeticCategory } }
  | { ok: false; code: SpendRejectionCode; wallet: FitcoinWallet };

export type RefundReason = 'support' | 'item_withdrawn' | 'purchase_error';

export type RefundOutcome =
  | { ok: true; replayed: boolean; transaction: EconomyTransaction; wallet: FitcoinWallet }
  | { ok: false; code: RefundRejectionCode };

export type MigrationOutcome =
  | { ok: true; replayed: boolean; transaction: EconomyTransaction | null; wallet: FitcoinWallet }
  | { ok: false; code: 'INVALID_AMOUNT' };

export type TransactionQuery = { limit?: number; beforeSequence?: number };
