/**
 * Moteur de recommandation des recettes FITAIA. Local, déterministe, pur et testé (tests/recipes.test.ts) : aucune IA
 * externe, aucune donnée envoyée.
 *
 * Filtres OBLIGATOIRES (une recette incompatible n'est jamais proposée) : allergies, régime, aliments refusés,
 * recettes écartées ou mises de côté pour un temps, temps disponible.
 * Classement : favoris (et recettes proches), goûts déclarés, aliments qui reviennent dans le journal (60 jours),
 * repas des 3 derniers jours (on varie), objectif, calories restantes (simple repère, jamais un blocage), moment de la
 * journée, entraînement enregistré aujourd'hui, refus passés (« trop compliqué », « je préfère autre chose »).
 * Chaque raison affichée correspond à une donnée réelle qui a compté dans le classement.
 */
import type { Meal, MealEntry } from '@/data/content';
import { RECIPES, type Recipe, type RecipeMoment } from '@/data/recipes';
import { allergensOf, perServing, recipeMeal, SUBSTITUTES, type Subs } from '@/kitchen/nutrition';
import type { Allergen } from '@/kitchen/allergens';

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
const STARCH = ['riz', 'pates', 'patates'];
const PROTEIN = ['poulet', 'dinde', 'boeuf', 'porc', 'poisson', 'crevettes', 'oeufs', 'tofu', 'legumineuses', 'laitages', 'fromage'];

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

export function familyLabel(id: string): string {
  return FAMILIES.find((f) => f.id === id)?.label ?? id;
}

/** Calories et macros d'une portion. */
export function recipeNutrition(r: Recipe, subs: Subs = {}) {
  return perServing(r, subs);
}

/** La recette comme repas prêt à ajouter au journal (valeurs moyennes, affichées comme telles). */
export function recipeToMeal(r: Recipe, eaten = 1, subs: Subs = {}): Meal {
  return recipeMeal(r, eaten, subs);
}

export function recipeFamilies(r: Recipe): string[] {
  return Array.from(new Set(r.ingredients.flatMap((i) => familiesIn(i.food))));
}

/** Aliment principal (première source de protéines), pour varier et relier les recettes proches. */
export function mainFamily(r: Recipe): string {
  const fams = recipeFamilies(r);
  return PROTEIN.find((p) => fams.includes(p)) ?? fams[0] ?? r.id;
}

