/**
 * Quelle image du perso montrer (Accueil, Mon perso, Communauté) : UNE règle, pure, testée (tests/hero-source.test.ts).
 *
 * Ordre :
 *  1) le portrait pris sur l'avatar 3D PERSONNEL (selfie → GLB, « Mon corps en 3D »), s'il existe pour la base affichée :
 *     c'est la seule image qui est vraiment la personne ; elle passe avant tout le reste ;
 *  2) le dessin IA de la tenue équipée, s'il existe ;
 *  3) la silhouette de l'usine au palier atteint (héros homme, tenue de départ, perte de poids) ;
 *  4) l'illustration la plus proche de la fiche du créateur ;
 *  5) l'illustration de la tenue (ou la base femme).
 * Rien ici n'invente un visage : sans portrait personnel, l'image reste une base générique, et `personal` le dit.
 */
import type { ImageSourcePropType } from 'react-native';
import type { CharacterSheet } from '@/data/character';
import type { AvatarBase } from './identity';

export type HeroChoice = { source: ImageSourcePropType; label: string; personal: boolean };

export type HeroInput = {
  base: AvatarBase;
  avatar3d: { base: AvatarBase; portraitUri?: string | null } | null;
  drawing: { outfit: string; uri: string } | null;
  skin: { id: string; name: string; img: ImageSourcePropType };
  stage: { img: ImageSourcePropType; label: string } | null;
  ready: boolean;
  sheet: CharacterSheet;
  previewImage: (s: CharacterSheet) => ImageSourcePropType;
  defaultSheetFor: (sex: AvatarBase) => CharacterSheet;
};

export function heroSourceFor(i: HeroInput): HeroChoice {
  const label = 'Ton perso en tenue ' + i.skin.name;
  if (i.avatar3d?.portraitUri && i.avatar3d.base === i.base) {
    return { source: { uri: i.avatar3d.portraitUri }, label: 'Ton avatar 3D, créé depuis ton selfie', personal: true };
  }
  if (i.drawing && i.drawing.outfit === i.skin.id) return { source: { uri: i.drawing.uri }, label, personal: true };
  if (i.stage) return { source: i.stage.img, label: 'Ton perso, étape ' + i.stage.label.toLowerCase(), personal: false };
  if (i.ready) return { source: i.previewImage(i.sheet), label, personal: false };
  // les illustrations de tenue montrent un homme : une femme voit sa base réaliste, pas un autre personnage
  if (i.base === 'f') return { source: i.previewImage(i.defaultSheetFor('f')), label: 'Ton perso', personal: false };
  return { source: i.skin.img, label, personal: false };
}
