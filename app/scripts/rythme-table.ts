/** Tableau « combien de jours pour quoi » (docs/ECONOMIE.md), calculé avec les vraies règles : npm run rythme */
import { COSMETIC_CATALOG } from '../src/inventory/cosmeticCatalog';
import { RARITY } from '../src/data/content';
import { OUTFIT_SHEETS } from '../src/shop/catalogue';
import { COIN_MILESTONES, PERSONAS, daysToAfford, simulate, unlockTimeline } from '../src/shop/rythme';

const R = { COMMON: 'commune', RARE: 'rare', EPIC: 'epique', LEGENDARY: 'legendaire' } as const;
const items = OUTFIT_SHEETS.map((s) => COSMETIC_CATALOG.find((i) => i.id === s.itemId)!).filter((i) => i.priceFitcoins !== null).sort((a, b) => a.priceFitcoins! - b.priceFitcoins!);
const rows: string[] = [];
rows.push('| Tenue | Rareté | Prix | ' + PERSONAS.map((p) => p.label).join(' | ') + ' |');
rows.push('|---|---|---:|' + PERSONAS.map(() => '---:').join('|') + '|');
for (const i of items) rows.push('| ' + i.name + (i.source === 'LIMITED' ? ' (limitée)' : '') + ' | ' + RARITY[R[i.rarity]].label + ' | ' + i.priceFitcoins + ' | ' + PERSONAS.map((p) => (daysToAfford(i.priceFitcoins!, p.week) ?? '>730') + ' j').join(' | ') + ' |');
const tl: string[] = ['| Profil | Ordre de déblocage, jour par jour (la moins chère d’abord) |', '|---|---|'];
for (const p of PERSONAS) tl.push('| ' + p.label + ' | ' + unlockTimeline(items.map((i) => ({ id: i.name, price: i.priceFitcoins! })), p.week, 120).map((u) => 'J' + u.day + ' ' + u.id).join(' · ') + ' |');
const earn: string[] = ['| Profil | 7 jours | 30 jours | 60 jours | 90 jours |', '|---|---:|---:|---:|---:|'];
for (const p of PERSONAS) earn.push('| ' + p.label + ' (' + p.line + ') | ' + [7, 30, 60, 90].map((d) => simulate(p.week, d).at(-1)!.earned).join(' | ') + ' |');
const ms = ['| Palier | Bonus |', '|---|---:|', ...COIN_MILESTONES.map((m) => '| ' + m.label + ' (' + m.atPoints + ' PF) | +' + m.coins + ' |')];
console.log(JSON.stringify({ table: rows.join('\n'), timeline: tl.join('\n'), earn: earn.join('\n'), milestones: ms.join('\n') }));
