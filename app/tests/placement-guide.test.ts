import { PlacementGuide, PHRASES, GUIDE, whatIsMissing } from '../src/pose/placementGuide';
import { PushupCounter, unsquash, angle, type Pose } from '../src/pose/repCounter';
import { toView } from '../src/pose/previewMap';
import { startPhrase } from '../src/coach/repVoice';

let n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) throw new Error('FAIL ' + m); console.log('ok', m); };

// Image caméra portrait 720 × 1280 (aspect 0,5625), coordonnées normalisées. Personne de profil, allongée en travers.
const ASPECT = 720 / 1280;
/** Pompe vue de profil, en pixels réels puis normalisée ; `elbowDeg` = angle réel au coude. */
function frame(elbowDeg: number, opts: { legs?: boolean; c?: number } = {}): Pose {
  const c = opts.c ?? 0.8;
  const px = (x: number, y: number, cc = c) => ({ x: x / 720, y: y / 1280, c: cc });
  const shoulder = { x: 160, y: 700 };
  const wrist = { x: 160, y: 820 };
  const th = Math.max(1, Math.min(179.9, elbowDeg));
  const d = 60 / Math.tan((th * Math.PI) / 360);
  return {
    shoulder: px(shoulder.x, shoulder.y),
    elbow: px(shoulder.x + d, 760),
    wrist: px(wrist.x, wrist.y),
    hip: px(400, 715),
    knee: px(520, 722, opts.legs === false ? 0.05 : c),
    ankle: px(640, 730, opts.legs === false ? 0.05 : c),
  };
}

// 1) Sans correction de l'écrasement, un coude réel à 90° se lit faux ; avec, il se lit juste.
const f90 = frame(90);
const squashed = angle(f90.shoulder, f90.elbow, f90.wrist);
const fixed = unsquash(f90, ASPECT);
const real = angle(fixed.shoulder, fixed.elbow, fixed.wrist);
ok(Math.abs(real - 90) < 1, 'coude à 90° lu à ' + real.toFixed(1) + '° après correction (' + squashed.toFixed(1) + '° sans)');

// 2) Guidage : personne → « je ne te vois pas » après un délai, pas avant
const g = new PlacementGuide();
let t = 0;
const step = 1000 / 15;
const said: string[] = [];
const feed = (found: boolean, pose?: Pose) => { const o = g.update({ found, ts: t, pose }); t += step; if (o.say) said.push(o.say); return o; };
let o = feed(false);
ok(!o.say && o.status === 'searching', 'rien dit tout de suite au démarrage');
for (let i = 0; i < 20; i++) feed(false);
ok(said[0] === PHRASES.nobody, 'personne vu → consigne de placement dite');
// répété au plus toutes les 7 s
const before = said.length;
for (let i = 0; i < 60; i++) feed(false); // 4 s
ok(said.length === before, 'consigne pas répétée en boucle');

// 3) Jambes hors champ → on le dit
for (let i = 0; i < 50; i++) feed(true, frame(175, { legs: false }));
ok(said.includes(PHRASES.legs) && g.status === 'partial', 'jambes hors champ → « éloigne le téléphone »');
ok(whatIsMissing({ ...frame(175), wrist: { x: 0.2, y: 0.6, c: 0.1 } }) === 'arms', 'bras non vu détecté');
ok(whatIsMissing({ ...frame(175), ankle: { x: 0.995, y: 0.6, c: 0.9 } }) === 'edge', 'personne coupée au bord détectée');

// 4) Corps entier vu en continu → bip + « c'est bon », même juste après une autre consigne
let beep = false;
let readyAt = -1;
for (let i = 0; i < 20; i++) { const r = feed(true, frame(175)); if (r.beep) { beep = true; readyAt = i; } }
ok(beep && g.ready && said[said.length - 1] === PHRASES.ready, 'bien placé → bip + « c’est bon » (après ' + readyAt + ' images)');
ok(readyAt * step >= GUIDE.readyMs - step, 'pas de « c’est bon » sur une seule image');

// 5) Courte perte (descente rapide) tolérée, longue perte annoncée
for (let i = 0; i < 10; i++) feed(true, frame(175, { c: 0.1 }));
ok(g.ready, 'perte de 0,7 s tolérée');
for (let i = 0; i < 30; i++) feed(true, frame(175, { c: 0.1 }));
ok(!g.ready && said.includes(PHRASES.lost), 'perte longue → « je ne te vois plus en entier »');

