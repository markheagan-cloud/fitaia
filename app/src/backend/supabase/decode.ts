/**
 * Décodage strict des réponses JSON des fonctions SQL de la migration 0002 vers les types du domaine.
 * Toute réponse inattendue lève une erreur : l'app n'affiche jamais un solde ou un état mal compris.
 */
import type {
  ClaimOutcome,
  EconomyTransaction,
  FitcoinWallet,
  RewardClaim,
  RewardDefinition,
  RewardStatus,
  SpendOutcome,
  TransactionMetadata,
  UnlockCondition,
} from '../../economy/types';
import { LEDGER_REASONS, SOURCE_TYPES, TRANSACTION_TYPES } from '../../economy/types';
import type { CosmeticCategory, CosmeticItem, EquipOutcome, EquippedCosmetics, InventoryEntry, UserInventory } from '../../inventory/types';
import { COSMETIC_CATEGORIES, RARITIES } from '../../inventory/types';
import { ALLOWED_ACTION_TYPES, STAGES } from '../../progression/progressionRules';
import type { AwardOutcome, AwardRejectionCode, PeerAwardOutcome, ProgressionAccount, ProgressionEvent, StageId } from '../../progression/types';

export class DecodeError extends Error {}

type Json = Record<string, unknown>;

function obj(value: unknown, what: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new DecodeError(what + ' : objet attendu');
  return value as Json;
}
function arr(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new DecodeError(what + ' : liste attendue');
  return value;
}
function str(o: Json, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new DecodeError(key + ' : texte attendu');
  return v;
}
function optStr(o: Json, key: string): string | null {
  return o[key] === null || o[key] === undefined ? null : str(o, key);
}
function int(o: Json, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new DecodeError(key + ' : entier attendu');
  return v;
}
function bool(o: Json, key: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new DecodeError(key + ' : booléen attendu');
  return v;
}
function oneOf<T extends string>(o: Json, key: string, values: readonly T[]): T {
  const v = str(o, key);
  if (!(values as readonly string[]).includes(v)) throw new DecodeError(key + ' : valeur inconnue « ' + v + ' »');
  return v as T;
}
/** Horodatage ISO 8601 normalisé au format de l'app (UTC, millisecondes). */
function iso(o: Json, key: string): string {
  const d = new Date(str(o, key));
  if (Number.isNaN(d.getTime())) throw new DecodeError(key + ' : date invalide');
  return d.toISOString();
}

const STAGE_IDS: readonly StageId[] = STAGES.map((s) => s.id);
const AWARD_CODES: readonly AwardRejectionCode[] = ['UNKNOWN_ACTION', 'ACTION_DISABLED', 'WRONG_GRANT_MODE', 'INVALID_SOURCE', 'NOT_VERIFIED', 'DAILY_CAP_REACHED', 'SELF_PEER_FORBIDDEN', 'UNKNOWN_TARGET', 'BLOCKED'];

export function decodeAccount(value: unknown): ProgressionAccount {
  const o = obj(value, 'compte de progression');
  return {
    userId: str(o, 'userId'),
    lifetimePoints: int(o, 'lifetimePoints'),
    weeklyPoints: int(o, 'weeklyPoints'),
    seasonPoints: int(o, 'seasonPoints'),
    weekKey: str(o, 'weekKey'),
    seasonKey: str(o, 'seasonKey'),
    currentStage: oneOf(o, 'currentStage', STAGE_IDS),
    highestHistoricalStage: oneOf(o, 'highestHistoricalStage', STAGE_IDS),
    createdAt: iso(o, 'createdAt'),
    updatedAt: iso(o, 'updatedAt'),
  };
}

function decodeProgressionEvent(value: unknown): ProgressionEvent {
  const o = obj(value, 'attribution');
  return {
    id: str(o, 'id'),
    userId: str(o, 'userId'),
    actionType: oneOf(o, 'actionType', ALLOWED_ACTION_TYPES),
    sourceId: str(o, 'sourceId'),
    actorId: optStr(o, 'actorId'),
    points: int(o, 'points'),
    dayKey: str(o, 'dayKey'),
    weekKey: str(o, 'weekKey'),
    seasonKey: str(o, 'seasonKey'),
    idempotencyKey: str(o, 'idempotencyKey'),
    createdAt: iso(o, 'createdAt'),
  };
}

export function decodeAwardOutcome(value: unknown): AwardOutcome {
  const o = obj(value, 'attribution');
  if (!bool(o, 'ok')) return { ok: false, code: oneOf(o, 'code', AWARD_CODES), account: decodeAccount(o.account) };
  const sc = o.stageChange === null ? null : obj(o.stageChange, 'changement d’étape');
  return {
    ok: true,
    replayed: bool(o, 'replayed'),
    award: decodeProgressionEvent(o.award),
    account: decodeAccount(o.account),
    stageChange: sc ? { from: oneOf(sc, 'from', STAGE_IDS), to: oneOf(sc, 'to', STAGE_IDS) } : null,
  };
}

