#!/usr/bin/env node
/**
 * Crée dans App Store Connect les achats intégrés des tenues (un produit non consommable par tenue payable en euros),
 * avec nom et description en français, prix France (les autres pays suivent la grille d'Apple), disponibilité dans
 * tous les pays et capture pour la revue d'Apple.
 *
 * La grille vient de src/shop/prixEuros.ts (lue telle quelle, pas recopiée) et la liste des tenues du catalogue.
 * Idempotent : un produit déjà créé est laissé tel quel (on complète seulement ce qui manque).
 *
 * Usage (environnement qui joint api.appstoreconnect.apple.com) :
 *   ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_P8="$(cat AuthKey.p8)" node scripts/asc-achats.mjs            # plan, ne change rien
 *   … node scripts/asc-achats.mjs --appliquer [--captures dossier]                                    # crée
 * `--captures` : dossier avec une image <tenue>.png (ex. capture de la fiche) par tenue, pour la revue d'Apple.
 */
import { createHash, createSign } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const APPLY = process.argv.includes('--appliquer');
const capIdx = process.argv.indexOf('--captures');
const CAPTURES = capIdx > 0 ? process.argv[capIdx + 1] : null;
const APP_ID = JSON.parse(readFileSync(join(ROOT, 'eas.json'), 'utf8')).submit.production.ios.ascAppId;
const API = 'https://api.appstoreconnect.apple.com';