// 6) Comptage complet avec image écrasée corrigée et chevilles mal vues (genou utilisé)
const c = new PushupCounter();
const run = (angles: number[], legsSeen = true) => angles.flatMap((a) => {
  const p = frame(a);
  if (!legsSeen) p.ankle = { ...p.ankle, c: 0.1 };
  return c.update(unsquash(p, ASPECT));
});
let ev = run([175, 175, 150, 120, 95, 85, 80, 85, 100, 130, 160, 172, 176, 178]);
ok(ev.some((e) => e.type === 'rep'), 'pompe comptée (image portrait, angles corrigés)');
ev = run([175, 150, 120, 95, 85, 80, 85, 100, 130, 160, 172, 176, 178], false);
ok(c.count === 2, 'pompe comptée avec chevilles cachées (alignement sur le genou)');

// 7) Squelette posé sur l'aperçu : le centre de l'image tombe au centre de la vue, miroir pour la caméra avant
const mid = toView({ x: 0.5, y: 0.5 }, ASPECT, 342, 600, true);
ok(Math.abs(mid.x - 171) < 0.01 && Math.abs(mid.y - 300) < 0.01, 'centre image = centre aperçu');
const left = toView({ x: 0.3, y: 0.5 }, ASPECT, 342, 600, false);
const leftM = toView({ x: 0.3, y: 0.5 }, ASPECT, 342, 600, true);
ok(Math.abs(left.x + leftM.x - 342) < 0.01, 'miroir caméra avant appliqué');

ok(/écran vers toi/.test(startPhrase), 'consigne de départ : téléphone écran vers soi');
console.log(n + ' tests placement/guidage OK');

// ── Passe de fiabilité ───────────────────────────────────────────────────────────────────────
import { poseForSide } from '../src/pose/sideLock';
import { pickVoice } from '../src/services/voicePick';
import { rejectWhyPhrase } from '../src/coach/repVoice';

// Debout face au téléphone (corps vertical) : rien ne compte, et on demande de se mettre en position
const standing = (elbow: number): Pose => {
  const p = frame(elbow);
  return { ...p, hip: { x: 0.25, y: 0.55, c: 0.8 }, knee: { x: 0.25, y: 0.7, c: 0.8 }, ankle: { x: 0.25, y: 0.85, c: 0.8 }, shoulder: { ...p.shoulder, x: 0.25, y: 0.35 } };
};
const c2 = new PushupCounter();
const evs = [175, 120, 80, 120, 175, 175, 80, 175, 175, 175, 175, 175, 175, 175, 175, 175, 175, 175, 175, 175, 175, 175].flatMap((a) => c2.update(unsquash(standing(a), ASPECT)));
ok(c2.count === 0 && !evs.some((e) => e.type === 'rep' || e.type === 'rejected'), 'debout : bras pliés jamais comptés ni reprochés');
ok(evs.some((e) => e.type === 'posture'), 'debout : « mets-toi en position de pompe » demandé');

// Petite flexion en ajustant ses mains (160°) : ni comptée, ni reprochée
const c3 = new PushupCounter();
const small = [178, 178, 160, 150, 145, 150, 165, 178, 178].flatMap((a) => c3.update(unsquash(frame(a), ASPECT)));
ok(!small.some((e) => e.type === 'rejected' || e.type === 'rep'), 'petite flexion ignorée');

// Côté verrouillé : on garde le bras gauche même si le droit est mieux vu sur une image
const L = frame(90), R = frame(170);
const sev = { found: true, side: 'right' as const, points: R, left: L, right: R };
ok(poseForSide(sev, 'left') === L && poseForSide(sev, null) === R && poseForSide({ found: false }, 'left') === undefined, 'côté verrouillé respecté');

// Voix : française, améliorée de préférence, jamais une voix fantaisie
const voices = [
  { identifier: 'com.apple.eloquence.fr-FR.Grandma', name: 'Grand-mère', quality: 'Enhanced', language: 'fr-FR' },
  { identifier: 'com.apple.voice.compact.fr-FR.Thomas', name: 'Thomas', quality: 'Default', language: 'fr-FR' },
  { identifier: 'com.apple.voice.enhanced.fr-FR.Audrey', name: 'Audrey', quality: 'Enhanced', language: 'fr-FR' },
  { identifier: 'com.apple.voice.enhanced.fr-CA.Amelie', name: 'Amélie', quality: 'Enhanced', language: 'fr-CA' },
  { identifier: 'com.apple.speech.synthesis.voice.Albert', name: 'Albert', quality: 'Default', language: 'fr-FR' },
];
ok(pickVoice(voices) === 'com.apple.voice.enhanced.fr-FR.Audrey', 'voix choisie : française améliorée');
ok(pickVoice(voices.slice(0, 2)) === 'com.apple.voice.compact.fr-FR.Thomas', 'voix fantaisie écartée');
ok(pickVoice([]) === undefined, 'aucune voix française : voix par défaut du téléphone');
ok(/plus bas/.test(rejectWhyPhrase('depth', 1)) && /hanches/.test(rejectWhyPhrase('align', 1)), 'correction vocale précise');
console.log(n + ' tests au total');
