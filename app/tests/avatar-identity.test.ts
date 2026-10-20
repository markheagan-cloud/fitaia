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
