/**
 * Défi pompes : la source native du module de pose doit pouvoir être versionnée, et la démo sans caméra
 * ne doit jamais se faire passer pour une vraie détection ni créditer quoi que ce soit.
 */
import { runSuite } from './helpers/check';

type Cp = { execFileSync(file: string, args: string[], o: { stdio: string }): unknown };
type Fs = { readFileSync(path: string, enc: string): string };

runSuite('module de pose et démo sans caméra', async (t) => {
  const cpModule: string = 'node:child_process';
  const fsModule: string = 'node:fs';
  const { execFileSync } = (await import(cpModule)) as Cp;
  const { readFileSync } = (await import(fsModule)) as Fs;
  const ignored = (path: string): boolean => {
    try {
      execFileSync('git', ['check-ignore', '-q', path], { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  };

  // 1. le dossier généré par prebuild reste ignoré, la source du module natif ne l'est plus
  t.ok(ignored('ios/Podfile'), 'ios/ généré par prebuild ignoré');
  t.ok(ignored('android/build.gradle'), 'android/ généré par prebuild ignoré');
  t.ok(!ignored('modules/fitaia-pose/ios/FitaiaPoseModule.swift'), 'source Swift du module de pose versionnable');
  t.ok(!ignored('modules/fitaia-pose/android/src/main/Pose.kt'), 'source Android du module de pose versionnable');

  // 2. la démo (startPush) ne prétend pas détecter un corps et ne crédite rien
  const src = readFileSync('src/store/useGame.ts', 'utf8');
  const start = src.indexOf('startPush: (onDone) =>');
  const end = src.indexOf('resetScan:', start);
  t.ok(start > 0 && end > start, 'startPush trouvé');
  const demo = src.slice(start, end);
  t.ok(!/Corps détecté|points suivis|validée/.test(demo), 'aucun message de détection ou de validation dans la démo');
  t.ok(!/reward\(|logDay\(|pushDone: true|pushTotal/.test(demo), 'la démo ne crédite ni ne valide le défi');
  t.ok(/démo|Démo/.test(demo), 'la démo se présente comme une démo');

  // 3. le vrai module natif est le seul chemin vers la récompense
  const hook = readFileSync('src/pose/usePushupCamera.ts', 'utf8');
  t.ok(/isPoseAvailable/.test(hook) && /pushFinish/.test(hook), 'la validation réelle passe par le module natif');
});