export function decodePeerOutcome(value: unknown): PeerAwardOutcome {
  const o = obj(value, 'attribution');
  return bool(o, 'ok') ? { ok: true, replayed: bool(o, 'replayed'), points: int(o, 'points') } : { ok: false, code: oneOf(o, 'code', AWARD_CODES) };
}

export function decodeWallet(value: unknown): FitcoinWallet {
  const o = obj(value, 'wallet');
  return {
    userId: str(o, 'userId'),
    balance: int(o, 'balance'),
    lifetimeEarned: int(o, 'lifetimeEarned'),
    lifetimeSpent: int(o, 'lifetimeSpent'),
    createdAt: iso(o, 'createdAt'),
    updatedAt: iso(o, 'updatedAt'),
  };
}

function decodeMetadata(value: unknown): TransactionMetadata {
  const o = obj(value, 'métadonnées');
  for (const v of Object.values(o)) {
    if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') throw new DecodeError('métadonnées : valeur simple attendue');
  }
  return o as TransactionMetadata;
}

export function decodeTransaction(value: unknown): EconomyTransaction {
  const o = obj(value, 'transaction');
  if (str(o, 'currency') !== 'FITCOIN') throw new DecodeError('currency : FITCOIN attendu');
  return {
    id: str(o, 'id'),
    userId: str(o, 'userId'),
    sequence: int(o, 'sequence'),
    type: oneOf(o, 'type', TRANSACTION_TYPES),
    currency: 'FITCOIN',
    amount: int(o, 'amount'),
    balanceBefore: int(o, 'balanceBefore'),
    balanceAfter: int(o, 'balanceAfter'),
    reason: oneOf(o, 'reason', LEDGER_REASONS),
    sourceType: oneOf(o, 'sourceType', SOURCE_TYPES),
    sourceId: str(o, 'sourceId'),
    idempotencyKey: str(o, 'idempotencyKey'),
    metadata: decodeMetadata(o.metadata),
    createdAt: iso(o, 'createdAt'),
  };
}

export function decodeTransactions(value: unknown): EconomyTransaction[] {
  return arr(value, 'registre').map(decodeTransaction);
}

function decodeCondition(value: unknown): UnlockCondition {
  const o = obj(value, 'condition');
  const kind = oneOf(o, 'kind', ['lifetime_points', 'stage_reached', 'action_completed_today'] as const);
  switch (kind) {
    case 'lifetime_points':
      return { kind, atLeast: int(o, 'atLeast') };
    case 'stage_reached':
      return { kind, stageId: oneOf(o, 'stageId', STAGE_IDS) };
    case 'action_completed_today':
      return { kind, action: oneOf(o, 'action', ALLOWED_ACTION_TYPES) };
  }
}

function decodeRewardDefinition(value: unknown): RewardDefinition {
  const o = obj(value, 'récompense');
  const item = optStr(o, 'cosmeticItemId');
  return {
    id: str(o, 'id'),
    type: oneOf(o, 'type', ['fitcoins', 'cosmetic', 'badge', 'capsule'] as const),
    amount: int(o, 'amount'),
    ...(item === null ? {} : { cosmeticItemId: item }),
    unlockCondition: decodeCondition(o.unlockCondition),
    repeatable: bool(o, 'repeatable'),
    enabled: bool(o, 'enabled'),
  };
}

export function decodeRewardStatuses(value: unknown): RewardStatus[] {
  return arr(value, 'récompenses').map((v) => {
    const o = obj(v, 'état de récompense');
    const p = obj(o.progress, 'progression');
    return {
      reward: decodeRewardDefinition(o.reward),
      state: oneOf(o, 'state', ['locked', 'claimable', 'claimed'] as const),
      periodKey: optStr(o, 'periodKey'),
      progress: { current: int(p, 'current'), required: int(p, 'required') },
    };
  });
}

function decodeClaim(value: unknown): RewardClaim {
  const o = obj(value, 'réclamation');
  return {
    id: str(o, 'id'),
    userId: str(o, 'userId'),
    rewardId: str(o, 'rewardId'),
    status: oneOf(o, 'status', ['fulfilled', 'pending'] as const),
    periodKey: optStr(o, 'periodKey'),
    claimedAt: iso(o, 'claimedAt'),
    idempotencyKey: str(o, 'idempotencyKey'),
    transactionId: optStr(o, 'transactionId'),
    duplicateItem: bool(o, 'duplicateItem'),
  };
}

