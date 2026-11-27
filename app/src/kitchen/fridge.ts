/**
 * « Dans mon frigo » : ce qu'on a déjà → recettes faisables tout de suite, ou avec 1 ou 2 ingrédients en plus.
 * Le placard (huile, citron, sauce soja) n'est jamais compté comme manquant. Une substitution validée compte comme
 * « j'ai » (ex. : j'ai des pâtes, la recette veut du riz) et la recette est alors proposée avec ce remplacement.
 */
import { RECIPES, type Recipe } from '@/data/recipes';
import { SUBSTITUTES, type Subs } from './nutrition';
import { exclusion, safeSubstitutes, type RecipePrefs } from '@/coach/recipes';

export type FridgeMatch = { recipe: Recipe; missing: string[]; subs: Subs };

/** Aliments proposés dans le sélecteur du frigo : ceux des recettes (hors placard), avec un nom court. */
export function fridgeChoices(recipes: Recipe[] = RECIPES): { food: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const r of recipes) for (const i of r.ingredients) if (!i.pantry && !seen.has(i.food)) seen.set(i.food, shortName(i.food));
  return [...seen.entries()].map(([food, name]) => ({ food, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** « Blanc de poulet grillé » → « Poulet », « Riz basmati cuit » → « Riz basmati ». */
export function shortName(food: string): string {
  const special: Record<string, string> = {
    'Blanc de poulet grillé': 'Poulet', 'Escalope de dinde': 'Dinde', 'Bœuf (rumsteck)': 'Bœuf', 'Steak haché 5 %': 'Steak haché',
    'Thon en boîte au naturel': 'Thon en boîte', 'Œuf entier': 'Œufs', 'Jambon blanc': 'Jambon', 'Semoule / couscous cuit': 'Semoule',
    'Tomates concassées (conserve)': 'Tomates concassées', 'Whey (poudre)': 'Whey', 'Lait d’amande': 'Boisson à l’amande',
    'Pomme de terre vapeur': 'Pommes de terre', 'Fromage blanc 3 %': 'Fromage blanc', 'Yaourt grec 0 %': 'Yaourt grec',
  };
  return special[food] ?? food.replace(/ (cuits?|cuites?|cuit)$/i, '').replace(/ \(.*\)$/, '');
}

export function fridgeMatch(r: Recipe, have: Set<string>): FridgeMatch {
  const missing: string[] = [];
  const subs: Subs = {};
  r.ingredients.forEach((ing, i) => {
    if (ing.pantry || have.has(ing.food)) return;
    const alt = (SUBSTITUTES[ing.food] ?? []).find((s) => have.has(s.food));
    if (alt) subs[i] = alt.food;
    else missing.push(ing.name);
  });
  return { recipe: r, missing, subs };
}

/** Recettes classées : 0 manquant d'abord, puis 1, puis 2 (au-delà : pas montrées). Rien coché : liste vide. */
export function fridgeRecipes(fridge: string[], recipes: Recipe[] = RECIPES): { ready: FridgeMatch[]; one: FridgeMatch[]; two: FridgeMatch[] } {
  const have = new Set(fridge);
  const out = { ready: [] as FridgeMatch[], one: [] as FridgeMatch[], two: [] as FridgeMatch[] };
  if (!have.size) return out;
  for (const r of recipes) {
    const m = fridgeMatch(r, have);
    const used = r.ingredients.filter((i) => !i.pantry).length - m.missing.length;
    if (used === 0) continue; // rien de mon frigo dedans : pas pertinent
    if (m.missing.length === 0) out.ready.push(m);
    else if (m.missing.length === 1) out.one.push(m);
    else if (m.missing.length === 2) out.two.push(m);
  }
  return out;
}

/**
 * Comme fridgeRecipes, mais seulement les recettes permises (allergies, régime, aliments refusés, mises de côté) ; une
 * substitution par un aliment du frigo qui toucherait une allergie ou le régime est refusée : la recette est alors
 * gardée sans ce remplacement (l'ingrédient compte comme manquant) ou écartée si elle n'est pas permise.
 */
export function fridgeRecipesFor(fridge: string[], prefs: RecipePrefs, now = Date.now(), recipes: Recipe[] = RECIPES) {
  const allowed = recipes.filter((r) => !exclusion(r, prefs, now));
  const res = fridgeRecipes(fridge, allowed);
  const safe = (m: FridgeMatch): FridgeMatch => {
    const subs: Subs = {};
    const missing = [...m.missing];
    for (const [k, food] of Object.entries(m.subs)) {
      const i = Number(k);
      if (safeSubstitutes(m.recipe, i, prefs).some((s) => s.food === food)) subs[i] = food;
      else missing.push(m.recipe.ingredients[i].name);
    }
    return { recipe: m.recipe, missing, subs };
  };
  const all = [...res.ready, ...res.one, ...res.two].map(safe);
  return {
    ready: all.filter((m) => m.missing.length === 0),
    one: all.filter((m) => m.missing.length === 1),
    two: all.filter((m) => m.missing.length === 2),
  };
}
