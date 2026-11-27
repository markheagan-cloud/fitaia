/** Smart Kitchen : catalogue, nutrition (Ciqual), portions, substitutions, allergies, moteur, frigo, collections. */
import { RECIPES } from '../src/data/recipes';
import { LOCAL_FOODS } from '../src/data/foods';
import {
  EMPTY_PREFS, recipeFamilies, contextLine, exclusion, familiesIn, goalOf, journalTastes, mainFamily, momentAt, pickVaried, rankRecipes, recentRecipeIds,
  recipeDiet, recipeNutrition, recipeToMeal, safeSubstitutes,
} from '../src/coach/recipes';
import { FOOD_ALLERGENS } from '../src/kitchen/allergens';
import { SUBSTITUTES, allergensOf, fmtCount, perServing, recipeMeal, resolve, stepChanges, totalOf } from '../src/kitchen/nutrition';
import { fridgeChoices, fridgeRecipes, fridgeRecipesFor } from '../src/kitchen/fridge';
import { COLLECTIONS, CATEGORIES, inCollection, visibleCollections } from '../src/kitchen/collections';
import { createCheck } from './helpers/check';

const t = createCheck();
const byId = (id: string) => RECIPES.find((r) => r.id === id)!;
const FOOD = new Map(LOCAL_FOODS.map((f) => [f.name, f]));

// --- catalogue : faisable, cohérent, vérifié ---
t.ok(RECIPES.length === 27, '27 recettes');
t.ok(new Set(RECIPES.map((r) => r.id)).size === RECIPES.length, 'identifiants uniques');
for (const r of RECIPES) {
  if (!(r.minutes <= 20 && r.ingredients.length <= 6 && r.steps.length >= 1 && r.desc.length <= 60)) throw new Error('recette pas express : ' + r.id);
  for (const i of r.ingredients) {
    if (!FOOD.has(i.food)) throw new Error('aliment absent de la base : ' + i.food);
    if (!(i.food in FOOD_ALLERGENS)) throw new Error('allergènes non renseignés : ' + i.food);
  }
  for (const st of r.steps) for (const u of st.uses ?? []) if (!r.ingredients[u]) throw new Error('étape qui cite un ingrédient absent : ' + r.id);
  const used = new Set(r.steps.flatMap((s) => s.uses ?? []));
  r.ingredients.forEach((_, i) => { if (!used.has(i)) throw new Error('ingrédient jamais utilisé dans les étapes : ' + r.id + ' #' + i); });
  const n = perServing(r);
  if (!(n.kcal > 80 && n.kcal < 900)) throw new Error('calories hors bornes : ' + r.id + ' ' + n.kcal);
  const fromMacros = n.p * 4 + n.g * 4 + n.l * 9;
  if (Math.abs(fromMacros - n.kcal) / n.kcal > 0.2) throw new Error('macros incohérentes : ' + r.id + ' ' + fromMacros + ' vs ' + n.kcal);
}
t.ok(true, 'aliments en base, allergènes renseignés, ≤ 20 min, ≤ 6 ingrédients, chaque ingrédient utilisé dans une étape, macros cohérentes');
for (const subs of Object.entries(SUBSTITUTES)) for (const s of subs[1]) if (!FOOD.has(s.food) || !(s.food in FOOD_ALLERGENS)) throw new Error('substitut inconnu : ' + s.food);
t.ok(true, 'chaque substitut existe en base avec ses allergènes');
const ciq = RECIPES.flatMap((r) => r.ingredients.map((i) => FOOD.get(i.food)!)).filter((f) => !f.ciqual).map((f) => f.name);
t.equal([...new Set(ciq)].sort(), ['Skyr', 'Whey (poudre)', 'Yaourt grec 0 %'], 'tout vient de Ciqual 2025 sauf skyr, whey, yaourt grec 0 % (absents de Ciqual, signalés)');
t.equal(FOOD.get('Blanc de poulet grillé')!.per100, { kcal: 141, p: 30.1, g: 0, l: 2 }, 'poulet grillé = Ciqual 2025');

// calcul réel : bowl poulet = 150 g poulet (141) + 150 g riz (148) + 150 g brocolis (30) + 15 g soja (39,9) + 5 g huile (899)
t.equal(recipeNutrition(byId('bowl-poulet-riz')).kcal, Math.round(211.5 + 222 + 45 + 5.985 + 44.95), 'calories calculées depuis la base');
const meal = recipeToMeal(byId('bowl-poulet-riz'));
t.ok(meal.origin === 'average' && meal.items[0] === 'Blanc de poulet, 150 g' && meal.items[1] === 'Riz basmati, 150 g cuit (50 g cru)', 'repas : quantités lisibles, poids cru des féculents');

