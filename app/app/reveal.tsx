/**
 * Révélation du perso : après le selfie, la personne voit son perso apparaître (dessin par le service en ligne),
 * puis les tenues de la boutique portées par lui. Rien de simulé : tant que le service n'a pas répondu, l'écran
 * montre le selfie et l'étape en cours ; en cas d'échec, le message réel et un bouton pour réessayer.
 */
import React, { useEffect, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LIME, OBSIDIAN } from '@/theme/tokens';
import { useGame } from '@/store/useGame';
import { SKINS, RARITY } from '@/data/content';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { scheduleDailyMissions } from '@/services/reminders';

const STEP: Record<string, string> = { queued: 'Envoi de ton selfie…', running: 'Ton perso se dessine…', saving: 'Dernières touches…' };

export default function Reveal() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const selfieUri = useGame((s) => s.selfieUri);
  const caricature = useGame((s) => s.caricature);
  const job = useGame((s) => s.caricatureJob);
  const createMyCaricature = useGame((s) => s.createMyCaricature);
  const failed = job.state === 'failed';
  const done = !!caricature && job.state === 'idle';
  const size = Math.min(width - 64, 320);

  const [pulse] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(0));
  const [rise] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const b = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [pulse, spin]);

  useEffect(() => {
    if (!done) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [done, pop, rise]);

  const outfits = caricature?.outfits ?? {};
  const shown = SKINS.filter((s) => outfits[s.id]);

  return (
    <View style={{ flex: 1, backgroundColor: OBSIDIAN }}>
      <LinearGradient colors={['#0E0F11', '#1C1D1F', '#23301A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
          <Txt size={13} weight="semibold" color={LIME}>{done ? 'TON PERSO' : failed ? 'À REFAIRE' : 'CRÉATION EN COURS'}</Txt>
          <Display size={34} color="#F5F4F1" style={{ textAlign: 'center' }}>{done ? 'C’est toi.' : failed ? 'Le dessin n’a pas abouti' : 'Ton visage devient ton perso'}</Display>

          <View style={{ width: size + 36, height: size + 36, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={[styles.halo, { width: size + 36, height: size + 36, borderRadius: (size + 36) / 2, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.04] }) }] }]} />
            {!done && !failed ? (
              <Animated.View style={[styles.ring, { width: size + 16, height: size + 16, borderRadius: (size + 16) / 2, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]} />
            ) : null}
            {done && caricature ? (
              <Animated.View style={{ opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
                <Image source={{ uri: caricature.portraitUri }} accessibilityLabel="Ton perso, dessiné depuis ton selfie" style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: LIME }} contentFit="cover" />
              </Animated.View>
            ) : selfieUri ? (
              <Image source={{ uri: selfieUri }} accessibilityLabel="Ton selfie" style={{ width: size, height: size, borderRadius: size / 2, opacity: 0.55 }} contentFit="cover" blurRadius={6} />
            ) : null}
          </View>

          <Txt accessibilityLiveRegion="polite" size={15} lineHeight={21} color="#B7BBC2" style={{ textAlign: 'center' }}>
            {done
              ? 'Dessiné depuis ton selfie, à ta silhouette. Il change de corps à chaque palier que tu franchis.'
              : failed
                ? job.error || 'Le service de dessin n’a pas répondu.'
                : (STEP[job.state] ?? 'Ton perso se dessine…') + ' Moins d’une minute.'}
          </Txt>

          {done && shown.length ? (
            <Animated.View style={{ alignSelf: 'stretch', gap: 10, opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
              <Txt size={13} weight="semibold" color="#F5F4F1">Tes tenues, sur toi</Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {shown.map((s) => (
                  <View key={s.id} style={[styles.outfit, { borderColor: RARITY[s.rarity].c }]}>
                    <Image source={{ uri: outfits[s.id] }} accessibilityLabel={'Ton perso en tenue ' + s.name} style={{ width: 132, height: 132 }} contentFit="cover" />
                    <View style={{ padding: 8, gap: 1 }}>
                      <Txt size={13} weight="bold" color="#F5F4F1" numberOfLines={1}>{s.name}</Txt>
                      <Txt size={11} weight="semibold" color={RARITY[s.rarity].c}>{RARITY[s.rarity].label}</Txt>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </Animated.View>
          ) : null}

          {done ? (
            <Press haptic="medium" onPress={() => {
              void scheduleDailyMissions();
              router.replace('/(tabs)');
            }} style={[styles.btn, { backgroundColor: LIME }]}>
              <Txt size={16} weight="bold" color={OBSIDIAN}>Entrer dans FITAIA</Txt>
            </Press>
          ) : failed ? (
            <>
              <Press haptic="medium" onPress={() => void createMyCaricature()} style={[styles.btn, { backgroundColor: LIME }]}>
                <Txt size={16} weight="bold" color={OBSIDIAN}>Réessayer</Txt>
              </Press>
              <Press onPress={() => router.replace('/selfie')} style={[styles.btn, { borderWidth: 1, borderColor: '#4A4D52' }]}>
                <Txt size={15} weight="semibold" color="#F5F4F1">Reprendre mon selfie</Txt>
              </Press>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 },
  halo: { position: 'absolute', backgroundColor: LIME },
  ring: { position: 'absolute', borderWidth: 3, borderColor: 'transparent', borderTopColor: LIME, borderRightColor: LIME },
  outfit: { width: 136, borderRadius: 18, borderWidth: 2, overflow: 'hidden', backgroundColor: '#17181A' },
  btn: { alignSelf: 'stretch', height: 56, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
