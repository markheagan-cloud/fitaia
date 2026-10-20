import React, { useEffect } from 'react';
import { ImageSourcePropType, ImageStyle, StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useBody, useGame } from '@/store/useGame';
import { useEquippedSkin } from '@/avatar/outfits';
import { previewImage } from '@/data/character';
import { BODY_STAGES, sheetMatchesHero, stageIndex } from './bodyStages';
import { avatarBase, defaultSheetFor, type AvatarBase } from './identity';

/** Base du perso (homme / femme), la même pour la 2D et la 3D. */
export function useAvatarBase(): AvatarBase {
  const sex = useGame((s) => s.profile.sex);
  const appearance = useGame((s) => s.character.appearance);
  const ready = useGame((s) => s.characterReady);
  return avatarBase(sex, { appearance }, ready);
}

/** Silhouette de l'usine à montrer (index dans BODY_STAGES), ou null si elle ne s'applique pas à ce joueur. */
export function useHeroStage(): number | null {
  const skin = useEquippedSkin();
  const ready = useGame((s) => s.characterReady);
  const sheet = useGame((s) => s.character);
  const body = useBody();
  const base = useAvatarBase();
  if (skin.id !== 'origine' || body.profile.startKg <= body.profile.targetKg || !sheetMatchesHero(sheet, ready, base)) return null;
  return stageIndex(body.tier);
}

/** Image du perso actuellement affichée (même règle partout : Accueil, Mon perso, Communauté). */
export function useHeroSource(): { source: ImageSourcePropType; label: string } {
  const skin = useEquippedSkin();
  const avatar = useGame((s) => s.avatar);
  const ready = useGame((s) => s.characterReady);
  const sheet = useGame((s) => s.character);
  const stage = useHeroStage();
  const base = useAvatarBase();
  const label = 'Ton perso en tenue ' + skin.name;
  if (avatar && avatar.outfit === skin.id) return { source: { uri: avatar.uri }, label };
  // tenue de départ : le corps rendu par l'usine, au palier atteint (départ, en route, objectif)
  if (stage !== null) return { source: BODY_STAGES[stage].img, label: 'Ton perso, étape ' + BODY_STAGES[stage].label.toLowerCase() };
  if (ready) return { source: previewImage(sheet), label };
  // les illustrations de tenue montrent un homme : une femme voit sa base réaliste, pas un autre personnage
  if (base === 'f') return { source: previewImage(defaultSheetFor('f')), label: 'Ton perso' };
  return { source: skin.img, label };
}

/**
 * Le perso affiché partout (Accueil, Mon perso) :
 * 1) dessin IA « HD » s'il existe pour la tenue équipée ;
 * 2) sinon le rendu réaliste le plus proche de la fiche (créateur validé) ;
 * 3) sinon l'illustration par défaut de la tenue.
 */
export function HeroAvatar({ width, height, style, idle = true }: { width: number; height: number; style?: StyleProp<ViewStyle & ImageStyle>; idle?: boolean }) {
  const imgStyle = style as StyleProp<ImageStyle>;
  const { source, label } = useHeroSource();
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    // respiration sur place : cycle de 4,2 s, amplitude très faible (le perso « vit » sans bouger)
    if (idle && !reduced) t.set(withRepeat(withTiming(1, { duration: 2100, easing: Easing.inOut(Easing.sin) }), -1, true));
    else t.set(0);
  }, [idle, reduced, t]);
  const anim = useAnimatedStyle(() => {
    const v = t.get();
    return {
      // ancrage aux pieds : le torse se gonfle légèrement, le corps oscille d'un demi-degré
      transformOrigin: 'bottom center',
      transform: [{ scaleY: 1 + 0.008 * v }, { scaleX: 1 + 0.004 * v }, { rotateZ: `${(v - 0.5) * 0.5}deg` }],
    };
  });
  return (
    <Animated.Image source={source} accessibilityLabel={label} style={[{ width, height }, imgStyle, anim]} resizeMode="cover" />
  );
}
