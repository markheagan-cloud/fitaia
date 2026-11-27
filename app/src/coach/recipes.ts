/**
 * Recettes faciles proposées selon ce que la personne aime. Pur, testé (tests/recipes.test.ts).
 *
 * Données utilisées, toutes réelles et gardées sur le téléphone :
 *  - ses goûts déclarés (« j'aime » / « pas pour moi » par famille d'aliments, régime, favoris, recettes écartées) ;
 *  - son journal de repas des 60 derniers jours (les aliments qui reviennent) ;
 *  - son objectif (perte, maintien, prise, comme le calcul de l'objectif calorique) ;
 *  - les calories qu'il lui reste aujourd'hui et l'heure (petit-déjeuner, repas, collation).
 * Calories et macros de chaque recette sont calculées depuis la base d'aliments (valeurs moyennes), jamais écrites.
 */
import type { Meal, MealEntry } from '@/data/content';
import { LOCAL_FOODS, type LocalFood } from '@/data/foods';
import { RECIPES, type Recipe, type RecipeMoment } from '@/data/recipes';
import { mealScore } from '@/store/economy';

export type Diet = 'vegetarien' | 'vegan' | 'sansPorc' | 'sansLactose' | 'sansPoisson';
export const DIETS: { id: Diet; label: string }[] = [
  { id: 'vegetarien', label: 'Végétarien' },
  { id: 'vegan', label: 'Végan' },
  { id: 'sansPorc', label: 'Sans porc' },
  { id: 'sansLactose', label: 'Sans lactose' },
  { id: 'sansPoisson', label: 'Sans poisson' },
];

export type Family = { id: string; label: string; le: string; re: RegExp };

/** Familles d'aliments proposées en « j'aime / pas pour moi » et reconnues dans le journal (texte sans accents). */
export const FAMILIES: Family[] = [
  { id: 'poulet', label: 'Poulet', le: 'le poulet', re: /\bpoulet\b/ },
  { id: 'dinde', label: 'Dinde', le: 'la dinde', re: /\bdinde\b/ },
  { id: 'boeuf', label: 'Bœuf', le: 'le bœuf', re: /\b(boeuf|steak|rumsteck|bavette)\b/ },
  { id: 'porc', label: 'Porc, jambon', le: 'le jambon', re: /\b(porc|jambon|lardons?|saucisses?|bacon)\b/ },
  { id: 'poisson', label: 'Poisson', le: 'le poisson', re: /\b(poissons?|saumon|thon|cabillaud|colin|sardines?|maquereau|sushis?)\b/ },
  { id: 'crevettes', label: 'Crevettes', le: 'les crevettes', re: /\b(crevettes?|fruits de mer)\b/ },
  { id: 'oeufs', label: 'Œufs', le: 'les œufs', re: /\b(oeufs?|omelette)\b/ },
  { id: 'tofu', label: 'Tofu', le: 'le tofu', re: /\btofu\b/ },
  { id: 'legumineuses', label: 'Lentilles, pois chiches', le: 'les légumineuses', re: /\b(lentilles?|pois chiches?|haricots rouges?|dahl|chili)\b/ },
  { id: 'fromage', label: 'Fromage', le: 'le fromage', re: /\b(feta|mozzarella|emmental|parmesan|comte|chevre|raclette|cheddar)\b/ },
  { id: 'laitages', label: 'Yaourt, skyr', le: 'les laitages', re: /\b(yaourts?|skyr|fromage blanc)\b/ },
  { id: 'riz', label: 'Riz', le: 'le riz', re: /\briz\b/ },
  { id: 'pates', label: 'Pâtes', le: 'les pâtes', re: /\b(pates|spaghettis?|penne|tagliatelles?|macaronis?)\b/ },
  { id: 'patates', label: 'Pommes de terre', le: 'les pommes de terre', re: /\b(pommes? de terre|patates? douces?|frites|puree)\b/ },
  { id: 'legumes', label: 'Légumes verts', le: 'les légumes verts', re: /\b(brocolis?|epinards?|haricots verts|courgettes?|salade)\b/ },
  { id: 'avocat', label: 'Avocat', le: 'l’avocat', re: /\bavocats?\b/ },
  { id: 'fruits', label: 'Fruits', le: 'les fruits', re: /\b(bananes?|fraises?|myrtilles?|mangues?|kiwis?|oranges?|raisins?|pommes?(?! de terre))\b/ },
  { id: 'avoine', label: 'Flocons d’avoine', le: 'les flocons d’avoine', re: /\b(avoine|porridge|muesli)\b/ },
  { id: 'cacahuete', label: 'Cacahuète', le: 'la cacahuète', re: /\bcacahuetes?\b/ },
];

