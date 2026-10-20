/* Tests du FITAIA Human Engine (logique pure : profil → corps, calibration, animation, façade). */
import { bodyFromProfile, currentAndTarget, toMorphWeights, bmiOf } from '../src/human-engine/body/BodyParameterMapper';
import { MorphAnimator, easeInOutCubic } from '../src/human-engine/animation/MorphAnimator';
import { FitaiaHumanEngine } from '../src/human-engine/core/FitaiaHumanEngine';
import { DEFAULT_PROFILE } from '../src/store/profile';
import { evaluateDrivers, piecewise, PROTOTYPE_DRIVERS } from '../src/human-engine/body/BodyParameterMapper';
import { AVATARS, DEFAULT_AVATAR, PREMIUM_MALE_DRIVERS, avatarForProfile } from '../src/human-engine/avatars';
import maleStats from '../src/human-engine/assets/premium-male-01.stats.json';
import femaleStats from '../src/human-engine/assets/premium-female-01.stats.json';
import { BODY_SHAPE_KEYS, shapeFromBody, withOverrides } from '../src/human-engine/body/BodyShape';

let n = 0;
const ok = (c: boolean, m: string) => {
  if (!c) throw new Error('ÉCHEC : ' + m);
  n++;
  console.log('ok', m);
};
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;

// 1. IMC
ok(near(bmiOf(178, 92), 29.04, 0.01), 'IMC 178 cm / 92 kg = 29,0');

// 2. Profil par défaut → corps actuel et objectif cohérents
const { current, target } = currentAndTarget(DEFAULT_PROFILE, 92);
ok(near(current.weight, 0.502, 0.005) && near(current.bellyFat, 0.503, 0.005) && near(current.muscle, 0.35), 'corps actuel 92 kg = 0,50 / 0,50 / 0,35');
ok(target.weight < current.weight && target.bellyFat < current.bellyFat && target.muscle > current.muscle, 'objectif : moins de masse et de ventre, plus de muscle');

// 3. Bornes
const huge = bodyFromProfile({ sex: 'm', heightCm: 170, activity: 'intense' }, 200);
const tiny = bodyFromProfile({ sex: 'm', heightCm: 190, activity: 'sedentaire' }, 50);
ok(huge.weight === 1 && huge.bellyFat === 1 && tiny.weight === 0 && tiny.bellyFat === 0, 'valeurs bornées à [0, 1]');
const f = bodyFromProfile({ sex: 'f', heightCm: 165, activity: 'modere' }, 80);
const mm = bodyFromProfile({ sex: 'm', heightCm: 165, activity: 'modere' }, 80);
ok(f.bellyFat < mm.bellyFat && f.weight === mm.weight, 'à IMC égal, ventre moindre chez les femmes (répartition moyenne)');

// 4. Calibration → noms de morphs
const w = toMorphWeights({ weight: 0.65, bellyFat: 0.45, muscle: 0.3 });
ok(w.body_weight === 0.65 && w.belly_fat === 0.45 && w.muscle === 0.3, 'calibration prototype = identité vers body_weight / belly_fat / muscle');
ok(toMorphWeights({ weight: 2, bellyFat: -1, muscle: NaN }).body_weight === 1, 'entrées hors bornes ramenées dans [0, 1]');

// 5. Animateur
ok(easeInOutCubic(0) === 0 && easeInOutCubic(1) === 1 && near(easeInOutCubic(0.5), 0.5), 'easing : 0 → 0, ½ → ½, 1 → 1');
const a = new MorphAnimator();
a.start({ weight: 0.6, bellyFat: 0.4, muscle: 0.3 }, { weight: 0.2, bellyFat: 0.2, muscle: 0.5 }, 1000, 1600);
const mid = a.step(1800)!;
ok(near(mid.value.weight, 0.4) && !mid.done, 'mi-parcours (800/1600 ms) : poids 0,40');
const end = a.step(2700)!;
ok(end.done && near(end.value.muscle, 0.5) && !a.active && a.step(2800) === null, 'fin : valeur cible exacte, puis inactif');
a.start({ weight: 0, bellyFat: 0, muscle: 0 }, { weight: 1, bellyFat: 1, muscle: 1 }, 0, 0);
ok(a.step(0)!.done, 'durée 0 (mouvement réduit) : immédiat');

