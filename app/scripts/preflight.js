#!/usr/bin/env node
/**
 * FITAIA — Preflight avant soumission App Store / Google Play
 * Tout ce qui est affiché a réellement été vérifié. Les contrôles impossibles ici sont marqués SKIP avec la raison.
 */
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', c: '\x1b[36m', d: '\x1b[2m', x: '\x1b[0m' };
const res = { pass: 0, fail: 0, warn: 0, skip: 0 };
const pass = m => { res.pass++; console.log(`${C.g}PASS${C.x} ${m}`); };
const fail = m => { res.fail++; console.log(`${C.r}FAIL${C.x} ${m}`); };
const warn = m => { res.warn++; console.log(`${C.y}WARN${C.x} ${m}`); };
const skip = (m, why) => { res.skip++; console.log(`${C.d}SKIP${C.x} ${m} ${C.d}— ${why}${C.x}`); };
const sec = t => console.log(`\n${C.c}── ${t}${C.x}`);
const read = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
const json = f => { try { return JSON.parse(read(f)); } catch { return null; } };
const run = (cmd) => { try { return { ok: true, out: execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 180000, env: { ...process.env, CI: '1' } }) }; } catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || '') + (e.killed ? '\n[timeout 180 s]' : '') }; } };

console.log(`${C.c}═══ FITAIA PREFLIGHT ═══${C.x}`);

sec('Configuration Expo');
const app = json('app.json')?.expo;
if (!app) fail('app.json illisible'); else {
  pass('app.json valide');
  app.ios?.bundleIdentifier ? pass(`iOS bundleIdentifier ${app.ios.bundleIdentifier}`) : fail('iOS bundleIdentifier manquant');
  app.android?.package ? pass(`Android package ${app.android.package}`) : fail('Android package manquant');
  /^\d+\.\d+\.\d+$/.test(app.version || '') ? pass(`version ${app.version}`) : fail('version doit être x.y.z');
  app.scheme ? pass(`deep link scheme "${app.scheme}"`) : warn('aucun scheme (deep links)');
  const pl = app.ios?.infoPlist || {};
  const usesCamera = JSON.stringify(app.plugins || []).includes('expo-camera');
  if (usesCamera) pl.NSCameraUsageDescription ? pass('NSCameraUsageDescription présent') : fail('expo-camera sans NSCameraUsageDescription → rejet iOS');
  pl.ITSAppUsesNonExemptEncryption === false ? pass('ITSAppUsesNonExemptEncryption=false (évite la question export)') : warn('ITSAppUsesNonExemptEncryption non déclaré');
  app.android?.adaptiveIcon?.foregroundImage ? pass('adaptive icon déclarée') : fail('adaptive icon manquante (Play)');
  for (const k of ['icon', 'splash.image', 'android.adaptiveIcon.foregroundImage']) {
    const p = k.split('.').reduce((o, kk) => o?.[kk], app);
    if (!p) continue; fs.existsSync(p) ? pass(`asset ${p}`) : fail(`asset manquant ${p} → npm run icons`);
  }
  app.ios?.privacyManifests ? pass('Privacy Manifest déclaré') : warn('Pas de privacyManifests dans app.json (Expo en génère un par défaut pour ses libs ; à compléter si APIs "required reason")');
  if (app.extra?.eas?.projectId) pass('EAS projectId présent'); else warn('EAS projectId absent → `eas init` (compte Expo requis)');
}
const eas = json('eas.json');
eas ? pass('eas.json valide') : fail('eas.json illisible');
if (eas?.submit?.production?.ios?.ascAppId === '') warn('ascAppId vide : à remplir après création de l’app sur App Store Connect');

