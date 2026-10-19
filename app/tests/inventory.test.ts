/**
 * Inventaire cosmétique (Phase 2) : catalogue, acquisition, doublons, équipement, lien avec l'avatar.
 *   node --experimental-strip-types --no-warnings --import ../ts-hook.mjs tests/inventory.test.ts
 */
import { createAvatarPresentationService } from '../src/avatar-presentation/AvatarPresentationService';
import { DEFAULT_SERVER_CONFIG } from '../src/backend/config';
import { LocalEconomyServer } from '../src/backend/local/LocalEconomyServer';
import { CATEGORY_LABELS, COSMETIC_CATALOG, SLOT_EXCLUSIONS } from '../src/inventory/cosmeticCatalog';
import { acquireItem, equipItem, owns, purchaseBlock, revokeItem, unequipSlot } from '../src/inventory/inventory';
import { COSMETIC_CATEGORIES, RARITIES } from '../src/inventory/types';
import type { CosmeticItem, EquippedCosmetics, InventoryEntry } from '../src/inventory/types';
import { createEventBus } from '../src/platform/events';
import type { DomainEvent } from '../src/platform/events';
import { createMemoryStorage } from '../src/platform/storage';
import { runSuite } from './helpers/check';

const byId = (id: string): CosmeticItem => {
  const item = COSMETIC_CATALOG.find((i) => i.id === id);
  if (!item) throw new Error('objet absent du catalogue : ' + id);
  return item;
};
const entry = (itemId: string, acquiredVia: InventoryEntry['acquiredVia'] = 'purchase'): InventoryEntry => ({
  itemId,
  acquiredVia,
  acquiredAt: '2026-10-04T10:00:00.000Z',
  sourceTransactionId: acquiredVia === 'purchase' ? 'tx-' + itemId : null,
  sourceClaimId: acquiredVia === 'reward' ? 'claim-' + itemId : null,
});

