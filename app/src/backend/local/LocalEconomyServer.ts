/**
 * SERVEUR LOCAL DE DÉMONSTRATION de la Phase 2 (aucun réseau, aucune donnée réelle).
 *
 * Il simule fidèlement le futur serveur : c'est lui, et non l'écran, qui calcule les PF, vérifie l'éligibilité,
 * lit les prix et écrit le registre. Chaque opération d'un utilisateur passe par un verrou propre à cet
 * utilisateur (équivalent du `SELECT … FOR UPDATE` des fonctions SQL) puis écrit son document en une fois.
 * Les mêmes règles sont implémentées en SQL (migration 0002) ; les deux sont testés par la même suite.
 */
import { type DomainEventBus, type PendingEvent, createEventBus } from '../../platform/events';
import { type Clock, systemClock } from '../../platform/clock';
import { type IdGenerator, uuidGenerator } from '../../platform/ids';
import { KeyedMutex } from '../../platform/mutex';
import type { KeyValueStorage } from '../../platform/storage';
import { dayKeyIn, seasonKeyOf, weekKeyOf } from '../../platform/calendar';
import { REQUEST_ID_PATTERN, migrationKey, purchaseKey, refundKey, rewardClaimKey } from '../../platform/idempotency';
import { applyAward, newAccount, normalizeAccount } from '../../progression/account';
import type { Period } from '../../progression/account';
import { cappedPoints, planAward, pointsToday } from '../../progression/points';
import type { ActionVerifier, AwardOutcome, PeerAwardOutcome, ProgressionAccount, ProgressionEvent } from '../../progression/types';
import { earnFitcoins, emptyWallet, ledgerMatchesWallet, refundFitcoins, spendFitcoins } from '../../economy/ledger';
import type { LedgerState } from '../../economy/ledger';
import { openingFitcoins } from '../../economy/migration';
import { claimPeriod, isEligible, ledgerReasonFor, rewardStatuses } from '../../economy/rewards';
import type {
  ClaimOutcome,
  EconomyTransaction,
  FitcoinWallet,
  MigrationOutcome,
  RefundOutcome,
  RefundReason,
  RewardClaim,
  RewardStatus,
  SpendOutcome,
  SpendRequest,
  TransactionQuery,
} from '../../economy/types';
import { acquireItem, equipItem, isCategory, owns, purchaseBlock, revokeItem, unequipSlot } from '../../inventory/inventory';
import type { CosmeticItem, EquipOutcome, GrantOutcome, UserInventory } from '../../inventory/types';
import { DEFAULT_SERVER_CONFIG, type EconomyServerConfig, validateServerConfig } from '../config';
import { awardEvents, claimEvents, equipEvents, migrationEvents, peerAwardEvents, refundEvents, spendEvents } from '../eventMapping';
import { type UserState, decodeUserState, emptyUserState } from './state';

/** Démo : toute preuve est acceptée (les repas, activités et encouragements locaux ne quittent pas l'appareil). */
export const declarativeVerifier: ActionVerifier = { verify: async () => ({ ok: true }) };

export const REFUND_REASONS: readonly RefundReason[] = ['support', 'item_withdrawn', 'purchase_error'];

export type LocalServerDeps = {
  storage: KeyValueStorage;
  config?: EconomyServerConfig;
  clock?: Clock;
  ids?: IdGenerator;
  events?: DomainEventBus;
  verifier?: ActionVerifier;
  keyPrefix?: string;
};

type Mutation<T> = { state: UserState | null; result: T; events: PendingEvent[] };

type OpContext = { at: string; dayKey: string; period: Period };

export class LocalEconomyServer {
  readonly config: EconomyServerConfig;
  readonly events: DomainEventBus;
  private readonly storage: KeyValueStorage;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;
  private readonly verifier: ActionVerifier;
  private readonly prefix: string;
  private readonly mutex = new KeyedMutex();
  private readonly itemsById: Map<string, CosmeticItem>;

  constructor(deps: LocalServerDeps) {
    this.config = deps.config ?? DEFAULT_SERVER_CONFIG;
    const problems = validateServerConfig(this.config);
    if (problems.length > 0) throw new Error('Configuration économique invalide : ' + problems.join(' ; '));
    this.storage = deps.storage;
    this.clock = deps.clock ?? systemClock;
    this.ids = deps.ids ?? uuidGenerator;
    this.events = deps.events ?? createEventBus({ now: () => this.clock.now() });
    this.verifier = deps.verifier ?? declarativeVerifier;
    this.prefix = deps.keyPrefix ?? 'fitaia.phase2.v1.user.';
    this.itemsById = new Map(this.config.catalog.map((i) => [i.id, i]));
  }