sec('Secrets & environnement');
const trackedFiles = (run('git ls-files').ok ? run('git ls-files').out.split('\n') : fs.readdirSync('.')).filter(f => f && fs.existsSync(f) && fs.statSync(f).isFile());
const patterns = [/sk-[A-Za-z0-9]{20,}/, /sk_live_[A-Za-z0-9]+/, /AKIA[0-9A-Z]{16}/, /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}/, /-----BEGIN (RSA |EC )?PRIVATE KEY/, /appl_[A-Za-z0-9]{20,}/, /goog_[A-Za-z0-9]{20,}/];
let leaks = 0;
for (const f of trackedFiles) { if (/\.(png|jpg|lock)$/.test(f)) continue; const s = read(f) || ''; patterns.forEach(p => { if (p.test(s)) { fail(`secret potentiel dans ${f}`); leaks++; } }); }
if (!leaks) pass(`aucun secret détecté dans ${trackedFiles.length} fichiers`);
const gi = read('.gitignore') || '';
['.env', 'node_modules', 'ios/', 'android/'].forEach(e => gi.includes(e) ? pass(`.gitignore couvre ${e}`) : warn(`.gitignore ne couvre pas ${e}`));
fs.existsSync('.env.example') ? pass('.env.example présent') : warn('.env.example absent');
if (fs.existsSync('.env') && run('git ls-files .env').out.trim()) fail('.env est versionné !');

sec('Code');
const srcFiles = trackedFiles.filter(f => /\.(tsx?|js)$/.test(f) && !f.startsWith('scripts/'));
let dbg = 0, devUrl = 0;
for (const f of srcFiles) { const s = read(f) || ''; if (/console\.log\(/.test(s)) dbg++; if (/localhost|127\.0\.0\.1|ngrok|10\.0\.2\.2/.test(s)) devUrl++; }
dbg ? warn(`${dbg} fichier(s) avec console.log`) : pass('aucun console.log');
devUrl ? fail(`${devUrl} fichier(s) avec URL de dev`) : pass('aucune URL de développement');
if (fs.existsSync('node_modules')) {
  const tc = run('npx --yes tsc --noEmit'); tc.ok ? pass('typecheck (tsc --noEmit)') : fail('typecheck :\n' + tc.out.slice(0, 1500));
  const lint = run('npx --yes expo lint --max-warnings=0'); lint.ok ? pass('lint (expo lint)') : warn('lint : ' + lint.out.split('\n').slice(-3).join(' '));
  const doctor = run('npx --yes expo-doctor'); doctor.ok ? pass('expo-doctor') : warn('expo-doctor : ' + doctor.out.split('\n').filter(l => /✖|error/i.test(l)).slice(0, 5).join(' | '));
} else { skip('typecheck / lint / expo-doctor', 'node_modules absent → npm install'); }

sec('Monétisation & notifications');
const pkg = json('package.json') || {};
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
if (deps['react-native-purchases']) { pass('RevenueCat présent'); warn('Achats intégrés : produits à créer dans App Store Connect / Play Console + restauration des achats obligatoire (iOS 3.1.1)'); }
if (deps['expo-notifications']) { warn('expo-notifications : vérifier aps-environment (EAS gère) et finalité des push dans la description'); } else pass('pas de notifications → pas d’entitlement push nécessaire');

sec('Build natif');
skip('Info.plist / entitlements / AndroidManifest générés', 'Expo managed : générés par `eas build` (ou `npx expo prebuild`) — non présents dans le repo');
skip('build release iOS/Android', 'nécessite compte Expo + compte Apple Developer (99 $/an) / Google Play (25 $)');
skip('target SDK Android', 'défini par le SDK Expo installé lors du build (voir npx expo-doctor)');

console.log(`\n${C.g}${res.pass} PASS${C.x}  ${C.r}${res.fail} FAIL${C.x}  ${C.y}${res.warn} WARN${C.x}  ${C.d}${res.skip} SKIP${C.x}`);
console.log(res.fail ? `${C.r}✗ Preflight échoué : corriger les FAIL avant soumission${C.x}` : `${C.g}✓ Aucun bloquant détecté (les SKIP restent à vérifier au build)${C.x}`);
process.exit(res.fail ? 1 : 0);
