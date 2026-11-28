/**
 * Catalogue des recettes FITAIA (express : 20 minutes au plus, 6 ingrédients au plus). Données seulement : calories,
 * macros, allergènes, régimes, portions et substitutions sont CALCULÉS depuis la base d'aliments (src/data/foods.ts,
 * valeurs Ciqual 2025 quand l'aliment y figure) par src/kitchen/. Rien n'est écrit à la main.
 *
 * Une recette = une portion de base. Poids en grammes, cuits pour les féculents (`cru` donne le rapport cuit/cru pour
 * afficher le poids à peser). `n` + `unit` : quantité lisible (2 œufs, 1 tortilla) ; `pantry` : placard (huile, citron,
 * sauce soja), jamais compté comme « ingrédient manquant ». Sel, poivre, herbes et épices ne sont pas comptés.
 * Étapes : `uses` = ingrédients utilisés (index), `timer` = minuteur proposé en secondes.
 *
 * Pour agrandir le catalogue (100, 250…) : ajouter des entrées ici ; les tests (tests/recipes.test.ts) refusent une
 * recette dont un aliment manque, qui dépasse 20 min ou 6 ingrédients, ou dont les macros sont incohérentes.
 */
export type RecipeMoment = 'matin' | 'repas' | 'collation';
export type RecipeTag = 'emporter' | 'etudiant';

export type RecipeIngredient = {
  /** Nom exact dans LOCAL_FOODS. */
  food: string;
  /** Grammes pour une portion (cuits pour les féculents). */
  g: number;
  /** Nom affiché. */
  name: string;
  n?: number;
  unit?: [singulier: string, pluriel: string];
  /** Rapport poids cuit / poids cru (riz ≈ 3) : affiche aussi le poids cru à peser. */
  cru?: number;
  pantry?: boolean;
};

export type RecipeStep = { t: string; uses?: number[]; timer?: number };