// --- portions ---
const p = byId('omelette-epinards-feta');
t.equal(resolve(p, 2)[0].qty, '4 œufs', '2 portions : 4 œufs');
t.equal(resolve(p, 0.5)[0].qty, '1 œuf', '½ portion : 1 œuf');
t.equal(resolve(byId('tartine-avocat-oeuf'), 1)[1].qty, '½ avocat', '½ avocat');
t.equal(resolve(byId('tartine-avocat-oeuf'), 3)[1].qty, '1½ avocats', '3 portions : 1½ avocats');
t.ok(fmtCount(0.25) === '¼' && fmtCount(1.5) === '1½' && fmtCount(2) === '2', 'fractions lisibles');
const one = totalOf(p, 1), four = totalOf(p, 4);
t.ok(Math.abs(four.kcal - one.kcal * 4) < 1e-6 && Math.abs(four.p - one.p * 4) < 1e-6, 'préparer 4 portions = 4 × une portion (aucune erreur de multiplication)');
const eaten = recipeMeal(p, 1.5);
t.ok(eaten.kcal === Math.round(one.kcal * 1.5) && eaten.name.endsWith('1½ portions'), 'manger 1½ portion : calories × 1,5, arrondies une seule fois');

// --- substitutions ---
const bowl = byId('bowl-poulet-riz');
const tofu = recipeMeal(bowl, 1, { 0: 'Tofu ferme' });
t.ok(tofu.kcal !== meal.kcal && tofu.items[0].startsWith('Tofu ferme'), 'poulet → tofu : valeurs recalculées');
t.ok(recipeDiet(bowl, { 0: 'Tofu ferme' }).vegetarien && !recipeDiet(bowl).vegetarien, 'avec tofu, le bowl devient végétarien');
t.ok(allergensOf(bowl, { 0: 'Tofu ferme' }).includes('soja'), 'tofu : allergène soja ajouté');
t.ok(!safeSubstitutes(bowl, 0, { ...EMPTY_PREFS, allergies: ['soja'] }).some((s) => s.food === 'Tofu ferme'), 'allergie soja : le tofu n’est jamais proposé en remplacement');
t.ok(!safeSubstitutes(byId('porridge-banane'), 1, { ...EMPTY_PREFS, allergies: ['fruitsCoque'] }).some((s) => s.food === 'Lait d’amande'), 'allergie fruits à coque : pas de boisson à l’amande');
t.ok(safeSubstitutes(byId('porridge-banane'), 1, { ...EMPTY_PREFS, diet: ['sansLactose'] }).length === 2, 'sans lactose : amande et soja proposés pour le lait');
t.equal(resolve(bowl, 1, { 3: 'sans' })[3].qty, 'sans', 'placard : on peut faire sans la sauce soja');
t.ok(resolve(bowl, 1, { 0: 'sans' })[0].g === 150, 'un ingrédient principal ne peut pas être retiré');

// --- régimes et allergènes déduits des aliments ---
t.ok(recipeDiet(byId('dahl-lentilles')).vegan, 'dahl végan');
t.ok(!recipeDiet(byId('omelette-epinards-feta')).vegan && recipeDiet(byId('omelette-epinards-feta')).vegetarien, 'omelette feta végétarienne, pas végane');
t.ok(!recipeDiet(byId('pizza-tortilla')).sansPorc, 'pizza au jambon : pas sans porc');
t.ok(!recipeDiet(byId('shake-fraises')).sansLactose, 'whey : pas sans lactose');
t.ok(recipeDiet(byId('pomme-cacahuete')).sansLactose && recipeDiet(byId('pomme-cacahuete')).vegan, 'beurre de cacahuète n’est pas un laitage');
t.ok(!recipeDiet(byId('fromage-blanc-miel-noix')).vegan, 'miel : pas végan');
t.ok(allergensOf(byId('bowl-poulet-riz')).includes('gluten'), 'sauce soja : gluten (blé) signalé');
t.ok(allergensOf(byId('pomme-cacahuete')).includes('arachide'), 'arachide signalée');

