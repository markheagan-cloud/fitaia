import { PushupCounter, angle, Pose } from '../src/pose/repCounter';
const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } else console.log('ok', m); };
// Profil : épaule (100,100), hanche (220,110), cheville (340,120) ; coude/poignet bougent.
function frame(elbowAngleDeg: number, hipDrop = 0): Pose {
  const sh = { x: 100, y: 100, c: 0.9 };
  const wr = { x: 100, y: 200, c: 0.9 }; // poignet au sol sous l'épaule
  // coude à l'apex d'un triangle isocèle épaule–poignet : angle voulu = θ → décalage = 50 / tan(θ/2)
  const theta = Math.max(1, Math.min(179.9, elbowAngleDeg));
  const d = 50 / Math.tan((theta * Math.PI) / 360);
  const el = { x: 100 + d, y: 150, c: 0.9 };
  const hip = { x: 220, y: 110 + hipDrop, c: 0.9 };
  return { shoulder: sh, elbow: el, wrist: wr, hip, knee: { x: 280, y: 115, c: 0.9 }, ankle: { x: 340, y: 120, c: 0.9 } };
}
assert(Math.round(angle({ x: 0, y: 0, c: 1 }, { x: 0, y: 1, c: 1 }, { x: 1, y: 1, c: 1 })) === 90, 'angle 90°');
const c = new PushupCounter();
const run = (angles: number[], hipDrop = 0) => angles.flatMap((a) => c.update(frame(a, hipDrop)));
// rep complète : 175 → 80 → 175 (plusieurs images pour le lissage)
let ev = run([175, 175, 150, 120, 95, 80, 75, 80, 100, 130, 160, 172, 176, 178]);
assert(ev.some((e) => e.type === 'rep'), 'rep complète comptée');
// demi-rep : descend à 120 seulement
ev = run([178, 150, 125, 120, 125, 150, 170, 178, 178]);
assert(ev.some((e) => e.type === 'rejected' && /90°/.test(e.reason)), 'demi-rep refusée (amplitude)');
// rep complète mais hanche qui plonge (pas gainé)
ev = run([178, 150, 110, 85, 75, 85, 120, 160, 176, 178], 60);
assert(ev.some((e) => e.type === 'rejected' && /gainé/.test(e.reason)), 'rep refusée (alignement)');
assert(c.count === 1, 'compteur = 1 (une seule rep valide)');
// perte de suivi
const lost = { ...frame(175), hip: { x: 220, y: 110, c: 0.1 } };
const tev = [1, 2, 3, 4, 5].flatMap(() => c.update(lost));
assert(tev.some((e) => e.type === 'tracking' && !e.ok), 'perte de suivi signalée');
console.log('ALL POSE TESTS PASSED');
