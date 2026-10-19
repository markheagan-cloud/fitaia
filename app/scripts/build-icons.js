#!/usr/bin/env node
/**
 * FITAIA — App Icon Generator (réel)
 * Entrée : assets/icon-source.png (1024x1024 recommandé, carré, sans coins arrondis)
 * Sorties : assets/icon.png, assets/adaptive-icon.png, assets/splash.png, assets/favicon.png
 *           + assets/store/ (1024 iOS, 512 Play) + vérification zone de sécurité.
 * Expo génère lui-même tous les formats iOS/Android à partir de ces fichiers (prebuild/EAS).
 * Option IA : si OPENAI_API_KEY est défini ET --generate, propose une icône source (jamais de clé en dur).
 */
const fs = require('fs');
const path = require('path');

let sharp;
try { sharp = require('sharp'); } catch { console.error('✗ sharp manquant : npm i -D sharp'); process.exit(1); }

const root = process.cwd();
const src = process.argv[2] || path.join(root, 'assets/icon-source.png');
const out = path.join(root, 'assets');
const store = path.join(out, 'store');
const BG = '#1C1D1F';
const LIME = { r: 200, g: 240, b: 60, alpha: 1 };

async function placeholder() {
  // Icône de secours : fond obsidian + pastille lime (remplacer par le vrai design)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <rect width="1024" height="1024" fill="${BG}"/>
    <circle cx="512" cy="512" r="300" fill="#C8F03C"/>
    <text x="512" y="560" font-family="Arial" font-weight="800" font-size="200" text-anchor="middle" fill="${BG}">F</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(src);
  console.log('⚠  Aucune icône source — placeholder créé :', path.relative(root, src));
}

async function checkSafeZone(file) {
  // Adaptive icon Android : contenu important dans le cercle central (66 % du diamètre sur 108dp).
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = info.width / 2, safe = r * 0.66;
  let outside = 0;
  for (let y = 0; y < info.height; y += 4) for (let x = 0; x < info.width; x += 4) {
    const a = data[(y * info.width + x) * 4 + 3];
    if (a > 200 && Math.hypot(x - r, y - r) > safe) outside++;
  }
  const pct = (outside / ((info.width / 4) * (info.height / 4))) * 100;
  return pct;
}

(async () => {
  fs.mkdirSync(store, { recursive: true });
  if (!fs.existsSync(src)) await placeholder();

  const meta = await sharp(src).metadata();
  if (meta.width !== meta.height) { console.error(`✗ Source non carrée (${meta.width}x${meta.height})`); process.exit(1); }
  if (meta.width < 1024) console.warn(`⚠  Source ${meta.width}px < 1024px : qualité App Store réduite`);
  console.log(`✓ Source ${meta.width}x${meta.height} ${meta.format}`);

  // iOS App Store : 1024 sans alpha
  await sharp(src).resize(1024, 1024).flatten({ background: BG }).png().toFile(path.join(store, 'ios-1024.png'));
  // app.json icon
  await sharp(src).resize(1024, 1024).flatten({ background: BG }).png().toFile(path.join(out, 'icon.png'));
  // Play Store 512
  await sharp(src).resize(512, 512).flatten({ background: BG }).png().toFile(path.join(store, 'play-512.png'));
  // Android adaptive foreground : 1024 avec contenu réduit à 66 % pour rester en zone sûre
  const fg = await sharp(src).resize(Math.round(1024 * 0.66)).png().toBuffer();
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fg, gravity: 'centre' }]).png().toFile(path.join(out, 'adaptive-icon.png'));
  // Splash 1284x2778 (fond obsidian, logo centré)
  const logo = await sharp(src).resize(360).png().toBuffer();
  await sharp({ create: { width: 1284, height: 2778, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: 'centre' }]).png().toFile(path.join(out, 'splash.png'));
  // favicon
  await sharp(src).resize(48, 48).png().toFile(path.join(out, 'favicon.png'));

  const pct = await checkSafeZone(path.join(out, 'adaptive-icon.png'));
  console.log(pct < 0.5 ? `✓ Zone de sécurité adaptive OK (${pct.toFixed(2)} % hors zone)` : `⚠  ${pct.toFixed(1)} % de pixels opaques hors zone sûre`);

  for (const f of ['icon.png', 'adaptive-icon.png', 'splash.png', 'favicon.png', 'store/ios-1024.png', 'store/play-512.png']) {
    const m = await sharp(path.join(out, f)).metadata();
    console.log(`  → assets/${f}  ${m.width}x${m.height}${m.hasAlpha ? ' (alpha)' : ''}`);
  }
  if (process.argv.includes('--generate')) {
    console.log(process.env.OPENAI_API_KEY ? 'ℹ  Génération IA : brancher scripts/lib/icon-ai.js (non implémenté, clé lue depuis l’env)' : 'ℹ  --generate ignoré : OPENAI_API_KEY absent');
  }
  console.log('✓ Icônes générées');
})().catch(e => { console.error('✗', e.message); process.exit(1); });
