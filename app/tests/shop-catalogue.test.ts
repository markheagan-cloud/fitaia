/**
 * Catalogue de la boutique : chaque tenue en vente a sa fiche (et un dessin côté service), chaque édition limitée a
 * une vraie date appliquée, les articles « à venir » ne se vendent pas, les identifiants restent cohérents.
 */
import { COSMETIC_CATALOG } from '../src/inventory/cosmeticCatalog';
import { purchaseBlock } from '../src/inventory/inventory';
import { SKINS } from '../src/data/content';
import { OUTFIT_SHEETS, UPCOMING, WINDOWS, frenchDate, limitedLine, limitedState, onSale, sheetOf, upcomingMatches, upcomingPrice } from '../src/shop/catalogue';
import { runSuite } from './helpers/check';

type Fs = { readFileSync(path: string, encoding: 'utf8'): string };

runSuite('catalogue-boutique', async (t) => {
  const fs = (await import('node:fs' as string)) as Fs;
  const recette = fs.readFileSync('../hero3d/caricature/space/recette.py', 'utf8');

  // 1. Toute tenue affichée en boutique a sa fiche, et le service sait la dessiner (clé de la recette)
  for (const sk of SKINS) {
    const id = 'outfit_' + sk.id;
    t.ok(!!sheetOf(id), id + ' : fiche présente');
    t.ok(new RegExp("'" + sk.id + "':").test(recette), id + ' : dessinée par la recette du service');
    t.ok(!!COSMETIC_CATALOG.find((i) => i.id === id), id + ' : objet du catalogue économique');
    const s = sheetOf(id)!;
    t.ok(Object.values(s.pieces).filter(Boolean).length >= 2 && !!s.decor, id + ' : pièces et décor détaillés');
  }
  t.equal(OUTFIT_SHEETS.length, SKINS.length, 'une fiche par tenue, pas de fiche orpheline');

  // 2. Éditions limitées : exactement les objets LIMITED, avec une date de fin
  for (const item of COSMETIC_CATALOG.filter((i) => i.category === 'FULL_OUTFIT' && sheetOf(i.id))) {
    t.equal(!!sheetOf(item.id)!.limited, item.source === 'LIMITED', item.id + ' : limitée si et seulement si source LIMITED');
  }

  // 3. Dates : ouverte jusqu'au dernier jour inclus (heure de Paris), fermée le lendemain
  const w = WINDOWS.hiver; // jusqu'au 31/01/2027
  t.ok(limitedState(w, new Date('2026-11-26T10:00:00Z')).open, 'ouverte le 26/11/2026');
  const last = limitedState(w, new Date('2027-01-31T22:30:00Z')); // 23 h 30 à Paris
  t.ok(last.open && last.daysLeft === 1, 'dernier jour : ouverte, 1 jour');
  t.ok(!limitedState(w, new Date('2027-01-31T23:30:00Z')).open, 'fermée le 1er février à 0 h 30 à Paris');
  t.equal(limitedState(w, new Date('2026-11-26T10:00:00Z')), { open: true, daysLeft: 67, untilLabel: '31 janvier 2027' }, '67 jours le 26/11');
  t.equal(limitedLine(w, new Date('2027-01-31T10:00:00Z')), 'Jusqu’au 31 janvier 2027 · dernier jour', 'libellé du dernier jour');
  t.equal(frenchDate('2027-02-01'), '1er février 2027', '1er du mois');
  t.ok(!onSale('outfit_titane', new Date('2027-03-01T12:00:00Z')), 'édition terminée : plus en vente');
  t.ok(onSale('outfit_sprint', new Date('2030-01-01T12:00:00Z')), 'tenue permanente : toujours en vente');

  // 4. À venir : identifiants uniques, jamais une tenue affichée, prix pris dans le catalogue quand il existe
  const ids = new Set<string>();
  for (const u of UPCOMING) {
    t.ok(!ids.has(u.id), u.id + ' : identifiant unique');
    ids.add(u.id);
    t.ok(!sheetOf(u.id), u.id + ' : pas en vente comme tenue dessinée');
    if (u.catalogId) {
      const c = COSMETIC_CATALOG.find((i) => i.id === u.catalogId);
      t.ok(!!c, u.id + ' : objet du catalogue existant');
      t.equal(upcomingPrice(u), c!.priceFitcoins, u.id + ' : prix du catalogue');
      if (c!.source === 'REWARD' || c!.source === 'PRESTIGE') t.ok(purchaseBlock(c!) === 'NOT_FOR_SALE', u.id + ' : ne s’achète pas');
    } else t.equal(upcomingPrice(u), null, u.id + ' : prix non inventé');
  }
  t.ok(UPCOMING.filter((u) => upcomingMatches(u, 'chaussures')).length >= 5, 'rayon chaussures garni');
  t.ok(UPCOMING.every((u) => u.kind !== 'chaussures' || upcomingMatches(u, 'chaussures')), 'chaussures dans leur rayon');
});