// 6. Façade moteur (sans avatar chargé)
(async () => {
  const e = new FitaiaHumanEngine();
  e.setBody({ weight: 0.65, bellyFat: 0.45, muscle: 0.3 });
  const s = e.snapshot();
  ok(s.morphs.body_weight === 0.65 && s.morphs.belly_fat === 0.45 && s.morphs.muscle === 0.3, 'setBody → morphTargetInfluences attendus');
  e.setBody({ muscle: 0.8 });
  ok(e.getBody().weight === 0.65 && e.getBody().muscle === 0.8, 'setBody partiel : les autres valeurs sont conservées');
  const p = e.animateTo({ weight: 0.3, bellyFat: 0.2, muscle: 0.35 }, { durationMs: 1000 });
  const t0 = (globalThis.performance?.now?.() ?? Date.now());
  e.update(t0 + 500);
  ok(e.snapshot().animating && e.getBody().weight < 0.65 && e.getBody().weight > 0.3, 'animation en cours : valeur intermédiaire');
  e.update(t0 + 1100);
  ok(await p, 'animateTo résout true à l’arrivée');
  ok(near(e.getBody().weight, 0.3) && !e.snapshot().animating, 'arrivée exacte sur la cible');
  const p2 = e.animateTo({ weight: 0.9 }, { durationMs: 1000 });
  e.setBody({ weight: 0.1 });
  ok((await p2) === false && e.getBody().weight === 0.1, 'setBody interrompt l’animation (résout false)');
  let calls = 0;
  const un = e.subscribe(() => calls++);
  e.setBody({ weight: 0.5 });
  un();
  e.setBody({ weight: 0.4 });
  ok(calls === 2, 'abonnement : état initial + 1 changement, puis désabonné');
  // Drivers (couche qui rend BodyParameters indépendants du mesh)
  ok(piecewise([[0, 0], [1, 1]], 0.25) === 0.25 && piecewise([[0.2, 0], [0.6, 1]], 0) === 0 && piecewise([[0.2, 0], [0.6, 1]], 2) === 1, 'piecewise : interpolation et bornes');
  const proto = evaluateDrivers({ weight: 0.65, bellyFat: 0.45, muscle: 0.3 }, PROTOTYPE_DRIVERS);
  ok(proto.body_weight === 0.65 && proto.belly_fat === 0.45 && proto.muscle === 0.3, 'drivers prototype = identité');
  const thin = evaluateDrivers({ weight: 0, bellyFat: 0, muscle: 0 }, PREMIUM_MALE_DRIVERS);
  const base = evaluateDrivers({ weight: 0.167, bellyFat: 0.05, muscle: 0.28 }, PREMIUM_MALE_DRIVERS);
  const heavy = evaluateDrivers({ weight: 1, bellyFat: 1, muscle: 0.3 }, PREMIUM_MALE_DRIVERS);
  ok(thin.body_weight_low > 0 && thin.body_weight === 0 && thin.muscle_low > 0, 'héros : corps mince → morphs « low »');
  ok(Object.entries(base).filter(([k]) => k !== 'shoulders').every(([, v]) => v < 0.05), 'héros : IMC ~23 / activité moyenne ≈ corps de base');
  ok(heavy.body_weight === 1 && heavy.face_fat > 0.8 && heavy.neck_fat > 0.8 && heavy.upper_arm > 0.6 && heavy.thigh > 0.5 && near(heavy.belly_fat, 0.8), 'héros : surpoids corrélé (visage, cou, bras, cuisses, ventre)');
  const mid = evaluateDrivers({ weight: 0.5, bellyFat: 0.5, muscle: 0.5 }, PREMIUM_MALE_DRIVERS);
  ok(mid.body_weight > 0.35 && mid.body_weight < 0.5 && mid.muscle > 0.25 && mid.muscle < 0.4, 'héros : valeurs intermédiaires progressives');
  const sh = shapeFromBody({ weight: 0.8, bellyFat: 0.2, muscle: 0.1 });
  ok(sh.faceFat > 0.6 && sh.upperArm > 0.5 && sh.thigh > 0.6 && sh.neckFat > 0.6, 'corrélation : un fort poids épaissit visage, cou, bras et cuisses même sans gros ventre');
  ok(BODY_SHAPE_KEYS.length === 13 && BODY_SHAPE_KEYS.every((k) => sh[k] >= 0 && sh[k] <= 1), 'BodyShape : 13 réglages bornés à [0, 1]');
  ok(withOverrides(sh, { waist: 2 }).waist === 1 && withOverrides(sh, {}).hips === sh.hips, 'BodyShape : ajustements fins bornés');
  const body = { weight: 0.6, bellyFat: 0.6, muscle: 0.3 };
  const asM = evaluateDrivers(body, PREMIUM_MALE_DRIVERS, 'm');
  const asF = evaluateDrivers(body, PREMIUM_MALE_DRIVERS, 'f');
  ok((asF.hips ?? 0) > (asM.hips ?? 0) && (asF.belly_fat ?? 0) < (asM.belly_fat ?? 0) && asF.body_weight === asM.body_weight, 'base féminine : plus de hanches, moins de ventre, même masse');
  ok(JSON.stringify(evaluateDrivers(body, PREMIUM_MALE_DRIVERS)) === JSON.stringify(asM), 'sans base précisée : répartition masculine (comportement inchangé)');
  ok(avatarForProfile('f').id === 'premium-female-01' && avatarForProfile('m').id === 'premium-male-01' && avatarForProfile('x', 'fem').id === 'premium-female-01' && avatarForProfile('x', 'masc').id === 'premium-male-01', 'base 3D choisie selon le profil (et l’apparence pour « autre »)');
  ok(AVATARS['premium-female-01'].sex === 'f' && JSON.stringify(femaleStats.morphs) === JSON.stringify(maleStats.morphs), 'base féminine : mêmes 15 morphs que l’homme (mêmes drivers)');
  ok(femaleStats.triangles <= 40000 && femaleStats.bytes < 6_000_000, 'base féminine : budget mobile respecté (≤ 40 000 triangles, < 6 Mo)');
  ok(DEFAULT_AVATAR.id === 'premium-male-01' && AVATARS.prototype.look === 'clay' && DEFAULT_AVATAR.look === 'studio', 'registre : premium par défaut, prototype gardé en test');
  const e2 = new FitaiaHumanEngine();
  e2.attachAvatar({ traverse: () => {} } as never, 'gpu', { vertices: 0, triangles: 0, meshes: 0, materials: 0, textures: 0, geometryBytes: 0 }, PREMIUM_MALE_DRIVERS);
  e2.setBody({ weight: 0.9 });
  e2.setBody({ weight: 1 });
  ok(e2.snapshot().morphs.body_weight === 1 && e2.snapshot().mesh!.missingMorphs.length === 15, 'moteur + drivers héros : setBody pilote les morphs nommés (mesh vide → 15 manquants signalés)');
  console.log('\nHUMAN ENGINE : ' + n + ' tests passés');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
