/**
 * Quelle image du perso montrer (Accueil, Mon perso, Communauté) : UNE règle, pure, testée (tests/hero-source.test.ts).
 *
 * Ordre :
 *  0) la CARICATURE personnelle (dans la tenue équipée si elle a été dessinée sur ce perso)
 *     — (selfie → portrait validé, voir src/avatar/caricature.ts), si elle existe pour la base
 *     affichée : c'est le perso à l'image de la personne, celui que Mark a validé ;
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

/**
 * `pending` : le selfie de la personne, quand son perso n'est pas encore dessiné. La photo brute ne sert JAMAIS d'image
 * du perso : `source` reste une image de repli (non personnelle) et l'écran affiche un état d'attente (HeroAvatar).
 */
export type HeroChoice = { source: ImageSourcePropType; label: string; personal: boolean; pending?: string };

export type HeroInput = {
  base: AvatarBase;
  caricature: { base: AvatarBase; portraitUri: string; outfits?: Record<string, string> } | null;
  avatar3d: { base: AvatarBase; portraitUri?: string | null } | null;
  /** Selfie gardé sur le téléphone tant que le perso se dessine : sert seulement de fond flouté à l'état d'attente. */
  pendingSelfie?: string | null;
  drawing: { outfit: string; uri: string } | null;
  skin: { id: string; name: string; img: ImageSourcePropType };
  /** Mélange porté (vestiaire) : clé d'une image de caricature.outfits ; passe avant la tenue entière. */
  look?: string | null;
  stage: { img: ImageSourcePropType; label: string } | null;
  ready: boolean;
  sheet: CharacterSheet;
  previewImage: (s: CharacterSheet) => ImageSourcePropType;
  defaultSheetFor: (sex: AvatarBase) => CharacterSheet;
};

export function heroSourceFor(i: HeroInput): HeroChoice {
  const c = pick(i);
  const drawn = !!i.caricature?.portraitUri && i.caricature.base === i.base;
  return !drawn && i.pendingSelfie ? { ...c, personal: false, pending: i.pendingSelfie } : c;
}

function pick(i: HeroInput): HeroChoice {
  const label = 'Ton perso en tenue ' + i.skin.name;
  if (i.caricature?.portraitUri && i.caricature.base === i.base) {
    // le mélange du vestiaire s'il est porté et dessiné, sinon la tenue équipée, sinon le portrait
    const mixed = i.look ? i.caricature.outfits?.[i.look] : undefined;
    if (mixed) return { source: { uri: mixed }, label: 'Ton perso, habillé à ta façon', personal: true };
    const worn = i.caricature.outfits?.[i.skin.id];
    if (worn) return { source: { uri: worn }, label: 'Ton perso en tenue ' + i.skin.name, personal: true };
    return { source: { uri: i.caricature.portraitUri }, label: 'Ton perso, dessiné depuis ton selfie', personal: true };
  }
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
