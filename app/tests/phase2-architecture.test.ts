/**
 * Architecture de la Phase 2 (vérification statique des sources) : domaines purs, couplage faible avec l'avatar,
 * temps et hasard injectés, solde jamais écrit hors du registre.
 *   node --experimental-strip-types --no-warnings --import ../ts-hook.mjs tests/phase2-architecture.test.ts
 */
import { runSuite } from './helpers/check';

type Fs = {
  readFileSync(path: URL, encoding: 'utf8'): string;
  readdirSync(path: URL, options: { recursive: true }): string[];
};

const DOMAINS = ['platform', 'progression', 'economy', 'inventory', 'avatar-presentation', 'backend'] as const;

runSuite('architecture Phase 2', async (t) => {
  // Imports dynamiques : ce test lit des fichiers sans exiger les types Node dans la compilation de l'app,
  // et fonctionne aussi bien en strip-types qu'après esbuild (CommonJS). À lancer depuis la racine du dépôt.
  const fsModule: string = 'node:fs';
  const urlModule: string = 'node:url';
  const fs = (await import(fsModule)) as Fs;
  const { pathToFileURL } = (await import(urlModule)) as { pathToFileURL(path: string): URL };
  const cwd = (globalThis as unknown as { process?: { cwd(): string } }).process?.cwd();
  if (!cwd) throw new Error('process.cwd() indisponible');
  const root = new URL('src/', pathToFileURL(cwd + '/'));
  const files: { path: string; domain: string; code: string }[] = [];
  for (const domain of DOMAINS) {
    const dir = new URL(domain + '/', root);
    for (const raw of fs.readdirSync(dir, { recursive: true })) {
      const name = String(raw).replace(/\\/g, '/'); // Windows : séparateurs « \ »
      if (!name.endsWith('.ts')) continue;
      const code = fs.readFileSync(new URL(name, dir), 'utf8');
      files.push({ path: domain + '/' + name, domain, code });
    }
  }
  const imports = (code: string) => [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  const offenders = (predicate: (f: { path: string; domain: string; code: string }) => boolean) => files.filter(predicate).map((f) => f.path);

  t.ok(files.length >= 30, files.length + ' modules TypeScript de la Phase 2 analysés');
  t.equal(
    offenders((f) => imports(f.code).some((i) => /^(react|react-native|expo|zustand|@react-native|@\/)/.test(i))),
    [],
    'aucun import React Native, Expo, zustand ou alias @/ : domaines purs, testables et réutilisables côté serveur',
  );
  t.equal(offenders((f) => imports(f.code).some((i) => /human-engine/.test(i))), [], 'aucun import du Human Engine (Économie → Inventaire → AvatarPresentationService → moteur)');
  t.equal(offenders((f) => imports(f.code).some((i) => /\/(store|community|social|data|app)\//.test(i) || i.startsWith('../../app'))), [], 'aucune dépendance vers l’app existante (store, communauté, écrans)');
  t.equal(
    offenders((f) => ['progression', 'economy', 'inventory', 'avatar-presentation', 'platform'].includes(f.domain) && imports(f.code).some((i) => /\/backend\//.test(i))),
    [],
    'les domaines ne dépendent jamais des adaptateurs (local ou Supabase)',
  );
  t.equal(offenders((f) => /\benum\s+\w+|\bnamespace\s+\w+/.test(f.code)), [], 'ni enum ni namespace (TypeScript effaçable)');
  t.equal(
    offenders((f) => /\bbalance:(?!\s*number\b)/.test(f.code)).sort(),
    ['backend/supabase/decode.ts', 'economy/ledger.ts'],
    'le solde n’est calculé que par le registre (et relu par le décodeur) : jamais wallet.balance += … ailleurs',
  );
  t.equal(offenders((f) => /Date\.now\(\)|new Date\(\)/.test(f.code)).sort(), ['platform/clock.ts', 'platform/events.ts'], 'l’heure vient de l’horloge injectée (serveur), jamais de Date.now() dispersé');
  t.equal(offenders((f) => /Math\.random/.test(f.code)), ['platform/ids.ts'], 'aucun hasard hors du générateur d’identifiants');
  t.equal(offenders((f) => /console\.(log|info|debug)/.test(f.code)), [], 'aucun journal bavard dans les domaines');
  t.equal(
    offenders((f) => f.domain !== 'backend' && /(rpc|fetch|XMLHttpRequest|supabase)\s*\(/i.test(f.code)),
    [],
    'aucun appel réseau dans les domaines',
  );
  const repoInterfaces = ['progression/ProgressionRepository.ts', 'economy/EconomyRepository.ts', 'inventory/InventoryRepository.ts'];
  const interfaceCode = files.filter((f) => repoInterfaces.includes(f.path)).map((f) => f.code).join('\n');
  t.ok(
    files.filter((f) => repoInterfaces.includes(f.path)).length === 3 && !/\b(amount|price|priceFitcoins|balance|userId)\??:/.test(interfaceCode.replace(/\/\*\*[\s\S]*?\*\//g, '')),
    'dépôts côté app : aucun montant, prix, solde ni utilisateur en paramètre (l’utilisateur est celui de la session)',
  );
  const economyTypes = files.find((f) => f.path === 'economy/types.ts')?.code ?? '';
  t.ok(/export type SpendRequest = \{ itemId: string; requestId: string \};/.test(economyTypes), 'une dépense ne transmet qu’un objet et un identifiant de demande');
});
