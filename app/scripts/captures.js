/* Captures App Store 6,7" (1290×2796) à partir des vrais écrans de l'app (serveur Expo web sur :8081).
   Usage : CAPTURES-FITAIA.bat (installe Playwright + Chromium la première fois). */
const path = require('path');
const fs = require('fs');
function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    // Lancé via `npx -p playwright` : le paquet est dans le cache npx, pas dans node_modules.
    const { execSync } = require('child_process');
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    for (const c of [path.join(root, 'playwright'), path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx')]) {
      try {
        if (c.endsWith('_npx')) {
          for (const d of fs.readdirSync(c)) {
            const m = path.join(c, d, 'node_modules', 'playwright');
            if (fs.existsSync(m)) return require(m);
          }
        } else if (fs.existsSync(c)) return require(c);
      } catch {
        // suivant
      }
    }
    throw new Error('Playwright introuvable : lance `npm i -D playwright` dans app/');
  }
}
const { chromium } = loadPlaywright();

const BASE = process.env.FITAIA_URL || 'http://localhost:8081';
const OUT = path.join(__dirname, '..', 'store', 'captures', 'raw');
const state = fs.readFileSync(path.join(__dirname, 'captures-state.json'), 'utf8');
const shots = [
  ['01-defis', '/defis'],
  [
    '02-scanner',
    '/scanner',
    async (page) => {
      await page.getByText('Chercher un aliment').first().click();
      await page.getByPlaceholder(/yaourt grec/).fill('poulet');
      await page.waitForTimeout(1200);
      await page.getByText('Blanc de poulet grillé').first().click();
      await page.waitForTimeout(1500);
    },
  ],
  ['03-accueil', '/'],
  ['04-perso', '/perso'],
  ['05-boutique', '/boutique'],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    locale: 'fr-FR',
  });
  await ctx.addInitScript((s) => {
    try {
      localStorage.setItem('fitaia-v1', s);
    } catch {
      // ignore
    }
  }, state);
  const page = await ctx.newPage();
  const only = process.argv.slice(2);
  for (const [name, route, action] of shots) {
    if (only.length && !only.includes(name)) continue;
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500); // polices + animations d'entrée
    if (action) await action(page);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('ok', name);
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