  // ------------------------------------------------------------------ lectures

  async getProgression(userId: string): Promise<ProgressionAccount> {
    const ctx = this.context();
    const state = await this.load(userId);
    return this.accountView(state.progression ?? newAccount(userId, this.config.stages, ctx.period, ctx.at), ctx);
  }

  async getBalance(userId: string): Promise<FitcoinWallet> {
    const state = await this.load(userId);
    return state.wallet ?? emptyWallet(userId, this.context().at);
  }

  async getTransactions(userId: string, query: TransactionQuery = {}): Promise<EconomyTransaction[]> {
    const requested = query.limit ?? 50;
    const limit = Number.isFinite(requested) ? Math.min(100, Math.max(1, Math.floor(requested))) : 50;
    const state = await this.load(userId);
    return state.transactions
      .filter((t) => query.beforeSequence === undefined || t.sequence < query.beforeSequence)
      .sort((a, b) => b.sequence - a.sequence)
      .slice(0, limit);
  }

  async getRewardStatuses(userId: string): Promise<RewardStatus[]> {
    const ctx = this.context();
    const state = await this.load(userId);
    const account = this.accountView(state.progression ?? newAccount(userId, this.config.stages, ctx.period, ctx.at), ctx);
    return rewardStatuses(this.config.rewards, state.claims, this.eligibility(state, account, ctx), ctx.dayKey);
  }

  getCatalog(): CosmeticItem[] {
    return [...this.config.catalog];
  }

  async getInventory(userId: string): Promise<UserInventory> {
    const state = await this.load(userId);
    return { userId, items: [...state.inventory], equipped: { ...state.equipped } };
  }

  /** Le wallet stocké est-il exactement le rejeu de son registre ? */
  async verifyLedger(userId: string): Promise<boolean> {
    const state = await this.load(userId);
    if (!state.wallet) return state.transactions.length === 0;
    return ledgerMatchesWallet(state.wallet, state.transactions);
  }

  // ------------------------------------------------------------------ progression

  recordAction(userId: string, actionType: string, sourceId: string | null): Promise<AwardOutcome> {
    return this.mutate(userId, async (loaded, ctx) => {
      const { state, created } = this.withProgression(loaded, ctx);
      const account = state.progression as ProgressionAccount;
      const reject = (code: Extract<AwardOutcome, { ok: false }>['code']): Mutation<AwardOutcome> => {
        const result: AwardOutcome = { ok: false, code, account: this.accountView(account, ctx) };
        return { state: created ? state : null, result, events: awardEvents(userId, actionType, result) };
      };
      const plan = planAward(this.config.rules, { beneficiaryId: userId, actorId: null, actionType, sourceId, grantMode: 'self', dayKey: ctx.dayKey });
      if (!plan.ok) return reject(plan.code);
      const existing = state.progressionEvents.find((e) => e.idempotencyKey === plan.idempotencyKey);
      if (existing) {
        return { state: created ? state : null, result: { ok: true, replayed: true, award: existing, account: this.accountView(account, ctx), stageChange: null }, events: [] };
      }
      if (!plan.rule.enabled) return reject('ACTION_DISABLED');
      if (plan.rule.proof === 'server_record') {
        const verdict = await this.verifier.verify({ beneficiaryId: userId, actorId: null, actionType: plan.actionType, sourceId: plan.sourceId, dayKey: ctx.dayKey });
        if (!verdict.ok) return reject(verdict.code);
      }
      const points = cappedPoints(plan.rule, pointsToday(state.progressionEvents, plan.actionType, ctx.dayKey));
      if (points === 0) return reject('DAILY_CAP_REACHED');
      const award = this.newProgressionEvent(userId, null, plan.actionType, plan.sourceId, points, plan.idempotencyKey, ctx);
      const applied = applyAward(account, award, this.config.stages);
      const result: AwardOutcome = { ok: true, replayed: false, award, account: this.accountView(applied.account, ctx), stageChange: applied.stageChange };
      return {
        state: { ...state, progression: applied.account, progressionEvents: [...state.progressionEvents, award] },
        result,
        events: awardEvents(userId, actionType, result),
      };
    });
  }