const MEAT = new Set(['poulet', 'dinde', 'boeuf', 'porc']);
const SEA = new Set(['poisson', 'crevettes']);
const DAIRY = /\b(yaourt|skyr|fromage|lait (?!d amande)|emmental|mozzarella|feta|beurre(?! de cacahuete)|whey)/;

/** Texte comparable : minuscules, sans accents, œ → oe, ponctuation → espace. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function familiesIn(text: string): string[] {
  const n = ' ' + norm(text) + ' ';
  return FAMILIES.filter((f) => f.re.test(n)).map((f) => f.id);
}

const FOOD = new Map<string, LocalFood>(LOCAL_FOODS.map((f) => [f.name, f]));

export function recipeFoods(r: Recipe): LocalFood[] {
  return r.ingredients.map(([name]) => {
    const f = FOOD.get(name);
    if (!f) throw new Error('Aliment inconnu dans la recette ' + r.id + ' : ' + name);
    return f;
  });
}

/** Calories et macros d'une portion, calculées depuis la base d'aliments. */
export function recipeNutrition(r: Recipe): { kcal: number; p: number; g: number; l: number } {
  const foods = recipeFoods(r);
  const sum = { kcal: 0, p: 0, g: 0, l: 0 };
  r.ingredients.forEach(([, grams], i) => {
    const k = grams / 100;
    const v = foods[i].per100;
    sum.kcal += v.kcal * k;
    sum.p += v.p * k;
    sum.g += v.g * k;
    sum.l += v.l * k;
  });
  return { kcal: Math.round(sum.kcal), p: Math.round(sum.p), g: Math.round(sum.g), l: Math.round(sum.l) };
}

/** La recette comme repas prêt à ajouter au journal (valeurs moyennes, affichées comme telles). */
export function recipeToMeal(r: Recipe): Meal {
  const n = recipeNutrition(r);
  return {
    name: r.name,
    ...n,
    score: mealScore(n.kcal, n.p, n.g, n.l),
    items: r.ingredients.map(([food, grams, label]) => label ?? food + ', ' + grams + ' g'),
    origin: 'average',
  };
}

export function recipeFamilies(r: Recipe): string[] {
  return Array.from(new Set(r.ingredients.flatMap(([food]) => familiesIn(food))));
}

/** Ce que la recette contient, pour les régimes (déduit des aliments, pas déclaré à la main). */
export function recipeDiet(r: Recipe): Record<Diet, boolean> {
  const fam = new Set(recipeFamilies(r));
  const names = r.ingredients.map(([food]) => ' ' + norm(food) + ' ');
  const meat = [...fam].some((f) => MEAT.has(f));
  const sea = [...fam].some((f) => SEA.has(f));
  const dairy = names.some((n) => DAIRY.test(n));
  const egg = fam.has('oeufs');
  const honey = names.some((n) => /\bmiel\b/.test(n));
  return {
    vegetarien: !meat && !sea,
    vegan: !meat && !sea && !dairy && !egg && !honey,
    sansPorc: !fam.has('porc'),
    sansLactose: !dairy,
    sansPoisson: !sea,
  };
}

/** Familles qui reviennent dans le journal : nombre de repas (60 derniers jours) où chacune apparaît. */
export function journalTastes(meals: Record<string, MealEntry[]>, now = Date.now(), days = 60): Record<string, number> {
  const since = now - days * 86_400_000;
  const out: Record<string, number> = {};
  for (const m of Object.values(meals).flat()) {
    if (m.at < since || m.id.startsWith('reprise-')) continue;
    for (const f of familiesIn(m.name + ' ' + m.items.join(' '))) out[f] = (out[f] ?? 0) + 1;
  }
  return out;
}

export type Goal = 'perte' | 'maintien' | 'prise';
/** Même seuil que l'objectif calorique (src/store/profile.ts, dailyGoal). */
export function goalOf(targetKg: number, weightKg: number): Goal {
  if (targetKg < weightKg - 0.3) return 'perte';
  if (targetKg > weightKg + 0.3) return 'prise';
  return 'maintien';
}

export function momentAt(hour: number): RecipeMoment {
  if (hour >= 5 && hour < 11) return 'matin';
  if ((hour >= 11 && hour < 15) || (hour >= 18 && hour < 22)) return 'repas';
  return 'collation';
}

export type RecipePrefs = { diet: Diet[]; likes: string[]; dislikes: string[]; favorites: string[]; hidden: string[] };
export const EMPTY_PREFS: RecipePrefs = { diet: [], likes: [], dislikes: [], favorites: [], hidden: [] };

