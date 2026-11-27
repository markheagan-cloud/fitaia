/**
 * Calculs d'une recette : portions, substitutions, quantités lisibles, calories et macros. Pur, testé.
 * Tout part des grammes de chaque ingrédient et des valeurs pour 100 g de la base (Ciqual 2025 quand dispo).
 */
import type { Meal } from '@/data/content';
import { LOCAL_FOODS, type LocalFood } from '@/data/foods';
import type { Recipe, RecipeIngredient } from '@/data/recipes';
import { mealScore } from '@/store/economy';
import { FOOD_ALLERGENS, type Allergen } from './allergens';

const FOOD = new Map<string, LocalFood>(LOCAL_FOODS.map((f) => [f.name, f]));

export function food(name: string): LocalFood {
  const f = FOOD.get(name);
  if (!f) throw new Error('Aliment inconnu : ' + name);
  return f;
}

export type Macros = { kcal: number; p: number; g: number; l: number };

/**
 * Substitutions validées (même rôle dans le plat, même poids). Clé : aliment d'origine. Chaque remplacement est
 * vérifié contre les allergies et le régime avant d'être proposé (src/kitchen/subs.ts).
 */
export const SUBSTITUTES: Record<string, { food: string; name: string }[]> = {
  'Riz basmati cuit': [{ food: 'Pâtes cuites', name: 'pâtes' }, { food: 'Quinoa cuit', name: 'quinoa' }, { food: 'Semoule / couscous cuit', name: 'semoule' }],
  'Riz complet cuit': [{ food: 'Riz basmati cuit', name: 'riz basmati' }, { food: 'Quinoa cuit', name: 'quinoa' }, { food: 'Pâtes cuites', name: 'pâtes' }],
  'Pâtes complètes cuites': [{ food: 'Pâtes cuites', name: 'pâtes' }, { food: 'Riz basmati cuit', name: 'riz basmati' }],
  'Quinoa cuit': [{ food: 'Riz basmati cuit', name: 'riz basmati' }, { food: 'Semoule / couscous cuit', name: 'semoule' }],
  'Semoule / couscous cuit': [{ food: 'Quinoa cuit', name: 'quinoa' }, { food: 'Riz basmati cuit', name: 'riz basmati' }],
  'Blanc de poulet grillé': [{ food: 'Escalope de dinde', name: 'dinde' }, { food: 'Tofu ferme', name: 'tofu ferme' }],
  'Escalope de dinde': [{ food: 'Blanc de poulet grillé', name: 'blanc de poulet' }, { food: 'Tofu ferme', name: 'tofu ferme' }],
  'Bœuf (rumsteck)': [{ food: 'Blanc de poulet grillé', name: 'blanc de poulet' }, { food: 'Tofu ferme', name: 'tofu ferme' }],
  'Steak haché 5 %': [{ food: 'Escalope de dinde', name: 'escalope de dinde' }],
  'Saumon cuit': [{ food: 'Cabillaud cuit', name: 'cabillaud' }],
  'Cabillaud cuit': [{ food: 'Saumon cuit', name: 'saumon' }],
  'Crevettes cuites': [{ food: 'Blanc de poulet grillé', name: 'blanc de poulet' }, { food: 'Tofu ferme', name: 'tofu ferme' }],
  'Jambon blanc': [{ food: 'Escalope de dinde', name: 'blanc de dinde' }],
  'Tofu ferme': [{ food: 'Blanc de poulet grillé', name: 'blanc de poulet' }],
  'Lait demi-écrémé': [{ food: 'Lait d’amande', name: 'boisson à l’amande' }, { food: 'Boisson au soja', name: 'boisson au soja' }],
  'Lait d’amande': [{ food: 'Lait demi-écrémé', name: 'lait demi-écrémé' }, { food: 'Boisson au soja', name: 'boisson au soja' }],
  'Skyr': [{ food: 'Yaourt grec 0 %', name: 'yaourt grec 0 %' }, { food: 'Fromage blanc 3 %', name: 'fromage blanc' }, { food: 'Yaourt au soja nature', name: 'yaourt au soja' }],
  'Yaourt grec 0 %': [{ food: 'Skyr', name: 'skyr' }, { food: 'Fromage blanc 3 %', name: 'fromage blanc' }, { food: 'Yaourt au soja nature', name: 'yaourt au soja' }],
  'Fromage blanc 3 %': [{ food: 'Skyr', name: 'skyr' }, { food: 'Yaourt grec 0 %', name: 'yaourt grec 0 %' }, { food: 'Yaourt au soja nature', name: 'yaourt au soja' }],
  'Brocolis cuits': [{ food: 'Haricots verts cuits', name: 'haricots verts' }, { food: 'Courgette cuite', name: 'courgette' }],
  'Haricots verts cuits': [{ food: 'Brocolis cuits', name: 'brocolis' }, { food: 'Courgette cuite', name: 'courgette' }],
  'Courgette cuite': [{ food: 'Brocolis cuits', name: 'brocolis' }, { food: 'Haricots verts cuits', name: 'haricots verts' }],
  'Épinards cuits': [{ food: 'Courgette cuite', name: 'courgette' }, { food: 'Champignons', name: 'champignons' }],
  'Poivron': [{ food: 'Courgette cuite', name: 'courgette' }, { food: 'Champignons', name: 'champignons' }],
  'Champignons': [{ food: 'Poivron', name: 'poivron' }, { food: 'Courgette cuite', name: 'courgette' }],
  'Concombre': [{ food: 'Poivron', name: 'poivron' }],
  'Pomme de terre vapeur': [{ food: 'Patate douce cuite', name: 'patate douce' }],
  'Patate douce cuite': [{ food: 'Pomme de terre vapeur', name: 'pommes de terre' }],
  'Pain complet': [{ food: 'Pain blanc (baguette)', name: 'baguette' }],
  'Feta': [{ food: 'Mozzarella', name: 'mozzarella' }],
  'Mozzarella': [{ food: 'Emmental', name: 'emmental râpé' }],
  'Emmental': [{ food: 'Mozzarella', name: 'mozzarella' }],
  'Myrtilles': [{ food: 'Fraises', name: 'fraises' }],
  'Fraises': [{ food: 'Myrtilles', name: 'myrtilles' }],
  'Mangue': [{ food: 'Fraises', name: 'fraises' }, { food: 'Kiwi', name: 'kiwi' }],
  'Kiwi': [{ food: 'Fraises', name: 'fraises' }, { food: 'Mangue', name: 'mangue' }],
  'Amandes': [{ food: 'Noix', name: 'noix' }],
  'Noix': [{ food: 'Amandes', name: 'amandes' }],
  'Lentilles cuites': [{ food: 'Pois chiches cuits', name: 'pois chiches' }],
  'Pois chiches cuits': [{ food: 'Haricots rouges cuits', name: 'haricots rouges' }, { food: 'Lentilles cuites', name: 'lentilles' }],
  'Haricots rouges cuits': [{ food: 'Pois chiches cuits', name: 'pois chiches' }, { food: 'Lentilles cuites', name: 'lentilles' }],
  'Maïs doux': [{ food: 'Petits pois cuits', name: 'petits pois' }],
};

