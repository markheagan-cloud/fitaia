#!/usr/bin/env node
/**
 * FITAIA — ASO Audit
 * Lit store/metadata.json (ce que TU rédiges) et vérifie les limites réelles des stores + cohérence mots-clés.
 * Aucune donnée App Store Connect / Play Console n'est inventée : la section "DONNÉES RÉELLES" reste vide
 * tant que tu n'exportes pas tes rapports (store/real/*.csv).
 */
const fs = require('fs');
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', c: '\x1b[36m', x: '\x1b[0m' };
const meta = JSON.parse(fs.readFileSync('store/metadata.json', 'utf8'));
const L = { iosTitle: 30, iosSubtitle: 30, iosKeywords: 100, iosPromo: 170, iosDesc: 4000, playTitle: 30, playShort: 80, playDesc: 4000 };
const ck = (label, v, max) => { const n = (v || '').length; console.log(`${n <= max && n > 0 ? C.g + 'OK ' : C.r + 'KO '}${C.x}${label}: ${n}/${max}`); return n <= max && n > 0; };
console.log(`${C.c}═══ FITAIA ASO AUDIT ═══${C.x}\n`);
console.log(`${C.c}iOS (App Store)${C.x}`);
ck('Titre', meta.ios.title, L.iosTitle); ck('Sous-titre', meta.ios.subtitle, L.iosSubtitle);
ck('Mots-clés', meta.ios.keywords, L.iosKeywords); ck('Texte promo', meta.ios.promo, L.iosPromo); ck('Description', meta.ios.description, L.iosDesc);
console.log(`\n${C.c}Android (Google Play)${C.x}`);
ck('Titre', meta.play.title, L.playTitle); ck('Description courte', meta.play.short, L.playShort); ck('Description', meta.play.description, L.playDesc);

console.log(`\n${C.c}Cohérence mots-clés iOS${C.x}`);
const kws = meta.ios.keywords.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const titleWords = (meta.ios.title + ' ' + meta.ios.subtitle).toLowerCase();
const dup = kws.filter(k => titleWords.includes(k));
dup.length ? console.log(`${C.y}WARN${C.x} déjà indexés via titre/sous-titre (place gaspillée) : ${dup.join(', ')}`) : console.log(`${C.g}OK ${C.x} aucun doublon avec titre/sous-titre`);
if (meta.ios.keywords.includes(', ')) console.log(`${C.y}WARN${C.x} espaces après les virgules : ${meta.ios.keywords.split(', ').length - 1} caractères perdus`);
const seen = new Set(), rep = kws.filter(k => seen.size === seen.add(k).size);
if (rep.length) console.log(`${C.y}WARN${C.x} mots-clés répétés : ${rep.join(', ')}`);

console.log(`\n${C.c}Concurrents définis (par toi)${C.x}`);
(meta.competitors || []).forEach(c => console.log(`  • ${c.name} — positionnement : ${c.positioning}`));
console.log(`\n${C.c}Checklist fiche store${C.x}`);
(meta.checklist || []).forEach(c => console.log(`  ${c.done ? C.g + '✓' : C.r + '○'}${C.x} ${c.item}`));

console.log(`\n${C.c}DONNÉES RÉELLES${C.x}`);
const real = fs.existsSync('store/real') ? fs.readdirSync('store/real') : [];
real.length ? real.forEach(f => console.log(`  fichier fourni : store/real/${f} (analyse à brancher)`)) :
  console.log(`  Aucune donnée App Store Connect / Play Console fournie. Exporte "Analyses > Sources" et "Mots-clés ASA" dans store/real/ pour une analyse chiffrée.\n  ${C.y}Tout ce qui précède est une vérification de format + recommandations, pas une mesure de performance.${C.x}`);
