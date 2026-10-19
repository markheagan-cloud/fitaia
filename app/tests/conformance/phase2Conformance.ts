/**
 * Suite de CONFORMITÉ de la Phase 2 : le même contrat, rejoué contre chaque adaptateur.
 *  - tests/fitcoins.test.ts                    → serveur local de démonstration ;
 *  - supabase/tests/repository_contract.test.ts → adaptateur Supabase sur un vrai PostgreSQL 16 (fonctions SQL 0002).
 * Un adaptateur n'est conforme que s'il passe toutes ces vérifications à l'identique.
 */
import type { Phase2Repositories } from '../../src/backend/repositories';
import { replayLedger } from '../../src/economy/ledger';
import type { EconomyTransaction, MigrationOutcome, RefundOutcome, RewardDefinition } from '../../src/economy/types';
import type { GrantOutcome } from '../../src/inventory/types';
import type { DomainEvent, DomainEventBus } from '../../src/platform/events';
import type { Check } from '../helpers/check';

/** Récompenses ajoutées pour les tests (le serveur SQL les reçoit par INSERT, le serveur local par configuration). */
export const TEST_REWARDS: readonly RewardDefinition[] = [
  { id: 'test_grant_400', type: 'fitcoins', amount: 400, unlockCondition: { kind: 'lifetime_points', atLeast: 0 }, repeatable: false, enabled: true },
  { id: 'test_reward_tee', type: 'cosmetic', amount: 1, cosmeticItemId: 'top_tee_graphite', unlockCondition: { kind: 'lifetime_points', atLeast: 0 }, repeatable: false, enabled: true },
  { id: 'test_badge', type: 'badge', amount: 1, unlockCondition: { kind: 'lifetime_points', atLeast: 0 }, repeatable: false, enabled: true },
  { id: 'test_capsule', type: 'capsule', amount: 1, unlockCondition: { kind: 'lifetime_points', atLeast: 0 }, repeatable: false, enabled: true },
  { id: 'test_stage_elan', type: 'badge', amount: 1, unlockCondition: { kind: 'stage_reached', stageId: 'elan' }, repeatable: false, enabled: true },
  { id: 'test_disabled', type: 'fitcoins', amount: 5, unlockCondition: { kind: 'lifetime_points', atLeast: 0 }, repeatable: false, enabled: false },
];

export type ConformanceUser = { userId: string; repos: Phase2Repositories };

export interface ConformanceHarness {
  name: string;
  events: DomainEventBus;
  newUser(): Promise<ConformanceUser>;
  /** Rejeu du registre par le serveur lui-même (local : verifyLedger ; SQL : verify_wallet_ledger). */
  verifyLedger(userId: string): Promise<boolean>;
  admin: {
    refund(userId: string, transactionId: string): Promise<RefundOutcome>;
    migrate(userId: string, legacyBalance: number): Promise<MigrationOutcome>;
    grant(userId: string, itemId: string): Promise<GrantOutcome>;
  };
}

let requestSeq = 0;
const requestId = () => 'req-' + Date.now().toString(36) + '-' + (++requestSeq).toString(36).padStart(4, '0');

async function allTransactions(user: ConformanceUser): Promise<EconomyTransaction[]> {
  return user.repos.economy.getTransactions({ limit: 100 });
}

async function fund400(user: ConformanceUser): Promise<void> {
  const r = await user.repos.economy.claimReward('test_grant_400');
  if (!r.ok || r.wallet.balance < 400) throw new Error('préparation : wallet de 400 impossible');
}