/** Choix fait par la personne pour un ingrédient : un autre aliment, ou « sans » (placard seulement). */
export type SubChoice = string | 'sans';
export type Subs = Record<number, SubChoice>;

export type ResolvedIngredient = {
  index: number;
  food: string;
  /** Grammes pour TOUTES les portions préparées. */
  g: number;
  name: string;
  /** Quantité lisible pour les portions préparées (« 2 œufs », « 150 g », « 150 g cuit (50 g cru) »). */
  qty: string;
  pantry: boolean;
  swapped: boolean;
  removed: boolean;
};

const FRAC: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾', '0.33': '⅓' };

/** 0,5 → « ½ », 1,5 → « 1½ », 2 → « 2 », 0,4 → « ½ » (arrondi au quart). */
export function fmtCount(n: number): string {
  const q = Math.max(0.25, Math.round(n * 4) / 4);
  const whole = Math.floor(q);
  const rest = +(q - whole).toFixed(2);
  if (!rest) return String(whole);
  return (whole ? String(whole) : '') + FRAC[String(rest)];
}

export function fmtGrams(g: number): string {
  const r = g < 20 ? Math.round(g) : Math.round(g / 5) * 5;
  return Math.max(1, r) + ' g';
}

function qtyOf(ing: RecipeIngredient, k: number, swapped: boolean): string {
  if (!swapped && ing.n && ing.unit) {
    const n = ing.n * k;
    return fmtCount(n) + ' ' + (n > 1 ? ing.unit[1] : ing.unit[0]);
  }
  const g = ing.g * k;
  if (ing.cru) return swapped ? fmtGrams(g) + ' cuit' : fmtGrams(g) + ' cuit (' + fmtGrams(g / ing.cru) + ' cru)';
  return fmtGrams(g);
}

