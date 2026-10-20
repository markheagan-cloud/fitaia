import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN } from '@/theme/tokens';
import { useGame } from '@/store/useGame';
import { currentWeight } from '@/store/profile';
import { fmtKg } from '@/data/content';
import {
  DEFAULT_ANIMATION_MS,
  avatarForBase,
  HumanAvatarView,
  currentAndTarget,
  fitaiaHumanEngine,
  useHumanEngine,
  type BodyParameters,
  type ExpoThreeRenderer,
} from '@/human-engine';
import { Slider } from '@/components/Slider';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CloseIcon } from '@/components/Icons';
import { avatarBase } from '@/avatar/identity';

const lerp = (a: BodyParameters, b: BodyParameters, t: number): BodyParameters => ({
  weight: a.weight + (b.weight - a.weight) * t,
  bellyFat: a.bellyFat + (b.bellyFat - a.bellyFat) * t,
  muscle: a.muscle + (b.muscle - a.muscle) * t,
});

/**
 * Mon corps en 3D : le vrai GLB du héros (usine hero3d), piloté par le profil. Glisser pour tourner sur 360°, curseur
 * ou bouton pour passer du corps actuel à l'objectif. Illustration, jamais une prédiction médicale.
 */
export default function Corps() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useGame((s) => s.profile);
  const appearance = useGame((s) => s.character.appearance);
  const ready = useGame((s) => s.characterReady);
  // même base que les images 2D (Accueil, Mon perso, Communauté)
  const base = avatarBase(profile.sex, { appearance }, ready);
  const avatar = useMemo(() => avatarForBase(base), [base]);
  const weights = useGame((s) => s.weights);
  const kg = currentWeight(profile, weights);
  const { current, target } = useMemo(() => currentAndTarget(profile, kg), [profile, kg]);
  const snap = useHumanEngine(fitaiaHumanEngine);
  const [mix, setMix] = useState(0);
  const [scroll, setScroll] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const rendererRef = useRef<ExpoThreeRenderer | null>(null);

  useEffect(() => {
    fitaiaHumanEngine.setBody(current);
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    // corps actuel à l'ouverture, une seule fois
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAt = (v: number) => {
    setMix(v);
    fitaiaHumanEngine.setBody(lerp(current, target, v));
  };
  const goTo = (v: number) => {
    const from = lerp(current, target, mix);
    setMix(v);
    fitaiaHumanEngine.animateTo(lerp(current, target, v), { from, durationMs: reduceMotion ? 0 : DEFAULT_ANIMATION_MS });
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/perso'));
  const load = snap.load;
  const shownKg = kg + (profile.targetKg - kg) * mix;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: 16, gap: 14 }} scrollEnabled={scroll}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Display size={22}>Mon corps en 3D</Display>
            <Txt size={12} color={t.ink2}>Glisse pour tourner autour de ton perso</Txt>
          </View>
          <Press accessibilityLabel="Fermer" onPress={back} style={[styles.round, { backgroundColor: t.surf }]}>
            <CloseIcon color={t.ink} />
          </Press>
        </View>

        <View>
          <HumanAvatarView
            avatar={avatar}
            engine={fitaiaHumanEngine}
            strategy={Platform.OS === 'web' ? 'gpu' : 'cpu'}
            mode="onDemand"
            height={460}
            background={t.dark ? '#1D1F22' : '#E6E4DF'}
            onRenderer={(x) => (rendererRef.current = x)}
            onGesture={(active) => setScroll(!active)}
          />
          {load.status !== 'ready' ? (
            <View style={[styles.center, { pointerEvents: 'none' }]}>
              <Txt size={13} color={load.status === 'error' ? '#E2483D' : t.ink2}>
                {load.status === 'error' ? 'Le perso 3D n’a pas pu se charger.' : 'Chargement du perso 3D…'}
              </Txt>
            </View>
          ) : null}
          <View style={styles.overlayBottom}>
            <Press accessibilityLabel="Recentrer la vue" onPress={() => rendererRef.current?.resetView()} style={[styles.camBtn, { width: 96 }]}>
              <Txt size={12} weight="semibold" color="#F5F4F1">Recentrer</Txt>
            </Press>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Press accessibilityState={{ selected: mix === 0 }} onPress={() => goTo(0)} style={[styles.btn, { borderColor: t.line, backgroundColor: mix === 0 ? t.ink : 'transparent' }]}>
            <Txt size={14} weight="semibold" color={mix === 0 ? t.bg : t.ink}>Aujourd’hui</Txt>
          </Press>
          <Press accessibilityState={{ selected: mix === 1 }} onPress={() => goTo(1)} style={[styles.btn, { borderColor: t.line, backgroundColor: mix === 1 ? t.ink : 'transparent' }]}>
            <Txt size={14} weight="semibold" color={mix === 1 ? t.bg : t.ink}>Objectif</Txt>
          </Press>
        </View>

        <View style={[styles.card, { backgroundColor: t.surf }]}>
          <Slider label={'Vers l’objectif · ' + fmtKg(shownKg) + ' kg'} value={mix} onChange={setAt} />
        </View>

        <Press haptic="medium" onPress={() => goTo(mix < 0.5 ? 1 : 0)} style={[styles.primary, { backgroundColor: LIME }]}>
          <Txt size={15} weight="bold" color={OBSIDIAN}>{mix < 0.5 ? 'Voir mon objectif' : 'Revenir à aujourd’hui'}</Txt>
        </Press>

        <Txt size={12} lineHeight={17} color={t.ink2}>
          Illustration calculée à partir de ta taille, de ton poids et de ton objectif. Ce n’est ni une prédiction médicale ni une reconstruction exacte de ton corps.
        </Txt>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  round: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  overlayBottom: { position: 'absolute', bottom: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  camBtn: { minWidth: 44, height: 44, paddingHorizontal: 10, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(18,19,21,0.72)' },
  card: { borderRadius: 22, padding: 14, gap: 12 },
  btn: { flex: 1, height: 48, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primary: { height: 54, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