// --- journal, objectif, moment ---
t.ok(familiesIn('Poulet rôti et purée').includes('poulet') && familiesIn('Poulet rôti et purée').includes('patates'), 'poulet + purée reconnus');
t.ok(!familiesIn('Pomme de terre vapeur').includes('fruits'), 'pomme de terre n’est pas un fruit');
const now = Date.UTC(2026, 10, 27, 12);
const e = (id: string, daysAgo: number, name: string) => ({ id, at: now - daysAgo * 86_400_000, name, kcal: 500, p: 30, g: 50, l: 15, score: 70, items: [] });
const tastes = journalTastes({ a: [e('1', 1, 'Saumon riz'), e('2', 3, 'Sushi saumon'), e('3', 5, 'Thon salade'), e('4', 90, 'Poulet curry'), e('reprise-x', 1, 'Poulet')] }, now);
t.ok(tastes.poisson === 3 && !tastes.poulet, 'journal : poisson ×3, vieux poulet et reprise ignorés');
t.equal(recentRecipeIds({ a: [e('x', 1, 'Wrap dinde crudités · ½ portion'), e('y', 5, 'Dahl express de lentilles')] }, now), ['wrap-dinde'], 'recettes des 3 derniers jours reconnues, même en ½ portion');
t.ok(goalOf(78, 92) === 'perte' && goalOf(80, 70) === 'prise' && goalOf(70, 70.2) === 'maintien', 'objectif comme le calcul calorique');
t.ok(momentAt(8) === 'matin' && momentAt(12) === 'repas' && momentAt(16) === 'collation' && momentAt(20) === 'repas' && momentAt(23) === 'collation', 'moment de la journée');

const base = { prefs: EMPTY_PREFS, tastes: {}, goal: 'maintien' as const, remainingKcal: 2000, hour: 12, now };
t.ok(rankRecipes(base).length === RECIPES.length, 'sans goût déclaré : tout est proposé');

// --- filtres obligatoires ---
for (const a of ['gluten', 'lait', 'oeufs', 'arachide', 'fruitsCoque', 'soja', 'poisson', 'crustaces'] as const) {
  const list = rankRecipes({ ...base, prefs: { ...EMPTY_PREFS, allergies: [a] } });
  if (list.some((s) => allergensOf(s.recipe).includes(a))) throw new Error('allergie non respectée : ' + a);
  if (!list.length) throw new Error('plus aucune recette pour ' + a);
}
t.ok(true, 'allergies : aucune recette contenant l’allergène, pour chacun des 8 allergènes du catalogue');
const veg = rankRecipes({ ...base, prefs: { ...EMPTY_PREFS, diet: ['vegetarien'] } });
t.ok(veg.length > 0 && veg.every((s) => recipeDiet(s.recipe).vegetarien), 'végétarien : aucune viande ni poisson');
t.ok(!rankRecipes({ ...base, prefs: { ...EMPTY_PREFS, dislikes: ['poisson'] } }).some((s) => /saumon|thon|cabillaud/.test(s.recipe.id)), 'pas pour moi : poisson écarté');
t.ok(!rankRecipes({ ...base, prefs: { ...EMPTY_PREFS, hidden: ['wrap-dinde'] } }).some((s) => s.recipe.id === 'wrap-dinde'), 'recette écartée disparue');
t.ok(exclusion(byId('wrap-dinde'), { ...EMPTY_PREFS, snoozed: { 'wrap-dinde': now + 1000 } }, now) === 'mise de côté', 'mise de côté jusqu’à une date');
t.ok(exclusion(byId('wrap-dinde'), { ...EMPTY_PREFS, snoozed: { 'wrap-dinde': now - 1000 } }, now) === null, '« pas envie aujourd’hui » : elle revient ensuite');
t.ok(rankRecipes({ ...base, maxMinutes: 10 }).every((s) => s.recipe.minutes <= 10), 'temps disponible : 10 minutes au plus');
t.ok(rankRecipes({ ...base, maxMinutes: 10 })[0].reasons.some((x) => x.startsWith('Prête en')), 'raison « Prête en X minutes »');
t.ok(rankRecipes({ ...base, moment: 'collation' }).every((s) => s.recipe.moment === 'collation'), 'onglet collation');
const favs = rankRecipes({ ...base, favoritesOnly: true, prefs: { ...EMPTY_PREFS, favorites: ['chili-sin-carne'] } });
t.ok(favs.length === 1 && favs[0].reasons[0] === 'Dans tes favoris', 'favoris');

