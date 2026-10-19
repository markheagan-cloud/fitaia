/**
 * Portraits sociaux rendus par l'usine d'avatars (même avatar maître que le reste de l'app).
 *
 * CONTRAT (partagé entre l'usine d'avatars et l'interface Communauté) :
 *  - 4 cadrages par avatar : head (tête, fond transparent), bust (buste, fond transparent),
 *    full (corps entier, fond transparent), card (carte sociale 4:5, fond studio FITAIA) ;
 *  - fichiers : assets/community/portraits/<clé>/<cadrage>.png, <clé> = avatarId avec ':' remplacé par '_'
 *    (ex. « moi », « demo_demo_sarah ») ;
 *  - ce module est régénéré par l'usine (tools/premium-avatar) ; tant qu'un portrait manque, `portraitSource` renvoie null
 *    et l'interface utilise le repli (dessin vectoriel), jamais une image d'une autre personne.
 * Le GLB complet n'est jamais chargé dans les listes : seules ces images le sont.
 */
import type { ImageSourcePropType } from 'react-native';

export type PortraitKind = 'head' | 'bust' | 'full' | 'card';

/** Table générée : clé d'avatar → cadrages disponibles (rendus de l'usine d'avatars). */
// <portraits-usine> (généré par tools/premium-avatar/portraits_table.py — ne pas modifier à la main)
const PORTRAITS: Record<string, Partial<Record<PortraitKind, ImageSourcePropType>>> = {
  'demo_demo_adam': {
    head: require('../../../assets/community/portraits/demo_demo_adam/head.png'),
    bust: require('../../../assets/community/portraits/demo_demo_adam/bust.png'),
    full: require('../../../assets/community/portraits/demo_demo_adam/full.png'),
    card: require('../../../assets/community/portraits/demo_demo_adam/card.png'),
  },
  'demo_demo_ines': {
    head: require('../../../assets/community/portraits/demo_demo_ines/head.png'),
    bust: require('../../../assets/community/portraits/demo_demo_ines/bust.png'),
    full: require('../../../assets/community/portraits/demo_demo_ines/full.png'),
    card: require('../../../assets/community/portraits/demo_demo_ines/card.png'),
  },
  'demo_demo_julie': {
    head: require('../../../assets/community/portraits/demo_demo_julie/head.png'),
    bust: require('../../../assets/community/portraits/demo_demo_julie/bust.png'),
    full: require('../../../assets/community/portraits/demo_demo_julie/full.png'),
    card: require('../../../assets/community/portraits/demo_demo_julie/card.png'),
  },
  'demo_demo_karim': {
    head: require('../../../assets/community/portraits/demo_demo_karim/head.png'),
    bust: require('../../../assets/community/portraits/demo_demo_karim/bust.png'),
    full: require('../../../assets/community/portraits/demo_demo_karim/full.png'),
    card: require('../../../assets/community/portraits/demo_demo_karim/card.png'),
  },
  'demo_demo_leila': {
    head: require('../../../assets/community/portraits/demo_demo_leila/head.png'),
    bust: require('../../../assets/community/portraits/demo_demo_leila/bust.png'),
    full: require('../../../assets/community/portraits/demo_demo_leila/full.png'),
    card: require('../../../assets/community/portraits/demo_demo_leila/card.png'),
  },
  'demo_demo_nassim': {
    head: require('../../../assets/community/portraits/demo_demo_nassim/head.png'),
    bust: require('../../../assets/community/portraits/demo_demo_nassim/bust.png'),
    full: require('../../../assets/community/portraits/demo_demo_nassim/full.png'),
    card: require('../../../assets/community/portraits/demo_demo_nassim/card.png'),
  },
  'demo_demo_sarah': {
    head: require('../../../assets/community/portraits/demo_demo_sarah/head.png'),
    bust: require('../../../assets/community/portraits/demo_demo_sarah/bust.png'),
    full: require('../../../assets/community/portraits/demo_demo_sarah/full.png'),
    card: require('../../../assets/community/portraits/demo_demo_sarah/card.png'),
  },
  'demo_demo_thomas': {
    head: require('../../../assets/community/portraits/demo_demo_thomas/head.png'),
    bust: require('../../../assets/community/portraits/demo_demo_thomas/bust.png'),
    full: require('../../../assets/community/portraits/demo_demo_thomas/full.png'),
    card: require('../../../assets/community/portraits/demo_demo_thomas/card.png'),
  },
  'moi': {
    head: require('../../../assets/community/portraits/moi/head.png'),
    bust: require('../../../assets/community/portraits/moi/bust.png'),
    full: require('../../../assets/community/portraits/moi/full.png'),
    card: require('../../../assets/community/portraits/moi/card.png'),
  },
};
// </portraits-usine>

export const portraitKey = (avatarId: string) => avatarId.replace(/:/g, '_');

export function portraitSource(avatarId: string, kind: PortraitKind): ImageSourcePropType | null {
  return PORTRAITS[portraitKey(avatarId)]?.[kind] ?? null;
}

export function hasPortraits(avatarId: string): boolean {
  return !!PORTRAITS[portraitKey(avatarId)];
}