/** Ingrédients pour `servings` portions, avec les remplacements choisis. */
export function resolve(r: Recipe, servings = 1, subs: Subs = {}): ResolvedIngredient[] {
  return r.ingredients.map((ing, index) => {
    const choice = subs[index];
    const removed = choice === 'sans' && !!ing.pantry;
    const alt = choice && choice !== 'sans' ? SUBSTITUTES[ing.food]?.find((s) => s.food === choice) : undefined;
    const foodName = alt ? alt.food : ing.food;
    return {
      index,
      food: foodName,
      g: removed ? 0 : ing.g * servings,
      name: alt ? alt.name : ing.name,
      qty: removed ? 'sans' : qtyOf(ing, servings, !!alt),
      pantry: !!ing.pantry,
      swapped: !!alt,
      removed,
    };
  });
}

export function macrosOf(list: { food: string; g: number }[]): Macros {
  const s = { kcal: 0, p: 0, g: 0, l: 0 };
  for (const it of list) {
    const v = food(it.food).per100;
    const k = it.g / 100;
    s.kcal += v.kcal * k;
    s.p += v.p * k;
    s.g += v.g * k;
    s.l += v.l * k;
  }
  return s;
}

export const round = (m: Macros): Macros => ({ kcal: Math.round(m.kcal), p: Math.round(m.p), g: Math.round(m.g), l: Math.round(m.l) });

/** Valeurs pour UNE portion (avec remplacements), arrondies. */
export function perServing(r: Recipe, subs: Subs = {}): Macros {
  return round(macrosOf(resolve(r, 1, subs)));
}

/** Toutes les portions préparées (non arrondi). */
export function totalOf(r: Recipe, servings: number, subs: Subs = {}): Macros {
  return macrosOf(resolve(r, servings, subs));
}

/** Allergènes de la recette telle qu'elle sera cuisinée. */
export function allergensOf(r: Recipe, subs: Subs = {}): Allergen[] {
  const out = new Set<Allergen>();
  for (const it of resolve(r, 1, subs)) if (!it.removed) for (const a of FOOD_ALLERGENS[it.food] ?? []) out.add(a);
  return [...out];
}

/**
 * Repas à enregistrer : `eaten` portions mangées (½, 1, 1½…) de la recette telle que cuisinée. Les macros sont celles
 * d'une portion × `eaten`, calculées en une fois (pas d'arrondi multiplié).
 */
export function recipeMeal(r: Recipe, eaten = 1, subs: Subs = {}): Meal {
  const m = round(macrosOf(resolve(r, eaten, subs)));
  const suffix = eaten !== 1 ? ' · ' + fmtCount(eaten) + ' portion' + (eaten > 1 ? 's' : '') : '';
  return {
    name: r.name + suffix,
    ...m,
    score: mealScore(m.kcal, m.p, m.g, m.l),
    items: resolve(r, eaten, subs).filter((x) => !x.removed).map((x) => cap(x.name) + ', ' + x.qty),
    origin: 'average',
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export { cap };

/**
 * Changements qui touchent une étape (« pâtes au lieu de riz basmati », « sans sauce soja ») : le texte de l'étape reste
 * celui de la recette, cette ligne dit quoi utiliser à la place.
 */
export function stepChanges(r: Recipe, uses: number[] | undefined, subs: Subs = {}): string[] {
  const items = resolve(r, 1, subs);
  return (uses ?? [])
    .map((i) => items[i])
    .filter((x) => x && (x.swapped || x.removed))
    .map((x) => (x.removed ? 'sans ' + r.ingredients[x.index].name : x.name + ' au lieu de ' + r.ingredients[x.index].name));
}
