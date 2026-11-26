#!/usr/bin/env node
/** Compile et lance supabase/tests/e2e_serveur.ts (contre le vrai serveur : SUPABASE_URL + SUPABASE_ANON_KEY). */
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.join(__dirname, '..');
const esbuild = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
execFileSync(esbuild, ['supabase/tests/e2e_serveur.ts', '--bundle', '--platform=node', '--alias:@=./src', '--alias:react-native=./tests/rn-stub.js', '--outfile=.tests-out/e2e_serveur.js', '--log-level=error'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
execFileSync(process.execPath, ['.tests-out/e2e_serveur.js'], { cwd: root, stdio: 'inherit' });