  /** Action d'entraide accordée par `actorId` à `targetUserId` : verrou et plafond du BÉNÉFICIAIRE. */
  recordPeerAction(actorId: string, actionType: string, targetUserId: string, sourceId: string): Promise<PeerAwardOutcome> {
    return this.mutate<PeerAwardOutcome>(targetUserId, async (loaded, ctx) => {
      const reject = (code: Extract<PeerAwardOutcome, { ok: false }>['code']): Mutation<PeerAwardOutcome> => {
        const result: PeerAwardOutcome = { ok: false, code };
        return { state: null, result, events: peerAwardEvents(actorId, actionType, result) };
      };
      const plan = planAward(this.config.rules, { beneficiaryId: targetUserId, actorId, actionType, sourceId, grantMode: 'peer', dayKey: ctx.dayKey });
      if (!plan.ok) return reject(plan.code);
      const verdict = await this.verifier.verify({ beneficiaryId: targetUserId, actorId, actionType: plan.actionType, sourceId: plan.sourceId, dayKey: ctx.dayKey });
      if (!verdict.ok) return reject(verdict.code);
      const { state } = this.withProgression(loaded, ctx);
      const existing = state.progressionEvents.find((e) => e.idempotencyKey === plan.idempotencyKey);
      if (existing) return { state: null, result: { ok: true, replayed: true, points: existing.points }, events: [] };
      if (!plan.rule.enabled) return reject('ACTION_DISABLED');
      const points = cappedPoints(plan.rule, pointsToday(state.progressionEvents, plan.actionType, ctx.dayKey));
      if (points === 0) return reject('DAILY_CAP_REACHED');
      const award = this.newProgressionEvent(targetUserId, actorId, plan.actionType, plan.sourceId, points, plan.idempotencyKey, ctx);
      const applied = applyAward(state.progression as ProgressionAccount, award, this.config.stages);
      // Comme avec Supabase : aucun événement côté demandeur ; le bénéficiaire découvre ses PF en relisant son compte.
      return {
        state: { ...state, progression: applied.account, progressionEvents: [...state.progressionEvents, award] },
        result: { ok: true, replayed: false, points },
        events: [],
      };
    });
  }

  // ------------------------------------------------------------------ récompenses

  claimReward(userId: string, rewardId: string): Promise<ClaimOutcome> {
    return this.mutate(userId, (loaded, ctx) => {
      const { state: withAccount, created: createdAccount } = this.withProgression(loaded, ctx);
      const { state, created: createdWallet } = this.withWallet(withAccount, ctx);
      const created = createdAccount || createdWallet;
      const wallet = state.wallet as FitcoinWallet;
      const reject = (code: Extract<ClaimOutcome, { ok: false }>['code']): Mutation<ClaimOutcome> => {
        const result: ClaimOutcome = { ok: false, code, wallet };
        return { state: created ? state : null, result, events: claimEvents(userId, rewardId, result) };
      };
      const def = this.config.rewards.find((r) => r.id === rewardId);
      if (!def) return reject('UNKNOWN_REWARD');
      const periodKey = claimPeriod(def, ctx.dayKey);
      const key = rewardClaimKey(userId, def.id, periodKey);
      const item = def.cosmeticItemId ? this.itemsById.get(def.cosmeticItemId) : undefined;
      const existing = state.claims.find((c) => c.idempotencyKey === key);
      if (existing) {
        const result: ClaimOutcome = {
          ok: true,
          replayed: true,
          rewardType: def.type,
          claim: existing,
          transaction: state.transactions.find((t) => t.id === existing.transactionId) ?? null,
          wallet,
          item: item ? { itemId: item.id, category: item.category, duplicate: existing.duplicateItem } : null,
        };
        return { state: created ? state : null, result, events: [] };
      }
      if (!def.enabled) return reject('REWARD_DISABLED');
      const account = this.accountView(state.progression as ProgressionAccount, ctx);
      if (!isEligible(def, this.eligibility(state, account, ctx))) return reject('NOT_ELIGIBLE');
      if (def.type === 'cosmetic' && (!item || !item.enabled)) return reject('ITEM_UNAVAILABLE');

      const claimId = this.ids.next();
      let next: UserState = state;
      let transaction: EconomyTransaction | null = null;
      let duplicateItem = false;
      if (def.type === 'fitcoins') {
        const posted = earnFitcoins(
          this.ledger(state),
          'earn',
          def.amount,
          { reason: ledgerReasonFor(def), sourceType: 'reward', sourceId: def.id, idempotencyKey: key, metadata: { rewardType: def.type, claimId } },
          { id: this.ids.next(), at: ctx.at },
        );
        transaction = posted.transaction;
        next = { ...next, wallet: posted.state.wallet, transactions: [...posted.state.transactions] };
      } else if (def.type === 'cosmetic' && item) {
        const acquired = acquireItem(next.inventory, { itemId: item.id, acquiredVia: 'reward', acquiredAt: ctx.at, sourceTransactionId: null, sourceClaimId: claimId });
        duplicateItem = !acquired.acquired;
        next = { ...next, inventory: acquired.inventory };
      }
      const claim: RewardClaim = {
        id: claimId,
        userId,
        rewardId: def.id,
        status: def.type === 'capsule' ? 'pending' : 'fulfilled',
        periodKey,
        claimedAt: ctx.at,
        idempotencyKey: key,
        transactionId: transaction?.id ?? null,
        duplicateItem,
      };
      next = { ...next, claims: [...next.claims, claim] };
      const result: ClaimOutcome = {
        ok: true,
        replayed: false,
        rewardType: def.type,
        claim,
        transaction,
        wallet: next.wallet as FitcoinWallet,
        item: item ? { itemId: item.id, category: item.category, duplicate: duplicateItem } : null,
      };
      return { state: next, result, events: claimEvents(userId, rewardId, result) };
    });
  }