runSuite('inventaire', async (t) => {
  // ---------------------------------------------------------------- modèle et catalogue (point 13)
  t.equal([...COSMETIC_CATEGORIES], ['TOP', 'BOTTOM', 'SHOES', 'JACKET', 'HEAD', 'GLASSES', 'ACCESSORY', 'FULL_OUTFIT'], 'catégories exactes de la spécification');
  t.equal([...RARITIES], ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'], 'raretés exactes de la spécification');
  const fields = ['assetReference', 'category', 'createdAt', 'enabled', 'id', 'name', 'priceFitcoins', 'rarity', 'source'];
  t.ok(COSMETIC_CATALOG.every((i) => Object.keys(i).sort().join(',') === fields.join(',')), 'chaque objet a exactement id, name, category, rarity, assetReference, source, priceFitcoins, enabled, createdAt');
  t.ok(new Set(COSMETIC_CATALOG.map((i) => i.id)).size === COSMETIC_CATALOG.length && COSMETIC_CATALOG.every((i) => /^[a-z0-9_]{2,64}$/.test(i.id)), 'identifiants uniques et stables');
  t.ok(COSMETIC_CATEGORIES.every((c) => COSMETIC_CATALOG.some((i) => i.category === c)) && RARITIES.every((r) => COSMETIC_CATALOG.some((i) => i.rarity === r)), 'catalogue de départ : toutes les catégories et raretés représentées');
  t.ok(COSMETIC_CATALOG.filter((i) => i.source === 'REWARD' || i.source === 'PRESTIGE').every((i) => i.priceFitcoins === null), 'récompenses et prestige : jamais de prix');
  t.ok(COSMETIC_CATALOG.every((i) => !Number.isNaN(Date.parse(i.createdAt))) && COSMETIC_CATALOG.every((i) => i.assetReference.startsWith('cosmetic/')), 'dates valides, références de ressources opaques');
  t.ok(Object.values(CATEGORY_LABELS).every((label) => label.length > 0 && !label.includes("'")), 'libellés de catégories en français');

  t.ok(purchaseBlock(byId('top_hoodie_nuit')) === null, 'objet de boutique actif : achetable');
  t.ok(purchaseBlock(byId('jacket_october_crew')) === 'NOT_FOR_SALE' && purchaseBlock(byId('accessory_montre_parcours')) === 'NOT_FOR_SALE', 'veste October Crew et montre du Parcours : non achetables');
  t.ok(purchaseBlock(byId('head_bonnet_hiver')) === 'ITEM_DISABLED', 'objet d’événement désactivé : non achetable');
  t.ok(purchaseBlock({ ...byId('accessory_montre_parcours'), priceFitcoins: 50 }) === 'NOT_FOR_SALE', 'même avec un prix glissé par erreur, une récompense ne s’achète pas');

  // ---------------------------------------------------------------- acquisition et doublons
  const first = acquireItem([], entry('top_tee_graphite'));
  const dup = acquireItem(first.inventory, entry('top_tee_graphite', 'reward'));
  t.ok(first.acquired && first.inventory.length === 1 && owns(first.inventory, 'top_tee_graphite'), 'acquisition : objet ajouté');
  t.ok(!dup.acquired && dup.inventory.length === 1 && dup.inventory[0].acquiredVia === 'purchase', 'doublon : aucune seconde entrée, l’origine première est conservée');

  // ---------------------------------------------------------------- équipement et emplacements incompatibles
  let worn: EquippedCosmetics = {};
  const e1 = equipItem(worn, byId('top_tee_graphite'), SLOT_EXCLUSIONS);
  worn = e1.equipped;
  const e2 = equipItem(worn, byId('top_hoodie_nuit'), SLOT_EXCLUSIONS);
  t.ok(e1.changed && e2.changed && e2.equipped.TOP === 'top_hoodie_nuit' && e2.unequipped.includes('top_tee_graphite'), 'un seul objet par emplacement : le nouveau haut remplace l’ancien');
  worn = equipItem(e2.equipped, byId('bottom_jogger_graphite'), SLOT_EXCLUSIONS).equipped;
  worn = equipItem(worn, byId('jacket_coupe_vent_citron'), SLOT_EXCLUSIONS).equipped;
  worn = equipItem(worn, byId('glasses_sport_fume'), SLOT_EXCLUSIONS).equipped;
  const outfit = equipItem(worn, byId('outfit_urban_001'), SLOT_EXCLUSIONS);
  t.equal(outfit.equipped, { FULL_OUTFIT: 'outfit_urban_001', GLASSES: 'glasses_sport_fume' }, 'tenue complète : retire haut, bas et veste, garde les lunettes');
  t.equal([...outfit.unequipped].sort(), ['bottom_jogger_graphite', 'jacket_coupe_vent_citron', 'top_hoodie_nuit'], 'objets retirés listés');
  const same = equipItem(outfit.equipped, byId('outfit_urban_001'), SLOT_EXCLUSIONS);
  t.ok(!same.changed && same.unequipped.length === 0, 'rééquiper le même objet : aucun changement');
  const off = unequipSlot(outfit.equipped, 'GLASSES');
  const offEmpty = unequipSlot(off.equipped, 'GLASSES');
  t.ok(off.changed && off.equipped.GLASSES === undefined && !offEmpty.changed, 'retirer un emplacement');
  const revoked = revokeItem([entry('outfit_urban_001'), entry('glasses_sport_fume')], outfit.equipped, 'outfit_urban_001');
  t.ok(revoked.inventory.length === 1 && revoked.equipped.FULL_OUTFIT === undefined && revoked.equipped.GLASSES === 'glasses_sport_fume', 'objet retiré (remboursement) : déséquipé, le reste intact');
  t.ok(
    (Object.keys(SLOT_EXCLUSIONS) as (keyof typeof SLOT_EXCLUSIONS)[]).every((slot) => (SLOT_EXCLUSIONS[slot] ?? []).every((o) => (SLOT_EXCLUSIONS[o] ?? []).includes(slot))),
    'exclusions d’emplacements symétriques',
  );

  // ---------------------------------------------------------------- lien avec l'avatar (point 14)
  const presenter = createAvatarPresentationService(COSMETIC_CATALOG);
  const look = presenter.present({ SHOES: 'shoes_runner_lime', HEAD: 'head_casquette_noire', TOP: 'top_hoodie_nuit', BOTTOM: 'bottom_jogger_graphite', JACKET: 'jacket_coupe_vent_citron' });
  t.equal(look.layers.map((l) => l.slot), ['SHOES', 'BOTTOM', 'TOP', 'JACKET', 'HEAD'], 'couches dans l’ordre de rendu (pieds → tête)');
  t.ok(look.layers.every((l) => l.assetReference === byId(l.itemId).assetReference && l.rarity === byId(l.itemId).rarity), 'chaque couche porte la ressource et la rareté du catalogue');
  const full = presenter.present({ FULL_OUTFIT: 'outfit_urban_001' });
  t.equal(full.layers[0].replacesBase, ['torso', 'legs'], 'tenue complète : remplace le torse et les jambes de la tenue de base');
  const odd = presenter.present({ TOP: 'objet_disparu', SHOES: 'top_tee_graphite' });
  t.ok(odd.layers.length === 0 && odd.unknownItemIds.length === 2, 'objet inconnu ou dans le mauvais emplacement : signalé, jamais inventé');
  t.ok(presenter.present({}).layers.length === 0, 'rien de porté : aucune couche (le moteur garde la tenue de base)');

  // ---------------------------------------------------------------- serveur local : de l'achat au rendu
  const events = createEventBus();
  const seen: DomainEvent[] = [];
  events.subscribeAll((ev) => seen.push(ev));
  const server = new LocalEconomyServer({
    storage: createMemoryStorage(),
    events,
    config: {
      ...DEFAULT_SERVER_CONFIG,
      rewards: [...DEFAULT_SERVER_CONFIG.rewards, { id: 'test_grant_400', type: 'fitcoins', amount: 400, unlockCondition: { kind: 'lifetime_points', atLeast: 0 }, repeatable: false, enabled: true }],
    },
  });
  await server.claimReward('lea', 'test_grant_400');
  const bought = await server.spendFitcoins('lea', { itemId: 'outfit_urban_001', requestId: 'lea-achat-001' });
  const equipped = await server.equip('lea', 'outfit_urban_001');
  const inventory = await server.getInventory('lea');
  t.ok(bought.ok && equipped.ok && inventory.items[0].sourceTransactionId === (bought.ok ? bought.transaction.id : ''), 'achat : l’objet garde la trace de sa transaction');
  const rendered = createAvatarPresentationService(server.getCatalog()).present(inventory.equipped);
  t.ok(rendered.layers.length === 1 && rendered.layers[0].assetReference === 'cosmetic/full_outfit/outfit_urban_001', 'Économie → Inventaire → AvatarPresentationService : descripteur prêt pour le moteur');
  t.ok(seen.some((ev) => ev.type === 'inventory.item_acquired' && ev.payload.via === 'purchase') && seen.some((ev) => ev.type === 'inventory.item_equipped' && ev.payload.slot === 'FULL_OUTFIT'), 'événements d’acquisition et d’équipement');
  const grantDisabled = await server.grantCosmetic('lea', 'head_bonnet_hiver');
  const grantUnknown = await server.grantCosmetic('lea', 'inconnu');
  t.ok(!grantDisabled.ok && grantDisabled.code === 'ITEM_DISABLED' && !grantUnknown.ok && grantUnknown.code === 'ITEM_NOT_FOUND', 'attribution serveur : objet désactivé ou inconnu refusé');
  const withDisabledReward = new LocalEconomyServer({
    storage: createMemoryStorage(),
    config: {
      ...DEFAULT_SERVER_CONFIG,
      catalog: COSMETIC_CATALOG.map((i) => (i.id === 'top_tee_graphite' ? { ...i, enabled: false } : i)),
      rewards: [{ id: 'tee_offert', type: 'cosmetic', amount: 1, cosmeticItemId: 'top_tee_graphite', unlockCondition: { kind: 'lifetime_points', atLeast: 0 }, repeatable: false, enabled: true }],
    },
  });
  const unavailable = await withDisabledReward.claimReward('lea', 'tee_offert');
  t.ok(!unavailable.ok && unavailable.code === 'ITEM_UNAVAILABLE', 'récompense d’un objet retiré du catalogue : refusée proprement');
});
