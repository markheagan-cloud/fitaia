/**
 * Économie Fitcoins (Phase 2) : registre, wallet, récompenses, idempotence, concurrence, événements, dépôts.
 * Logique pure, sans React Native :
 *   node --experimental-strip-types --no-warnings --import ../ts-hook.mjs tests/fitcoins.test.ts
 * La même suite de conformité tourne aussi contre PostgreSQL (supabase/tests/repository_contract.test.ts).
 */
import { DEFAULT_SERVER_CONFIG, validateServerConfig } from '../src/backend/config';
import { createPhase2Backend } from '../src/backend/index';
import { LocalEconomyServer } from '../src/backend/local/LocalEconomyServer';
import { createLocalRepositories } from '../src/backend/local/LocalRepository';
import { LocalStateError } from '../src/backend/local/state';
import { DecodeError } from '../src/backend/supabase/decode';
import { BackendError, PHASE2_RPC } from '../src/backend/supabase/rpc';
import type { RpcClient } from '../src/backend/supabase/rpc';
import { earnFitcoins, emptyWallet, ledgerMatchesWallet, refundFitcoins, replayLedger, spendFitcoins } from '../src/economy/ledger';
import type { LedgerState } from '../src/economy/ledger';
import { rejectionMessage } from '../src/economy/messages';
import type { UserFacingCode } from '../src/economy/messages';
import { DOMAIN_EVENT_TYPES, createEventBus } from '../src/platform/events';
import type { DomainEvent } from '../src/platform/events';
import { KeyedMutex } from '../src/platform/mutex';
import { createMemoryStorage } from '../src/platform/storage';
import type { ActionVerifier } from '../src/progression/types';
import { TEST_REWARDS, runPhase2Conformance } from './conformance/phase2Conformance';
import { runSuite, sequentialIds, testClock } from './helpers/check';

const CONFIG = { ...DEFAULT_SERVER_CONFIG, rewards: [...DEFAULT_SERVER_CONFIG.rewards, ...TEST_REWARDS] };
const entry = (key: string) => ({ reason: 'progression_milestone' as const, sourceType: 'reward' as const, sourceId: 'r', idempotencyKey: key, metadata: {} });