export type Recipe = {
  id: string;
  name: string;
  /** Une phrase, courte. */
  desc: string;
  moment: RecipeMoment;
  minutes: number;
  difficulty: 1 | 2;
  noCook?: boolean;
  tags?: RecipeTag[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
};

export const MOMENT_LABEL: Record<RecipeMoment, string> = { matin: 'Petit-déjeuner', repas: 'Repas', collation: 'Collation' };
export const DIFFICULTY_LABEL: Record<1 | 2, string> = { 1: 'Très facile', 2: 'Facile' };

const OEUF: [string, string] = ['œuf', 'œufs'];
const TORTILLA: [string, string] = ['tortilla', 'tortillas'];
const TRANCHE: [string, string] = ['tranche', 'tranches'];
const CS: [string, string] = ['c. à soupe', 'c. à soupe'];
const CC: [string, string] = ['c. à café', 'c. à café'];
const PIECE = (s: string, p = s + 's'): [string, string] => [s, p];

const huile = (g = 5): RecipeIngredient => ({ food: 'Huile d’olive', g, name: 'huile d’olive', n: g / 5, unit: CC, pantry: true });
const citron = (g = 10): RecipeIngredient => ({ food: 'Jus de citron', g, name: 'jus de citron', n: g / 5, unit: CC, pantry: true });
const soja = (): RecipeIngredient => ({ food: 'Sauce soja', g: 15, name: 'sauce soja', n: 1, unit: CS, pantry: true });

export const RECIPES: Recipe[] = [
  // --- Petit-déjeuner ---
  {
    id: 'porridge-banane', name: 'Porridge banane cannelle', desc: 'Crémeux, chaud, prêt avant le café.', moment: 'matin', minutes: 8, difficulty: 1,
    ingredients: [
      { food: 'Flocons d’avoine', g: 50, name: 'flocons d’avoine' },
      { food: 'Lait demi-écrémé', g: 200, name: 'lait demi-écrémé' },
      { food: 'Banane', g: 120, name: 'banane', n: 1, unit: PIECE('banane') },
    ],
    steps: [
      { t: 'Verse le lait et les flocons dans une casserole.', uses: [0, 1] },
      { t: 'Feu doux 4 minutes, en remuant.', timer: 240 },
      { t: 'Coupe la banane en rondelles par-dessus, une pincée de cannelle.', uses: [2] },
    ],
  },
  {
    id: 'skyr-fruits-rouges', name: 'Skyr fruits rouges et amandes', desc: 'Frais, croquant, sans rien allumer.', moment: 'matin', minutes: 3, difficulty: 1, noCook: true, tags: ['emporter'],
    ingredients: [
      { food: 'Skyr', g: 150, name: 'skyr' },
      { food: 'Myrtilles', g: 80, name: 'myrtilles' },
      { food: 'Fraises', g: 80, name: 'fraises' },
      { food: 'Amandes', g: 15, name: 'amandes', n: 1, unit: PIECE('poignée') },
    ],
    steps: [
      { t: 'Verse le skyr dans un bol.', uses: [0] },
      { t: 'Ajoute les fruits, frais ou surgelés.', uses: [1, 2] },
      { t: 'Concasse les amandes par-dessus.', uses: [3] },
    ],
  },
  {
    id: 'omelette-epinards-feta', name: 'Omelette épinards feta', desc: 'Salée, fondante, pleine de protéines.', moment: 'matin', minutes: 10, difficulty: 2,
    ingredients: [
      { food: 'Œuf entier', g: 110, name: 'œufs', n: 2, unit: OEUF },
      { food: 'Épinards cuits', g: 100, name: 'épinards (surgelés ou frais)' },
      { food: 'Feta', g: 30, name: 'feta' },
      huile(),
    ],
    steps: [
      { t: 'Chauffe l’huile, fais tomber les épinards.', uses: [3, 1], timer: 120 },
      { t: 'Bats les œufs, verse-les, émiette la feta.', uses: [0, 2] },
      { t: 'Laisse prendre à feu moyen, puis plie en deux.', timer: 180 },
    ],
  },
  {
    id: 'tartine-avocat-oeuf', name: 'Tartines avocat et œuf', desc: 'Le grand classique, en dix minutes.', moment: 'matin', minutes: 10, difficulty: 1,
    ingredients: [
      { food: 'Pain complet', g: 60, name: 'pain complet', n: 2, unit: TRANCHE },
      { food: 'Avocat', g: 70, name: 'avocat', n: 0.5, unit: PIECE('avocat') },
      { food: 'Œuf entier', g: 55, name: 'œuf', n: 1, unit: OEUF },
      citron(5),
    ],
    steps: [
      { t: 'Plonge l’œuf dans l’eau bouillante.', uses: [2], timer: 420 },
      { t: 'Écrase l’avocat avec le citron, sel et poivre.', uses: [1, 3] },
      { t: 'Toaste le pain, tartine, pose l’œuf coupé en deux.', uses: [0] },
    ],
  },
  {
    id: 'overnight-oats-mangue', name: 'Flocons de la veille, chia et mangue', desc: 'Préparé le soir, prêt au réveil.', moment: 'matin', minutes: 5, difficulty: 1, noCook: true, tags: ['emporter', 'etudiant'],
    ingredients: [
      { food: 'Flocons d’avoine', g: 40, name: 'flocons d’avoine' },
      { food: 'Lait d’amande', g: 150, name: 'boisson à l’amande' },
      { food: 'Graines de chia', g: 10, name: 'graines de chia', n: 1, unit: CS },
      { food: 'Mangue', g: 80, name: 'mangue en dés' },
    ],
    steps: [
      { t: 'Le soir : mélange flocons, chia et boisson à l’amande dans un pot.', uses: [0, 1, 2] },
      { t: 'Une nuit au frigo.' },
      { t: 'Le matin : ajoute la mangue.', uses: [3] },
    ],
  },
  {
    id: 'pancakes-banane', name: 'Pancakes banane', desc: 'Trois ingrédients, zéro sucre ajouté.', moment: 'matin', minutes: 15, difficulty: 2,
    ingredients: [
      { food: 'Banane', g: 120, name: 'banane bien mûre', n: 1, unit: PIECE('banane') },
      { food: 'Œuf entier', g: 110, name: 'œufs', n: 2, unit: OEUF },
      { food: 'Flocons d’avoine', g: 30, name: 'flocons d’avoine' },
      huile(3),
    ],
    steps: [
      { t: 'Écrase la banane, mélange avec les œufs et les flocons.', uses: [0, 1, 2] },
      { t: 'Huile légèrement une poêle chaude, verse de petites louches.', uses: [3] },
      { t: 'Deux minutes par face.', timer: 120 },
    ],
  },
  // --- Repas ---
  {
    id: 'bowl-poulet-riz', name: 'Bowl poulet, riz, brocolis', desc: 'Le bol protéiné qui cale pour l’après-midi.', moment: 'repas', minutes: 20, difficulty: 1, tags: ['emporter'],
    ingredients: [
      { food: 'Blanc de poulet grillé', g: 150, name: 'blanc de poulet' },
      { food: 'Riz basmati cuit', g: 150, name: 'riz basmati', cru: 3 },
      { food: 'Brocolis cuits', g: 150, name: 'brocolis' },
      soja(),
      huile(),
    ],
    steps: [
      { t: 'Lance le riz dans l’eau bouillante.', uses: [1], timer: 600 },
      { t: 'Coupe le poulet en morceaux et saisis-le dans l’huile.', uses: [0, 4], timer: 480 },
      { t: 'Brocolis à la vapeur ou au micro-ondes.', uses: [2], timer: 300 },
      { t: 'Assemble dans un bol, arrose de sauce soja.', uses: [3] },
    ],
  },
  {
    id: 'wrap-dinde', name: 'Wrap dinde crudités', desc: 'Roulé serré, il se mange partout.', moment: 'repas', minutes: 10, difficulty: 1, tags: ['emporter', 'etudiant'],
    ingredients: [
      { food: 'Tortilla de blé', g: 60, name: 'grande tortilla', n: 1, unit: TORTILLA },
      { food: 'Escalope de dinde', g: 100, name: 'escalope de dinde' },
      { food: 'Salade verte', g: 30, name: 'salade' },
      { food: 'Tomate', g: 60, name: 'tomate', n: 0.5, unit: PIECE('tomate') },
      { food: 'Fromage blanc 3 %', g: 30, name: 'fromage blanc', n: 2, unit: CS },
    ],
    steps: [
      { t: 'Poêle la dinde coupée en lanières.', uses: [1], timer: 360 },
      { t: 'Étale le fromage blanc sur la tortilla, sel, poivre.', uses: [0, 4] },
      { t: 'Ajoute salade, tomate et dinde, roule bien serré.', uses: [2, 3] },
    ],
  },
  {
    id: 'salade-thon-pois-chiches', name: 'Salade thon pois chiches', desc: 'Que des boîtes et du frais, rien à cuire.', moment: 'repas', minutes: 10, difficulty: 1, noCook: true, tags: ['emporter', 'etudiant'],
    ingredients: [
      { food: 'Thon en boîte au naturel', g: 90, name: 'thon au naturel', n: 1, unit: ['petite boîte', 'petites boîtes'] },
      { food: 'Pois chiches cuits', g: 120, name: 'pois chiches (conserve)' },
      { food: 'Tomate', g: 100, name: 'tomate', n: 1, unit: PIECE('tomate') },
      { food: 'Concombre', g: 100, name: 'concombre' },
      huile(10),
      citron(10),
    ],
    steps: [
      { t: 'Rince et égoutte les pois chiches.', uses: [1] },
      { t: 'Coupe tomate et concombre en dés.', uses: [2, 3] },
      { t: 'Mélange avec le thon émietté, l’huile et le citron.', uses: [0, 4, 5] },
    ],
  },
  {
    id: 'pates-tomate-thon', name: 'Pâtes complètes tomate thon', desc: 'Une sauce minute, un vrai plat.', moment: 'repas', minutes: 15, difficulty: 1, tags: ['etudiant'],
    ingredients: [
      { food: 'Pâtes complètes cuites', g: 180, name: 'pâtes complètes', cru: 2.5 },
      { food: 'Tomates concassées (conserve)', g: 150, name: 'tomates concassées' },
      { food: 'Thon en boîte au naturel', g: 90, name: 'thon au naturel', n: 1, unit: ['petite boîte', 'petites boîtes'] },
      { food: 'Oignon', g: 30, name: 'oignon', n: 0.25, unit: PIECE('oignon') },
      huile(),
    ],
    steps: [
      { t: 'Lance les pâtes dans l’eau bouillante salée.', uses: [0], timer: 600 },
      { t: 'Fais revenir l’oignon émincé dans l’huile.', uses: [3, 4], timer: 120 },
      { t: 'Ajoute les tomates et laisse mijoter.', uses: [1], timer: 480 },
      { t: 'Hors du feu, ajoute le thon et mélange aux pâtes.', uses: [2] },
    ],
  },
  {
    id: 'saumon-patate-douce', name: 'Saumon, patate douce, haricots verts', desc: 'Doré, fondant, coloré.', moment: 'repas', minutes: 20, difficulty: 2,
    ingredients: [
      { food: 'Saumon cuit', g: 120, name: 'pavé de saumon', n: 1, unit: PIECE('pavé') },
      { food: 'Patate douce cuite', g: 200, name: 'patate douce' },
      { food: 'Haricots verts cuits', g: 150, name: 'haricots verts' },
      citron(10),
    ],
    steps: [
      { t: 'Coupe la patate douce en cubes, micro-ondes couverte.', uses: [1], timer: 480 },
      { t: 'Saumon côté peau dans une poêle chaude, sans matière grasse.', uses: [0], timer: 240 },
      { t: 'Retourne le saumon.', timer: 180 },
      { t: 'Haricots verts à la vapeur, citron sur le tout.', uses: [2, 3], timer: 300 },
    ],
  },
  {
    id: 'dahl-lentilles', name: 'Dahl express de lentilles', desc: 'Épicé, réconfortant, 100 % végétal.', moment: 'repas', minutes: 20, difficulty: 1, tags: ['etudiant'],
    ingredients: [
      { food: 'Lentilles cuites', g: 200, name: 'lentilles (conserve)' },
      { food: 'Tomates concassées (conserve)', g: 100, name: 'tomates concassées' },
      { food: 'Oignon', g: 50, name: 'oignon', n: 0.5, unit: PIECE('oignon') },
      { food: 'Riz basmati cuit', g: 100, name: 'riz basmati', cru: 3 },
      huile(),
    ],
    steps: [
      { t: 'Lance le riz.', uses: [3], timer: 600 },
      { t: 'Oignon émincé dans l’huile avec curry et cumin.', uses: [2, 4], timer: 180 },
      { t: 'Ajoute lentilles et tomates, feu doux.', uses: [0, 1], timer: 600 },
    ],
  },
  {
    id: 'chili-sin-carne', name: 'Chili sin carne', desc: 'Le chili sans viande qui ne manque de rien.', moment: 'repas', minutes: 20, difficulty: 2, tags: ['emporter'],
    ingredients: [
      { food: 'Haricots rouges cuits', g: 150, name: 'haricots rouges (conserve)' },
      { food: 'Maïs doux', g: 60, name: 'maïs' },
      { food: 'Tomates concassées (conserve)', g: 150, name: 'tomates concassées' },
      { food: 'Poivron', g: 80, name: 'poivron', n: 0.5, unit: PIECE('poivron') },
      { food: 'Riz complet cuit', g: 120, name: 'riz complet', cru: 2.8 },
      huile(),
    ],
    steps: [
      { t: 'Lance le riz complet.', uses: [4], timer: 900 },
      { t: 'Poivron en dés dans l’huile, avec paprika et cumin.', uses: [3, 5], timer: 240 },
      { t: 'Ajoute haricots rincés, maïs et tomates.', uses: [0, 1, 2], timer: 600 },
    ],
  },
  {
    id: 'steak-pommes-de-terre', name: 'Steak haché, pommes de terre, salade', desc: 'Simple, efficace, comme à la maison.', moment: 'repas', minutes: 15, difficulty: 1,
    ingredients: [
      { food: 'Steak haché 5 %', g: 125, name: 'steak haché 5 %', n: 1, unit: PIECE('steak') },
      { food: 'Pomme de terre vapeur', g: 200, name: 'pommes de terre' },
      { food: 'Salade verte', g: 60, name: 'salade' },
      huile(),
    ],
    steps: [
      { t: 'Pommes de terre en morceaux, micro-ondes couvertes avec un fond d’eau.', uses: [1], timer: 600 },
      { t: 'Steak dans une poêle bien chaude.', uses: [0], timer: 180 },
      { t: 'Retourne le steak.', timer: 180 },
      { t: 'Assaisonne la salade avec l’huile, sel et poivre.', uses: [2, 3] },
    ],
  },
  {
    id: 'crevettes-riz-poivron', name: 'Crevettes sautées, riz, poivron', desc: 'Un wok express, sucré-salé.', moment: 'repas', minutes: 15, difficulty: 1,
    ingredients: [
      { food: 'Crevettes cuites', g: 120, name: 'crevettes décortiquées' },
      { food: 'Riz basmati cuit', g: 150, name: 'riz basmati', cru: 3 },
      { food: 'Poivron', g: 100, name: 'poivron', n: 1, unit: PIECE('petit poivron', 'petits poivrons') },
      soja(),
      huile(),
    ],
    steps: [
      { t: 'Lance le riz.', uses: [1], timer: 600 },
      { t: 'Poivron en lanières dans l’huile très chaude.', uses: [2, 4], timer: 240 },
      { t: 'Ajoute crevettes et sauce soja, puis sers sur le riz.', uses: [0, 3], timer: 120 },
    ],
  },
  {
    id: 'tofu-brocolis-quinoa', name: 'Tofu sauté, brocolis, quinoa', desc: 'Doré et croustillant, tout végétal.', moment: 'repas', minutes: 15, difficulty: 2,
    ingredients: [
      { food: 'Tofu ferme', g: 150, name: 'tofu ferme' },
      { food: 'Brocolis cuits', g: 150, name: 'brocolis' },
      { food: 'Quinoa cuit', g: 150, name: 'quinoa', cru: 3 },
      soja(),
      huile(),
    ],
    steps: [
      { t: 'Lance le quinoa.', uses: [2], timer: 720 },
      { t: 'Tofu en cubes, doré dans l’huile.', uses: [0, 4], timer: 360 },
      { t: 'Ajoute brocolis et sauce soja.', uses: [1, 3], timer: 180 },
    ],
  },
  {
    id: 'cabillaud-courgettes', name: 'Cabillaud, courgettes, semoule', desc: 'Léger, citronné, très doux.', moment: 'repas', minutes: 20, difficulty: 2,
    ingredients: [
      { food: 'Cabillaud cuit', g: 150, name: 'dos de cabillaud' },
      { food: 'Courgette cuite', g: 150, name: 'courgette', n: 1, unit: PIECE('courgette') },
      { food: 'Semoule / couscous cuit', g: 150, name: 'semoule', cru: 2.5 },
      huile(),
      citron(10),
    ],
    steps: [
      { t: 'Semoule : même volume d’eau bouillante, couvre.', uses: [2], timer: 300 },
      { t: 'Courgette en rondelles dans l’huile.', uses: [1, 3], timer: 360 },
      { t: 'Cabillaud à la poêle, quatre minutes par face, citron dessus.', uses: [0, 4], timer: 480 },
    ],
  },
  {
    id: 'pizza-tortilla', name: 'Pizza tortilla express', desc: 'Croustillante, prête avant la livraison.', moment: 'repas', minutes: 12, difficulty: 1, tags: ['etudiant'],
    ingredients: [
      { food: 'Tortilla de blé', g: 60, name: 'grande tortilla', n: 1, unit: TORTILLA },
      { food: 'Tomates concassées (conserve)', g: 50, name: 'tomates concassées', n: 3, unit: CS },
      { food: 'Mozzarella', g: 50, name: 'mozzarella' },
      { food: 'Jambon blanc', g: 40, name: 'jambon', n: 1, unit: TRANCHE },
      { food: 'Champignons', g: 50, name: 'champignons' },
    ],
    steps: [
      { t: 'Préchauffe le four à 220 °C.' },
      { t: 'Tomate sur la tortilla, puis jambon, champignons et mozzarella.', uses: [0, 1, 2, 3, 4] },
      { t: 'Au four, origan dessus en sortant.', timer: 480 },
    ],
  },
  {
    id: 'quesadilla-poulet', name: 'Quesadilla poulet maïs', desc: 'Dorée, filante, à partager… ou pas.', moment: 'repas', minutes: 12, difficulty: 1, tags: ['emporter'],
    ingredients: [
      { food: 'Tortilla de blé', g: 120, name: 'tortillas', n: 2, unit: TORTILLA },
      { food: 'Blanc de poulet grillé', g: 100, name: 'poulet cuit' },
      { food: 'Maïs doux', g: 40, name: 'maïs' },
      { food: 'Emmental', g: 30, name: 'emmental râpé' },
      { food: 'Poivron', g: 50, name: 'poivron', n: 0.25, unit: PIECE('poivron') },
    ],
    steps: [
      { t: 'Garnis une tortilla : poulet émietté, maïs, poivron, fromage.', uses: [0, 1, 2, 3, 4] },
      { t: 'Couvre avec la seconde tortilla.' },
      { t: 'Poêle sèche, trois minutes par face, puis coupe en parts.', timer: 360 },
    ],
  },
  {
    id: 'salade-quinoa-feta', name: 'Salade quinoa feta concombre', desc: 'Fraîche et méditerranéenne.', moment: 'repas', minutes: 10, difficulty: 1, tags: ['emporter'],
    ingredients: [
      { food: 'Quinoa cuit', g: 150, name: 'quinoa cuit et refroidi', cru: 3 },
      { food: 'Feta', g: 40, name: 'feta' },
      { food: 'Concombre', g: 100, name: 'concombre' },
      { food: 'Tomate', g: 100, name: 'tomate', n: 1, unit: PIECE('tomate') },
      huile(10),
      citron(10),
    ],
    steps: [
      { t: 'Quinoa cuit et refroidi (cuit la veille, c’est parfait).', uses: [0] },
      { t: 'Coupe concombre, tomate et feta en dés.', uses: [1, 2, 3] },
      { t: 'Mélange avec l’huile et le citron.', uses: [4, 5] },
    ],
  },
  {
    id: 'omelette-champignons-jambon', name: 'Omelette champignons jambon', desc: 'Le dîner sauvé en dix minutes.', moment: 'repas', minutes: 10, difficulty: 1, tags: ['etudiant'],
    ingredients: [
      { food: 'Œuf entier', g: 110, name: 'œufs', n: 2, unit: OEUF },
      { food: 'Champignons', g: 100, name: 'champignons' },
      { food: 'Jambon blanc', g: 40, name: 'jambon', n: 1, unit: TRANCHE },
      { food: 'Pain complet', g: 30, name: 'pain complet', n: 1, unit: TRANCHE },
      huile(3),
    ],
    steps: [
      { t: 'Champignons émincés dans l’huile.', uses: [1, 4], timer: 240 },
      { t: 'Ajoute le jambon en lanières puis les œufs battus.', uses: [2, 0] },
      { t: 'Laisse prendre à feu moyen, sers avec le pain.', uses: [3], timer: 180 },
    ],
  },
  {
    id: 'boeuf-saute-riz', name: 'Bœuf sauté poivron, riz', desc: 'Saisi vite et fort, comme au wok.', moment: 'repas', minutes: 15, difficulty: 2,
    ingredients: [
      { food: 'Bœuf (rumsteck)', g: 130, name: 'rumsteck en lanières' },
      { food: 'Poivron', g: 100, name: 'poivron', n: 1, unit: PIECE('petit poivron', 'petits poivrons') },
      { food: 'Oignon', g: 40, name: 'oignon', n: 0.5, unit: PIECE('petit oignon', 'petits oignons') },
      { food: 'Riz basmati cuit', g: 150, name: 'riz basmati', cru: 3 },
      soja(),
      huile(),
    ],
    steps: [
      { t: 'Lance le riz.', uses: [3], timer: 600 },
      { t: 'Poivron et oignon dans l’huile très chaude.', uses: [1, 2, 5], timer: 240 },
      { t: 'Ajoute le bœuf et la sauce soja, puis sers sur le riz.', uses: [0, 4], timer: 120 },
    ],
  },
  // --- Collations ---
  {
    id: 'fromage-blanc-miel-noix', name: 'Fromage blanc, miel, noix', desc: 'Doux et croquant, en deux minutes.', moment: 'collation', minutes: 2, difficulty: 1, noCook: true,
    ingredients: [
      { food: 'Fromage blanc 3 %', g: 150, name: 'fromage blanc' },
      { food: 'Miel', g: 8, name: 'miel', n: 1, unit: CC },
      { food: 'Noix', g: 15, name: 'cerneaux de noix' },
    ],
    steps: [{ t: 'Fromage blanc dans un bol, miel et noix concassées dessus.', uses: [0, 1, 2] }],
  },
  {
    id: 'smoothie-banane-cacahuete', name: 'Smoothie banane cacahuète', desc: 'Onctueux, parfait après l’effort.', moment: 'collation', minutes: 5, difficulty: 1, noCook: true, tags: ['emporter'],
    ingredients: [
      { food: 'Banane', g: 120, name: 'banane', n: 1, unit: PIECE('banane') },
      { food: 'Lait demi-écrémé', g: 200, name: 'lait demi-écrémé' },
      { food: 'Beurre de cacahuète', g: 15, name: 'beurre de cacahuète', n: 1, unit: CS },
    ],
    steps: [{ t: 'Tout dans le mixeur, 30 secondes. Quelques glaçons si tu veux.', uses: [0, 1, 2] }],
  },
  {
    id: 'pomme-cacahuete', name: 'Pomme et beurre de cacahuète', desc: 'Le goûter qui croque.', moment: 'collation', minutes: 2, difficulty: 1, noCook: true, tags: ['emporter', 'etudiant'],
    ingredients: [
      { food: 'Pomme', g: 150, name: 'pomme', n: 1, unit: PIECE('pomme') },
      { food: 'Beurre de cacahuète', g: 20, name: 'beurre de cacahuète', n: 1, unit: ['grosse c. à soupe', 'grosses c. à soupe'] },
    ],
    steps: [{ t: 'Coupe la pomme en quartiers, trempe-les dans le beurre de cacahuète.', uses: [0, 1] }],
  },
  {
    id: 'shake-fraises', name: 'Shake protéiné fraises', desc: 'Rose, frais, 25 g de protéines.', moment: 'collation', minutes: 3, difficulty: 1, noCook: true, tags: ['emporter'],
    ingredients: [
      { food: 'Whey (poudre)', g: 30, name: 'whey', n: 1, unit: PIECE('dose') },
      { food: 'Lait d’amande', g: 250, name: 'boisson à l’amande' },
      { food: 'Fraises', g: 100, name: 'fraises (surgelées : plus frais)' },
    ],
    steps: [{ t: 'Tout dans le mixeur, 30 secondes.', uses: [0, 1, 2] }],
  },
  {
    id: 'yaourt-grec-kiwi', name: 'Yaourt grec, kiwi, chia', desc: 'Acidulé et rassasiant.', moment: 'collation', minutes: 3, difficulty: 1, noCook: true,
    ingredients: [
      { food: 'Yaourt grec 0 %', g: 150, name: 'yaourt grec 0 %' },
      { food: 'Kiwi', g: 80, name: 'kiwi', n: 1, unit: PIECE('kiwi') },
      { food: 'Graines de chia', g: 10, name: 'graines de chia', n: 1, unit: CS },
    ],
    steps: [{ t: 'Kiwi en dés sur le yaourt, chia par-dessus.', uses: [0, 1, 2] }],
  },
];
