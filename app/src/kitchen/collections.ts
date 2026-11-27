/**
 * Collections éditoriales et catégories. Chaque collection est une règle sur les données réelles des recettes ; une
 * collection qui ne contient pas au moins 3 recettes n'est pas montrée. Pas de collection « petit budget » : le
 * catalogue n'a pas de prix fiables par recette.
 */
import { RECIPES, type Recipe } from '@/data/recipes';
import { perServing } from './nutrition';
import { recipeDiet } from '@/coach/recipes';

export type Collection = { id: string; title: string; line: string; cover: string; test: (r: Recipe) => boolean };

const MED = new Set(['salade-quinoa-feta', 'salade-thon-pois-chiches', 'cabillaud-courgettes', 'omelette-epinards-feta', 'pates-tomate-thon', 'saumon-patate-douce']);
const WORLD = new Set(['dahl-lentilles', 'chili-sin-carne', 'crevettes-riz-poivron', 'boeuf-saute-riz', 'tofu-brocolis-quinoa', 'quesadilla-poulet']);
const STREET = new Set(['wrap-dinde', 'quesadilla-poulet', 'pizza-tortilla', 'bowl-poulet-riz']);

export const COLLECTIONS: Collection[] = [
  { id: 'express', title: 'La semaine express', line: '10 minutes ou moins', cover: 'skyr-fruits-rouges', test: (r) => r.minutes <= 10 },
  { id: 'protein', title: 'FITAIA Protein', line: '30 g de protéines et plus', cover: 'bowl-poulet-riz', test: (r) => perServing(r).p >= 30 },
  { id: 'breakfast', title: 'Breakfast Club', line: 'Pour bien commencer', cover: 'pancakes-banane', test: (r) => r.moment === 'matin' },
  { id: 'mediterranee', title: 'Méditerranée', line: 'Huile d’olive, citron, soleil', cover: 'salade-quinoa-feta', test: (r) => MED.has(r.id) },
  { id: 'monde', title: 'Saveurs du monde', line: 'Inde, Mexique, Asie', cover: 'dahl-lentilles', test: (r) => WORLD.has(r.id) },
  { id: 'street', title: 'Healthy Street Food', line: 'Le plaisir, en mieux', cover: 'quesadilla-poulet', test: (r) => STREET.has(r.id) },
  { id: 'simple', title: 'Sans prise de tête', line: '4 ingrédients au plus', cover: 'pomme-cacahuete', test: (r) => r.ingredients.length <= 4 },
];

export type Category = { id: string; label: string; test: (r: Recipe) => boolean };

export const CATEGORIES: Category[] = [
  { id: 'matin', label: 'Petit-déj', test: (r) => r.moment === 'matin' },
  { id: 'repas', label: 'Déjeuner, dîner', test: (r) => r.moment === 'repas' },
  { id: 'collation', label: 'Collations', test: (r) => r.moment === 'collation' },
  { id: 'proteine', label: 'Protéinées', test: (r) => perServing(r).p >= 25 },
  { id: 'vege', label: 'Végétariennes', test: (r) => recipeDiet(r).vegetarien },
  { id: 'express', label: 'Express', test: (r) => r.minutes <= 10 },
  { id: 'sans-cuisson', label: 'Sans cuisson', test: (r) => !!r.noCook },
  { id: 'etudiant', label: 'Étudiants', test: (r) => !!r.tags?.includes('etudiant') },
  { id: 'emporter', label: 'À emporter', test: (r) => !!r.tags?.includes('emporter') },
];

export function inCollection(c: Collection, recipes: Recipe[] = RECIPES): Recipe[] {
  return recipes.filter(c.test);
}

export function visibleCollections(recipes: Recipe[] = RECIPES): Collection[] {
  return COLLECTIONS.filter((c) => inCollection(c, recipes).length >= 3);
}