  // ------------------------------------------------------------------ dépenses, remboursements, migration

  /** Dépense pour un objet : le prix est lu dans le catalogue du serveur, jamais reçu du téléphone. */
  spendFitcoins(userId: string, request: SpendRequest): Promise<SpendOutcome> {
    return this.mutate(userId, (loaded, ctx) => {
      const { state, created } = this.withWallet(loaded, ctx);
      const wallet = state.wallet as FitcoinWallet;
      const reject = (code: Extract<SpendOutcome, { ok: false }>['code']): Mutation<SpendOutcome> => ({
        state: created ? state : null,
        result: { ok: false, code, wallet },
        events: [],
      });
      if (!REQUEST_ID_PATTERN.test(request.requestId)) return reject('INVALID_REQUEST_ID');
      const key = purchaseKey(userId, request.requestId);
      const existing = state.transactions.find((t) => t.idempotencyKey === key);
      if (existing) {
        if (existing.sourceId !== request.itemId) return reject('IDEMPOTENCY_KEY_REUSED');
        const category = String(existing.metadata.category);
        if (!isCategory(category)) throw new Error('Transaction d’achat sans catégorie');
        return { state: created ? state : null, result: { ok: true, replayed: true, transaction: existing, wallet, item: { itemId: existing.sourceId, category } }, events: [] };
      }
      const item = this.itemsById.get(request.itemId);
      if (!item) return reject('ITEM_NOT_FOUND');
      const blocked = purchaseBlock(item);
      if (blocked) return reject(blocked);
      if (owns(state.inventory, item.id)) return reject('ALREADY_OWNED');
      const spent = spendFitcoins(
        this.ledger(state),
        item.priceFitcoins as number,
        { reason: 'cosmetic_purchase', sourceType: 'cosmetic_item', sourceId: item.id, idempotencyKey: key, metadata: { category: item.category, rarity: item.rarity, requestId: request.requestId } },
        { id: this.ids.next(), at: ctx.at },
      );
      if (!spent.ok) return reject(spent.code);
      const acquired = acquireItem(state.inventory, { itemId: item.id, acquiredVia: 'purchase', acquiredAt: ctx.at, sourceTransactionId: spent.transaction.id, sourceClaimId: null });
      const result: SpendOutcome = { ok: true, replayed: false, transaction: spent.transaction, wallet: spent.state.wallet, item: { itemId: item.id, category: item.category } };
      return {
        state: { ...state, wallet: spent.state.wallet, transactions: [...spent.state.transactions], inventory: acquired.inventory },
        result,
        events: spendEvents(result),
      };
    });
  }

