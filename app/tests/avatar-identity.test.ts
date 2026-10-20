/**
 * Même perso partout : la base homme/femme est décidée une seule fois (src/avatar/identity.ts) et la 2D comme la 3D
 * la lisent. Régression du 20 oct. : une femme sans créateur validé voyait l'homme de l'usine sur l'accueil et une
 * femme en 3D.
 */
import { avatarBase, defaultSheetFor } from '../src/avatar/identity';
import { sheetMatchesHero } from '../src/avatar/bodyStages';
import { avatarForBase } from '../src/human-engine/avatars';
import { DEFAULT_SHEET, previewImage } from '../src/data/character';

let n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) throw new Error('FAIL ' + m); console.log('ok', m); };

// créateur pas encore validé : le profil décide
ok(avatarBase('f', DEFAULT_SHEET, false) === 'f', 'femme sans créateur → base femme (fiche masculine par défaut ignorée)');
ok(avatarBase('m', DEFAULT_SHEET, false) === 'm', 'homme sans créateur → base homme');
ok(avatarBase('x', DEFAULT_SHEET, false) === 'm', '« autre » sans créateur → base homme par défaut');
// créateur validé : la fiche décide
ok(avatarBase('m', { appearance: 'fem' }, true) === 'f', 'fiche validée féminine → femme, quel que soit le profil');
ok(avatarBase('f', { appearance: 'masc' }, true) === 'm', 'fiche validée masculine → homme');
ok(avatarBase('f', { appearance: 'neutre' }, true) === 'f', 'fiche neutre → retombe sur le profil');

// la 3D suit la même base
ok(avatarForBase('f').id === 'premium-female-01' && avatarForBase('m').id === 'premium-male-01', 'GLB choisi depuis la base');

// la 2D ne montre jamais l'homme de l'usine à une femme
ok(!sheetMatchesHero(DEFAULT_SHEET, false, 'f'), 'silhouettes du héros masquées pour une base femme');
ok(sheetMatchesHero(DEFAULT_SHEET, false, 'm'), 'silhouettes du héros gardées pour un homme sans créateur');

// fiche de départ cohérente avec le profil
const fem = defaultSheetFor('f');
ok(fem.appearance === 'fem' && fem.beard === 'aucune', 'fiche de départ femme : apparence féminine, pas de barbe');
ok(previewImage(fem) !== previewImage(DEFAULT_SHEET), 'image de départ femme différente de celle de l’homme');
ok(defaultSheetFor('m').appearance === 'masc' && defaultSheetFor('x').appearance === 'neutre', 'fiches de départ homme / autre');

console.log(n + ' tests identité avatar OK');

// rapport du serveur selfie → avatar 3D : ce qui vient de la photo, ce qui n'en vient pas
import { parseReport } from '../src/avatar/avatar3dReport';
const rep = parseReport('abc', 'file:///a.glb', 'm', {
  ok: true,
  traits_photo: { teint_rgb: [0.8935, 0.6259, 0.4913], cheveux_rgb: [0.1569, 0.2, 0.2235], chauve: false, cibles_visage: 39, erreur_moyenne_mm: 6.29 },
  non_deductible: [{ trait: 'taille', raison: 'pas d’échelle', source: 'profil' }, { trait: 'poids', raison: 'visage seul', source: 'profil' }],
  limites: [],
}, 1);
ok(rep.fromPhoto.skin === '#e4a07d' && rep.fromPhoto.hair === '#283339' && rep.fromPhoto.faceTargets === 39 && rep.fromPhoto.errorMm === 6.3, 'traits lus sur la photo convertis ' + JSON.stringify(rep.fromPhoto));
ok(rep.notFromPhoto.map((x) => x.trait).join(',') === 'taille,poids', 'traits non déductibles transmis à l’écran');
const bald = parseReport('b', 'u', 'f', { ok: true, traits_photo: { chauve: true, cheveux_rgb: [0, 0, 0] }, limites: ['base féminine : visage non ajusté'] });
ok(bald.fromPhoto.hair === null && bald.fromPhoto.bald && bald.limits.length === 1 && bald.base === 'f', 'crâne rasé et limites de la base féminine');
console.log(n + ' tests rapport avatar 3D OK');
