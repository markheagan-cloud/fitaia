/**
 * Photos des recettes (une par recette, jamais réutilisée) : images originales créées une fois avec FLUX.2 klein 4B
 * (Apache 2.0, usage commercial permis), relues à l'œil (bons ingrédients), embarquées dans l'app : hors ligne, sans
 * génération à l'ouverture. Générateur : hero3d/cuisine/photos_recettes.py. 880 px, JPEG.
 */
import type { ImageSourcePropType } from 'react-native';

export const RECIPE_PHOTOS: Record<string, ImageSourcePropType> = {
  'boeuf-saute-riz': require('../../assets/recipes/boeuf-saute-riz.jpg'),
  'bowl-poulet-riz': require('../../assets/recipes/bowl-poulet-riz.jpg'),
  'cabillaud-courgettes': require('../../assets/recipes/cabillaud-courgettes.jpg'),
  'chili-sin-carne': require('../../assets/recipes/chili-sin-carne.jpg'),
  'crevettes-riz-poivron': require('../../assets/recipes/crevettes-riz-poivron.jpg'),
  'dahl-lentilles': require('../../assets/recipes/dahl-lentilles.jpg'),
  'fromage-blanc-miel-noix': require('../../assets/recipes/fromage-blanc-miel-noix.jpg'),
  'omelette-champignons-jambon': require('../../assets/recipes/omelette-champignons-jambon.jpg'),
  'omelette-epinards-feta': require('../../assets/recipes/omelette-epinards-feta.jpg'),
  'overnight-oats-mangue': require('../../assets/recipes/overnight-oats-mangue.jpg'),
  'pancakes-banane': require('../../assets/recipes/pancakes-banane.jpg'),
  'pates-tomate-thon': require('../../assets/recipes/pates-tomate-thon.jpg'),
  'pizza-tortilla': require('../../assets/recipes/pizza-tortilla.jpg'),
  'pomme-cacahuete': require('../../assets/recipes/pomme-cacahuete.jpg'),
  'porridge-banane': require('../../assets/recipes/porridge-banane.jpg'),
  'quesadilla-poulet': require('../../assets/recipes/quesadilla-poulet.jpg'),
  'salade-quinoa-feta': require('../../assets/recipes/salade-quinoa-feta.jpg'),
  'salade-thon-pois-chiches': require('../../assets/recipes/salade-thon-pois-chiches.jpg'),
  'saumon-patate-douce': require('../../assets/recipes/saumon-patate-douce.jpg'),
  'shake-fraises': require('../../assets/recipes/shake-fraises.jpg'),
  'skyr-fruits-rouges': require('../../assets/recipes/skyr-fruits-rouges.jpg'),
  'smoothie-banane-cacahuete': require('../../assets/recipes/smoothie-banane-cacahuete.jpg'),
  'steak-pommes-de-terre': require('../../assets/recipes/steak-pommes-de-terre.jpg'),
  'tartine-avocat-oeuf': require('../../assets/recipes/tartine-avocat-oeuf.jpg'),
  'tofu-brocolis-quinoa': require('../../assets/recipes/tofu-brocolis-quinoa.jpg'),
  'wrap-dinde': require('../../assets/recipes/wrap-dinde.jpg'),
  'yaourt-grec-kiwi': require('../../assets/recipes/yaourt-grec-kiwi.jpg'),
};