  /** Opération SERVEUR (support) : rembourse exactement un achat, une seule fois, et retire l'objet. */
  refundFitcoins(userId: string, transactionId: string, reason: RefundReason): Promise<RefundOutcome> {
    return this.mutate(userId, (loaded, ctx) => {
      const none = (code: Extract<RefundOutcome, { ok: false }>['code']): Mutation<RefundOutcome> => ({ state: null, result: { ok: false, code }, events: [] });
      if (!REFUND_REASONS.includes(reason)) return none('INVALID_REASON');
      const original = loaded.transactions.find((t) => t.id === transactionId);
      if (!original || !loaded.wallet) return none('TRANSACTION_NOT_FOUND');
      if (original.type !== 'spend') return none('NOT_REFUNDABLE');
      const key = refundKey(original.id);
      const existing = loaded.transactions.find((t) => t.idempotencyKey === key);
      if (existing) return { state: null, result: { ok: true, replayed: true, transaction: existing, wallet: loaded.wallet }, events: [] };
      const posted = refundFitcoins(
        this.ledger(loaded),
        original,
        { reason: 'purchase_refund', sourceType: 'transaction', sourceId: original.id, idempotencyKey: key, metadata: { refundReason: reason, itemId: original.sourceId } },
        { id: this.ids.next(), at: ctx.at },
      );
      let next: UserState = { ...loaded, wallet: posted.state.wallet, transactions: [...posted.state.transactions] };
      const entry = loaded.inventory.find((e) => e.sourceTransactionId === original.id);
      if (original.sourceType === 'cosmetic_item' && entry) {
        const revoked = revokeItem(next.inventory, next.equipped, entry.itemId);
        next = { ...next, inventory: revoked.inventory, equipped: revoked.equipped };
      }
      const result: RefundOutcome = { ok: true, replayed: false, transaction: posted.transaction, wallet: posted.state.wallet };
      return { state: next, result, events: refundEvents(result) };
    });
  }

  /** Opération SERVEUR : solde d'ouverture depuis l'ancienne monnaie, une seule fois par utilisateur. */
  migrateLegacyBalance(userId: string, legacyBalance: number): Promise<MigrationOutcome> {
    return this.mutate<MigrationOutcome>(userId, (loaded, ctx) => {
      const { state, created } = this.withWallet(loaded, ctx);
      const wallet = state.wallet as FitcoinWallet;
      const amount = openingFitcoins(legacyBalance, this.config.legacyMigration);
      if (amount === null) return { state: created ? state : null, result: { ok: false, code: 'INVALID_AMOUNT' }, events: [] };
      const key = migrationKey(this.config.legacyMigration.version, userId);
      const existing = state.transactions.find((t) => t.idempotencyKey === key);
      if (existing) return { state: created ? state : null, result: { ok: true, replayed: true, transaction: existing, wallet }, events: [] };
      if (amount === 0) return { state: created ? state : null, result: { ok: true, replayed: false, transaction: null, wallet }, events: [] };
      const m = this.config.legacyMigration;
      const posted = earnFitcoins(
        this.ledger(state),
        'migration',
        amount,
        {
          reason: 'legacy_migration',
          sourceType: 'migration',
          sourceId: 'legacy_earn_' + m.version,
          idempotencyKey: key,
          metadata: { legacyBalance, creditsPerFitcoin: m.creditsPerFitcoin, maxOpeningFitcoins: m.maxOpeningFitcoins },
        },
        { id: this.ids.next(), at: ctx.at },
      );
      const result: MigrationOutcome = { ok: true, replayed: false, transaction: posted.transaction, wallet: posted.state.wallet };
      return { state: { ...state, wallet: posted.state.wallet, transactions: [...posted.state.transactions] }, result, events: migrationEvents(result) };
    });
  }

  // ------------------------------------------------------------------ inventaire

  /** Opération SERVEUR : attribue un objet (support, futur cadeau) ; un doublon ne crée rien. */
  grantCosmetic(userId: string, itemId: string): Promise<GrantOutcome> {
    return this.mutate<GrantOutcome>(userId, (state, ctx) => {
      const item = this.itemsById.get(itemId);
      if (!item) return { state: null, result: { ok: false, code: 'ITEM_NOT_FOUND' }, events: [] };
      if (!item.enabled) return { state: null, result: { ok: false, code: 'ITEM_DISABLED' }, events: [] };
      const acquired = acquireItem(state.inventory, { itemId, acquiredVia: 'grant', acquiredAt: ctx.at, sourceTransactionId: null, sourceClaimId: null });
      if (!acquired.acquired) return { state: null, result: { ok: true, acquired: false }, events: [] };
      return {
        state: { ...state, inventory: acquired.inventory },
        result: { ok: true, acquired: true },
        events: [{ type: 'inventory.item_acquired', payload: { userId, itemId, category: item.category, via: 'grant' } }],
      };
    });
  }

