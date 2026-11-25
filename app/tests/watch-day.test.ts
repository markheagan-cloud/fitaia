/** Montre connectée : mise en forme du résumé Santé du jour (src/coach/watchDay.ts). */
import { watchTiles } from '../src/coach/watchDay';
import { createCheck } from './helpers/check';

const t = createCheck();
const now = new Date(2026, 10, 25, 18, 30);
t.ok(watchTiles({}, now).length === 0, 'aucune mesure : aucune tuile, rien d’inventé');
t.ok(watchTiles({ steps: 0, activeKcal: NaN }, now).length === 0, 'zéro ou valeur invalide : pas de tuile');
const tiles = watchTiles({ steps: 8432.4, activeKcal: 412.6, heartRate: 71.6, heartRateAt: now.getTime() - 12 * 60000, workouts: 1, workoutMinutes: 34.2 }, now);
t.ok(tiles.map((x) => x.id).join() === 'steps,kcal,heart,workouts', 'quatre tuiles dans l’ordre');
t.ok(tiles[0].value === '8 432' && tiles[1].value === '413 kcal', 'pas et calories arrondis, milliers séparés');
t.ok(tiles[2].value === '72 bpm' && tiles[2].hint === 'il y a 12 min', 'cœur : dernière mesure et son âge');
t.ok(tiles[3].label === 'Séance' && tiles[3].hint === '34 min', 'séance au singulier avec sa durée');
t.ok(watchTiles({ workouts: 2 }, now)[0].label === 'Séances', 'pluriel');
t.ok(watchTiles({ heartRate: 60, heartRateAt: now.getTime() - 150 * 60000 }, now)[0].hint === 'il y a 2 h', 'mesure ancienne en heures');
console.log(t.count() + ' vérifications OK');
