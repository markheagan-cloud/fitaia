/**
 * Prix en euros : un prix fixe par tenue, calé sur le marché, jamais sur une tenue commune ni offerte ; identifiants
 * App Store stables ; toute tenue payable en euros reste payable en Fitcoins.
 */
import { COSMETIC_CATALOG } from '../src/inventory/cosmeticCatalog';
import { OUTFIT_SHEETS } from '../src/shop/catalogue';
import { PALIERS, eurosLabel, itemIdOfProduct, palierOf, productIdOf } from '../src/shop/prixEuros';
import { runSuite } from './helpers/check';

runSuite('prix-euros', async (t) => {
  const shop = OUTFIT_SHEETS.map((s) => COSMETIC_CATALOG.find((i) => i.id === s.itemId)!);
  const ids = new Set<string>();
  for (const i of shop) {
    const p = palierOf(i);
    if (i.rarity === 'COMMON' || i.priceFitcoins === null) t.equal(p, null, i.id + ' : Fitcoins seulement');
    else {
      t.ok(!!p, i.id + ' : prix en euros');
      t.ok(i.priceFitcoins > 0, i.id + ' : aussi en Fitcoins');
    }
    const pid = productIdOf(i.id);
    t.ok(/^com\.fitaia\.app\.tenue\.[a-z0-9_]+$/.test(pid) && !ids.has(pid), pid + ' : identifiant App Store valide et unique');
    ids.add(pid);
    t.equal(itemIdOfProduct(pid), i.id, pid + ' : aller-retour');
  }
  t.equal(palierOf(COSMETIC_CATALOG.find((i) => i.id === 'outfit_royal')!), PALIERS.prestige, 'Royal Or : 14,99 €');
  // plus c'est rare, plus c'est cher, en euros comme en Fitcoins
  const order = ['rare', 'epique', 'legendaire', 'prestige'] as const;
  for (let k = 1; k < order.length; k++) t.ok(PALIERS[order[k]].euros > PALIERS[order[k - 1]].euros, order[k] + ' plus cher que ' + order[k - 1]);
  t.equal(eurosLabel(9.99), '9,99 €', 'format français');
  t.equal(itemIdOfProduct('com.autre.app'), null, 'produit étranger ignoré');
});
