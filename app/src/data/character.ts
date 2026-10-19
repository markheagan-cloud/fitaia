/**
 * Fiche de personnage FITAIA — créateur façon GTA : toutes les combinaisons sont possibles,
 * les modifications sont gratuites et instantanées ; seul le rendu dessiné passe par le serveur.
 */
import type { ImageSourcePropType } from 'react-native';
import { IMG } from './content';

export type Option<T extends string = string> = { id: T; label: string; prompt: string; color?: string };

export const APPEARANCE: Option[] = [
  { id: 'masc', label: 'Masculine', prompt: 'masculine presenting' },
  { id: 'fem', label: 'Féminine', prompt: 'feminine presenting' },
  { id: 'neutre', label: 'Neutre', prompt: 'androgynous' },
];

export const BODY: Option[] = [
  { id: 'mince', label: 'Mince', prompt: 'slim lean build' },
  { id: 'athle', label: 'Athlétique', prompt: 'athletic toned build' },
  { id: 'costaud', label: 'Costaud', prompt: 'strong muscular build' },
  { id: 'rond', label: 'Rond', prompt: 'plus-size curvy build, confident posture' },
];

export const SKIN: Option[] = [
  { id: 's1', label: 'Porcelaine', prompt: 'very fair skin', color: '#F6E3D4' },
  { id: 's2', label: 'Claire', prompt: 'fair skin', color: '#EFCDB1' },
  { id: 's3', label: 'Dorée', prompt: 'light golden skin', color: '#E2B48C' },
  { id: 's4', label: 'Mate', prompt: 'olive tan skin', color: '#C6956A' },
  { id: 's5', label: 'Caramel', prompt: 'medium brown skin', color: '#A6714B' },
  { id: 's6', label: 'Brune', prompt: 'brown skin', color: '#7F5236' },
  { id: 's7', label: 'Foncée', prompt: 'dark brown skin', color: '#5A3A26' },
  { id: 's8', label: 'Ébène', prompt: 'deep ebony skin', color: '#3B2619' },
];

export const HAIR_STYLE: Option[] = [
  { id: 'rase', label: 'Rasé', prompt: 'shaved head' },
  { id: 'court', label: 'Court', prompt: 'short neat hair' },
  { id: 'degrade', label: 'Dégradé', prompt: 'short faded sides, textured top' },
  { id: 'boucle', label: 'Bouclé', prompt: 'curly medium hair' },
  { id: 'afro', label: 'Afro', prompt: 'natural afro hair' },
  { id: 'tresses', label: 'Tresses', prompt: 'braided hair' },
  { id: 'milong', label: 'Mi-long', prompt: 'shoulder-length hair' },
  { id: 'long', label: 'Long', prompt: 'long hair' },
  { id: 'chignon', label: 'Chignon', prompt: 'hair tied in a high bun' },
  { id: 'queue', label: 'Queue', prompt: 'ponytail' },
  { id: 'hijab', label: 'Hijab', prompt: 'wearing a sporty hijab' },
];

export const HAIR_COLOR: Option[] = [
  { id: 'noir', label: 'Noir', prompt: 'black', color: '#1B1A1F' },
  { id: 'brun', label: 'Brun', prompt: 'dark brown', color: '#4A3024' },
  { id: 'chatain', label: 'Châtain', prompt: 'chestnut brown', color: '#7B5230' },
  { id: 'blond', label: 'Blond', prompt: 'blond', color: '#D7B46A' },
  { id: 'roux', label: 'Roux', prompt: 'red auburn', color: '#B4502B' },
  { id: 'gris', label: 'Gris', prompt: 'silver grey', color: '#A7A9AD' },
  { id: 'blanc', label: 'Blanc', prompt: 'white', color: '#EDEDEA' },
  { id: 'lime', label: 'Lime', prompt: 'lime green dyed', color: '#C8F03C' },
];

export const FACE: Option[] = [
  { id: 'ovale', label: 'Ovale', prompt: 'oval face' },
  { id: 'rond', label: 'Rond', prompt: 'round face' },
  { id: 'carre', label: 'Carré', prompt: 'square jaw' },
  { id: 'coeur', label: 'Cœur', prompt: 'heart-shaped face' },
  { id: 'long', label: 'Allongé', prompt: 'long face' },
];