// --- grille et catalogue, lus dans le code de l'app -------------------------------------------------------------
const prixSrc = readFileSync(join(ROOT, 'src/shop/prixEuros.ts'), 'utf8');
const PALIERS = Object.fromEntries([...prixSrc.matchAll(/(\w+): \{ id: '\w+', euros: ([\d.]+) \}/g)].map((m) => [m[1], Number(m[2])]));
const PRESTIGE = new Set([...(/const PRESTIGE = new Set\(\[([^\]]*)\]\)/.exec(prixSrc)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]));
const PREFIX = /PRODUCT_PREFIX = '([^']+)'/.exec(prixSrc)[1];
const catSrc = readFileSync(join(ROOT, 'src/inventory/cosmeticCatalog.ts'), 'utf8');
const sheetsSrc = readFileSync(join(ROOT, 'src/shop/catalogue.ts'), 'utf8');
const items = [...catSrc.matchAll(/item\('(outfit_\w+)', '([^']+)', 'FULL_OUTFIT', '(\w+)', '(\w+)', (\d+|null)\)/g)]
  .map(([, id, name, rarity, source, price]) => ({ id, name, rarity, source, price: price === 'null' ? null : Number(price) }))
  .filter((i) => sheetsSrc.includes("itemId: '" + i.id + "'"));
const palier = (i) => {
  if (i.price === null || (i.source !== 'SHOP' && i.source !== 'LIMITED')) return null;
  if (PRESTIGE.has(i.id)) return PALIERS.prestige;
  return { LEGENDARY: PALIERS.legendaire, EPIC: PALIERS.epique, RARE: PALIERS.rare }[i.rarity] ?? null;
};
const tagline = (id) => /itemId: '(\w+)'[\s\S]*?tagline: '((?:[^'\\]|\\.)*)'/g;
const taglineOf = (id) => {
  for (const m of sheetsSrc.matchAll(tagline())) if (m[1] === id) return m[2].replace(/\\'/g, "'");
  return '';
};
const plan = items.map((i) => ({ ...i, euros: palier(i), productId: PREFIX + i.id.replace(/^outfit_/, '') })).filter((i) => i.euros);

console.log('App ' + APP_ID + ' · ' + plan.length + ' achats intégrés (non consommables) :');
for (const p of plan) console.log('  ' + p.productId.padEnd(34) + p.euros.toFixed(2).replace('.', ',') + ' €  ' + p.name);
if (!APPLY) {
  console.log('\nPlan seulement. Ajoute --appliquer pour créer.');
  process.exit(0);
}

// --- API App Store Connect ------------------------------------------------------------------------------------
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 } = process.env;
if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_P8) {
  console.error('Il manque ASC_KEY_ID, ASC_ISSUER_ID ou ASC_KEY_P8.');
  process.exit(1);
}
const b64u = (b) => Buffer.from(b).toString('base64url');
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }));
  const sig = createSign('SHA256').update(head + '.' + body).sign({ key: ASC_KEY_P8, dsaEncoding: 'ieee-p1363' });
  return head + '.' + body + '.' + b64u(sig);
}
async function asc(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + jwt(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(method + ' ' + path + ' → ' + res.status + ' ' + text.slice(0, 400));
  return text ? JSON.parse(text) : {};
}
async function all(path) {
  const out = [];
  let next = path;
  while (next) {
    const r = await asc('GET', next.replace(API, ''));
    out.push(...r.data);
    next = r.links?.next ?? null;
  }
  return out;
}

const existing = await all('/v1/apps/' + APP_ID + '/inAppPurchasesV2?limit=200');
const byProduct = new Map(existing.map((x) => [x.attributes.productId, x]));
const territories = (await all('/v1/territories?limit=200')).map((t) => ({ type: 'territories', id: t.id }));

for (const p of plan) {
  let iap = byProduct.get(p.productId);
  if (!iap) {
    iap = (await asc('POST', '/v2/inAppPurchases', {
      data: {
        type: 'inAppPurchases',
        attributes: {
          name: p.name,
          productId: p.productId,
          inAppPurchaseType: 'NON_CONSUMABLE',
          familySharable: false,
          reviewNote: 'Tenue de personnage (cosmétique) pour FITAIA. Elle s’obtient aussi gratuitement en Fitcoins gagnés avec les défis. Achat unique, aucune monnaie achetable.',
        },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } },
      },
    })).data;
    console.log('créé   ' + p.productId);
  } else console.log('existe ' + p.productId + ' (' + iap.attributes.state + ')');
  const id = iap.id;

  const locs = await asc('GET', '/v2/inAppPurchases/' + id + '/inAppPurchaseLocalizations');
  if (!locs.data.some((l) => l.attributes.locale === 'fr-FR')) {
    const desc = (taglineOf(p.id) || 'Tenue ' + p.name + ' dessinée sur ton perso.').slice(0, 55);
    await asc('POST', '/v1/inAppPurchaseLocalizations', {
      data: { type: 'inAppPurchaseLocalizations', attributes: { locale: 'fr-FR', name: p.name.slice(0, 30), description: desc }, relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id } } } },
    });
    console.log('  nom et description fr-FR');
  }

  const sched = await asc('GET', '/v2/inAppPurchases/' + id + '/iapPriceSchedule').catch(() => null);
  const hasPrice = sched?.data && (await asc('GET', '/v1/inAppPurchasePriceSchedules/' + sched.data.id + '/manualPrices?limit=1').catch(() => ({ data: [] }))).data.length > 0;
  if (!hasPrice) {
    const points = await all('/v2/inAppPurchases/' + id + '/pricePoints?filter[territory]=FRA&limit=200');
    const pt = points.find((x) => Number(x.attributes.customerPrice) === p.euros);
    if (!pt) throw new Error('Pas de palier Apple à ' + p.euros + ' € pour la France');
    await asc('POST', '/v1/inAppPurchasePriceSchedules', {
      data: {
        type: 'inAppPurchasePriceSchedules',
        relationships: {
          inAppPurchase: { data: { type: 'inAppPurchases', id } },
          baseTerritory: { data: { type: 'territories', id: 'FRA' } },
          manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${prix}' }] },
        },
      },
      included: [{ type: 'inAppPurchasePrices', id: '${prix}', attributes: { startDate: null }, relationships: { inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: pt.id } } } }],
    });
    console.log('  prix ' + p.euros + ' € (France, autres pays par Apple)');
  }

  const avail = await asc('GET', '/v2/inAppPurchases/' + id + '/inAppPurchaseAvailability').catch(() => null);
  if (!avail?.data) {
    await asc('POST', '/v1/inAppPurchaseAvailabilities', {
      data: {
        type: 'inAppPurchaseAvailabilities',
        attributes: { availableInNewTerritories: true },
        relationships: { inAppPurchase: { data: { type: 'inAppPurchases', id } }, availableTerritories: { data: territories } },
      },
    });
    console.log('  disponible dans tous les pays');
  }

  const shot = CAPTURES ? join(CAPTURES, p.id.replace(/^outfit_/, '') + '.png') : null;
  if (shot && existsSync(shot)) {
    const cur = await asc('GET', '/v2/inAppPurchases/' + id + '/appStoreReviewScreenshot').catch(() => null);
    if (!cur?.data) {
      const bytes = readFileSync(shot);
      const r = (await asc('POST', '/v1/inAppPurchaseAppStoreReviewScreenshots', {
        data: { type: 'inAppPurchaseAppStoreReviewScreenshots', attributes: { fileName: p.id + '.png', fileSize: statSync(shot).size }, relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id } } } },
      })).data;
      for (const op of r.attributes.uploadOperations) {
        const part = bytes.subarray(op.offset, op.offset + op.length);
        const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
        const up = await fetch(op.url, { method: op.method, headers, body: part });
        if (!up.ok) throw new Error('envoi de la capture : ' + up.status);
      }
      await asc('PATCH', '/v1/inAppPurchaseAppStoreReviewScreenshots/' + r.id, {
        data: { type: 'inAppPurchaseAppStoreReviewScreenshots', id: r.id, attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') } },
      });
      console.log('  capture pour la revue');
    }
  }
}
console.log('\nTerminé. Les produits « Prêts à soumettre » s’achètent en bac à sable (TestFlight) ; ils partent en revue avec la prochaine version de l’app.');
