/** Trois persos au choix (src/avatar/persoChoice.ts). */
import { addPerso, choosePerso, photosLeft } from '../src/avatar/persoChoice';
import { createCheck } from './helpers/check';

const t = createCheck();
const p = (id: string, at: number) => ({ id, at });
let s = addPerso(null, [], p('a', 1));
t.ok(s.current?.id === 'a' && s.alts.length === 0 && photosLeft(s.current, s.alts) === 2, 'premier perso : deux photos encore possibles');
s = addPerso(s.current, s.alts, p('b', 2));
t.ok(s.current?.id === 'b' && s.alts.map((x) => x.id).join() === 'a' && s.dropped.length === 0, 'deuxième photo : le premier reste au choix');
s = addPerso(s.current, s.alts, p('c', 3));
t.ok(s.current?.id === 'c' && s.alts.map((x) => x.id).join() === 'b,a' && s.dropped.length === 0 && photosLeft(s.current, s.alts) === 0, 'troisième photo : trois persos au choix');
const back = choosePerso(s.current, s.alts, 'a');
t.ok(back.current?.id === 'a' && back.alts.map((x) => x.id).sort().join() === 'b,c' && back.dropped.length === 0, 'choisir le premier : rien n’est perdu');
t.ok(choosePerso(s.current, s.alts, 'zz').current?.id === 'c', 'choix inconnu : rien ne change');
const four = addPerso(back.current, back.alts, p('d', 4));
t.ok(four.current?.id === 'd' && four.alts.length === 2 && four.alts[0].id === 'a' && four.dropped.map((x) => x.id).join() === 'b', 'quatrième photo : le plus ancien non choisi part, le préféré reste');
t.ok(addPerso(p('a', 1), [], p('a', 5)).alts.length === 0, 'même perso redessiné : pas de doublon');
console.log(t.count() + ' vérifications OK');
