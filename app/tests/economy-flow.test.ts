/**
 * Parcours économique de l'app, joué contre le serveur local Phase 2 (mêmes règles que Supabase) :
 * conversion unique de l'ancien solde, tenue de départ, gains quotidiens bornés, achat, tenues App Store refusées.
 */
import { runSuite } from './helpers/check';
import { LocalEconomyServer } from '../src/backend/local/LocalEconomyServer';
import { createLocalRepositories } from '../src/backend/local/LocalRepository';
import { createMemoryStorage } from '../src/platform/storage';

const USER = '11111111-1111-4111-8111-111111111111';

runSuite('parcours économique de l’app', async (t) => {
  let now = Date.parse('2026-10-20T08:00:00Z');
  const server = new LocalEconomyServer({ storage: createMemoryStorage(), clock: { now: () => new Date(now) } });
  const repo = createLocalRepositories(server, USER);

  const claimAll = async () => {
    let coins = 0;
    for (const st of await repo.economy.getRewardStatuses()) {
      if (st.state !== 'claimable' || st.reward.type === 'capsule') continue;
      const c = await repo.economy.claimReward(st.reward.id);
      if (c.ok && !c.replayed && c.transaction) coins += c.transaction.amount;
    }
    return coins;
  };

  // ancienne économie : 5 200 crédits → 520 Fitcoins, une seule fois
  await server.migrateLegacyBalance(USER, 5200);
  await server.migrateLegacyBalance(USER, 5200);
  t.ok((await repo.economy.getBalance()).balance === 520, 'ancien solde converti une seule fois (10:1)');

  // tenue de départ offerte, sans doublon
  t.ok((await server.grantCosmetic(USER, 'outfit_origine')).ok, 'tenue de départ attribuée');
  await server.grantCosmetic(USER, 'outfit_origine');
  t.ok((await repo.inventory.getInventory()).items.filter((i) => i.itemId === 'outfit_origine').length === 1, 'tenue de départ sans doublon');

  // premier défi du jour : 50 PF + 50 Fitcoins ; le même défi rejoué ne rapporte rien
  const a1 = await repo.progression.recordAction('challenge_completed', 'pushups:2026-10-20');
  t.ok(a1.ok && !a1.replayed && a1.award.points === 50, 'défi : 50 PF');
  t.ok((await claimAll()) === 50, 'défi du jour : +50 Fitcoins');
  const a2 = await repo.progression.recordAction('challenge_completed', 'pushups:2026-10-20');
  t.ok(a2.ok && a2.replayed, 'même défi rejoué : idempotent');
  t.ok((await claimAll()) === 0, 'pas de deuxième récompense quotidienne');

  // repas : +5 PF chacun, +10 Fitcoins au premier seulement
  await repo.progression.recordAction('meal_logged', 'meal:a');
  t.ok((await claimAll()) === 10, 'premier repas : +10 Fitcoins');
  await repo.progression.recordAction('meal_logged', 'meal:b');
  t.ok((await claimAll()) === 0, 'deuxième repas : pas de Fitcoins');
  t.ok((await repo.economy.getBalance()).balance === 580, 'solde 520 + 50 + 10');

  // achat d'une tenue rare en Fitcoins, puis équipement
  const buy = await repo.economy.spendFitcoins({ itemId: 'outfit_cargo', requestId: '22222222-2222-4222-8222-222222222222' });
  t.ok(buy.ok && buy.wallet.balance === 180, 'Cargo Urbain achetée 400');
  t.ok((await repo.inventory.equip('outfit_cargo')).ok, 'tenue équipée');
  t.ok((await repo.inventory.getInventory()).equipped.FULL_OUTFIT === 'outfit_cargo', 'tenue portée enregistrée');
  const again = await repo.economy.spendFitcoins({ itemId: 'outfit_olive', requestId: '33333333-3333-4333-8333-333333333333' });
  t.ok(!again.ok && again.code === 'INSUFFICIENT_FUNDS', 'Olive Tech refusée sans fonds suffisants');

  // tenues App Store : jamais payables en Fitcoins
  for (const id of ['outfit_creme', 'outfit_titane', 'outfit_atelier']) {
    const r = await repo.economy.spendFitcoins({ itemId: id, requestId: '44444444-4444-4444-8444-44444444444' + id.length });
    t.ok(!r.ok && r.code === 'NOT_FOR_SALE', id + ' : pas en vente en Fitcoins');
  }

  // le lendemain (jour serveur Europe/Paris), la récompense quotidienne revient
  now = Date.parse('2026-10-21T08:00:00Z');
  await repo.progression.recordAction('challenge_completed', 'pushups:2026-10-21');
  t.ok((await claimAll()) === 50, 'nouveau jour : défi du jour à nouveau récompensé');
  t.ok(await server.verifyLedger(USER), 'registre cohérent avec le solde');
});
