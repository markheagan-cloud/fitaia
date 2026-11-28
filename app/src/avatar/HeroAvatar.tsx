import { caricatureConfigured } from '@/services/caricature';
import React, { useEffect } from 'react';
import { ActivityIndicator, Image, ImageStyle, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useBody, useGame } from '@/store/useGame';
import { useEquippedSkin } from '@/avatar/outfits';
import { useLook } from '@/shop/useLook';
import { previewImage } from '@/data/character';
import { BODY_STAGES, sheetMatchesHero, stageIndex } from './bodyStages';
import { heroSourceFor, type HeroChoice } from './heroSource';
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

/** Image du perso actuellement affichée (même règle partout : Accueil, Mon perso, Communauté), voir heroSource.ts. */
export function useHeroSource(): HeroChoice {
  const skin = useEquippedSkin();
  const avatar = useGame((s) => s.avatar);
  const avatar3d = useGame((s) => s.avatar3d);
  const caricature = useGame((s) => s.caricature);
  const selfieUri = useGame((s) => s.selfieUri);
  const ready = useGame((s) => s.characterReady);
  const sheet = useGame((s) => s.character);
  const stage = useHeroStage();
  const base = useAvatarBase();
  const look = useLook((s) => s.worn);
  return heroSourceFor({
    look,
    base,
    caricature,
    pendingSelfie: caricatureConfigured ? selfieUri : null,
    avatar3d,
    drawing: avatar,
    skin,
    stage: stage === null ? null : BODY_STAGES[stage],
    ready,
    sheet,
    previewImage,
    defaultSheetFor,
  });
}

/**
 * Le perso affiché partout (Accueil, Mon perso) :
 * 0) la caricature personnelle (selfie) si elle existe ;
 * 1) le portrait de l'avatar 3D personnel (selfie) s'il existe ;
 * 2) le dessin IA « HD » s'il existe pour la tenue équipée ;
 * 3) sinon le rendu réaliste le plus proche de la fiche (créateur validé) ;
 * 4) sinon l'illustration par défaut de la tenue.
 */
export function HeroAvatar({ width, height, style, idle = true }: { width: number; height: number; style?: StyleProp<ViewStyle & ImageStyle>; idle?: boolean }) {
  const imgStyle = style as StyleProp<ImageStyle>;
  const { source, label, pending } = useHeroSource();
  const job = useGame((s) => s.caricatureJob.state);
  const create = useGame((s) => s.createMyCaricature);
  useEffect(() => {
    // perso jamais dessiné et rien en cours (app fermée pendant le dessin…) : on relance tout seul, une fois
    if (pending && job === 'idle') void create();
  }, [pending, job, create]);
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
  if (pending) {
    // Le perso se dessine : jamais la photo brute à sa place. Fond = selfie très flouté et assombri, message clair.
    const failed = job === 'failed';
    const big = height >= 200;
    return (
      <Pressable disabled={!failed} onPress={() => void create()} accessibilityRole={failed ? 'button' : undefined}
        accessibilityLabel={failed ? 'Le dessin de ton perso a été interrompu, toucher pour relancer' : 'Ton perso se dessine'}
        style={[{ width, height, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#14171D' }, style as StyleProp<ViewStyle>]}>
        <Image source={{ uri: pending }} blurRadius={40} resizeMode="cover" style={{ position: 'absolute', width, height, opacity: 0.35 }} />
        {failed ? null : <ActivityIndicator color="#C8F03C" size={big ? 'large' : 'small'} />}
        {big ? (
          <View style={{ alignItems: 'center', gap: 4, marginTop: 14, paddingHorizontal: 24 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'center' }}>{failed ? 'Le dessin a été interrompu' : 'Ton perso se dessine…'}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, textAlign: 'center' }}>{failed ? 'Touche ici pour relancer' : 'Environ 30 secondes, tu peux continuer'}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }
  return (
    <Animated.Image source={source} accessibilityLabel={label} style={[{ width, height }, imgStyle, anim]} resizeMode="cover" />
  );
}
