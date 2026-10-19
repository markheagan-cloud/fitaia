/**
 * Aliments réels, gratuits : Open Food Facts (base ouverte, licence ODbL, sans clé API)
 * + une petite base locale d'aliments courants (valeurs moyennes) pour le hors-ligne.
 */
import { Platform } from 'react-native';
import { mealScore } from '@/store/economy';
import type { Meal } from '@/data/content';
import { LOCAL_FOODS } from '@/data/foods';

export type Food = {
  id: string;
  name: string;
  brand?: string;
  per100: { kcal: number; p: number; g: number; l: number };
  serving?: number; // g
  image?: string;
  nutriscore?: string;
  source: 'off' | 'local';
};

const UA = 'FITAIA/1.0 (app mobile; contact@fitaia.app)';
const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_fr,brands,nutriments,serving_quantity,image_small_url,nutriscore_grade';

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  brands?: string;
  serving_quantity?: number | string;
  image_small_url?: string;
  nutriscore_grade?: string;
  nutriments?: Record<string, number | string | undefined>;
};

const num = (v: number | string | undefined) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n as number) ? Math.max(0, n as number) : 0;
};

function fromOff(p: OffProduct): Food | null {
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (!kcal && n['energy_100g']) kcal = num(n['energy_100g']) / 4.184; // kJ → kcal
  const name = (p.product_name_fr || p.product_name || '').trim();
  if (!name || !kcal) return null;
  const serving = num(p.serving_quantity);
  return {
    id: 'off:' + (p.code ?? name),
    name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    per100: { kcal: Math.round(kcal), p: +num(n.proteins_100g).toFixed(1), g: +num(n.carbohydrates_100g).toFixed(1), l: +num(n.fat_100g).toFixed(1) },
    serving: serving > 0 && serving < 2000 ? Math.round(serving) : undefined,
    image: p.image_small_url,
    nutriscore: p.nutriscore_grade && /^[a-e]$/.test(p.nutriscore_grade) ? p.nutriscore_grade : undefined,
    source: 'off',
  };
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Recherche locale (hors-ligne, instantanée). */
export function searchLocal(q: string, limit = 8): Food[] {
  const n = norm(q.trim());
  if (!n) return [];
  const words = n.split(/\s+/);
  return LOCAL_FOODS.filter((f) => words.every((w) => norm(f.name).includes(w)))
    .slice(0, limit)
    .map((f) => ({ ...f, id: 'local:' + f.name, source: 'local' as const }));
}

/** Sur ordinateur (web), la recherche Open Food Facts est bloquée par le navigateur (CORS) ; le code-barres, lui, passe. */
export const offSearchAvailable = Platform.OS !== 'web';

/** Recherche Open Food Facts (produits vendus en France en priorité). */
export async function searchOff(q: string, signal?: AbortSignal): Promise<Food[]> {
  if (!offSearchAvailable) return [];
  const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&lc=fr&cc=fr&fields=${FIELDS}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error('Open Food Facts indisponible (' + res.status + ')');
  const data = (await res.json()) as { products?: OffProduct[] };
  const seen = new Set<string>();
  const out: Food[] = [];
  for (const p of data.products ?? []) {
    const f = fromOff(p);
    if (!f) continue;
    const key = norm(f.name + '|' + (f.brand ?? ''));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/** Produit par code-barres (EAN-13 / UPC). */
export async function fetchBarcode(code: string, signal?: AbortSignal): Promise<Food | null> {
  const clean = code.replace(/\D/g, '');
  if (clean.length < 8) return null;
  const res = await fetch(`${BASE}/api/v2/product/${clean}.json?fields=${FIELDS}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Open Food Facts indisponible (' + res.status + ')');
  const data = (await res.json()) as { status?: number; product?: OffProduct };
  if (!data.product) return null;
  return fromOff(data.product);
}

/** Portion → repas (kcal et macros proportionnels, score FITAIA). */
export function toMeal(food: Food, grams: number): Meal {
  const k = Math.max(1, grams) / 100;
  const kcal = Math.round(food.per100.kcal * k);
  const p = Math.round(food.per100.p * k);
  const g = Math.round(food.per100.g * k);
  const l = Math.round(food.per100.l * k);
  return {
    name: food.name + (food.brand ? ' · ' + food.brand : ''),
    kcal, p, g, l,
    score: mealScore(kcal, p, g, l),
    items: [food.name + ', ' + Math.round(grams) + ' g'],
  };
}

/** Portions proposées : la portion fabricant si connue, sinon des repères usuels. */
export function portionPresets(food: Food): number[] {
  const base = food.serving ? [food.serving, Math.round(food.serving * 2)] : [];
  const usual = food.per100.kcal > 350 ? [30, 50, 100] : [100, 150, 250];
  return Array.from(new Set([...base, ...usual])).filter((x) => x > 0).slice(0, 4);
}
