/** Recettes faciles selon les goûts (src/coach/recipes.ts, src/data/recipes.ts). */
import { RECIPES } from '../src/data/recipes';
import { mainFamily, pickVaried, familiesIn, goalOf, journalTastes, momentAt, rankRecipes, recipeDiet, recipeNutrition, recipeToMeal, EMPTY_PREFS } from '../src/coach/recipes';
import { createCheck } from './helpers/check';

const t = createCheck();
const byId = (id: string) => RECIPES.find((r) => r.id === id)!;

// données : chaque ingrédient existe dans la base d'aliments, recettes vraiment faciles, identifiants uniques
t.ok(RECIPES.length >= 24, 'au moins 24 recettes');
t.ok(new Set(RECIPES.map((r) => r.id)).size === RECIPES.length, 'identifiants uniques');
for (const r of RECIPES) {
  const n = recipeNutrition(r); // lève une erreur si un aliment manque
  if (!(r.minutes <= 20 && r.ingredients.length <= 6 && r.steps.length >= 1)) throw new Error('recette pas facile : ' + r.id);
  if (!(n.kcal > 80 && n.kcal < 900)) throw new Error('calories hors bornes : ' + r.id + ' ' + n.kcal);
  // cohérence : les calories des macros (4/4/9) tombent à ±20 % des calories de la base
  const fromMacros = n.p * 4 + n.g * 4 + n.l * 9;
  if (Math.abs(fromMacros - n.kcal) / n.kcal > 0.2) throw new Error('macros incohérentes : ' + r.id + ' ' + fromMacros + ' vs ' + n.kcal);
}
t.ok(true, 'tous les ingrédients sont dans la base, ≤ 20 min, ≤ 6 ingrédients, macros cohérentes');
for (const m of ['matin', 'repas', 'collation'] as const) t.ok(RECIPES.filter((r) => r.moment === m).length >= 5, 'au moins 5 recettes « ' + m + ' »');

// calcul réel : bowl poulet = 150 g poulet (165) + 150 g riz (130) + 150 g brocolis (35) + 10 g soja (60) + 5 g huile (900)
t.equal(recipeNutrition(byId('bowl-poulet-riz')).kcal, Math.round(247.5 + 195 + 52.5 + 6 + 45), 'calories calculées depuis la base');
const meal = recipeToMeal(byId('bowl-poulet-riz'));
t.ok(meal.origin === 'average' && meal.items[0].startsWith('Blanc de poulet') && meal.score > 0, 'repas prêt pour le journal, estimation affichée comme telle');

// régimes déduits des aliments
t.ok(recipeDiet(byId('dahl-lentilles')).vegan, 'dahl végan');
t.ok(!recipeDiet(byId('omelette-epinards-feta')).vegan && recipeDiet(byId('omelette-epinards-feta')).vegetarien, 'omelette feta végétarienne, pas végane');
t.ok(!recipeDiet(byId('pizza-tortilla')).sansPorc, 'pizza au jambon : pas sans porc');
t.ok(!recipeDiet(byId('shake-fraises')).sansLactose, 'whey : pas sans lactose');
t.ok(recipeDiet(byId('pomme-cacahuete')).sansLactose && recipeDiet(byId('pomme-cacahuete')).vegan, 'beurre de cacahuète n’est pas un laitage');
t.ok(!recipeDiet(byId('fromage-blanc-miel-noix')).vegan, 'miel : pas végan');

// familles reconnues dans le texte libre du journal
t.ok(familiesIn('Poulet rôti et purée').includes('poulet') && familiesIn('Poulet rôti et purée').includes('patates'), 'poulet + purée reconnus');
t.ok(!familiesIn('Pomme de terre vapeur').includes('fruits'), 'pomme de terre n’est pas un fruit');
t.ok(familiesIn('Œufs brouillés').includes('oeufs'), 'œ et accents gérés');

// journal : les familles qui reviennent, 60 jours, sans la ligne de reprise
const now = Date.UTC(2026, 10, 27, 12);
const e = (id: string, daysAgo: number, name: string) => ({ id, at: now - daysAgo * 86_400_000, name, kcal: 500, p: 30, g: 50, l: 15, score: 70, items: [] });
const tastes = journalTastes({ a: [e('1', 1, 'Saumon riz'), e('2', 3, 'Sushi saumon'), e('3', 5, 'Thon salade'), e('4', 90, 'Poulet curry'), e('reprise-x', 1, 'Poulet')] }, now);
t.ok(tastes.poisson === 3 && !tastes.poulet, 'journal : poisson ×3, vieux poulet et reprise ignorés');

