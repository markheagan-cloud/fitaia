/**
 * Vestiaire : les règles de mélange de l'app sont celles de la recette du service (recette.py), la clé est la même,
 * et le perso affiché montre le look porté seulement s'il a vraiment été dessiné.
 */
import { MIX_PIECES, PLEIN, SLOTS, mixKey, mixOfOutfit, mixProblem, setPiece, wholeOutfit } from '../src/shop/melange';
import { SKINS } from '../src/data/content';
import { heroSourceFor } from '../src/avatar/heroSource';
import { runSuite } from './helpers/check';

type Fs = { readFileSync(path: string, encoding: 'utf8'): string };

runSuite('vestiaire-melange', async (t) => {
  const fs = (await import('node:fs' as string)) as Fs;
  const py = fs.readFileSync('../hero3d/caricature/space/recette.py', 'utf8');
  const block = py.slice(py.indexOf('PIECES = {'), py.indexOf('EMPLACEMENTS ='));
  // 1. Même table de pièces que la recette
  for (const sk of SKINS) {
    const m = new RegExp("\\n    '" + sk.id + "': \\{([\\s\\S]*?)\\},?\\n", 'm').exec(block);
    t.ok(!!m, sk.id + ' : pièces dans la recette');
    if (!m) continue;
    const py_slots = SLOTS.filter((k) => new RegExp("'" + k + "':").test(m[1]));
    t.equal(MIX_PIECES[sk.id], py_slots, sk.id + ' : mêmes pièces mélangeables');
    t.equal(PLEIN.has(sk.id), /'plein': True/.test(m[1]), sk.id + ' : combinaison ou non');
  }
  t.equal(Object.keys(MIX_PIECES).length, SKINS.length, 'une entrée par tenue');

  // 2. Clé identique à cle_melange()
  t.equal(mixKey({ haut: 'cargo', bas: 'street', chaussures: 'sprint' }), 'm-cargo-street-sprint-x-x', 'clé du contrôle réel du 26/11');
  t.ok(/m-' \+ '-'.join\(mix.get\(k\) or 'x' for k in EMPLACEMENTS \+ \('fond',\)\)/.test(py), 'recette : même format de clé');

  // 3. Règles
  t.equal(mixProblem({ bas: 'street' }), 'Choisis un haut.', 'haut obligatoire');
  t.equal(mixProblem({ haut: 'pilote', bas: 'street' }), 'Ce haut est une combinaison : pas de bas avec.', 'combinaison sans bas');
  t.equal(mixProblem({ haut: 'cargo' }), 'Choisis un bas.', 'bas obligatoire sinon');
  t.equal(mixProblem({ haut: 'cargo', bas: 'street', chaussures: 'samourai' }), 'Cette tenue n’a pas cette pièce.', 'pas de chaussures Samouraï');
  t.equal(mixProblem({ haut: 'cargo', bas: 'street', chaussures: 'sprint' }), null, 'mélange valide');
  t.equal(setPiece({ haut: 'cargo', bas: 'street' }, 'haut', 'astro'), { haut: 'astro' }, 'passer en combinaison retire le bas');
  t.equal(setPiece({ haut: 'astro' }, 'haut', 'ring'), { haut: 'ring', bas: 'ring' }, 'quitter la combinaison remet le bas de la tenue');
  t.equal(setPiece({ haut: 'cargo', bas: 'street', chaussures: 'sprint' }, 'chaussures', 'sprint'), { haut: 'cargo', bas: 'street' }, 'retoucher une pièce l’enlève');
  t.equal(wholeOutfit(mixOfOutfit('street')), 'street', 'tenue entière reconnue (pas de nouveau dessin)');
  t.equal(wholeOutfit({ haut: 'cargo', bas: 'street' }), null, 'mélange : nouveau dessin');
  for (const sk of SKINS) t.equal(mixProblem(mixOfOutfit(sk.id)), null, sk.id + ' : tenue entière valide comme mélange');

  // 4. Perso affiché : le look porté seulement s'il est dessiné
  const base = {
    base: 'm' as const, avatar3d: null, drawing: null, stage: null, ready: false, sheet: {} as never,
    skin: { id: 'cargo', name: 'Cargo Urbain', img: 1 }, previewImage: () => 2, defaultSheetFor: () => ({}) as never,
  };
  const car = { base: 'm' as const, portraitUri: 'p.png', outfits: { cargo: 'cargo.png', 'm-cargo-street-sprint-x-x': 'mix.png' } };
  t.equal(heroSourceFor({ ...base, caricature: car, look: 'm-cargo-street-sprint-x-x' }).source, { uri: 'mix.png' }, 'look dessiné : montré');
  t.equal(heroSourceFor({ ...base, caricature: car, look: 'm-ring-ring-x-x-x' }).source, { uri: 'cargo.png' }, 'look pas dessiné : la tenue équipée, jamais une autre image');
});