export function decodeClaimOutcome(value: unknown): ClaimOutcome {
  const o = obj(value, 'réclamation');
  if (!bool(o, 'ok')) {
    return { ok: false, code: oneOf(o, 'code', ['UNKNOWN_REWARD', 'REWARD_DISABLED', 'NOT_ELIGIBLE', 'ITEM_UNAVAILABLE'] as const), wallet: decodeWallet(o.wallet) };
  }
  const item = o.item === null ? null : obj(o.item, 'objet');
  return {
    ok: true,
    replayed: bool(o, 'replayed'),
    rewardType: oneOf(o, 'rewardType', ['fitcoins', 'cosmetic', 'badge', 'capsule'] as const),
    claim: decodeClaim(o.claim),
    transaction: o.transaction === null ? null : decodeTransaction(o.transaction),
    wallet: decodeWallet(o.wallet),
    item: item ? { itemId: str(item, 'itemId'), category: oneOf(item, 'category', COSMETIC_CATEGORIES), duplicate: bool(item, 'duplicate') } : null,
  };
}

export function decodeSpendOutcome(value: unknown): SpendOutcome {
  const o = obj(value, 'achat');
  if (!bool(o, 'ok')) {
    const codes = ['INVALID_REQUEST_ID', 'IDEMPOTENCY_KEY_REUSED', 'ITEM_NOT_FOUND', 'ITEM_DISABLED', 'NOT_FOR_SALE', 'ALREADY_OWNED', 'INSUFFICIENT_FUNDS'] as const;
    return { ok: false, code: oneOf(o, 'code', codes), wallet: decodeWallet(o.wallet) };
  }
  const item = obj(o.item, 'objet');
  return {
    ok: true,
    replayed: bool(o, 'replayed'),
    transaction: decodeTransaction(o.transaction),
    wallet: decodeWallet(o.wallet),
    item: { itemId: str(item, 'itemId'), category: oneOf(item, 'category', COSMETIC_CATEGORIES) },
  };
}

export function decodeCatalog(value: unknown): CosmeticItem[] {
  return arr(value, 'catalogue').map((v) => {
    const o = obj(v, 'objet');
    return {
      id: str(o, 'id'),
      name: str(o, 'name'),
      category: oneOf(o, 'category', COSMETIC_CATEGORIES),
      rarity: oneOf(o, 'rarity', RARITIES),
      assetReference: str(o, 'assetReference'),
      source: oneOf(o, 'source', ['SHOP', 'REWARD', 'EVENT', 'LIMITED', 'PRESTIGE'] as const),
      priceFitcoins: o.priceFitcoins === null ? null : int(o, 'priceFitcoins'),
      enabled: bool(o, 'enabled'),
      createdAt: iso(o, 'createdAt'),
    };
  });
}

function decodeEquipped(value: unknown): EquippedCosmetics {
  const o = obj(value, 'objets portés');
  const equipped: EquippedCosmetics = {};
  for (const [slot, itemId] of Object.entries(o)) {
    if (!(COSMETIC_CATEGORIES as readonly string[]).includes(slot) || typeof itemId !== 'string') throw new DecodeError('objets portés : emplacement invalide');
    equipped[slot as CosmeticCategory] = itemId;
  }
  return equipped;
}

export function decodeInventory(value: unknown): UserInventory {
  const o = obj(value, 'inventaire');
  const items: InventoryEntry[] = arr(o.items, 'objets').map((v) => {
    const e = obj(v, 'objet possédé');
    return {
      itemId: str(e, 'itemId'),
      acquiredVia: oneOf(e, 'acquiredVia', ['purchase', 'reward', 'grant'] as const),
      acquiredAt: iso(e, 'acquiredAt'),
      sourceTransactionId: optStr(e, 'sourceTransactionId'),
      sourceClaimId: optStr(e, 'sourceClaimId'),
    };
  });
  return { userId: str(o, 'userId'), items, equipped: decodeEquipped(o.equipped) };
}

export function decodeEquipOutcome(value: unknown): EquipOutcome {
  const o = obj(value, 'équipement');
  if (!bool(o, 'ok')) return { ok: false, code: oneOf(o, 'code', ['ITEM_NOT_FOUND', 'NOT_OWNED', 'INVALID_SLOT'] as const) };
  return {
    ok: true,
    changed: bool(o, 'changed'),
    equipped: decodeEquipped(o.equipped),
    unequipped: arr(o.unequipped, 'objets retirés').map((v) => {
      if (typeof v !== 'string') throw new DecodeError('objets retirés : texte attendu');
      return v;
    }),
  };
}