// --- goûts et apprentissage ---
const likesChicken = rankRecipes({ ...base, prefs: { ...EMPTY_PREFS, likes: ['poulet'] } });
t.ok(likesChicken.slice(0, 2).every((s) => s.reasons.some((x) => x.includes('le poulet'))), 'j’aime le poulet : recettes au poulet en tête, raison donnée');
const habit = rankRecipes({ ...base, tastes });
t.ok(habit[0].reasons.some((x) => x.includes('revient souvent')) && /saumon|thon|cabillaud/.test(habit[0].recipe.id), 'journal : poisson fréquent remonté, raison donnée');
const neg = rankRecipes({ ...base, tastes, prefs: { ...EMPTY_PREFS, negatives: { poisson: 4 } } });
t.ok(!/saumon|thon|cabillaud/.test(neg[0].recipe.id), '« je préfère autre chose » répété : le poisson recule');
const hard = rankRecipes({ ...base, prefs: { ...EMPTY_PREFS, tooHard: 3 } });
t.ok(hard.slice(0, 5).every((s) => s.recipe.difficulty === 1 && s.recipe.minutes <= 12), '« trop compliqué » : les recettes simples passent devant');
const favRel = rankRecipes({ ...base, prefs: { ...EMPTY_PREFS, favorites: ['bowl-poulet-riz'] } });
const qi = favRel.findIndex((s) => s.recipe.id === 'quesadilla-poulet');
t.ok(qi >= 0 && qi < rankRecipes(base).findIndex((s) => s.recipe.id === 'quesadilla-poulet'), 'un favori au poulet fait remonter les autres recettes au poulet');
t.ok(pickVaried(favRel, 3).map((s) => mainFamily(s.recipe)).length === 3 && new Set(pickVaried(favRel, 3).map((s) => mainFamily(s.recipe))).size === 3, '… sans enlever la diversité');

// --- budget, moment, entraînement : jamais de blocage ---
const tight = rankRecipes({ ...base, remainingKcal: 300 });
t.ok(tight[0].fits && tight[0].meal.kcal <= 300, 'peu de calories restantes : une recette qui rentre en tête');
const over = rankRecipes({ ...base, remainingKcal: -200 });
t.ok(over.length === RECIPES.length && over[0].meal.kcal <= 350, 'objectif dépassé : tout reste accessible, du léger en tête');
t.ok(rankRecipes({ ...base, hour: 8 })[0].recipe.moment === 'matin', 'le matin : petit-déjeuner en tête');
const trained = rankRecipes({ ...base, trainedToday: true });
t.ok(trained[0].reasons.some((x) => x.includes('après ton entraînement')), 'entraînement enregistré : raison donnée');
t.ok(!rankRecipes(base).some((s) => s.reasons.some((x) => x.includes('entraînement'))), 'sans activité enregistrée : jamais d’« après ton entraînement »');
const loss = rankRecipes({ ...base, goal: 'perte' });
const share = (s: (typeof loss)[number]) => (s.meal.p * 4) / s.meal.kcal;
t.ok(share(loss[0]) > loss.reduce((a, s) => a + share(s), 0) / loss.length, 'perte : la première recette est plus protéinée que la moyenne');

// --- variété, « D'autres idées » ---
const first = rankRecipes(base)[0];
t.ok(rankRecipes({ ...base, todayNames: [first.recipe.name] })[0].recipe.id !== first.recipe.id, 'déjà mangée aujourd’hui : elle laisse la place');
for (const h of [12, 19]) {
  const three = pickVaried(rankRecipes({ ...base, hour: h }), 3);
  const starch = three.map((s) => recipeFamilies(s.recipe).find((f) => ['riz', 'pates', 'patates'].includes(f))).filter(Boolean);
  t.ok(new Set(starch).size === starch.length, 'idées à ' + h + ' h : jamais deux fois le même féculent (' + three.map((s) => s.recipe.id).join(', ') + ')');
}
const shown = pickVaried(rankRecipes(base), 3).map((s) => s.recipe.id);
const next = pickVaried(rankRecipes({ ...base, shown }), 3).map((s) => s.recipe.id);
t.ok(next.every((id) => !shown.includes(id)), '« D’autres idées » : trois nouvelles recettes, aucune répétée');
const recent = rankRecipes({ ...base, recentIds: [first.recipe.id] });
t.ok(recent.findIndex((s) => s.recipe.id === first.recipe.id) > 0, 'mangée ces 3 derniers jours : elle recule');

