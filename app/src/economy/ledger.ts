/**
 * Registre Fitcoins : écriture d'une ligne et rejeu. Le solde n'est jamais modifié autrement que par une
 * ligne du registre ; `replayLedger` reconstruit exactement le wallet à partir des lignes (audit, support).
 *
 * earnFitcoins / spendFitcoins / refundFitcoins sont des opérations SERVEUR : leurs montants viennent toujours
 * d'une source résolue par le serveur (définition de récompense, prix du catalogue, transaction d'origine),
 * jamais d'un paramètre envoyé par le téléphone.
 */
import type {
  EconomyTransaction,
  FitcoinWallet,
  LedgerReason,
  SourceType,
  TransactionMetadata,
  TransactionType,
} from './types';

export type LedgerState = { wallet: FitcoinWallet; transactions: readonly EconomyTransaction[] };

export type LedgerEntryInput = {
  reason: LedgerReason;
  sourceType: SourceType;
  sourceId: string;
  idempotencyKey: string;
  metadata: TransactionMetadata;
};

export type LedgerContext = { id: string; at: string };

export function emptyWallet(userId: string, at: string): FitcoinWallet {
  return { userId, balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, createdAt: at, updatedAt: at };
}

function assertPositiveAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Montant de Fitcoins invalide');
}

function post(state: LedgerState, type: TransactionType, signedAmount: number, entry: LedgerEntryInput, ctx: LedgerContext): { state: LedgerState; transaction: EconomyTransaction } {
  if (state.transactions.some((t) => t.idempotencyKey === entry.idempotencyKey)) {
    throw new Error('Clé d’idempotence déjà utilisée');
  }
  const before = state.wallet.balance;
  const after = before + signedAmount;
  if (after < 0) throw new Error('Solde négatif refusé');
  const last = state.transactions[state.transactions.length - 1];
  const transaction: EconomyTransaction = {
    id: ctx.id,
    userId: state.wallet.userId,
    sequence: (last?.sequence ?? 0) + 1,
    type,
    currency: 'FITCOIN',
    amount: signedAmount,
    balanceBefore: before,
    balanceAfter: after,
    reason: entry.reason,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    idempotencyKey: entry.idempotencyKey,
    metadata: entry.metadata,
    createdAt: ctx.at,
  };
  const wallet: FitcoinWallet = {
    ...state.wallet,
    balance: after,
    lifetimeEarned: state.wallet.lifetimeEarned + (type === 'earn' || type === 'migration' ? signedAmount : 0),
    lifetimeSpent: state.wallet.lifetimeSpent + (type === 'spend' || type === 'refund' ? -signedAmount : 0),
    updatedAt: ctx.at,
  };
  return { state: { wallet, transactions: [...state.transactions, transaction] }, transaction };
}

/** Crédit issu d'une source serveur (récompense, solde d'ouverture migré). */
export function earnFitcoins(state: LedgerState, type: 'earn' | 'migration', amount: number, entry: LedgerEntryInput, ctx: LedgerContext) {
  assertPositiveAmount(amount);
  return post(state, type, amount, entry, ctx);
}

/** Débit au prix fixé par le serveur ; refusé (sans écriture) si le solde ne suffit pas. */
export function spendFitcoins(
  state: LedgerState,
  price: number,
  entry: LedgerEntryInput,
  ctx: LedgerContext,
): { ok: true; state: LedgerState; transaction: EconomyTransaction } | { ok: false; code: 'INSUFFICIENT_FUNDS' } {
  assertPositiveAmount(price);
  if (state.wallet.balance < price) return { ok: false, code: 'INSUFFICIENT_FUNDS' };
  return { ok: true, ...post(state, 'spend', -price, entry, ctx) };
}

/** Annule exactement une dépense (montant repris de la transaction d'origine). */
export function refundFitcoins(state: LedgerState, original: EconomyTransaction, entry: LedgerEntryInput, ctx: LedgerContext) {
  if (original.type !== 'spend' || original.userId !== state.wallet.userId) throw new Error('Transaction non remboursable');
  return post(state, 'refund', -original.amount, entry, ctx);
}

export type ReplayResult =
  | { ok: true; balance: number; lifetimeEarned: number; lifetimeSpent: number }
  | { ok: false; sequence: number; problem: string };

/** Rejoue le registre depuis zéro et vérifie chaque maillon (ordre, soldes avant/après, signe, jamais négatif). */
export function replayLedger(transactions: readonly EconomyTransaction[]): ReplayResult {
  const list = [...transactions].sort((a, b) => a.sequence - b.sequence);
  let balance = 0;
  let lifetimeEarned = 0;
  let lifetimeSpent = 0;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.sequence !== i + 1) return { ok: false, sequence: t.sequence, problem: 'séquence discontinue' };
    if (t.balanceBefore !== balance) return { ok: false, sequence: t.sequence, problem: 'solde avant incohérent' };
    if (t.balanceAfter !== t.balanceBefore + t.amount) return { ok: false, sequence: t.sequence, problem: 'solde après incohérent' };
    if (t.balanceAfter < 0) return { ok: false, sequence: t.sequence, problem: 'solde négatif' };
    if ((t.type === 'spend') !== t.amount < 0 || t.amount === 0) return { ok: false, sequence: t.sequence, problem: 'signe du montant' };
    balance = t.balanceAfter;
    if (t.type === 'earn' || t.type === 'migration') lifetimeEarned += t.amount;
    else lifetimeSpent -= t.amount;
  }
  return { ok: true, balance, lifetimeEarned, lifetimeSpent };
}

/** Le wallet stocké est-il exactement la somme de son registre ? */
export function ledgerMatchesWallet(wallet: FitcoinWallet, transactions: readonly EconomyTransaction[]): boolean {
  const r = replayLedger(transactions);
  return r.ok && r.balance === wallet.balance && r.lifetimeEarned === wallet.lifetimeEarned && r.lifetimeSpent === wallet.lifetimeSpent;
}
