/** Voix du défi (src/coach/repVoice.ts). */
import { rejectPhrase, repPhrase } from '../src/coach/repVoice';
import { createCheck } from './helpers/check';

const t = createCheck();
t.ok(repPhrase(0, 5) === '', 'rien avant la première');
t.ok(repPhrase(1, 5) === '1. C’est parti.', 'première');
t.ok(repPhrase(2, 5) === '2', 'compte simple');
t.ok(/^3\. Allez, tu y es presque/.test(repPhrase(3, 5)), 'presque à 2 de la fin');
t.ok(/^4\. Encore une/.test(repPhrase(4, 5)), 'encore une');
t.ok(/^5 ! Défi réussi/.test(repPhrase(5, 5)), 'réussi');
t.ok(/moitié/.test(repPhrase(10, 20)), 'moitié sur un long défi');
t.ok(rejectPhrase(0) === '' && rejectPhrase(1) !== rejectPhrase(2), 'corrections alternées');
console.log(t.count() + ' vérifications OK');
