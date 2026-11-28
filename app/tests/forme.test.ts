/** Forme : niveaux sur 4 et fenêtre d'entraînement (src/coach/forme.ts). */
import { fenetre, forme } from '../src/coach/forme';
import { createCheck } from './helpers/check';

const t = createCheck();
const now = new Date(2026, 10, 25, 18, 30);
const vide = forme(0, {}, 0, now);
t.ok(vide.every((j) => j.level === 1), 'départ : tout au niveau 1');
t.ok(vide[0].hint === 'encore 25 pompes', 'force : ce qu’il reste');
const h = { '2026-11-25': { challenges: 1, meals: 2, earned: 0 }, '2026-11-24': { challenges: 0, meals: 1, earned: 0 }, '2026-11-10': { challenges: 0, meals: 3, earned: 0 } };
const j = forme(120, h, 4, now);
t.ok(j[0].level === 3 && j[1].level === 2 && j[2].level === 3, 'niveaux calculés sur le réel (repas hors 7 jours ignorés)');
t.ok(forme(300, h, 7, now)[0].level === 4 && forme(300, h, 7, now)[2].hint === 'niveau max', 'niveau max');
const f = fenetre(false, now);
t.ok(f.open && /encore 5 h/.test(f.text), 'fenêtre : 5 h restantes à 18 h 30');
t.ok(/45 min/.test(fenetre(false, new Date(2026, 10, 25, 23, 15)).text), 'fenêtre : minutes en fin de journée');
t.ok(!fenetre(true, now).open, 'défi validé : fenêtre fermée');
console.log(t.count() + ' vérifications OK');
