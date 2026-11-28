/** Un son par endroit (src/services/placeSound.ts). */
import { placeOf } from '../src/services/placeSound';
import { createCheck } from './helpers/check';

const t = createCheck();
t.ok(placeOf('/') === 'accueil' && placeOf('/(tabs)') === 'accueil', 'accueil');
t.ok(placeOf('/defis') === 'defis' && placeOf('/scanner') === 'scan' && placeOf('/perso') === 'perso', 'onglets');
t.ok(placeOf('/boutique') === 'boutique' && placeOf('/article/t-street') === 'boutique' && placeOf('/vestiaire') === 'boutique', 'boutique, fiche et vestiaire : même lieu');
t.ok(placeOf('/communaute') === 'communaute' && placeOf('/communaute/forum/x') === 'communaute', 'communauté et ses écrans');
t.ok(placeOf('/corps') === 'perso' && placeOf('/creator') === 'perso', 'mon corps et créateur : mon perso');
t.ok(placeOf('/selfie') === null && placeOf('/reveal') === null && placeOf('/onboarding') === null, 'écrans qui ont déjà leur son');
console.log(t.count() + ' vérifications OK');