export const EYES: Option[] = [
  { id: 'brun', label: 'Bruns', prompt: 'brown eyes', color: '#5B3A21' },
  { id: 'noir', label: 'Noirs', prompt: 'dark eyes', color: '#1E1A17' },
  { id: 'vert', label: 'Verts', prompt: 'green eyes', color: '#5E8B3F' },
  { id: 'bleu', label: 'Bleus', prompt: 'blue eyes', color: '#4C7FC2' },
  { id: 'gris', label: 'Gris', prompt: 'grey eyes', color: '#8E9AA6' },
  { id: 'noisette', label: 'Noisette', prompt: 'hazel eyes', color: '#9A7A3C' },
];

export const BEARD: Option[] = [
  { id: 'aucune', label: 'Aucune', prompt: 'clean-shaven' },
  { id: 'trois', label: '3 jours', prompt: 'light stubble' },
  { id: 'courte', label: 'Courte', prompt: 'short trimmed beard' },
  { id: 'pleine', label: 'Pleine', prompt: 'full beard' },
  { id: 'moustache', label: 'Moustache', prompt: 'moustache' },
];

export const EXTRAS: Option[] = [
  { id: 'lunettes', label: 'Lunettes', prompt: 'thin black glasses' },
  { id: 'montre', label: 'Montre', prompt: 'sports watch' },
  { id: 'casquette', label: 'Casquette', prompt: 'charcoal cap' },
  { id: 'bandeau', label: 'Bandeau', prompt: 'lime headband' },
  { id: 'tatouage', label: 'Tatouage', prompt: 'subtle arm tattoo' },
  { id: 'boucles', label: 'Boucles', prompt: 'small earrings' },
];

export type CharacterSheet = {
  appearance: string;
  body: string;
  height: number; // cm
  skin: string;
  hairStyle: string;
  hairColor: string;
  face: string;
  eyes: string;
  beard: string;
  extras: string[];
};

export const DEFAULT_SHEET: CharacterSheet = {
  appearance: 'masc',
  body: 'athle',
  height: 178,
  skin: 's3',
  hairStyle: 'degrade',
  hairColor: 'brun',
  face: 'ovale',
  eyes: 'brun',
  beard: 'trois',
  extras: ['montre'],
};

const pick = <T extends string>(list: Option<T>[], id: string) => list.find((o) => o.id === id) ?? list[0];

/** Prompt (anglais) pour le modèle d'image — stable pour une même fiche (cache serveur). */
export function sheetPrompt(s: CharacterSheet, outfitPrompt: string): string {
  const parts = [
    pick(APPEARANCE, s.appearance).prompt,
    pick(BODY, s.body).prompt,
    `about ${s.height} cm tall`,
    pick(SKIN, s.skin).prompt,
    pick(HAIR_COLOR, s.hairColor).prompt + ' ' + pick(HAIR_STYLE, s.hairStyle).prompt,
    pick(FACE, s.face).prompt,
    pick(EYES, s.eyes).prompt,
    pick(BEARD, s.beard).prompt,
    ...s.extras.map((e) => pick(EXTRAS, e).prompt),
  ];
  return parts.join(', ') + `. Outfit: ${outfitPrompt}.`;
}

/** Empreinte de la fiche : même fiche + même tenue = même rendu (jamais regénéré). */
export function sheetKey(s: CharacterSheet, outfit: string): string {
  return [s.appearance, s.body, s.height, s.skin, s.hairStyle, s.hairColor, s.face, s.eyes, s.beard, [...s.extras].sort().join('+'), outfit].join('|');
}

/** Perso de base : le rendu réaliste le plus proche de la fiche (sexe, carrure, peau, pilosité, voile). */
export function previewImage(s: CharacterSheet): ImageSourcePropType {
  const dark = ['s6', 's7', 's8'].includes(s.skin);
  if (s.hairStyle === 'hijab') return IMG.p6;
  if (s.appearance === 'fem') {
    if (s.body === 'rond' || s.body === 'costaud' || dark || s.hairStyle === 'afro') return IMG.p2;
    return IMG.p4;
  }
  if (s.hairColor === 'gris' || s.hairColor === 'blanc' || (s.body === 'rond' && s.beard !== 'aucune')) return IMG.p5;
  if (s.body === 'costaud' || dark || s.beard === 'pleine' || s.beard === 'courte' || s.extras.includes('tatouage')) return IMG.p3;
  return IMG.p1;
}

/** Nombre de combinaisons possibles (pour l'écran : « illimité » dans les faits). */
export function combinations(): number {
  const heights = 200 - 150 + 1;
  return APPEARANCE.length * BODY.length * heights * SKIN.length * HAIR_STYLE.length * HAIR_COLOR.length * FACE.length * EYES.length * BEARD.length * 2 ** EXTRAS.length;
}