  equip(userId: string, itemId: string): Promise<EquipOutcome> {
    return this.mutate<EquipOutcome>(userId, (state) => {
      const item = this.itemsById.get(itemId);
      if (!item) return { state: null, result: { ok: false, code: 'ITEM_NOT_FOUND' }, events: [] };
      if (!owns(state.inventory, itemId)) return { state: null, result: { ok: false, code: 'NOT_OWNED' }, events: [] };
      const change = equipItem(state.equipped, item, this.config.slotExclusions);
      const result: EquipOutcome = { ok: true, ...change };
      return { state: change.changed ? { ...state, equipped: change.equipped } : null, result, events: equipEvents(userId, itemId, result) };
    });
  }

  unequip(userId: string, slot: string): Promise<EquipOutcome> {
    return this.mutate<EquipOutcome>(userId, (state) => {
      if (!isCategory(slot)) return { state: null, result: { ok: false, code: 'INVALID_SLOT' }, events: [] };
      const change = unequipSlot(state.equipped, slot);
      return { state: change.changed ? { ...state, equipped: change.equipped } : null, result: { ok: true, ...change }, events: [] };
    });
  }

  // ------------------------------------------------------------------ mécanique interne

  private context(): OpContext {
    const now = this.clock.now();
    const dayKey = dayKeyIn(this.config.calendar.timeZone, now);
    return {
      at: now.toISOString(),
      dayKey,
      period: { weekKey: weekKeyOf(dayKey), seasonKey: seasonKeyOf(dayKey, this.config.calendar.seasonAnchorDay, this.config.calendar.seasonLengthDays) },
    };
  }

  private async mutate<T>(userId: string, operation: (state: UserState, ctx: OpContext) => Mutation<T> | Promise<Mutation<T>>): Promise<T> {
    const { result, events } = await this.mutex.runExclusive(userId, async () => {
      const m = await operation(await this.load(userId), this.context());
      if (m.state) await this.save(userId, m.state);
      return m;
    });
    this.publish(events);
    return result;
  }

  private publish(events: readonly PendingEvent[]): void {
    for (const e of events) this.events.publish(e);
  }

  private async load(userId: string): Promise<UserState> {
    const raw = await this.storage.getItem(this.prefix + userId);
    return raw === null ? emptyUserState(userId) : decodeUserState(raw, userId);
  }

  private async save(userId: string, state: UserState): Promise<void> {
    await this.storage.setItem(this.prefix + userId, JSON.stringify(state));
  }

  private withProgression(state: UserState, ctx: OpContext): { state: UserState; created: boolean } {
    if (state.progression) return { state, created: false };
    return { state: { ...state, progression: newAccount(state.userId, this.config.stages, ctx.period, ctx.at) }, created: true };
  }

  private withWallet(state: UserState, ctx: OpContext): { state: UserState; created: boolean } {
    if (state.wallet) return { state, created: false };
    return { state: { ...state, wallet: emptyWallet(state.userId, ctx.at) }, created: true };
  }

  private ledger(state: UserState): LedgerState {
    return { wallet: state.wallet as FitcoinWallet, transactions: state.transactions };
  }

  private accountView(account: ProgressionAccount, ctx: OpContext): ProgressionAccount {
    return normalizeAccount(account, this.config.stages, ctx.period);
  }

  private eligibility(state: UserState, account: ProgressionAccount, ctx: OpContext) {
    return { account, stages: this.config.stages, eventsToday: state.progressionEvents.filter((e) => e.dayKey === ctx.dayKey) };
  }

  private newProgressionEvent(
    userId: string,
    actorId: string | null,
    actionType: ProgressionEvent['actionType'],
    sourceId: string,
    points: number,
    idempotencyKey: string,
    ctx: OpContext,
  ): ProgressionEvent {
    return {
      id: this.ids.next(),
      userId,
      actionType,
      sourceId,
      actorId,
      points,
      dayKey: ctx.dayKey,
      weekKey: ctx.period.weekKey,
      seasonKey: ctx.period.seasonKey,
      idempotencyKey,
      createdAt: ctx.at,
    };
  }
}
