/** Repas récents (src/coach/recentMeals.ts). */
import { recentMeals } from '../src/coach/recentMeals';
import { createCheck } from './helpers/check';

const t = createCheck();
const m = (id: string, at: number, name: string, kcal: number) => ({ id, at, name, kcal, p: 1, g: 2, l: 3, score: 60, items: [name] });
const r = recentMeals({
  '2026-11-24': [m('a', 100, 'Poulet riz', 520), m('b', 200, 'Yaourt', 90)],
  '2026-11-25': [m('c', 300, 'Poulet riz', 520), m('d', 400, 'Pâtes', 610), m('reprise-x', 500, 'Repas enregistrés avant le journal', 900)],
});
t.ok(r.length === 3, 'doublons et reprise écartés');
t.ok(r[0].name === 'Pâtes' && r[1].name === 'Poulet riz' && r[2].name === 'Yaourt', 'du plus récent au plus ancien');
t.ok(!('id' in r[0]) && r[0].kcal === 610, 'un repas prêt à ré-enregistrer, sans identifiant');
t.ok(recentMeals({}).length === 0, 'journal vide');
console.log(t.count() + ' vérifications OK');