t.ok(goalOf(78, 92) === 'perte' && goalOf(80, 70) === 'prise' && goalOf(70, 70.2) === 'maintien', 'objectif comme le calcul calorique');
t.ok(momentAt(8) === 'matin' && momentAt(12) === 'repas' && momentAt(16) === 'collation' && momentAt(20) === 'repas' && momentAt(23) === 'collation', 'moment de la journée');

const base = { prefs: EMPTY_PREFS, tastes: {}, goal: 'maintien' as const, remainingKcal: 2000, hour: 12 };
t.ok(rankRecipes(base).length === RECIPES.length, 'sans goût déclaré : tout est proposé');

// filtres durs
const veg = rankRecipes({ ...base, prefs: { ...EMPTY_PREFS, diet: ['vegetarien'] } });
t.ok(veg.length > 0 && veg.every((s) => recipeDiet(s.recipe).vegetarien), 'végétarien : aucune viande ni poisson');
const noFish = rankRecipes({ ...base, prefs: { ...EMPTY_PREFS, dislikes: ['poisson'] } });
t.ok(!noFish.some((s) => s.recipe.id === 'saumon-patate-douce' || s.recipe.id === 'salade-thon-pois-chiches'), 'pas pour moi : poisson écarté');
t.ok(!rankRecipes({ ...base, prefs: { ...EMPTY_PREFS, hidden: ['wrap-dinde'] } }).some((s) => s.recipe.id === 'wrap-dinde'), 'recette écartée disparue');
t.ok(rankRecipes({ ...base, moment: 'collation' }).every((s) => s.recipe.moment === 'collation'), 'onglet collation');
const favs = rankRecipes({ ...base, favoritesOnly: true, prefs: { ...EMPTY_PREFS, favorites: ['chili-sin-carne'] } });
t.ok(favs.length === 1 && favs[0].reasons[0] === 'Dans tes favoris', 'favoris');

// goûts : ce qu'on aime passe devant, avec la raison
const likesChicken = rankRecipes({ ...base, prefs: { ...EMPTY_PREFS, likes: ['poulet'] } });
t.ok(likesChicken.slice(0, 2).every((s) => s.reasons.some((x) => x.includes('le poulet'))), 'j’aime le poulet : recettes au poulet en tête, raison donnée');
const habit = rankRecipes({ ...base, tastes });
t.ok(habit[0].reasons.some((x) => x.includes('revient souvent')), 'journal : poisson fréquent remonté');
t.ok(/saumon|thon|cabillaud/.test(habit[0].recipe.id), 'journal : une recette de poisson en tête (' + habit[0].recipe.id + ')');

// budget du jour et moment
const tight = rankRecipes({ ...base, remainingKcal: 300 });
t.ok(tight[0].fits && tight[0].meal.kcal <= 300, 'peu de calories restantes : une recette qui rentre en tête');
t.ok(tight.some((s) => !s.fits), 'les autres sont signalées « plus que tes calories restantes »');
t.ok(rankRecipes({ ...base, hour: 8 })[0].recipe.moment === 'matin', 'le matin : petit-déjeuner en tête');

// objectif perte : en tête, plus protéiné que la moyenne
const loss = rankRecipes({ ...base, goal: 'perte' });
const share = (s: (typeof loss)[number]) => (s.meal.p * 4) / s.meal.kcal;
const avg = loss.reduce((a, s) => a + share(s), 0) / loss.length;
t.ok(share(loss[0]) > avg, 'perte : la première recette est plus protéinée que la moyenne');

// varier : déjà mangée aujourd'hui, elle recule
const first = rankRecipes(base)[0];
const again = rankRecipes({ ...base, todayNames: [first.recipe.name] });
t.ok(again[0].recipe.id !== first.recipe.id, 'déjà au journal aujourd’hui : elle laisse la place');
const favEaten = rankRecipes({ ...base, prefs: { ...EMPTY_PREFS, favorites: ['bowl-poulet-riz'] }, todayNames: ['Bowl poulet, riz, brocolis'] });
t.ok(favEaten[0].recipe.id !== 'bowl-poulet-riz', 'même un favori ne revient pas en tête le jour où on l’a mangé');

// idées montrées ensemble : variées
const varied = pickVaried(habit, 3);
t.ok(varied.length === 3 && new Set(varied.map((s) => mainFamily(s.recipe))).size === 3, 'trois idées, trois aliments principaux différents');
t.ok(varied[0] === habit[0], 'la meilleure idée reste en tête');
t.ok(pickVaried(habit.slice(0, 2), 3).length === 2, 'moins de recettes que demandé : pas d’erreur');

console.log(t.count() + ' vérifications OK');
