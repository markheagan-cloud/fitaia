/**
 * AvatarPresentationService (côté interface) : portrait 2D léger d'un membre, pour les listes, cartes et messages.
 * Jamais de moteur 3D ici (une liste de 30 membres = 30 images, pas 30 contextes GL).
 *  - « moi » : le perso de l'utilisateur (même image que l'Accueil : identité inchangée partout) ; sans perso
 *    personnalisé, le rendu de l'avatar maître par l'usine ;
 *  - profils de démonstration : rendus de l'usine d'avatars (repli : portraits vectoriels FITAIA) ;
 *  - membres réels (serveur) : rendu « tête / buste » mis en cache par l'usine d'avatars (à brancher).
 */
import React from 'react';
import { Image, View, StyleProp, ViewStyle } from 'react-native';
import { useHeroSource } from '@/avatar/HeroAvatar';
import { useEquippedSkin, useGame } from '@/store/useGame';
import { IMG } from '@/data/content';
import { portraitSource, PortraitKind } from '../avatars/portraits';
import { VectorAvatar, AVATAR_VB } from '@/avatar/VectorAvatar';
import { demoAvatar } from '../services/devData';
import { useTheme } from '@/theme/ThemeProvider';

export type PortraitMode = 'tete' | 'buste' | 'corps' | 'carte';

/**
 * Position de la tête dans les illustrations du perso (fractions de l'image 480×600 : centre x, centre y, hauteur).
 * Mesurée sur assets/persos ; valeur par défaut pour les dessins générés (tête centrée en haut).
 */
const HEAD_RATIO = 0.8;
const HEADS: [unknown, { cx: number; cy: number; h: number }][] = [
  [IMG.p1, { cx: 0.74, cy: 0.075, h: 0.1 }],
  [IMG.p2, { cx: 0.45, cy: 0.1, h: 0.1 }],
  [IMG.p3, { cx: 0.28, cy: 0.075, h: 0.1 }],
  [IMG.p4, { cx: 0.67, cy: 0.085, h: 0.1 }],
  [IMG.p5, { cx: 0.47, cy: 0.065, h: 0.1 }],
  [IMG.p6, { cx: 0.32, cy: 0.09, h: 0.1 }],
];
const DEFAULT_HEAD = { cx: 0.5, cy: 0.12, h: 0.12 };
/** Part du cadre occupée par la tête selon le mode. */
const HEAD_FILL: Record<PortraitMode, number> = { tete: 0.55, buste: 0.3, corps: 0, carte: 0.24 };

function MyPortrait({ size, mode, box }: { size: number; mode: PortraitMode; box: StyleProp<ViewStyle> }) {
  const { source, label } = useHeroSource();
  const head = HEADS.find(([img]) => img === source)?.[1] ?? DEFAULT_HEAD;
  const frameH = mode === 'corps' ? size * 1.6 : mode === 'carte' ? size * 1.25 : size;
  let H: number;
  let left: number;
  let top: number;
  if (mode === 'corps') {
    H = frameH;
    left = size / 2 - head.cx * H * HEAD_RATIO;
    left = Math.min(0, Math.max(size - H * HEAD_RATIO, left));
    top = 0;
  } else {
    H = (HEAD_FILL[mode] * size) / head.h;
    left = size / 2 - head.cx * H * HEAD_RATIO;
    top = Math.min(0, size * (mode === 'tete' ? 0.5 : 0.3) - head.cy * H);
  }
  return (
    <View style={box} accessibilityLabel={label}>
      <Image source={source} resizeMode="cover" style={{ position: 'absolute', width: H * HEAD_RATIO, height: H, left, top }} />
    </View>
  );
}

/**
 * « moi » : le perso PERSONNALISÉ de l'utilisateur (dessin IA de la tenue portée ou fiche validée) prime toujours —
 * jamais l'image d'une autre personne à sa place. Sans perso personnalisé, l'avatar maître de l'app (rendu de l'usine).
 */
function Me({ size, mode, box }: { size: number; mode: PortraitMode; box: StyleProp<ViewStyle> }) {
  const skin = useEquippedSkin();
  const avatar = useGame((s) => s.avatar);
  const ready = useGame((s) => s.characterReady);
  const personal = (!!avatar && avatar.outfit === skin.id) || ready;
  const rendered = personal ? null : portraitSource('moi', KIND[mode]);
  if (rendered) {
    return (
      <View style={box}>
        <Image source={rendered} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      </View>
    );
  }
  return <MyPortrait size={size} mode={mode} box={box} />;
}

const FRAME: Record<PortraitMode, { zoom: number; top: number }> = {
  tete: { zoom: 2.25, top: 0.1 },
  buste: { zoom: 1.45, top: 0.06 },
  corps: { zoom: 1, top: 0 },
  carte: { zoom: 1.2, top: 0.03 },
};
const KIND: Record<PortraitMode, PortraitKind> = { tete: 'head', buste: 'bust', corps: 'full', carte: 'card' };

export function AvatarPortrait({ avatarId, size, mode = 'tete', radius, style }: { avatarId: string; size: number; mode?: PortraitMode; radius?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const f = FRAME[mode];
  const h = mode === 'corps' ? size * 1.6 : mode === 'carte' ? size * 1.25 : size;
  const box: StyleProp<ViewStyle> = [{ width: size, height: h, borderRadius: radius ?? (mode === 'tete' ? 999 : 20), overflow: 'hidden', backgroundColor: t.track }, style];

  if (avatarId === 'moi') return <Me size={size} mode={mode} box={box} />;
  // 1) rendu de l'usine d'avatars (avatar maître), s'il existe
  const rendered = portraitSource(avatarId, KIND[mode]);
  if (rendered) {
    return (
      <View style={box}>
        <Image source={rendered} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      </View>
    );
  }
  // 2) replis
  const demo = avatarId.startsWith('demo:') ? demoAvatar(avatarId.slice(5)) : null;
  if (demo) {
    const w = size * f.zoom;
    const hh = (w * AVATAR_VB.h) / AVATAR_VB.w;
    return (
      <View style={box}>
        <View style={{ position: 'absolute', left: (size - w) / 2, top: -hh * f.top }}>
          <VectorAvatar sheet={demo.sheet} outfit={demo.outfit} width={w} background={false} />
        </View>
      </View>
    );
  }
  return <View style={box} />;
}
