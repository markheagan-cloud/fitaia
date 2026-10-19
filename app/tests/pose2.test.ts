import { SquatCounter, PlankTimer, Pose } from '../src/pose/repCounter';
let n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) throw new Error('FAIL ' + m); console.log('ok', m); };
// Squat de profil : hanche au-dessus du genou, cheville au sol ; angle genou voulu via position de la hanche.
function squat(kneeDeg: number, lean = 0): Pose {
  const ankle = { x: 200, y: 400, c: 0.9 };
  const knee = { x: 200, y: 300, c: 0.9 }; // tibia vertical
  const th = (kneeDeg * Math.PI) / 180;
  // cuisse de longueur 100 partant du genou, angle hanche-genou-cheville = kneeDeg
  const hip = { x: 200 + Math.sin(th) * 100, y: 300 - Math.cos(th) * 100 * -1 - 0, c: 0.9 };
  // (cheville est sous le genou : vecteur genou→cheville = (0,+100) ; on place la hanche en tournant ce vecteur de kneeDeg)
  hip.x = 200 + 100 * Math.sin(th);
  hip.y = 300 + 100 * Math.cos(th);
  const shoulder = { x: hip.x + Math.sin((lean * Math.PI) / 180) * 120, y: hip.y - Math.cos((lean * Math.PI) / 180) * 120, c: 0.9 };
  return { shoulder, elbow: { x: shoulder.x, y: shoulder.y + 40, c: 0.9 }, wrist: { x: shoulder.x, y: shoulder.y + 80, c: 0.9 }, hip, knee, ankle };
}
const s = new SquatCounter();
const run = (a: number[], lean = 0) => a.flatMap((d) => s.update(squat(d, lean)));
let ev = run([178, 178, 160, 130, 100, 90, 85, 90, 110, 140, 165, 175, 178, 178]);
ok(ev.some((e) => e.type === 'rep'), 'squat complet compté');
ev = run([178, 150, 125, 120, 130, 160, 176, 178, 178]);
ok(ev.some((e) => e.type === 'rejected' && /95°/.test(e.reason)), 'demi-squat refusé');
ev = run([178, 150, 110, 88, 85, 85, 85, 85, 95, 130, 165, 176, 178, 178], 60);
ok(ev.some((e) => e.type === 'rejected' && /buste/.test(e.reason)), 'squat penché refusé');
ok(s.count === 1, 'compteur squats = 1');
// Gainage : corps aligné (épaule, hanche, cheville sur une ligne) pendant 3 s à 20 Hz
const aligned: Pose = { shoulder: { x: 100, y: 100, c: 0.9 }, elbow: { x: 100, y: 150, c: 0.9 }, wrist: { x: 100, y: 200, c: 0.9 }, hip: { x: 220, y: 110, c: 0.9 }, knee: { x: 280, y: 115, c: 0.9 }, ankle: { x: 340, y: 120, c: 0.9 } };
const sagging: Pose = { ...aligned, hip: { x: 220, y: 170, c: 0.9 } };
const t = new PlankTimer(3);
let last: any = null;
for (let i = 0; i <= 60; i++) last = t.update(aligned, i * 50)[0];
ok(last?.type === 'done' && last.seconds === 3, 'gainage 3 s validé (' + JSON.stringify(last) + ')');
const t2 = new PlankTimer(10);
for (let i = 0; i <= 40; i++) last = t2.update(aligned, i * 50)[0]; // 2 s
for (let i = 41; i <= 100; i++) last = t2.update(sagging, i * 50)[0]; // 3 s de hanches basses
ok(last.type === 'hold' && last.ok === false && /hanches/.test(last.reason) && last.seconds <= 3, 'gainage : hanches basses = temps en pause après tolérance (' + last.seconds + ' s)');
console.log(n + ' tests squats/gainage OK');
