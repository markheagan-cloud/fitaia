/** Cible du défi du jour (src/coach/challengeTarget.ts). */
import { challengeTarget, nextRaise } from '../src/coach/challengeTarget';
import { createCheck } from './helpers/check';

const t = createCheck();
const today = new Date(2026, 10, 25);
const day = (n: number) => '2026-10-' + String(n).padStart(2, '0');
const h = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [day(i + 1), { challenges: 1, meals: 0, earned: 0 }]));
t.ok(challengeTarget({}, today) === 5, 'départ : 5 pompes');
t.ok(challengeTarget(h(2), today) === 5 && challengeTarget(h(3), today) === 6, 'une de plus après 3 jours réussis');
t.ok(challengeTarget({ ...h(3), '2026-11-25': { challenges: 1, meals: 0, earned: 0 } }, today) === 6, 'la réussite du jour ne change pas la cible du jour');
t.ok(challengeTarget({ '2026-10-01': { challenges: 0, meals: 3, earned: 0 } }, today) === 5, 'un jour sans défi ne compte pas');
t.ok(challengeTarget(Object.fromEntries(Array.from({ length: 80 }, (_, i) => ['j' + i, { challenges: 1, meals: 0, earned: 0 }])), today) === 20, 'plafond à 20');
t.ok(/Encore 1 jour réussi et le défi passe à 6 pompes/.test(nextRaise(h(2), today)), 'annonce de la prochaine hausse');
console.log(t.count() + ' vérifications OK');