export async function runPhase2Conformance(h: ConformanceHarness, t: Check): Promise<void> {
  const p = `[${h.name}] `;
  const captured: DomainEvent[] = [];
  h.events.subscribeAll((e) => captured.push(e));
  const eventsOf = (userId: string) => captured.filter((e) => e.payload.userId === userId).map((e) => e.type);

  // ------------------------------------------------------------------ progression : points, plafonds, idempotence
  const a = await h.newUser();
  const acc0 = await a.repos.progression.getAccount();
  t.ok(acc0.lifetimePoints === 0 && acc0.currentStage === 'declic' && acc0.highestHistoricalStage === 'declic', p + 'nouveau compte : 0 PF, étape Déclic');

  const meal1 = await a.repos.progression.recordAction('meal_logged', 'meal-001');
  t.ok(meal1.ok && !meal1.replayed && meal1.award.points === 5 && meal1.account.lifetimePoints === 5, p + 'repas enregistré : +5 PF calculés par le serveur');
  const meal1bis = await a.repos.progression.recordAction('meal_logged', 'meal-001');
  t.ok(meal1bis.ok && meal1bis.replayed && meal1bis.account.lifetimePoints === 5, p + 'même repas renvoyé : rejoué, aucun PF en plus');
  await a.repos.progression.recordAction('meal_logged', 'meal-002');
  const meal3 = await a.repos.progression.recordAction('meal_logged', 'meal-003');
  const meal4 = await a.repos.progression.recordAction('meal_logged', 'meal-004');
  t.ok(meal3.ok && meal3.account.lifetimePoints === 15, p + 'trois repas : 15 PF');
  t.ok(!meal4.ok && meal4.code === 'DAILY_CAP_REACHED' && meal4.account.lifetimePoints === 15, p + 'quatrième repas : plafond de 15 PF/jour');

  const goal = await a.repos.progression.recordAction('daily_goal_completed');
  const goalBis = await a.repos.progression.recordAction('daily_goal_completed', 'autre-source');
  t.ok(goal.ok && goal.award.points === 20 && goal.award.sourceId === goal.award.dayKey, p + 'objectif quotidien : +20 PF, source = jour serveur');
  t.ok(goalBis.ok && goalBis.replayed && goalBis.account.lifetimePoints === 35, p + 'objectif quotidien : une seule fois par jour, la source du client est ignorée');

  const challenge = await a.repos.progression.recordAction('challenge_completed', 'defi-pompes-1');
  t.ok(challenge.ok && challenge.award.points === 50 && challenge.account.lifetimePoints === 85, p + 'défi terminé : +50 PF');
  const act1 = await a.repos.progression.recordAction('activity_logged', 'marche-1');
  await a.repos.progression.recordAction('activity_logged', 'marche-2');
  const act3 = await a.repos.progression.recordAction('activity_logged', 'marche-3');
  t.ok(act1.ok && act1.award.points === 15 && !act3.ok && act3.code === 'DAILY_CAP_REACHED', p + 'activité : +15 PF, plafond 30 PF/jour (pas de prime au surentraînement)');

  const invalid = await a.repos.progression.recordAction('meal_logged', 'espace interdite');
  const missing = await a.repos.progression.recordAction('meal_logged');
  t.ok(!invalid.ok && invalid.code === 'INVALID_SOURCE' && !missing.ok && missing.code === 'INVALID_SOURCE', p + 'source invalide ou absente : refusée');
  const unknown = await a.repos.progression.recordAction('perte_de_poids_rapide' as 'meal_logged', 'x-1');
  t.ok(!unknown.ok && unknown.code === 'UNKNOWN_ACTION', p + 'action hors liste blanche : refusée');
  const wrongMode = await a.repos.progression.recordAction('tip_marked_helpful' as 'meal_logged', 'tip-1');
  t.ok(!wrongMode.ok && wrongMode.code === 'WRONG_GRANT_MODE', p + 'action d’entraide impossible à s’attribuer soi-même');

  // ------------------------------------------------------------------ entraide (peer)
  const b = await h.newUser();
  const peer = await a.repos.progression.recordPeerAction('tip_marked_helpful', b.userId, 'tip-777');
  const peerBis = await a.repos.progression.recordPeerAction('tip_marked_helpful', b.userId, 'tip-777');
  const self = await a.repos.progression.recordPeerAction('tip_marked_helpful', a.userId, 'tip-778');
  t.ok(peer.ok && !peer.replayed && peer.points === 5, p + 'conseil marqué « Ça m’aide » : +5 PF pour l’auteur');
  t.ok(peerBis.ok && peerBis.replayed, p + 'même conseil, même membre : rejoué');
  t.ok(!self.ok && self.code === 'SELF_PEER_FORBIDDEN', p + 'impossible de marquer son propre conseil');
  t.ok((await b.repos.progression.getAccount()).lifetimePoints === 5, p + 'les PF d’entraide arrivent sur le compte du bénéficiaire');

  // ------------------------------------------------------------------ récompenses : éligibilité et idempotence
  const tooEarly = await a.repos.economy.claimReward('milestone_900');
  t.ok(!tooEarly.ok && tooEarly.code === 'NOT_ELIGIBLE' && tooEarly.wallet.balance === 0, p + 'palier 900 PF non atteint : refusé, aucun Fitcoin');
  const stageGate = await a.repos.economy.claimReward('test_stage_elan');
  t.ok(!stageGate.ok && stageGate.code === 'NOT_ELIGIBLE', p + 'récompense d’étape Élan refusée à l’étape Déclic');
  const unknownReward = await a.repos.economy.claimReward('n_existe_pas');
  const disabled = await a.repos.economy.claimReward('test_disabled');
  t.ok(!unknownReward.ok && unknownReward.code === 'UNKNOWN_REWARD' && !disabled.ok && disabled.code === 'REWARD_DISABLED', p + 'récompense inconnue ou désactivée : refusée');

  const statusesBefore = await a.repos.economy.getRewardStatuses();
  const daily = statusesBefore.find((s) => s.reward.id === 'daily_goal');
  const m900 = statusesBefore.find((s) => s.reward.id === 'milestone_900');
  t.ok(goal.ok && daily?.state === 'claimable' && daily.periodKey === goal.award.dayKey, p + 'récompense quotidienne réclamable après l’objectif du jour');
  t.ok(m900?.state === 'locked' && m900.progress.current === 115 && m900.progress.required === 900, p + 'palier 900 : verrouillé, progression 115 / 900');

  const dailyClaim = await a.repos.economy.claimReward('daily_goal');
  t.ok(
    dailyClaim.ok && !dailyClaim.replayed && dailyClaim.transaction?.amount === 10 && dailyClaim.wallet.balance === 10 && dailyClaim.transaction.reason === 'daily_reward',
    p + 'récompense quotidienne : +10 Fitcoins, motif daily_reward',
  );
  t.ok(dailyClaim.ok && dailyClaim.claim.idempotencyKey === `reward:${a.userId}:daily_goal:${dailyClaim.claim.periodKey}`, p + 'clé reward:<user>:daily_goal:<jour>');
  const dailyAgain = await a.repos.economy.claimReward('daily_goal');
  t.ok(dailyAgain.ok && dailyAgain.replayed && dailyAgain.wallet.balance === 10, p + 'récompense quotidienne redemandée : rejouée, solde inchangé');
  t.ok((await a.repos.economy.getRewardStatuses()).find((s) => s.reward.id === 'daily_goal')?.state === 'claimed', p + 'état « récupérée » ensuite');

  const c = await h.newUser();
  const burst = await Promise.all(Array.from({ length: 10 }, () => c.repos.economy.claimReward('test_grant_400')));
  const fresh = burst.filter((r) => r.ok && !r.replayed).length;
  const replays = burst.filter((r) => r.ok && r.replayed).length;
  const cTx = await allTransactions(c);
  t.ok(fresh === 1 && replays === 9, p + '10 réclamations simultanées identiques : 1 écriture, 9 rejeux');
  t.ok(cTx.length === 1 && cTx[0].amount === 400 && (await c.repos.economy.getBalance()).balance === 400, p + '10 réclamations simultanées : une seule transaction créditée (400)');
  t.equal(
    eventsOf(c.userId).filter((type) => type === 'reward.claimed' || type === 'economy.fitcoins_earned').sort(),
    ['economy.fitcoins_earned', 'reward.claimed'],
    p + 'événements : un seul reward.claimed et un seul economy.fitcoins_earned',
  );

  // ------------------------------------------------------------------ types de récompense : badge, capsule, cosmétique
  const badge = await c.repos.economy.claimReward('test_badge');
  const capsule = await c.repos.economy.claimReward('test_capsule');
  t.ok(badge.ok && badge.rewardType === 'badge' && badge.claim.status === 'fulfilled' && badge.transaction === null, p + 'badge : réclamation remise, aucun Fitcoin');
  t.ok(capsule.ok && capsule.rewardType === 'capsule' && capsule.claim.status === 'pending', p + 'capsule : réclamation en attente (ouverture en Phase 5)');

  // ------------------------------------------------------------------ dépenses
  const cap = await c.repos.economy.spendFitcoins({ itemId: 'head_casquette_noire', requestId: requestId() });
  t.ok(cap.ok && !cap.replayed && cap.transaction.amount === -100 && cap.wallet.balance === 300 && cap.transaction.reason === 'cosmetic_purchase', p + 'achat : −100 Fitcoins au prix du catalogue');
  t.ok(cap.ok && cap.transaction.sourceId === 'head_casquette_noire' && cap.transaction.sourceType === 'cosmetic_item', p + 'achat tracé : source = objet');
  const invC = await c.repos.inventory.getInventory();
  t.ok(invC.items.some((i) => i.itemId === 'head_casquette_noire' && i.acquiredVia === 'purchase'), p + 'objet acheté ajouté à l’inventaire');
  const dupBuy = await c.repos.economy.spendFitcoins({ itemId: 'head_casquette_noire', requestId: requestId() });
  t.ok(!dupBuy.ok && dupBuy.code === 'ALREADY_OWNED' && dupBuy.wallet.balance === 300, p + 'objet déjà possédé : achat refusé avant tout débit');
  const replayRid = cap.ok ? String(cap.transaction.metadata.requestId) : '';
  const capReplay = await c.repos.economy.spendFitcoins({ itemId: 'head_casquette_noire', requestId: replayRid });
  t.ok(capReplay.ok && capReplay.replayed && capReplay.wallet.balance === 300, p + 'même demande d’achat renvoyée : rejouée, un seul débit');
  const reused = await c.repos.economy.spendFitcoins({ itemId: 'top_tee_graphite', requestId: replayRid });
  t.ok(!reused.ok && reused.code === 'IDEMPOTENCY_KEY_REUSED', p + 'clé d’achat réutilisée pour un autre objet : refusée');
  const notForSale = await c.repos.economy.spendFitcoins({ itemId: 'jacket_october_crew', requestId: requestId() });
  const disabledItem = await c.repos.economy.spendFitcoins({ itemId: 'head_bonnet_hiver', requestId: requestId() });
  const ghost = await c.repos.economy.spendFitcoins({ itemId: 'objet_fantome', requestId: requestId() });
  const badRid = await c.repos.economy.spendFitcoins({ itemId: 'top_tee_graphite', requestId: 'x' });
  t.ok(!notForSale.ok && notForSale.code === 'NOT_FOR_SALE', p + 'objet de prestige : jamais achetable');
  t.ok(!disabledItem.ok && disabledItem.code === 'ITEM_DISABLED', p + 'objet désactivé : achat refusé');
  t.ok(!ghost.ok && ghost.code === 'ITEM_NOT_FOUND' && !badRid.ok && badRid.code === 'INVALID_REQUEST_ID', p + 'objet inconnu, identifiant de demande invalide : refusés');
  const tooExpensive = await c.repos.economy.spendFitcoins({ itemId: 'shoes_runner_lime', requestId: requestId() });
  t.ok(!tooExpensive.ok && tooExpensive.code === 'INSUFFICIENT_FUNDS' && tooExpensive.wallet.balance === 300, p + 'fonds insuffisants (600 > 300) : refus, solde intact');

  // ------------------------------------------------------------------ concurrence : deux appareils, 2 × 300 sur 400
  const d = await h.newUser();
  await fund400(d);
  const race = await Promise.all([
    d.repos.economy.spendFitcoins({ itemId: 'top_hoodie_nuit', requestId: requestId() }),
    d.repos.economy.spendFitcoins({ itemId: 'jacket_coupe_vent_citron', requestId: requestId() }),
  ]);
  const won = race.filter((r) => r.ok).length;
  const lost = race.filter((r) => !r.ok && r.code === 'INSUFFICIENT_FUNDS').length;
  const dWallet = await d.repos.economy.getBalance();
  t.ok(won === 1 && lost === 1, p + 'deux achats simultanés de 300 sur 400 : un réussit, un échoue');
  t.ok(dWallet.balance === 100 && (await allTransactions(d)).every((tx) => tx.balanceAfter >= 0), p + 'solde final 100, jamais négatif');

  const e = await h.newUser();
  await fund400(e);
  const sameItem = await Promise.all([
    e.repos.economy.spendFitcoins({ itemId: 'top_hoodie_nuit', requestId: requestId() }),
    e.repos.economy.spendFitcoins({ itemId: 'top_hoodie_nuit', requestId: requestId() }),
  ]);
  t.ok(
    sameItem.filter((r) => r.ok).length === 1 && sameItem.some((r) => !r.ok && r.code === 'ALREADY_OWNED') && (await e.repos.economy.getBalance()).balance === 100,
    p + 'même objet acheté depuis deux appareils : un seul débit, l’autre « déjà possédé »',
  );

  // ------------------------------------------------------------------ inventaire : récompense cosmétique et doublon
  const tee = await e.repos.economy.claimReward('test_reward_tee');
  t.ok(tee.ok && tee.item?.itemId === 'top_tee_graphite' && !tee.item.duplicate, p + 'récompense cosmétique : objet ajouté');
  const invE = await e.repos.inventory.getInventory();
  t.ok(invE.items.filter((i) => i.itemId === 'top_tee_graphite').length === 1 && invE.items.find((i) => i.itemId === 'top_tee_graphite')?.acquiredVia === 'reward', p + 'objet de récompense : canal « reward »');
  const f = await h.newUser();
  await fund400(f);
  await f.repos.economy.spendFitcoins({ itemId: 'top_tee_graphite', requestId: requestId() });
  const dupReward = await f.repos.economy.claimReward('test_reward_tee');
  const invF = await f.repos.inventory.getInventory();
  t.ok(dupReward.ok && dupReward.item?.duplicate === true && dupReward.claim.duplicateItem, p + 'récompense d’un objet déjà acheté : doublon signalé');
  t.ok(invF.items.filter((i) => i.itemId === 'top_tee_graphite').length === 1, p + 'doublon : jamais deux exemplaires dans l’inventaire');
  const grantDup = await h.admin.grant(f.userId, 'top_tee_graphite');
  const grantNew = await h.admin.grant(f.userId, 'glasses_sport_fume');
  t.ok(grantDup.ok && !grantDup.acquired && grantNew.ok && grantNew.acquired, p + 'attribution serveur : doublon ignoré, nouvel objet ajouté');

  // ------------------------------------------------------------------ équipement
  const notOwned = await f.repos.inventory.equip('shoes_runner_lime');
  t.ok(!notOwned.ok && notOwned.code === 'NOT_OWNED', p + 'impossible d’équiper un objet non possédé');
  const eqTee = await f.repos.inventory.equip('top_tee_graphite');
  t.ok(eqTee.ok && eqTee.changed && eqTee.equipped.TOP === 'top_tee_graphite', p + 'équiper un haut possédé');
  const eqTeeAgain = await f.repos.inventory.equip('top_tee_graphite');
  t.ok(eqTeeAgain.ok && !eqTeeAgain.changed, p + 'déjà porté : rien ne change');
  await f.repos.economy.spendFitcoins({ itemId: 'outfit_urban_001', requestId: requestId() });
  const eqOutfit = await f.repos.inventory.equip('outfit_urban_001');
  t.ok(eqOutfit.ok && eqOutfit.equipped.FULL_OUTFIT === 'outfit_urban_001' && eqOutfit.equipped.TOP === undefined && eqOutfit.unequipped.includes('top_tee_graphite'), p + 'tenue complète : retire le haut');
  const eqTeeBack = await f.repos.inventory.equip('top_tee_graphite');
  t.ok(eqTeeBack.ok && eqTeeBack.equipped.FULL_OUTFIT === undefined && eqTeeBack.unequipped.includes('outfit_urban_001'), p + 'haut : retire la tenue complète');
  const eqGlasses = await f.repos.inventory.equip('glasses_sport_fume');
  t.ok(eqGlasses.ok && eqGlasses.equipped.GLASSES === 'glasses_sport_fume' && eqGlasses.equipped.TOP === 'top_tee_graphite', p + 'lunettes portées avec le haut');
  const off = await f.repos.inventory.unequip('GLASSES');
  const offAgain = await f.repos.inventory.unequip('GLASSES');
  const badSlot = await f.repos.inventory.unequip('CAPE' as 'TOP');
  t.ok(off.ok && off.changed && off.equipped.GLASSES === undefined && offAgain.ok && !offAgain.changed, p + 'retirer un objet porté');
  t.ok(!badSlot.ok && badSlot.code === 'INVALID_SLOT', p + 'emplacement inconnu : refusé');
  t.equal((await f.repos.inventory.getInventory()).equipped, { TOP: 'top_tee_graphite' }, p + 'equippedCosmetics relu depuis le serveur');
  t.ok(eventsOf(f.userId).includes('inventory.item_equipped') && eventsOf(f.userId).includes('inventory.item_acquired'), p + 'événements inventory.item_acquired et inventory.item_equipped');

  // ------------------------------------------------------------------ remboursement (opération serveur)
  const g = await h.newUser();
  await fund400(g);
  const buy = await g.repos.economy.spendFitcoins({ itemId: 'top_hoodie_nuit', requestId: requestId() });
  if (!buy.ok) throw new Error('préparation : achat impossible');
  await g.repos.inventory.equip('top_hoodie_nuit');
  const refund = await h.admin.refund(g.userId, buy.transaction.id);
  t.ok(refund.ok && !refund.replayed && refund.transaction.amount === 300 && refund.wallet.balance === 400 && refund.transaction.reason === 'purchase_refund', p + 'remboursement : +300, motif purchase_refund');
  const invG = await g.repos.inventory.getInventory();
  t.ok(!invG.items.some((i) => i.itemId === 'top_hoodie_nuit') && invG.equipped.TOP === undefined, p + 'remboursement : objet retiré et déséquipé');
  const refundAgain = await h.admin.refund(g.userId, buy.transaction.id);
  t.ok(refundAgain.ok && refundAgain.replayed && refundAgain.wallet.balance === 400, p + 'second remboursement du même achat : rejoué, aucun crédit');
  const refundEarn = await h.admin.refund(g.userId, (await allTransactions(g)).find((tx) => tx.type === 'earn')?.id ?? '');
  t.ok(!refundEarn.ok && refundEarn.code === 'NOT_REFUNDABLE', p + 'un gain n’est pas remboursable');
  const rebuy = await g.repos.economy.spendFitcoins({ itemId: 'top_hoodie_nuit', requestId: requestId() });
  t.ok(rebuy.ok && rebuy.wallet.balance === 100, p + 'objet remboursé : rachetable');
  t.ok((await g.repos.economy.getBalance()).lifetimeSpent === 300 && (await g.repos.economy.getBalance()).lifetimeEarned === 400, p + 'compteurs : dépenses nettes 300, gains 400');

  // ------------------------------------------------------------------ migration de l'ancienne monnaie (opération serveur)
  const m = await h.newUser();
  const mig = await h.admin.migrate(m.userId, 12400);
  t.ok(mig.ok && !mig.replayed && mig.transaction?.amount === 1240 && mig.transaction.reason === 'legacy_migration', p + 'migration : 12 400 anciens crédits → 1 240 Fitcoins');
  t.ok(mig.ok && mig.transaction?.idempotencyKey === `migration:v1:${m.userId}`, p + 'migration : clé migration:v1:<user>');
  const migAgain = await h.admin.migrate(m.userId, 99999);
  t.ok(migAgain.ok && migAgain.replayed && (await m.repos.economy.getBalance()).balance === 1240, p + 'migration rejouée : une seule fois, même avec un autre solde déclaré');
  const big = await h.newUser();
  const capped = await h.admin.migrate(big.userId, 10_000_000);
  const negative = await h.admin.migrate(big.userId, -5);
  t.ok(capped.ok && capped.transaction?.amount === 2000 && !negative.ok, p + 'migration plafonnée à 2 000 Fitcoins ; solde négatif refusé');

  // ------------------------------------------------------------------ registre : historique et reconstruction exacte
  const gTx = await allTransactions(g);
  t.ok(gTx.map((tx) => tx.sequence).join(',') === '4,3,2,1', p + 'historique du plus récent au plus ancien');
  const page = await g.repos.economy.getTransactions({ limit: 2, beforeSequence: 4 });
  t.ok(page.map((tx) => tx.sequence).join(',') === '3,2', p + 'pagination par séquence');
  for (const user of [a, c, d, e, f, g, m]) {
    const replay = replayLedger(await allTransactions(user));
    const wallet = await user.repos.economy.getBalance();
    if (!replay.ok || replay.balance !== wallet.balance || replay.lifetimeEarned !== wallet.lifetimeEarned || replay.lifetimeSpent !== wallet.lifetimeSpent) {
      throw new Error('reconstruction impossible pour ' + user.userId);
    }
  }
  t.ok(true, p + 'reconstruction : le rejeu du registre redonne exactement chaque wallet (7 membres)');
  t.ok((await Promise.all([a, c, d, e, f, g, m].map((u) => h.verifyLedger(u.userId)))).every(Boolean), p + 'vérification serveur du registre : conforme pour chaque membre');

  // ------------------------------------------------------------------ événements
  const failClaim = captured.find((ev) => ev.type === 'reward.rejected' && ev.payload.userId === a.userId && ev.payload.subject.kind === 'reward');
  t.ok(failClaim !== undefined && failClaim.type === 'reward.rejected' && failClaim.payload.code === 'NOT_ELIGIBLE', p + 'événement reward.rejected sur une réclamation refusée');
  t.ok(eventsOf(a.userId).filter((type) => type === 'progression.points_awarded').length === 7, p + 'progression.points_awarded : un par attribution réelle, aucun pour un rejeu');
  t.ok(eventsOf(c.userId).includes('economy.fitcoins_spent'), p + 'événement economy.fitcoins_spent');
}
