/**
 * Recettes faciles (une portion, 20 minutes au plus, 6 ingrédients au plus). Chaque ingrédient renvoie à un aliment de
 * la base locale (src/data/foods.ts) avec son poids : calories et macros sont CALCULÉES depuis ces valeurs moyennes,
 * jamais écrites à la main (src/coach/recipes.ts). Sel, poivre, herbes et épices ne sont pas comptés (quasi nuls).
 * Les poids des féculents sont cuits ; le libellé donne le poids cru à peser.
 */
export type RecipeMoment = 'matin' | 'repas' | 'collation';

/** [nom exact dans LOCAL_FOODS, grammes, libellé affiché (facultatif)] */
export type RecipeIngredient = [food: string, grams: number, label?: string];

export type Recipe = {
  id: string;
  name: string;
  moment: RecipeMoment;
  minutes: number;
  ingredients: RecipeIngredient[];
  steps: string[];
};

export const MOMENT_LABEL: Record<RecipeMoment, string> = { matin: 'Petit-déjeuner', repas: 'Repas', collation: 'Collation' };

export const RECIPES: Recipe[] = [
  // --- Petit-déjeuner ---
  {
    id: 'porridge-banane', name: 'Porridge banane cannelle', moment: 'matin', minutes: 8,
    ingredients: [['Flocons d’avoine', 50, 'Flocons d’avoine, 50 g'], ['Lait demi-écrémé', 200, 'Lait demi-écrémé, 20 cl'], ['Banane', 100, '1 banane']],
    steps: ['Chauffe le lait et les flocons 4 minutes à feu doux en remuant.', 'Coupe la banane en rondelles par-dessus.', 'Une pincée de cannelle, c’est prêt.'],
  },
  {
    id: 'skyr-fruits-rouges', name: 'Skyr fruits rouges et amandes', moment: 'matin', minutes: 3,
    ingredients: [['Skyr', 150, 'Skyr, 150 g'], ['Myrtilles', 80, 'Myrtilles, 80 g'], ['Fraises', 80, 'Fraises, 80 g'], ['Amandes', 15, 'Amandes, une poignée (15 g)']],
    steps: ['Verse le skyr dans un bol.', 'Ajoute les fruits (frais ou surgelés) et les amandes concassées.'],
  },
  {
    id: 'omelette-epinards-feta', name: 'Omelette épinards feta', moment: 'matin', minutes: 10,
    ingredients: [['Œuf entier', 110, '2 œufs'], ['Épinards cuits', 100, 'Épinards, 100 g (surgelés ou frais)'], ['Feta', 30, 'Feta, 30 g'], ['Huile d’olive', 5, 'Huile d’olive, 1 c. à café']],
    steps: ['Fais tomber les épinards 2 minutes dans la poêle huilée.', 'Verse les œufs battus, émiette la feta.', 'Laisse prendre 3 minutes à feu moyen, plie en deux.'],
  },
  {
    id: 'tartine-avocat-oeuf', name: 'Tartines avocat et œuf', moment: 'matin', minutes: 10,
    ingredients: [['Pain complet', 60, '2 tranches de pain complet'], ['Avocat', 60, '½ avocat'], ['Œuf entier', 55, '1 œuf'], ['Jus de citron', 5, 'Un trait de citron']],
    steps: ['Fais cuire l’œuf 7 minutes dans l’eau bouillante (mollet) ou au plat.', 'Écrase l’avocat avec le citron, sel, poivre.', 'Tartine, pose l’œuf coupé dessus.'],
  },
  {
    id: 'overnight-oats-mangue', name: 'Flocons de la veille, chia et mangue', moment: 'matin', minutes: 5,
    ingredients: [['Flocons d’avoine', 40, 'Flocons d’avoine, 40 g'], ['Lait d’amande', 150, 'Lait d’amande, 15 cl'], ['Graines de chia', 10, 'Graines de chia, 1 c. à soupe'], ['Mangue', 80, 'Mangue en dés, 80 g']],
    steps: ['Le soir : mélange flocons, chia et lait d’amande dans un pot.', 'Une nuit au frigo.', 'Le matin : ajoute la mangue.'],
  },
  {
    id: 'pancakes-banane', name: 'Pancakes banane, trois ingrédients', moment: 'matin', minutes: 15,
    ingredients: [['Banane', 120, '1 grosse banane'], ['Œuf entier', 110, '2 œufs'], ['Flocons d’avoine', 30, 'Flocons d’avoine, 30 g'], ['Huile d’olive', 3, 'Un filet d’huile']],
    steps: ['Écrase la banane, mélange avec les œufs et les flocons.', 'Verse de petites louches dans une poêle chaude légèrement huilée.', '2 minutes par face.'],
  },
  // --- Repas ---
  {
    id: 'bowl-poulet-riz', name: 'Bowl poulet, riz, brocolis', moment: 'repas', minutes: 20,
    ingredients: [['Blanc de poulet grillé', 150, 'Blanc de poulet, 150 g'], ['Riz basmati cuit', 150, 'Riz basmati, 150 g cuit (50 g cru)'], ['Brocolis cuits', 150, 'Brocolis, 150 g'], ['Sauce soja', 10, 'Sauce soja, 1 c. à soupe'], ['Huile d’olive', 5, 'Huile d’olive, 1 c. à café']],
    steps: ['Lance le riz.', 'Coupe le poulet en morceaux, saisis-le 8 minutes dans l’huile.', 'Brocolis 5 minutes à la vapeur ou au micro-ondes.', 'Assemble, arrose de sauce soja.'],
  },
  {
    id: 'wrap-dinde', name: 'Wrap dinde crudités', moment: 'repas', minutes: 10,
    ingredients: [['Tortilla de blé', 60, '1 grande tortilla'], ['Escalope de dinde', 100, 'Dinde, 100 g'], ['Salade verte', 30, 'Salade, une poignée'], ['Tomate', 60, '½ tomate'], ['Fromage blanc 3 %', 30, 'Fromage blanc, 2 c. à soupe (sauce)']],
    steps: ['Poêle la dinde en lanières 6 minutes.', 'Étale le fromage blanc (sel, poivre, herbes) sur la tortilla.', 'Ajoute salade, tomate, dinde, roule serré.'],
  },
  {
    id: 'salade-thon-pois-chiches', name: 'Salade thon pois chiches', moment: 'repas', minutes: 10,
    ingredients: [['Thon en boîte au naturel', 90, '1 petite boîte de thon'], ['Pois chiches cuits', 120, 'Pois chiches, 120 g (conserve)'], ['Tomate', 100, '1 tomate'], ['Concombre', 100, '⅓ de concombre'], ['Huile d’olive', 10, 'Huile d’olive, 2 c. à café'], ['Jus de citron', 10, 'Jus de citron, 2 c. à café']],
    steps: ['Rince les pois chiches.', 'Coupe tomate et concombre en dés.', 'Mélange avec le thon émietté, l’huile et le citron.'],
  },
  {
    id: 'pates-tomate-thon', name: 'Pâtes complètes tomate thon', moment: 'repas', minutes: 15,
    ingredients: [['Pâtes complètes cuites', 180, 'Pâtes complètes, 180 g cuites (70 g crues)'], ['Tomates concassées (conserve)', 150, 'Tomates concassées, 150 g'], ['Thon en boîte au naturel', 90, '1 petite boîte de thon'], ['Oignon', 30, '¼ d’oignon'], ['Huile d’olive', 5, 'Huile d’olive, 1 c. à café']],
    steps: ['Lance les pâtes.', 'Fais revenir l’oignon dans l’huile, ajoute les tomates, 8 minutes.', 'Ajoute le thon hors du feu, mélange aux pâtes.'],
  },
  {
    id: 'saumon-patate-douce', name: 'Saumon, patate douce, haricots verts', moment: 'repas', minutes: 20,
    ingredients: [['Saumon cuit', 120, 'Pavé de saumon, 120 g'], ['Patate douce cuite', 200, 'Patate douce, 200 g'], ['Haricots verts cuits', 150, 'Haricots verts, 150 g'], ['Jus de citron', 10, 'Un trait de citron']],
    steps: ['Patate douce en cubes, 8 minutes au micro-ondes couverte (ou 20 minutes au four).', 'Saumon 4 minutes par face à la poêle, sans matière grasse.', 'Haricots verts à la vapeur, citron sur le tout.'],
  },
  {
    id: 'dahl-lentilles', name: 'Dahl express de lentilles', moment: 'repas', minutes: 20,
    ingredients: [['Lentilles cuites', 200, 'Lentilles, 200 g cuites (conserve)'], ['Tomates concassées (conserve)', 100, 'Tomates concassées, 100 g'], ['Oignon', 50, '½ oignon'], ['Riz basmati cuit', 100, 'Riz basmati, 100 g cuit (35 g cru)'], ['Huile d’olive', 5, 'Huile d’olive, 1 c. à café']],
    steps: ['Lance le riz.', 'Oignon dans l’huile avec curry et cumin, 3 minutes.', 'Ajoute lentilles et tomates, 10 minutes à feu doux.'],
  },
  {
    id: 'chili-sin-carne', name: 'Chili sin carne', moment: 'repas', minutes: 20,
    ingredients: [['Haricots rouges cuits', 150, 'Haricots rouges, 150 g (conserve)'], ['Maïs doux', 60, 'Maïs, 60 g'], ['Tomates concassées (conserve)', 150, 'Tomates concassées, 150 g'], ['Poivron', 80, '½ poivron'], ['Riz complet cuit', 120, 'Riz complet, 120 g cuit (40 g cru)'], ['Huile d’olive', 5, 'Huile d’olive, 1 c. à café']],
    steps: ['Lance le riz.', 'Poivron en dés dans l’huile 4 minutes, avec paprika et cumin.', 'Ajoute haricots rincés, maïs et tomates, 10 minutes.'],
  },
  {
    id: 'steak-pommes-de-terre', name: 'Steak haché, pommes de terre, salade', moment: 'repas', minutes: 15,
    ingredients: [['Steak haché 5 %', 125, '1 steak haché 5 %'], ['Pomme de terre vapeur', 200, 'Pommes de terre, 200 g'], ['Salade verte', 60, 'Salade, 2 poignées'], ['Huile d’olive', 5, 'Huile d’olive, 1 c. à café (vinaigrette)']],
    steps: ['Pommes de terre en morceaux, 10 minutes au micro-ondes couvertes avec un fond d’eau.', 'Steak 3 minutes par face.', 'Salade avec l’huile, un peu de vinaigre et de moutarde.'],
  },
  {
    id: 'crevettes-riz-poivron', name: 'Crevettes sautées, riz, poivron', moment: 'repas', minutes: 15,
    ingredients: [['Crevettes cuites', 120, 'Crevettes décortiquées, 120 g'], ['Riz basmati cuit', 150, 'Riz basmati, 150 g cuit (50 g cru)'], ['Poivron', 100, '1 petit poivron'], ['Sauce soja', 10, 'Sauce soja, 1 c. à soupe'], ['Huile d’olive', 5, 'Huile d’olive, 1 c. à café']],
    steps: ['Lance le riz.', 'Poivron en lanières dans l’huile chaude, 4 minutes.', 'Ajoute crevettes et sauce soja, 2 minutes, sers sur le riz.'],
  },
  {
    id: 'tofu-brocolis-quinoa', name: 'Tofu sauté, brocolis, quinoa', moment: 'repas', minutes: 15,
    ingredients: [['Tofu ferme', 150, 'Tofu ferme, 150 g'], ['Brocolis cuits', 150, 'Brocolis, 150 g'], ['Quinoa cuit', 150, 'Quinoa, 150 g cuit (50 g cru)'], ['Sauce soja', 10, 'Sauce soja, 1 c. à soupe'], ['Huile d’olive', 5, 'Huile d’olive, 1 c. à café']],
    steps: ['Lance le quinoa (12 minutes).', 'Tofu en cubes doré dans l’huile, 6 minutes.', 'Ajoute les brocolis et la sauce soja, 3 minutes.'],
  },
  {
    id: 'cabillaud-courgettes', name: 'Cabillaud, courgettes, semoule', moment: 'repas', minutes: 20,
    ingredients: [['Cabillaud cuit', 150, 'Dos de cabillaud, 150 g'], ['Courgette cuite', 150, '1 courgette'], ['Semoule / couscous cuit', 150, 'Semoule, 150 g cuite (60 g crue)'], ['Huile d’olive', 5, 'Huile d’olive, 1 c. à café'], ['Jus de citron', 10, 'Un trait de citron']],
    steps: ['Semoule : même volume d’eau bouillante, 5 minutes couverte.', 'Courgette en rondelles dans l’huile, 6 minutes.', 'Cabillaud 4 minutes par face, citron dessus.'],
  },
  {
    id: 'pizza-tortilla', name: 'Pizza tortilla express', moment: 'repas', minutes: 12,
    ingredients: [['Tortilla de blé', 60, '1 grande tortilla'], ['Tomates concassées (conserve)', 50, 'Tomates concassées, 3 c. à soupe'], ['Mozzarella', 50, 'Mozzarella, 50 g'], ['Jambon blanc', 40, '1 tranche de jambon'], ['Champignons', 50, 'Champignons, 50 g']],
    steps: ['Four à 220 °C.', 'Étale la tomate sur la tortilla, ajoute jambon, champignons et mozzarella.', '8 minutes au four, origan dessus.'],
  },
  {
    id: 'quesadilla-poulet', name: 'Quesadilla poulet maïs', moment: 'repas', minutes: 12,
    ingredients: [['Tortilla de blé', 120, '2 tortillas'], ['Blanc de poulet grillé', 100, 'Poulet cuit, 100 g'], ['Maïs doux', 40, 'Maïs, 40 g'], ['Emmental', 30, 'Emmental râpé, 30 g'], ['Poivron', 50, '¼ de poivron']],
    steps: ['Garnis une tortilla : poulet émietté, maïs, poivron, fromage.', 'Couvre de la seconde tortilla.', '3 minutes par face dans une poêle sèche, coupe en parts.'],
  },
  {
    id: 'salade-quinoa-feta', name: 'Salade quinoa feta concombre', moment: 'repas', minutes: 10,
    ingredients: [['Quinoa cuit', 150, 'Quinoa, 150 g cuit (50 g cru)'], ['Feta', 40, 'Feta, 40 g'], ['Concombre', 100, '⅓ de concombre'], ['Tomate', 100, '1 tomate'], ['Huile d’olive', 10, 'Huile d’olive, 2 c. à café'], ['Jus de citron', 10, 'Jus de citron, 2 c. à café']],
    steps: ['Quinoa cuit et refroidi (la veille, c’est parfait).', 'Dés de concombre, tomate et feta.', 'Mélange avec l’huile, le citron, menthe si tu as.'],
  },
  {
    id: 'omelette-champignons-jambon', name: 'Omelette champignons jambon', moment: 'repas', minutes: 10,
    ingredients: [['Œuf entier', 110, '2 œufs'], ['Champignons', 100, 'Champignons, 100 g'], ['Jambon blanc', 40, '1 tranche de jambon'], ['Pain complet', 40, '1 tranche de pain complet'], ['Huile d’olive', 3, 'Un filet d’huile']],
    steps: ['Champignons émincés dans l’huile, 4 minutes.', 'Ajoute le jambon en lanières puis les œufs battus.', '3 minutes à feu moyen, avec le pain.'],
  },
  {
    id: 'boeuf-saute-riz', name: 'Bœuf sauté poivron, riz', moment: 'repas', minutes: 15,
    ingredients: [['Bœuf (rumsteck)', 130, 'Rumsteck en lanières, 130 g'], ['Poivron', 100, '1 petit poivron'], ['Oignon', 40, '½ petit oignon'], ['Riz basmati cuit', 150, 'Riz basmati, 150 g cuit (50 g cru)'], ['Sauce soja', 10, 'Sauce soja, 1 c. à soupe'], ['Huile d’olive', 5, 'Huile d’olive, 1 c. à café']],
    steps: ['Lance le riz.', 'Poivron et oignon dans l’huile très chaude, 4 minutes.', 'Ajoute le bœuf 2 minutes, sauce soja, sers sur le riz.'],
  },
  // --- Collations ---
  {
    id: 'fromage-blanc-miel-noix', name: 'Fromage blanc, miel, noix', moment: 'collation', minutes: 2,
    ingredients: [['Fromage blanc 3 %', 150, 'Fromage blanc, 150 g'], ['Miel', 10, 'Miel, 1 c. à café'], ['Noix', 15, 'Noix, 3 cerneaux et demi (15 g)']],
    steps: ['Fromage blanc dans un bol, miel et noix concassées dessus.'],
  },
  {
    id: 'smoothie-banane-cacahuete', name: 'Smoothie banane cacahuète', moment: 'collation', minutes: 5,
    ingredients: [['Banane', 120, '1 banane'], ['Lait demi-écrémé', 200, 'Lait demi-écrémé, 20 cl'], ['Beurre de cacahuète', 15, 'Beurre de cacahuète, 1 c. à soupe']],
    steps: ['Tout dans le mixeur, 30 secondes.', 'Quelques glaçons si tu veux.'],
  },
  {
    id: 'pomme-cacahuete', name: 'Pomme et beurre de cacahuète', moment: 'collation', minutes: 2,
    ingredients: [['Pomme', 150, '1 pomme'], ['Beurre de cacahuète', 20, 'Beurre de cacahuète, 1 grosse c. à soupe']],
    steps: ['Coupe la pomme en quartiers, trempe-les dans le beurre de cacahuète.'],
  },
  {
    id: 'shake-fraises', name: 'Shake protéiné fraises', moment: 'collation', minutes: 3,
    ingredients: [['Whey (poudre)', 30, 'Whey, 1 dose (30 g)'], ['Lait d’amande', 250, 'Lait d’amande, 25 cl'], ['Fraises', 100, 'Fraises, 100 g (surgelées : plus frais)']],
    steps: ['Tout dans le mixeur, 30 secondes.'],
  },
  {
    id: 'yaourt-grec-kiwi', name: 'Yaourt grec, kiwi, chia', moment: 'collation', minutes: 3,
    ingredients: [['Yaourt grec 0 %', 150, 'Yaourt grec 0 %, 150 g'], ['Kiwi', 80, '1 kiwi'], ['Graines de chia', 10, 'Graines de chia, 1 c. à soupe']],
    steps: ['Kiwi en dés sur le yaourt, chia par-dessus.'],
  },
];