t.equal(contextLine(8, { remainingKcal: 1000 }), 'Une idée pour ton petit-déjeuner', 'titre du matin');
t.equal(contextLine(12, { remainingKcal: 1000, heroMinutes: 15 }), 'Ton déjeuner en 15 minutes', 'titre du midi');
t.equal(contextLine(12, { remainingKcal: 1000, trainedToday: true }), 'Un repas après ton entraînement', 'titre après entraînement (seulement s’il est enregistré)');
t.equal(contextLine(19, { remainingKcal: 1000 }), 'Trois idées pour ce soir', 'titre du soir');
t.equal(contextLine(19, { remainingKcal: -10 }), 'Encore faim ? Des idées légères et rassasiantes', 'objectif dépassé : pas de culpabilité');

// --- étapes et remplacements ---
t.equal(stepChanges(bowl, bowl.steps[0].uses, { 1: 'Pâtes cuites' }).join(), 'pâtes au lieu de riz basmati', 'étape : le remplacement est dit là où l’ingrédient sert');
t.equal(resolve(bowl, 1, { 1: 'Pâtes cuites' })[1].qty, '150 g cuit', 'féculent remplacé : poids cuit indiqué');

// --- frigo ---
t.ok(fridgeChoices().length >= 30 && !fridgeChoices().some((c) => c.food === 'Huile d’olive'), 'frigo : aliments des recettes, sans le placard');
const fr = fridgeRecipes(['Œuf entier', 'Pâtes cuites', 'Tomate', 'Blanc de poulet grillé', 'Brocolis cuits']);
t.ok(fr.ready.some((m) => m.recipe.id === 'bowl-poulet-riz' && m.subs[1] === 'Pâtes cuites'), 'frigo : bowl faisable avec des pâtes à la place du riz');
t.ok(fr.one.every((m) => m.missing.length === 1) && fr.two.every((m) => m.missing.length === 2), 'frigo : 1 et 2 ingrédients manquants bien séparés');
t.ok(fridgeRecipes([]).ready.length === 0, 'frigo vide : rien d’imposé');
const frG = fridgeRecipesFor(['Œuf entier', 'Pâtes cuites', 'Tomate', 'Blanc de poulet grillé', 'Brocolis cuits'], { ...EMPTY_PREFS, allergies: ['gluten'] });
const frAll = [...frG.ready, ...frG.one, ...frG.two];
t.ok(frAll.every((m) => !allergensOf(m.recipe, m.subs).includes('gluten')), 'frigo + allergie gluten : aucune recette ni remplacement avec gluten');
t.ok(!frAll.some((m) => Object.values(m.subs).includes('Pâtes cuites')), 'frigo + allergie gluten : les pâtes du frigo ne remplacent jamais le riz');
const frV = fridgeRecipesFor(['Blanc de poulet grillé', 'Riz basmati cuit', 'Brocolis cuits'], { ...EMPTY_PREFS, diet: ['vegetarien'] });
t.ok([...frV.ready, ...frV.one, ...frV.two].every((m) => !/poulet/i.test(m.recipe.name)), 'frigo + végétarien : pas de recette au poulet');

// --- collections et catégories ---
t.ok(visibleCollections().length === COLLECTIONS.length && COLLECTIONS.every((c) => inCollection(c).length >= 3), 'chaque collection a au moins 3 vraies recettes');
t.ok(COLLECTIONS.every((c) => !!byId(c.cover) && c.test(byId(c.cover))), 'la couverture d’une collection est une de ses recettes');
t.ok(CATEGORIES.every((c) => RECIPES.some(c.test)), 'chaque catégorie contient des recettes');

// --- performance : le classement complet doit rester instantané ---
{
  const t0 = performance.now();
  for (let i = 0; i < 500; i++) pickVaried(rankRecipes({ ...base, shown: [] }), 3);
  const ms = (performance.now() - t0) / 500;
  t.ok(ms < 5, 'classement des ' + RECIPES.length + ' recettes en ' + ms.toFixed(2) + ' ms (< 5 ms)');
  console.log('  perf : classement ' + ms.toFixed(2) + ' ms par appel');
}

console.log(t.count() + ' vérifications OK');
