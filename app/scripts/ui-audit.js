#!/usr/bin/env node
/**
 * FITAIA — Audit UI native (statique, réel)
 * Parcourt app/ et src/ et signale les écarts HIG / Material 3 détectables :
 *  - couleurs en dur hors tokens, cibles tactiles < 44, Pressable sans accessibilityLabel,
 *  - ScrollView/TextInput sans gestion clavier, écrans sans SafeAreaView, fontSize < 12.
 */
const fs = require('fs'); const path = require('path');
const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f);
  fs.statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && files.push(p); } })('.');
let issues = 0; const say = (f, l, m) => { issues++; console.log(`  ${f}:${l}  ${m}`); };
console.log('═══ FITAIA UI audit ═══');
for (const f of files.filter(f => !f.includes('node_modules') && !f.includes('src/theme/'))) {
  const src = fs.readFileSync(f, 'utf8'); const lines = src.split('\n');
  lines.forEach((ln, i) => {
    const n = i + 1;
    if (/#[0-9a-fA-F]{6}\b/.test(ln) && !ln.includes('//')) say(f, n, 'couleur en dur → utiliser tokens.ts');
    const h = ln.match(/(?:minHeight|height):\s*(\d+)/); if (h && +h[1] < 44 && /Pressable|Button|tab/i.test(src)) say(f, n, `cible tactile ${h[1]} < 44`);
    const fs_ = ln.match(/fontSize:\s*(\d+)/); if (fs_ && +fs_[1] < 12) say(f, n, `fontSize ${fs_[1]} < 12 (lisibilité)`);
  });
  if (/<Pressable/.test(src) && !/accessibilityLabel|accessibilityRole/.test(src)) say(f, 0, 'Pressable sans accessibilityLabel/Role');
  if (/TextInput/.test(src) && !/KeyboardAvoidingView|keyboardShouldPersistTaps/.test(src)) say(f, 0, 'TextInput sans gestion clavier');
  if (/^app\/\(tabs\)\/[a-z]+\.tsx$/.test(f) && !/SafeAreaView|useSafeAreaInsets/.test(src)) say(f, 0, 'écran sans safe area');
  if (/useColorScheme|useTheme/.test(src) === false && /^app\/\(tabs\)\/[a-z]+\.tsx$/.test(f)) say(f, 0, 'écran sans thème dark/light');
}
console.log(issues ? `\n${issues} point(s) à corriger` : '\n✓ Aucun écart détecté');
process.exit(issues ? 1 : 0);
