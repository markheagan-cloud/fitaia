/** Image du perso : le portrait de l'avatar 3D personnel passe avant toute image générique (src/avatar/heroSource.ts). */
import { heroSourceFor, type HeroInput } from '../src/avatar/heroSource';
import { DEFAULT_SHEET } from '../src/data/character';
import { createCheck } from './helpers/check';

const t = createCheck();
const preview = (s: { appearance: string }) => ({ uri: 'preview-' + s.appearance });
const base: HeroInput = {
  base: 'm',
  caricature: null,
  avatar3d: null,
  drawing: null,
  skin: { id: 'origine', name: 'Origine', img: { uri: 'skin-origine' } },
  stage: { img: { uri: 'usine-surpoids' }, label: 'Départ' },
  ready: false,
  sheet: DEFAULT_SHEET,
  previewImage: preview as HeroInput['previewImage'],
  defaultSheetFor: (sex) => ({ ...DEFAULT_SHEET, appearance: sex === 'f' ? 'fem' : 'masc' }),
};
const src = (c: ReturnType<typeof heroSourceFor>) => (c.source as { uri: string }).uri;

t.equal(src(heroSourceFor(base)), 'usine-surpoids', 'sans avatar personnel : silhouette de l’usine');
t.ok(!heroSourceFor(base).personal, '… et elle est annoncée comme non personnelle');

const mine = { ...base, avatar3d: { base: 'm' as const, portraitUri: 'file:///doc/avatar3d-portrait-1.png' } };
t.equal(src(heroSourceFor(mine)), 'file:///doc/avatar3d-portrait-1.png', 'portrait du GLB personnel : prioritaire sur l’usine');
t.ok(heroSourceFor(mine).personal, '… et marqué personnel');
t.equal(src(heroSourceFor({ ...mine, drawing: { outfit: 'origine', uri: 'dessin-ia' } })), 'file:///doc/avatar3d-portrait-1.png', 'prioritaire aussi sur le dessin IA de tenue');

t.equal(src(heroSourceFor({ ...base, avatar3d: { base: 'm', portraitUri: null } })), 'usine-surpoids', 'GLB sans portrait encore pris : image générique (rien d’inventé)');
t.equal(src(heroSourceFor({ ...base, avatar3d: { base: 'f', portraitUri: 'p-f' } })), 'usine-surpoids', 'portrait d’une autre base : ignoré');

const toon = { ...mine, caricature: { base: 'm' as const, portraitUri: 'file:///doc/caricature-1-portrait.png' } };
t.equal(src(heroSourceFor(toon)), 'file:///doc/caricature-1-portrait.png', 'caricature personnelle : prioritaire sur le portrait du GLB');
t.ok(heroSourceFor(toon).personal, '… et marquée personnelle');
t.equal(src(heroSourceFor({ ...toon, caricature: { base: 'f', portraitUri: 'c-f' } })), 'file:///doc/avatar3d-portrait-1.png', 'caricature d’une autre base : ignorée');

t.equal(src(heroSourceFor({ ...base, drawing: { outfit: 'origine', uri: 'dessin-ia' } })), 'dessin-ia', 'dessin IA de la tenue équipée');
t.equal(src(heroSourceFor({ ...base, drawing: { outfit: 'cargo', uri: 'dessin-ia' } })), 'usine-surpoids', 'dessin d’une autre tenue : ignoré');
t.equal(src(heroSourceFor({ ...base, stage: null, ready: true })), 'preview-masc', 'créateur validé : illustration la plus proche');
t.equal(src(heroSourceFor({ ...base, stage: null })), 'skin-origine', 'homme sans créateur : illustration de la tenue');
t.equal(src(heroSourceFor({ ...base, base: 'f', stage: null })), 'preview-fem', 'femme sans créateur : base féminine, jamais un homme');

console.log(t.count() + ' tests image du perso OK');