export type RankInput = {
  prefs: RecipePrefs;
  tastes: Record<string, number>;
  goal: Goal;
  /** Calories qui restent aujourd'hui (peut être négatif). */
  remainingKcal: number;
  hour: number;
  /** Noms des repas déjà au journal aujourd'hui (pour varier). */
  todayNames?: string[];
  /** Limiter à un moment ; sinon le moment de la journée est seulement favorisé. */
  moment?: RecipeMoment;
  favoritesOnly?: boolean;
};

export type Suggestion = { recipe: Recipe; meal: Meal; score: number; reasons: string[]; fits: boolean };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const FAM = new Map(FAMILIES.map((f) => [f.id, f]));

/** Recettes permises par les goûts et le régime, de la plus adaptée à la moins adaptée, avec leurs raisons. */
export function rankRecipes(input: RankInput, recipes: Recipe[] = RECIPES): Suggestion[] {
  const { prefs, tastes, goal, remainingKcal, hour } = input;
  const now = momentAt(hour);
  const today = new Set((input.todayNames ?? []).map(norm));
  const out: Suggestion[] = [];
  for (const r of recipes) {
    if (prefs.hidden.includes(r.id)) continue;
    if (input.moment && r.moment !== input.moment) continue;
    const fav = prefs.favorites.includes(r.id);
    if (input.favoritesOnly && !fav) continue;
    const diet = recipeDiet(r);
    if (prefs.diet.some((d) => !diet[d])) continue;
    const fams = recipeFamilies(r);
    if (fams.some((f) => prefs.dislikes.includes(f))) continue;

    const meal = recipeToMeal(r);
    const reasons: string[] = [];
    let score = 50;
    if (fav) {
      score += 30;
      reasons.push('Dans tes favoris');
    }
    const liked = fams.filter((f) => prefs.likes.includes(f));
    if (liked.length) {
      score += 25 * Math.min(2, liked.length);
      reasons.push('Tu aimes ' + liked.slice(0, 2).map((f) => FAM.get(f)!.le).join(' et '));
    }
    const habit = fams.filter((f) => (tastes[f] ?? 0) >= 2 && !liked.includes(f)).sort((a, b) => tastes[b] - tastes[a]);
    if (habit.length) {
      score += Math.min(24, habit.reduce((a, f) => a + Math.min(4, tastes[f]) * 3, 0));
      reasons.push(cap(FAM.get(habit[0])!.le) + ' revient souvent dans ton journal');
    }
    const protShare = (meal.p * 4) / Math.max(1, meal.kcal);
    if (goal === 'perte') {
      score += Math.round(protShare * 60) + (meal.kcal <= 550 ? 8 : -8);
      if (protShare >= 0.25 && meal.p >= 20) reasons.push('Riche en protéines (' + meal.p + ' g), ça cale pour ton objectif');
    } else if (goal === 'prise') {
      score += (meal.kcal >= 500 ? 10 : 0) + Math.round(protShare * 30);
      if (meal.kcal >= 500 && meal.p >= 25) reasons.push('Copieux et ' + meal.p + ' g de protéines pour ta prise de muscle');
    } else {
      score += Math.round(meal.score / 8);
    }
    const fits = meal.kcal <= remainingKcal;
    score += fits ? 10 : -30;
    if (!input.moment && r.moment === now) score += 20;
    // déjà mangée aujourd'hui : elle passe après toutes les autres, même si c'est un favori (on varie)
    out.push({ recipe: r, meal, score: today.has(norm(r.name)) ? score - 1000 : score, reasons: reasons.slice(0, 2), fits });
  }
  return out.sort((a, b) => b.score - a.score || a.recipe.minutes - b.recipe.minutes);
}

const PROTEIN = ['poulet', 'dinde', 'boeuf', 'porc', 'poisson', 'crevettes', 'oeufs', 'tofu', 'legumineuses', 'laitages', 'fromage'];
/** Aliment principal (première source de protéines), pour varier les idées montrées ensemble. */
export function mainFamily(r: Recipe): string {
  const fams = recipeFamilies(r);
  return PROTEIN.find((p) => fams.includes(p)) ?? fams[0] ?? r.id;
}

/** Les n premières idées, sans deux fois le même aliment principal quand c'est possible (ordre du classement gardé). */
export function pickVaried(list: Suggestion[], n: number): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const s of list) {
    if (out.length >= n) break;
    const f = mainFamily(s.recipe);
    if (seen.has(f)) continue;
    seen.add(f);
    out.push(s);
  }
  for (const s of list) {
    if (out.length >= n) break;
    if (!out.includes(s)) out.push(s);
  }
  return out.sort((a, b) => list.indexOf(a) - list.indexOf(b));
}
