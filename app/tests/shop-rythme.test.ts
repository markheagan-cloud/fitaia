/**
 * Rythme de déblocage : les objectifs de la chronologie (docs/ECONOMIE.md) tiennent avec les vraies règles.
 * Si on change un prix ou une récompense et qu'un objectif casse, ce test le dit.
 */
import { COSMETIC_CATALOG } from '../src/inventory/cosmeticCatalog';
import { OUTFIT_SHEETS, WINDOWS } from '../src/shop/catalogue';
import { COIN_MILESTONES, PERSONAS, dayGain, daysToAfford, inDays, myWeek, nextEvents, paceFor, simulate, unlockTimeline } from '../src/shop/rythme';
import { runSuite } from './helpers/check';

const P = Object.fromEntries(PERSONAS.map((p) => [p.id, p.week]));
const shop = OUTFIT_SHEETS.map((s) => COSMETIC_CATALOG.find((i) => i.id === s.itemId)!).filter((i) => i.priceFitcoins !== null).map((i) => ({ id: i.id, price: i.priceFitcoins! }));
const price = (id: string) => COSMETIC_CATALOG.find((i) => i.id === id)!.priceFitcoins!;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

runSuite('rythme-boutique', async (t) => {
  t.equal(dayGain({ challenges: 1, meals: 2 }), { coins: 60, points: 60 }, 'journée type : 60 Fitcoins, 60 PF');
  t.equal(dayGain({ challenges: 5, meals: 9 }), { coins: 60, points: 165 }, 'plafonds du jour respectés (150 + 15 PF)');
  t.ok(COIN_MILESTONES[0].atPoints === 50 && COIN_MILESTONES[0].coins === 100, 'premier défi : +100 Fitcoins');
  t.ok(COIN_MILESTONES.some((m) => m.label === 'Étape Élan'), 'bonus d’étape présents');

  // 1. Première victoire le premier jour, pour tout le monde
  for (const p of PERSONAS) t.ok(daysToAfford(Math.min(...shop.map((s) => s.price)), p.week) === 1, p.label + ' : première tenue dès le 1er jour');

  // 2. Un régulier débloque quelque chose au moins toutes les 2 semaines pendant 2 mois
  const reg = unlockTimeline(shop, P.regulier, 60);
  let last = 0;
  for (const u of reg) {
    t.ok(u.day - last <= 14, 'régulier : ' + u.id + ' au jour ' + u.day + ' (écart ' + (u.day - last) + ' j)');
    last = u.day;
  }
  t.ok(reg.length >= 6, 'régulier : au moins 6 tenues en 2 mois (' + reg.length + ')');

  // 3. Les éditions limitées : un régulier peut en avoir une avant la fin, pas toutes (le choix compte)
  const winterDays = daysBetween('2026-11-26', WINDOWS.hiver.until) + 1;
  t.ok((daysToAfford(price('outfit_titane'), P.regulier) ?? 999) <= winterDays, 'régulier : Titane Néon possible avant le ' + WINDOWS.hiver.until);
  const winterAll = ['outfit_titane', 'outfit_pilote', 'outfit_samourai'].reduce((s, id) => s + price(id), 0);
  t.ok(simulate(P.regulier, winterDays).at(-1)!.coins < winterAll, 'régulier : pas les 3 éditions d’hiver sans choisir');
  t.ok(simulate(P.fond, winterDays).at(-1)!.coins >= winterAll, 'à fond : les 3 éditions d’hiver possibles');
  t.ok(simulate(P.occasionnel, winterDays).at(-1)!.coins < price('outfit_titane') + price('outfit_samourai'), 'occasionnel : une seule légendaire d’hiver, il faut choisir');

  // 4. Le catalogue entier reste un objectif long (pas tout en une saison, même à fond)
  const all = shop.reduce((s, i) => s + i.price, 0);
  t.ok(simulate(P.fond, 56).at(-1)!.coins < all, 'à fond : pas tout le catalogue en 8 semaines');
  t.ok(simulate(P.fond, 365).at(-1)!.coins >= all, 'à fond : tout le catalogue possible en un an');

  // 5. Rythme personnel : calculé sur les vrais jours, jamais deviné avec trop peu de données
  t.equal(myWeek({ '2026-11-25': { challenges: 1, meals: 1 } }, '2026-11-26'), null, 'moins de 3 jours : pas d’estimation personnelle');
  const h = { '2026-11-20': { challenges: 1, meals: 2 }, '2026-11-22': { challenges: 2, meals: 1 }, '2026-11-26': { challenges: 1, meals: 0 } };
  const mw = myWeek(h, '2026-11-26')!;
  t.ok(mw.days === 7 && mw.week.length === 7 && mw.week[0].challenges === 1 && mw.week[1].challenges === 0, 'semaine perso : 7 jours depuis la 1re activité, jours vides comptés');
  t.ok(paceFor(h, '2026-11-26').mine && !paceFor({}, '2026-11-26').mine, 'rythme perso si données, sinon profil Régulier');
  const ev = nextEvents([{ id: 'outfit_sprint', name: 'Sprint Rouge', price: 150 }], paceFor({}, '2026-11-26'), { coins: 0, points: 0 });
  t.ok(ev[0].kind === 'palier' && ev[0].day === 1 && ev.some((e) => e.label === 'Sprint Rouge' && e.day === 1), 'calendrier : bonus du 1er défi puis Sprint Rouge le jour 1');
  t.equal([inDays(0), inDays(1), inDays(9), inDays(21), inDays(90)], ['aujourd’hui', 'demain', 'dans 9 jours', 'dans 3 semaines', 'dans 3 mois'], 'libellés de délai');
});
