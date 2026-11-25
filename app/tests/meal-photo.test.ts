/** Photo d'un repas → estimation (src/services/mealPhoto.ts), réponse réelle du service MealVision du 25/11/2026. */
import { estimateToMeal, parseMealEstimate } from '../src/services/mealEstimate';
import { createCheck } from './helpers/check';

const t = createCheck();
const reel = '{"ok": true, "name": "Repas complet", "items": [{"name": "Poulet grillé", "grams": 150, "kcal": 200, "p": 25, "g": 4, "l": 6}, {"name": "Riz blanc", "grams": 100, "kcal": 130, "p": 2, "g": 25, "l": 0}, {"name": "Brocoli", "grams": 100, "kcal": 30, "p": 2, "g": 7, "l": 0}], "kcal": 360}';
const e = parseMealEstimate(reel);
t.ok(e !== null && e.items.length === 3, 'trois aliments lus');
const m = estimateToMeal(e!, 1);
t.ok(m.kcal === 360 && m.p === 29 && m.g === 36 && m.l === 6, 'totaux portion normale');
t.ok(m.origin === 'photo' && m.items[1] === 'Riz blanc, 100 g', 'origine photo et grammes affichés');
const g = estimateToMeal(e!, 1.3);
t.ok(g.kcal === 468 && g.items[0] === 'Poulet grillé, 195 g', 'grande portion ×1,3');
t.ok(parseMealEstimate('{"ok": true, "name": "", "items": []}') === null, 'pas de repas sur la photo : null');
t.ok(parseMealEstimate('{"ok": true, "items": [{"name": "Eau", "kcal": 0}]}') === null, 'aliments à 0 kcal ignorés');
let err = '';
try { parseMealEstimate('pas du json'); } catch (x) { err = (x as Error).message; }
t.ok(/illisible/.test(err), 'réponse illisible : message clair');
console.log(t.count() + ' vérifications OK');
