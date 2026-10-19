#!/usr/bin/env node
/**
 * Lance toutes les suites tests/*.test.ts (esbuild → Node) et s'arrête en échec si une seule échoue.
 * Usage : npm test            (toutes)
 *         npm test -- economy (filtre sur le nom)
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const filter = process.argv[2] || '';
const files = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.ts') && f.includes(filter)).sort();
const esbuild = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');

let failed = 0;
for (const f of files) {
  const name = f.replace(/\.ts$/, '');
  try {
    execFileSync(esbuild, [
      `tests/${f}`, '--bundle', '--platform=node', '--alias:@=./src', '--alias:react-native=./tests/rn-stub.js',
      '--loader:.jpg=file', '--loader:.png=file', '--loader:.glb=file', '--outdir=.tests-out', '--log-level=error',
    ], { cwd: root, stdio: 'pipe', shell: process.platform === 'win32' });
  } catch (e) {
    failed++;
    console.log(`✗ ${name} : compilation impossible\n${String(e.stderr || e.message).slice(0, 800)}`);
    continue;
  }
  try {
    const out = execFileSync(process.execPath, [`.tests-out/${name}.js`], { cwd: root, stdio: 'pipe' }).toString().trim();
    console.log(`✓ ${name} : ${out.split('\n').pop()}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n${String(e.stdout || '').slice(-1500)}${String(e.stderr || '').slice(-1500)}`);
  }
}
console.log(failed ? `\n${failed} suite(s) en échec sur ${files.length}` : `\n${files.length} suites OK`);
process.exit(failed ? 1 : 0);