/** Ce que la recette contient, pour les régimes (déduit des aliments et de leurs allergènes, jamais déclaré à la main). */
export function recipeDiet(r: Recipe, subs: Subs = {}): Record<Diet, boolean> {
  const foods = r.ingredients
    .map((ing, i) => {
      const c = subs[i];
      if (c === 'sans') return ing.pantry ? '' : ing.food;
      return c ?? ing.food;
    })
    .filter(Boolean);
  const fam = new Set(foods.flatMap((f) => familiesIn(f)));
  const al = new Set(allergensOf(r, subs));
  const meat = [...fam].some((f) => MEAT.has(f));
  const sea = [...fam].some((f) => SEA.has(f)) || al.has('poisson') || al.has('crustaces');
  const honey = foods.includes('Miel');
  return {
    vegetarien: !meat && !sea,
    vegan: !meat && !sea && !al.has('lait') && !al.has('oeufs') && !honey,
    sansPorc: !fam.has('porc'),
    sansLactose: !al.has('lait'),
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

/** Recettes mangées ces `days` derniers jours (le journal garde le nom de la recette en tête du repas). */
export function recentRecipeIds(meals: Record<string, MealEntry[]>, now = Date.now(), days = 3, recipes: Recipe[] = RECIPES): string[] {
  const since = now - days * 86_400_000;
  const names = Object.values(meals).flat().filter((m) => m.at >= since).map((m) => norm(m.name));
  return recipes.filter((r) => names.some((n) => n === norm(r.name) || n.startsWith(norm(r.name) + ' '))).map((r) => r.id);
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

export type RecipePrefs = {
  diet: Diet[];
  likes: string[];
  dislikes: string[];
  favorites: string[];
  /** Écartées pour de bon. */
  hidden: string[];
  /** Allergies et intolérances déclarées : filtre strict. */
  allergies: Allergen[];
  /** Mises de côté jusqu'à une date (ms). */
  snoozed: Record<string, number>;
  /** « Je préfère autre chose » répété : famille → nombre. */
  negatives: Record<string, number>;
  /** Nombre de « trop compliqué ». */
  tooHard: number;
};
export const EMPTY_PREFS: RecipePrefs = { diet: [], likes: [], dislikes: [], favorites: [], hidden: [], allergies: [], snoozed: {}, negatives: {}, tooHard: 0 };

export type RankInput = {
  prefs: RecipePrefs;
  tastes: Record<string, number>;
  goal: Goal;
  /** Calories qui restent aujourd'hui (peut être négatif : simple repère). */
  remainingKcal: number;
  hour: number;
  now?: number;
  /** Noms des repas déjà au journal aujourd'hui. */
  todayNames?: string[];
  /** Recettes mangées ces 3 derniers jours. */
  recentIds?: string[];
  /** Un défi ou une activité est enregistré aujourd'hui. */
  trainedToday?: boolean;
  /** Temps disponible (minutes). */
  maxMinutes?: number;
  moment?: RecipeMoment;
  favoritesOnly?: boolean;
  /** Recettes déjà montrées (« D'autres idées ») : passent après les autres. */
  shown?: string[];
};

export type Suggestion = { recipe: Recipe; meal: Meal; score: number; reasons: string[]; fits: boolean };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const FAM = new Map(FAMILIES.map((f) => [f.id, f]));

/** Pourquoi une recette est exclue (null : permise). */
export function exclusion(r: Recipe, prefs: RecipePrefs, now = Date.now()): string | null {
  if (prefs.hidden.includes(r.id)) return 'écartée';
  if ((prefs.snoozed[r.id] ?? 0) > now) return 'mise de côté';
  const al = allergensOf(r);
  const hit = prefs.allergies.find((a) => al.includes(a));
  if (hit) return 'allergie : ' + hit;
  const diet = recipeDiet(r);
  const d = prefs.diet.find((x) => !diet[x]);
  if (d) return 'régime : ' + d;
  const f = recipeFamilies(r).find((x) => prefs.dislikes.includes(x));
  if (f) return 'aliment refusé : ' + f;
  return null;
}

/** Recettes permises, de la plus adaptée à la moins adaptée, avec leurs raisons (fondées sur les données réelles). */
export function rankRecipes(input: RankInput, recipes: Recipe[] = RECIPES): Suggestion[] {
  const { prefs, tastes, goal, remainingKcal, hour } = input;
  const now = input.now ?? Date.now();
  const moment = momentAt(hour);
  const today = new Set((input.todayNames ?? []).map(norm));
  const recent = new Set(input.recentIds ?? []);
  const shown = new Set(input.shown ?? []);
  const favFamilies = new Set(
    prefs.favorites.map((id) => recipes.find((r) => r.id === id)).filter((r): r is Recipe => !!r).map(mainFamily),
  );
  const journalMeals = Object.values(tastes).reduce((a, b) => a + b, 0);
  const out: Suggestion[] = [];
  for (const r of recipes) {
    if (input.moment && r.moment !== input.moment) continue;
    const fav = prefs.favorites.includes(r.id);
    if (input.favoritesOnly && !fav) continue;
    if (input.maxMinutes && r.minutes > input.maxMinutes) continue;
    if (exclusion(r, prefs, now)) continue;

    const meal = recipeMeal(r);
    const fams = recipeFamilies(r);
    const main = mainFamily(r);
    const reasons: string[] = [];
    let score = 50;
    if (fav) {
      score += 30;
      reasons.push('Dans tes favoris');
    } else if (favFamilies.has(main)) {
      score += 8;
    }
    const liked = fams.filter((f) => prefs.likes.includes(f));
    if (liked.length) {
      score += 25 * Math.min(2, liked.length);
      reasons.push('Tu aimes ' + liked.slice(0, 2).map((f) => FAM.get(f)!.le).join(' et '));
    }
    const protShare = (meal.p * 4) / Math.max(1, meal.kcal);
    if (input.trainedToday && r.moment !== 'matin' && meal.p >= 20) {
      score += 10;
      reasons.push(meal.p + ' g de protéines après ton entraînement');
    }
    const habit = fams.filter((f) => (tastes[f] ?? 0) >= 2 && !liked.includes(f)).sort((a, b) => tastes[b] - tastes[a]);
    if (habit.length) {
      score += Math.min(24, habit.reduce((a, f) => a + Math.min(4, tastes[f]) * 3, 0));
      reasons.push(cap(FAM.get(habit[0])!.le) + ' revient souvent dans ton journal');
    } else if (journalMeals >= 5 && !(tastes[main] ?? 0) && !liked.length && PROTEIN.includes(main)) {
      reasons.push('Change de tes repas habituels');
    }
    if (input.maxMinutes || r.minutes <= 10) {
      if (input.maxMinutes) score += 6;
      reasons.push('Prête en ' + r.minutes + ' minutes');
    }
    if (goal === 'perte') {
      score += Math.round(protShare * 60) + (meal.kcal <= 550 ? 8 : -8);
      if (protShare >= 0.25 && meal.p >= 20 && !input.trainedToday) reasons.push('Riche en protéines (' + meal.p + ' g), ça cale');
    } else if (goal === 'prise') {
      score += (meal.kcal >= 500 ? 10 : 0) + Math.round(protShare * 30);
      if (meal.kcal >= 500 && meal.p >= 25 && !input.trainedToday) reasons.push('Copieux, ' + meal.p + ' g de protéines pour ta prise de muscle');
    } else {
      score += Math.round(meal.score / 8);
    }
    const fits = meal.kcal <= remainingKcal;
    if (remainingKcal <= 0) {
      // budget du jour atteint : on ne bloque rien, on met en avant le léger et rassasiant
      score += (meal.kcal <= 350 ? 15 : -10) + Math.round(protShare * 20);
    } else {
      score += fits ? 10 : -20;
    }
    if (!input.moment && r.moment === moment) score += 20;
    if (recent.has(r.id) && !today.has(norm(r.name))) score -= 25;
    score -= 8 * Math.min(4, prefs.negatives[main] ?? 0);
    if (prefs.tooHard > 0 && (r.difficulty === 2 || r.minutes > 12)) score -= 6 * Math.min(3, prefs.tooHard);
    if (prefs.diet.length && reasons.length < 2) {
      reasons.push('Compatible avec ton choix ' + prefs.diet.map((d) => DIETS.find((x) => x.id === d)!.label.toLowerCase()).join(', '));
    }
    // déjà mangée aujourd'hui, ou déjà montrée (« D'autres idées ») : passe après les autres, même un favori
    if (today.has(norm(r.name))) score -= 1000;
    if (shown.has(r.id)) score -= 500;
    out.push({ recipe: r, meal, score, reasons: reasons.slice(0, 3), fits });
  }
  return out.sort((a, b) => b.score - a.score || a.recipe.minutes - b.recipe.minutes);
}

/**
 * Les n premières idées, variées : d'abord ni le même aliment principal ni le même féculent (pas trois plats au riz),
 * puis au moins un aliment principal différent, puis dans l'ordre. L'ordre du classement est gardé.
 */
export function pickVaried(list: Suggestion[], n: number): Suggestion[] {
  const out: Suggestion[] = [];
  const starchOf = (r: Recipe) => recipeFamilies(r).find((f) => STARCH.includes(f)) ?? '';
  const passes: ((s: Suggestion) => boolean)[] = [
    (s) => !out.some((o) => mainFamily(o.recipe) === mainFamily(s.recipe) || (!!starchOf(s.recipe) && starchOf(o.recipe) === starchOf(s.recipe))),
    (s) => !out.some((o) => mainFamily(o.recipe) === mainFamily(s.recipe)),
    () => true,
  ];
  for (const ok of passes) {
    for (const s of list) {
      if (out.length >= n) break;
      if (!out.includes(s) && ok(s)) out.push(s);
    }
  }
  return out.sort((a, b) => list.indexOf(a) - list.indexOf(b));
}

/** Sous-titre contextuel de « Qu'est-ce qu'on mange ? », fondé seulement sur l'heure et les données du jour. */
export function contextLine(hour: number, opts: { trainedToday?: boolean; remainingKcal: number; heroMinutes?: number }): string {
  if (opts.remainingKcal <= 0) return 'Encore faim ? Des idées légères et rassasiantes';
  const m = momentAt(hour);
  if (m === 'matin') return 'Une idée pour ton petit-déjeuner';
  if (opts.trainedToday && m === 'repas') return 'Un repas après ton entraînement';
  if (m === 'repas' && hour < 15) return opts.heroMinutes ? 'Ton déjeuner en ' + opts.heroMinutes + ' minutes' : 'Pour ton déjeuner';
  if (m === 'repas') return 'Trois idées pour ce soir';
  return 'Une collation selon tes envies';
}

/** Substitutions possibles pour un ingrédient, compatibles avec les allergies, le régime et les aliments refusés. */
export function safeSubstitutes(r: Recipe, index: number, prefs: Pick<RecipePrefs, 'allergies' | 'diet' | 'dislikes'>, subs: Subs = {}) {
  const ing = r.ingredients[index];
  return (SUBSTITUTES[ing.food] ?? []).filter((s) => {
    const next = { ...subs, [index]: s.food };
    const al = allergensOf(r, next);
    if (prefs.allergies.some((a) => al.includes(a))) return false;
    const diet = recipeDiet(r, next);
    if (prefs.diet.some((d) => !diet[d])) return false;
    return !familiesIn(s.food).some((f) => prefs.dislikes.includes(f));
  });
}