runSuite('Fitcoins', async (t) => {
  // ---------------------------------------------------------------- registre pur
  const ctx = (n: number) => ({ id: 'tx-' + n, at: '2026-10-04T10:00:00.000Z' });
  let ledger: LedgerState = { wallet: emptyWallet('u', '2026-10-04T10:00:00.000Z'), transactions: [] };
  const e1 = earnFitcoins(ledger, 'earn', 800, entry('k1'), ctx(1));
  ledger = e1.state;
  t.ok(ledger.wallet.balance === 800 && e1.transaction.balanceBefore === 0 && e1.transaction.balanceAfter === 800 && e1.transaction.sequence === 1, 'gain : solde avant/après et rang dans le registre');
  const s1 = spendFitcoins(ledger, 500, { ...entry('k2'), reason: 'cosmetic_purchase', sourceType: 'cosmetic_item', sourceId: 'outfit_urban_001' }, ctx(2));
  if (!s1.ok) throw new Error('dépense impossible');
  ledger = s1.state;
  t.ok(ledger.wallet.balance === 300 && s1.transaction.amount === -500 && ledger.wallet.lifetimeSpent === 500, 'dépense : −500, solde 300 (« j’avais 800, j’en ai 300 » est traçable)');
  const s2 = spendFitcoins(ledger, 301, { ...entry('k3'), reason: 'cosmetic_purchase', sourceType: 'cosmetic_item' }, ctx(3));
  t.ok(!s2.ok && s2.code === 'INSUFFICIENT_FUNDS' && ledger.transactions.length === 2, 'fonds insuffisants : aucune écriture');
  let threw = 0;
  for (const bad of [0, -5, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
    try {
      earnFitcoins(ledger, 'earn', bad, entry('bad-' + String(bad)), ctx(9));
    } catch {
      threw++;
    }
  }
  t.ok(threw === 5, 'montant nul, négatif, décimal, NaN ou hors limites : refusé');
  let dupKey = false;
  try {
    earnFitcoins(ledger, 'earn', 1, entry('k1'), ctx(10));
  } catch {
    dupKey = true;
  }
  t.ok(dupKey, 'clé d’idempotence déjà présente dans le registre : écriture refusée');
  const r1 = refundFitcoins(ledger, s1.transaction, { ...entry('refund:tx-2'), reason: 'purchase_refund', sourceType: 'transaction', sourceId: 'tx-2' }, ctx(4));
  t.ok(r1.state.wallet.balance === 800 && r1.state.wallet.lifetimeSpent === 0 && r1.transaction.type === 'refund', 'remboursement : annule exactement la dépense');
  let refundEarn = false;
  try {
    refundFitcoins(ledger, e1.transaction, entry('refund:tx-1'), ctx(5));
  } catch {
    refundEarn = true;
  }
  t.ok(refundEarn, 'un gain ne se rembourse pas');
  const replay = replayLedger(r1.state.transactions);
  t.ok(replay.ok && replay.balance === 800 && ledgerMatchesWallet(r1.state.wallet, r1.state.transactions), 'rejeu du registre = wallet');
  const tampered = r1.state.transactions.map((tx) => (tx.sequence === 2 ? { ...tx, balanceBefore: 900, balanceAfter: 400 } : tx));
  const gap = r1.state.transactions.filter((tx) => tx.sequence !== 2);
  const r2 = replayLedger(tampered);
  const r3 = replayLedger(gap);
  t.ok(!r2.ok && r2.sequence === 2 && !r3.ok, 'registre altéré ou trou dans la séquence : détecté');
  t.ok(!ledgerMatchesWallet({ ...r1.state.wallet, balance: 5000 }, r1.state.transactions), 'solde modifié hors registre : détecté');

  // ---------------------------------------------------------------- conformité (serveur local)
  const events = createEventBus();
  const conformServer = new LocalEconomyServer({ storage: createMemoryStorage(), config: CONFIG, events });
  let userSeq = 0;
  const captured: DomainEvent[] = [];
  events.subscribeAll((ev) => captured.push(ev));
  await runPhase2Conformance(
    {
      name: 'local',
      events,
      async newUser() {
        const userId = `00000000-0000-4000-a000-${(++userSeq).toString(16).padStart(12, '0')}`;
        return { userId, repos: createLocalRepositories(conformServer, userId) };
      },
      verifyLedger: (userId) => conformServer.verifyLedger(userId),
      admin: {
        refund: (userId, transactionId) => conformServer.refundFitcoins(userId, transactionId, 'support'),
        migrate: (userId, legacy) => conformServer.migrateLegacyBalance(userId, legacy),
        grant: (userId, itemId) => conformServer.grantCosmetic(userId, itemId),
      },
    },
    t,
  );

  // ---------------------------------------------------------------- événements : liste exacte et confidentialité
  t.equal(
    [...DOMAIN_EVENT_TYPES],
    ['progression.points_awarded', 'progression.stage_changed', 'economy.fitcoins_earned', 'economy.fitcoins_spent', 'reward.claimed', 'reward.rejected', 'inventory.item_acquired', 'inventory.item_equipped'],
    'exactement les 8 événements de la spécification',
  );
  const allowedKeys = new Set([
    'userId', 'actionType', 'points', 'lifetimePoints', 'dayKey', 'fromStage', 'toStage', 'highestHistoricalStage', 'transactionId',
    'transactionType', 'amount', 'balanceAfter', 'reason', 'sourceId', 'rewardId', 'rewardType', 'claimId', 'subject', 'code',
    'itemId', 'category', 'via', 'slot', 'unequipped', 'kind',
  ]);
  const keysOf = (v: unknown): string[] =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => [k, ...keysOf(x)]) : [];
  const allKeys = new Set(captured.flatMap((ev) => keysOf(ev.payload)));
  t.ok(captured.length > 30 && [...allKeys].every((k) => allowedKeys.has(k)), 'charges utiles : uniquement des champs autorisés (' + allKeys.size + ' clés, ' + captured.length + ' événements)');
  t.ok(!/poids|weight|kg|kcal|calor|email|token|password|secret|selfie|photo/i.test(JSON.stringify(captured.map((ev) => ev.payload))), 'aucun secret ni donnée de santé brute dans les événements');
  t.ok(captured.some((ev) => ev.type === 'reward.rejected' && ev.payload.subject.kind === 'action' && ev.payload.subject.actionType === 'unknown'), 'action inconnue : le texte envoyé par le téléphone n’est jamais recopié (« unknown »)');

  // ---------------------------------------------------------------- bus d'événements : isolation des abonnés
  const isolated: string[] = [];
  const bus = createEventBus({ onHandlerError: (_err, type) => isolated.push('erreur:' + type) });
  bus.subscribe('reward.claimed', () => {
    throw new Error('abonné défaillant');
  });
  const unsubscribe = bus.subscribe('reward.claimed', (ev) => isolated.push(ev.payload.rewardId));
  bus.publish({ type: 'reward.claimed', payload: { userId: 'u', rewardId: 'r1', rewardType: 'badge', claimId: 'c1' } });
  unsubscribe();
  bus.publish({ type: 'reward.claimed', payload: { userId: 'u', rewardId: 'r2', rewardType: 'badge', claimId: 'c2' } });
  t.equal(isolated, ['erreur:reward.claimed', 'r1', 'erreur:reward.claimed'], 'un abonné en erreur n’interrompt rien ; désabonnement effectif');
  const failingEvents = createEventBus({ onHandlerError: () => undefined });
  failingEvents.subscribeAll(() => {
    throw new Error('panne d’affichage');
  });
  const sturdy = new LocalEconomyServer({ storage: createMemoryStorage(), config: CONFIG, events: failingEvents });
  const sturdyClaim = await sturdy.claimReward('robuste', 'test_grant_400');
  t.ok(sturdyClaim.ok && (await sturdy.getBalance('robuste')).balance === 400, 'opération validée même si l’affichage d’un événement échoue');

  // ---------------------------------------------------------------- verrou par utilisateur
  const mutex = new KeyedMutex();
  const order: string[] = [];
  const slow = (label: string, ms: number) => async () => {
    order.push('début ' + label);
    await new Promise((r) => setTimeout(r, ms));
    order.push('fin ' + label);
  };
  await Promise.all([mutex.runExclusive('u', slow('A', 20)), mutex.runExclusive('u', slow('B', 1)), mutex.runExclusive('v', slow('C', 1))]);
  t.ok(order.indexOf('fin A') < order.indexOf('début B') && order.indexOf('début C') < order.indexOf('fin A'), 'verrou : même membre en série, membres différents en parallèle');
  const failing = mutex.runExclusive('u', async () => {
    throw new Error('panne');
  });
  await failing.catch(() => undefined);
  const after = await mutex.runExclusive('u', async () => 'libéré');
  t.ok(after === 'libéré' && mutex.pendingKeys() === 0, 'une erreur libère le verrou ; aucune file restante');

  // ---------------------------------------------------------------- persistance locale (redémarrage de l'app)
  const storage = createMemoryStorage();
  const first = new LocalEconomyServer({ storage, config: CONFIG });
  await first.claimReward('persist', 'test_grant_400');
  await first.spendFitcoins('persist', { itemId: 'top_tee_graphite', requestId: 'persist-0001' });
  const second = new LocalEconomyServer({ storage, config: CONFIG });
  const reloaded = await second.getBalance('persist');
  t.ok(reloaded.balance === 280 && (await second.getInventory('persist')).items.length === 1 && (await second.verifyLedger('persist')), 'redémarrage : wallet, registre et inventaire relus à l’identique');
  const odd = await Promise.all([Number.NaN, 0, -3, 1000].map((limit) => second.getTransactions('persist', { limit })));
  t.ok(odd.map((list) => list.length).join(',') === '2,1,1,2', 'pagination : limite absurde ramenée entre 1 et 100 (défaut 50)');
  await storage.setItem('fitaia.phase2.v1.user.corrompu', '{pas du json');
  await storage.setItem('fitaia.phase2.v1.user.autre', JSON.stringify({ schemaVersion: 1, userId: 'quelqu-un', progressionEvents: [], transactions: [], claims: [], inventory: [], equipped: {} }));
  const corrupt = await second.getBalance('corrompu').then(() => null, (err: unknown) => err);
  const foreign = await second.getBalance('autre').then(() => null, (err: unknown) => err);
  t.ok(corrupt instanceof LocalStateError && foreign instanceof LocalStateError, 'données locales illisibles ou d’un autre membre : erreur explicite, jamais un solde remis à zéro');

  // ---------------------------------------------------------------- journée serveur : remise à zéro quotidienne
  const clock = testClock('2026-10-05T08:00:00.000Z');
  const daily = new LocalEconomyServer({ storage: createMemoryStorage(), config: CONFIG, clock, ids: sequentialIds() });
  await daily.recordAction('jour', 'daily_goal_completed', null);
  const day1 = await daily.claimReward('jour', 'daily_goal');
  const day1Again = await daily.claimReward('jour', 'daily_goal');
  clock.advanceDays(1);
  const beforeGoal = await daily.claimReward('jour', 'daily_goal');
  await daily.recordAction('jour', 'daily_goal_completed', null);
  const day2 = await daily.claimReward('jour', 'daily_goal');
  t.ok(day1.ok && day1Again.ok && day1Again.replayed && !beforeGoal.ok && beforeGoal.code === 'NOT_ELIGIBLE', 'récompense quotidienne : une par jour, et seulement après l’objectif du jour');
  t.ok(day2.ok && !day2.replayed && day2.claim.periodKey === '2026-10-06' && day2.wallet.balance === 20, 'lendemain : nouvelle clé reward:…:daily_goal:2026-10-06, +10');
  clock.set('2026-10-05T21:59:00.000Z');
  const lateDay = (await daily.recordAction('minuit', 'meal_logged', 'm-1')).ok;
  clock.set('2026-10-05T22:01:00.000Z');
  const nextDay = await daily.recordAction('minuit', 'meal_logged', 'm-2');
  t.ok(lateDay && nextDay.ok && nextDay.award.dayKey === '2026-10-06', 'le jour suit le fuseau Europe/Paris (minuit à Paris = 22 h UTC en octobre)');

  // ---------------------------------------------------------------- preuve serveur et blocage
  const refuse: ActionVerifier = { verify: async ({ actionType }) => (actionType === 'tip_marked_helpful' ? { ok: false, code: 'BLOCKED' } : { ok: false, code: 'NOT_VERIFIED' }) };
  const strictEvents = createEventBus();
  const rejected: DomainEvent<'reward.rejected'>[] = [];
  strictEvents.subscribe('reward.rejected', (ev) => rejected.push(ev));
  const strict = new LocalEconomyServer({ storage: createMemoryStorage(), config: CONFIG, verifier: refuse, events: strictEvents });
  const enc = await strict.recordAction('s', 'encouragement_sent', 'enc-1');
  const meal = await strict.recordAction('s', 'meal_logged', 'meal-1');
  const blocked = await strict.recordPeerAction('s', 'tip_marked_helpful', 'autre', 'tip-1');
  t.ok(!enc.ok && enc.code === 'NOT_VERIFIED' && meal.ok, 'encouragement sans preuve serveur : refusé ; repas déclaratif : accepté');
  t.ok(!blocked.ok && blocked.code === 'BLOCKED' && (await strict.getProgression('autre')).lifetimePoints === 0, 'entraide refusée avec un membre bloqué');
  t.ok(rejected.length === 2 && rejected.every((ev) => ev.payload.subject.kind === 'action'), 'événement reward.rejected pour chaque action refusée');
  let encCap = 0;
  const enc2 = new LocalEconomyServer({ storage: createMemoryStorage(), config: CONFIG });
  for (let i = 0; i < 7; i++) if ((await enc2.recordAction('e', 'encouragement_sent', 'enc-' + i)).ok) encCap++;
  t.ok(encCap === 5 && (await enc2.getProgression('e')).lifetimePoints === 10, 'encouragements : +2 PF, plafond 10 PF/jour');
  let tips = 0;
  for (let i = 0; i < 6; i++) if ((await enc2.recordPeerAction('lecteur-' + i, 'tip_marked_helpful', 'auteur', 'tip-1')).ok) tips++;
  t.ok(tips === 4 && (await enc2.getProgression('auteur')).lifetimePoints === 20, 'conseils « Ça m’aide » : +5 PF, plafond 20 PF/jour pour l’auteur');

  // ---------------------------------------------------------------- charge concurrente mélangée
  const stress = new LocalEconomyServer({ storage: createMemoryStorage(), config: CONFIG });
  await stress.claimReward('charge', 'test_grant_400');
  const items = ['top_tee_graphite', 'top_hoodie_nuit', 'jacket_coupe_vent_citron', 'bottom_jogger_graphite', 'shoes_runner_craie', 'head_casquette_noire', 'glasses_sport_fume', 'outfit_urban_001'];
  const spendCalls = items.flatMap((itemId, i) => [
    stress.spendFitcoins('charge', { itemId, requestId: 'charge-a-' + i }),
    stress.spendFitcoins('charge', { itemId, requestId: 'charge-b-' + i }),
  ]);
  const claimCalls = Array.from({ length: 5 }, () => stress.claimReward('charge', 'test_grant_400'));
  const [spends, claims] = await Promise.all([Promise.all(spendCalls), Promise.all(claimCalls)]);
  const bought = spends.flatMap((r) => (r.ok ? [r] : []));
  const paid = bought.reduce((sum, r) => sum - r.transaction.amount, 0);
  const wallet = await stress.getBalance('charge');
  t.ok(new Set(bought.map((r) => r.item.itemId)).size === bought.length && claims.every((r) => r.ok && r.replayed), '21 opérations simultanées : aucun objet acheté deux fois, aucune récompense doublée');
  t.ok(wallet.balance === 400 - paid && wallet.balance >= 0 && (await stress.verifyLedger('charge')), '21 opérations simultanées : solde = 400 − achats réussis, jamais négatif, registre cohérent');

  const pausedRewards = new LocalEconomyServer({ storage, config: { ...CONFIG, rewards: CONFIG.rewards.map((r) => (r.id === 'test_grant_400' ? { ...r, enabled: false } : r)) } });
  const replayDisabled = await pausedRewards.claimReward('persist', 'test_grant_400');
  const newDisabled = await pausedRewards.claimReward('nouveau-venu', 'test_grant_400');
  t.ok(replayDisabled.ok && replayDisabled.replayed && !newDisabled.ok && newDisabled.code === 'REWARD_DISABLED', 'récompense désactivée : réclamation déjà faite rejouée, nouvelle refusée');

  // ---------------------------------------------------------------- configuration refusée si incohérente
  const broken = validateServerConfig({
    ...CONFIG,
    rewards: [{ id: 'mauvais', type: 'fitcoins', amount: 10, unlockCondition: { kind: 'lifetime_points', atLeast: 10 }, repeatable: true, enabled: true }],
    slotExclusions: { FULL_OUTFIT: ['TOP'] },
    catalog: [...CONFIG.catalog, { ...CONFIG.catalog[9], id: 'prestige_payant', source: 'PRESTIGE', priceFitcoins: 10 }],
  });
  t.ok(broken.length === 3 && validateServerConfig(CONFIG).length === 0, 'configuration incohérente détectée (répétable non quotidien, exclusion asymétrique, prestige avec prix)');
  const startWithBadCap = () =>
    new LocalEconomyServer({ storage: createMemoryStorage(), config: { ...CONFIG, rules: { ...CONFIG.rules, meal_logged: { ...CONFIG.rules.meal_logged, dailyCap: 2 } } } });
  let refused = false;
  try {
    startWithBadCap();
  } catch {
    refused = true;
  }
  t.ok(refused, 'le serveur local refuse de démarrer avec un plafond inférieur au gain unitaire');

  // ---------------------------------------------------------------- sélecteur d'adaptateur (l'interface ne sait pas lequel)
  const demo = createPhase2Backend({ mode: 'local-demo', userId: 'demo', storage: createMemoryStorage() });
  const demoAward = await demo.progression.recordAction('meal_logged', 'meal-demo');
  t.ok(demo.isDemo && demoAward.ok && (await demo.economy.getBalance()).balance === 0, 'mode local-demo : signalé comme démonstration, mêmes dépôts');

  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const answers: Record<string, unknown> = {
    get_wallet: { userId: 'u-1', balance: 40, lifetimeEarned: 50, lifetimeSpent: 10, createdAt: '2026-10-04T10:00:00+00:00', updatedAt: '2026-10-04T10:00:00.5+00:00' },
    claim_reward: { ok: false, code: 'NOT_ELIGIBLE', wallet: { userId: 'u-1', balance: 40, lifetimeEarned: 50, lifetimeSpent: 10, createdAt: '2026-10-04T10:00:00Z', updatedAt: '2026-10-04T10:00:00Z' } },
    get_transactions: [{ id: 't1', userId: 'u-1', sequence: 1, type: 'earn', currency: 'FITCOIN', amount: 50, balanceBefore: 0, balanceAfter: 50, reason: 'progression_milestone', sourceType: 'reward', sourceId: 'milestone_900', idempotencyKey: 'reward:u-1:milestone_900', metadata: { rewardType: 'fitcoins' }, createdAt: '2026-10-04T10:00:00Z' }],
    equip_cosmetic: { ok: true, changed: true, equipped: { TOP: 'top_tee_graphite' }, unequipped: [] },
    get_inventory: { userId: 'u-1', items: [], equipped: { CAPE: 'x' } },
  };
  const fakeRpc: RpcClient = {
    rpc: async (fn, args = {}) => {
      calls.push({ fn, args });
      if (fn === 'get_progression') return { data: null, error: { message: 'non connecté', code: '28000' } };
      return { data: answers[fn] ?? null, error: null };
    },
  };
  const remoteEvents: DomainEvent[] = [];
  const remote = createPhase2Backend({ mode: 'supabase', userId: 'u-1', rpc: fakeRpc });
  remote.events.subscribeAll((ev) => remoteEvents.push(ev));
  const remoteWallet = await remote.economy.getBalance();
  t.ok(!remote.isDemo && remoteWallet.balance === 40 && remoteWallet.updatedAt === '2026-10-04T10:00:00.500Z', 'mode supabase : réponse décodée, dates normalisées');
  const remoteClaim = await remote.economy.claimReward('milestone_900');
  t.ok(!remoteClaim.ok && remoteClaim.code === 'NOT_ELIGIBLE' && remoteEvents.some((ev) => ev.type === 'reward.rejected'), 'mode supabase : refus décodé et même événement reward.rejected');
  const remoteTx = await remote.economy.getTransactions({ limit: 10, beforeSequence: 5 });
  await remote.inventory.equip('top_tee_graphite');
  t.ok(remoteTx[0].reason === 'progression_milestone' && remoteEvents.some((ev) => ev.type === 'inventory.item_equipped'), 'mode supabase : registre décodé, événement d’équipement publié');
  const sent = calls.map((c) => c.fn + '(' + Object.keys(c.args).join(',') + ')');
  t.equal(sent, ['get_wallet()', 'claim_reward(p_reward_id)', 'get_transactions(p_limit,p_before_sequence)', 'equip_cosmetic(p_item_id)'], 'mode supabase : fonctions et paramètres nommés de la migration 0002');
  t.ok(calls.every((c) => Object.values(PHASE2_RPC).some((r) => r.fn === c.fn && Object.keys(c.args).every((k) => (r.params as readonly string[]).includes(k)))), 'aucun montant transmis : uniquement des identifiants');
  const authError = await remote.progression.getAccount().then(() => null, (err: unknown) => err);
  const badShape = await remote.inventory.getInventory().then(() => null, (err: unknown) => err);
  t.ok(authError instanceof BackendError && authError.code === '28000' && badShape instanceof DecodeError, 'erreur serveur et réponse inattendue : erreurs explicites, jamais un état inventé');

  // ---------------------------------------------------------------- textes destinés au membre
  const codes: UserFacingCode[] = [
    'UNKNOWN_ACTION', 'ACTION_DISABLED', 'WRONG_GRANT_MODE', 'INVALID_SOURCE', 'NOT_VERIFIED', 'DAILY_CAP_REACHED', 'SELF_PEER_FORBIDDEN', 'UNKNOWN_TARGET', 'BLOCKED',
    'UNKNOWN_REWARD', 'REWARD_DISABLED', 'NOT_ELIGIBLE', 'ITEM_UNAVAILABLE', 'INVALID_REQUEST_ID', 'IDEMPOTENCY_KEY_REUSED', 'ITEM_NOT_FOUND', 'ITEM_DISABLED',
    'NOT_FOR_SALE', 'ALREADY_OWNED', 'INSUFFICIENT_FUNDS', 'NOT_OWNED', 'INVALID_SLOT',
  ];
  t.ok(codes.every((code) => rejectionMessage(code).length > 10 && !rejectionMessage(code).includes("'")), 'chaque refus a un texte français (apostrophes typographiques)');
});
