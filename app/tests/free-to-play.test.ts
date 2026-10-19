/**
 * Garde-fou « gratuit à jouer » : aucun abonnement, paywall, monnaie payante ni pass payant dans l'app.
 * Seuls des cosmétiques peuvent se vendre (achat intégré Apple). Analyse statique de app/ et src/.
 * Les lignes marquées [ancien-modèle] nettoient les données des versions précédentes et sont ignorées.
 */
import { runSuite } from './helpers/check';
import { SKINS } from '../src/data/content';

type Fs = {
  readFileSync(path: URL, encoding: 'utf8'): string;
  readdirSync(path: URL, options: { recursive: true }): string[];
  existsSync(path: URL): boolean;
};

const FORBIDDEN: [RegExp, string][] = [
  [/FITAIA Plus/, 'offre FITAIA Plus'],
  [/paywall/i, 'paywall'],
  [/FIT Points/, 'monnaie payante FIT Points'],
  [/Pass Élite|buyPass|PASS_PRICE/, 'pass payant'],
  [/buyPack|PACKS\b/, 'packs de monnaie'],
  [/entitlement|abonnement/i, 'abonnement'],
];

runSuite('gratuit-à-jouer', async (t) => {
  const fsModule: string = 'node:fs';
  const urlModule: string = 'node:url';
  const fs = (await import(fsModule)) as Fs;
  const { pathToFileURL } = (await import(urlModule)) as { pathToFileURL(path: string): URL };
  const cwd = (globalThis as unknown as { process?: { cwd(): string } }).process?.cwd();
  if (!cwd) throw new Error('process.cwd() indisponible');
  const base = pathToFileURL(cwd + '/');

  for (const dir of ['app/', 'src/']) {
    const root = new URL(dir, base);
    for (const rel of fs.readdirSync(root, { recursive: true })) {
      if (!/\.(ts|tsx)$/.test(rel)) continue;
      const code = fs
        .readFileSync(new URL(rel.replace(/\\/g, '/'), root), 'utf8')
        .split('\n')
        .filter((l) => !l.includes('[ancien-modèle]'))
        .join('\n');
      for (const [re, label] of FORBIDDEN) t.ok(!re.test(code), `${label} absent de ${dir}${rel}`);
    }
  }
  t.ok(!fs.existsSync(new URL('app/paywall.tsx', base)), 'écran paywall supprimé');

  // Un cosmétique vendu par Apple ne se débloque jamais avec la monnaie du jeu.
  for (const sk of SKINS) {
    t.ok(sk.cur === 'earn' || sk.cur === 'store', `${sk.id} : devise connue`);
    if (sk.cur === 'store') t.ok(sk.price === 0, `${sk.id} : pas de prix en monnaie du jeu`);
  }
});
