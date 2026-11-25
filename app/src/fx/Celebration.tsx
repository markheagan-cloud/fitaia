import React, { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useCelebrate } from './celebrate';
import { useCountUp } from './AnimatedNumber';
import { useGame } from '@/store/useGame';
import { LIME, OBSIDIAN } from '@/theme/tokens';
import { CUR_NAMES } from '@/data/content';
import { Txt, Display } from '@/components/Txt';
import { CoinIcon } from '@/components/Icons';
import { playSfx } from '@/services/sound';

const COLORS = [LIME, '#FF4FA3', '#FFC93C', '#27E0D0', '#F5F4F1'];
const N = 36;

/** Un confetti : tout est calculé sur le fil d'interface (reanimated), donc fluide même si l'app travaille. */
function Confetti({ i, w, h }: { i: number; w: number; h: number }) {
  const p = useSharedValue(0);
  const seed = ((i * 9301 + 49297) % 233280) / 233280;
  const seed2 = ((i * 4621 + 7919) % 104729) / 104729;
  useEffect(() => {
    p.set(withDelay(seed2 * 180, withTiming(1, { duration: 1500 + seed * 900, easing: Easing.out(Easing.quad) })));
  }, [p, seed, seed2]);
  const st = useAnimatedStyle(() => {
    const k = p.get();
    const angle = -Math.PI / 2 + (seed - 0.5) * 2.4;
    const speed = 260 + seed2 * 320;
    return {
      opacity: k < 0.75 ? 1 : (1 - k) / 0.25,
      transform: [
        { translateX: w / 2 + Math.cos(angle) * speed * k },
        { translateY: h * 0.42 + Math.sin(angle) * speed * k + 620 * k * k },
        { rotate: `${k * 720 * (seed > 0.5 ? 1 : -1)}deg` },
      ],
    };
  });
  return <Animated.View style={[styles.bit, { backgroundColor: COLORS[i % COLORS.length], width: 6 + seed2 * 6, height: 10 + seed * 8 }, st]} />;
}

function Card({ id }: { id: number }) {
  const event = useCelebrate((s) => s.event)!;
  const close = useCelebrate((s) => s.close);
  const portrait = useGame((s) => s.caricature?.portraitUri);
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const scrim = useSharedValue(0);
  const pop = useSharedValue(reduced ? 1 : 0.6);
  const halo = useSharedValue(0);
  const [go, setGo] = useState(false); // les compteurs partent de 0 puis montent
  const coins = useCountUp(go ? event.coins ?? 0 : 0, 900);
  const points = useCountUp(go ? event.points ?? 0 : 0, 900);
  const img = event.image ?? portrait;

  useEffect(() => {
    scrim.set(withTiming(1, { duration: 220 }));
    pop.set(withSpring(1, { damping: 9, stiffness: 140 }));
    halo.set(withSequence(withTiming(1, { duration: 500 }), withTiming(0.6, { duration: 900 })));
    playSfx('succes');
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 260);
    }
    const g = setTimeout(() => setGo(true), 250);
    const t = setTimeout(close, 3400);
    return () => { clearTimeout(g); clearTimeout(t); };
  }, [id, scrim, pop, halo, close]);

  const scrimSt = useAnimatedStyle(() => ({ opacity: scrim.get() }));
  const popSt = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  const haloSt = useAnimatedStyle(() => ({ opacity: halo.get() * 0.55, transform: [{ scale: 0.8 + halo.get() * 0.5 }] }));

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={event.title + '. Toucher pour continuer'} onPress={close} style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimSt]} />
      {!reduced ? Array.from({ length: N }, (_, i) => <Confetti key={id + ':' + i} i={i} w={width} h={height} />) : null}
      <Animated.View style={[styles.center, popSt]}>
        <Animated.View style={[styles.halo, haloSt]} />
        {img ? <Image source={{ uri: img }} style={styles.img} /> : null}
        <Display size={32} color="#F5F4F1" style={{ textAlign: 'center' }}>{event.title}</Display>
        {event.sub ? <Txt size={15} color="#C9CCD2" style={{ textAlign: 'center' }}>{event.sub}</Txt> : null}
        {event.coins || event.points ? (
          <View style={styles.gains}>
            {event.coins ? (
              <View style={styles.gain}>
                <CoinIcon size={20} />
                <Txt size={20} weight="bold" num color={OBSIDIAN}>{'+' + coins + ' ' + CUR_NAMES[0]}</Txt>
              </View>
            ) : null}
            {event.points ? (
              <View style={[styles.gain, { backgroundColor: '#F5F4F1' }]}>
                <Txt size={20} weight="bold" num color={OBSIDIAN}>{'+' + points + ' PF'}</Txt>
              </View>
            ) : null}
          </View>
        ) : null}
        <Txt size={12} color="#8A8E96">Touche pour continuer</Txt>
      </Animated.View>
    </Pressable>
  );
}

/** Monté une fois à la racine ; n'affiche rien hors célébration. */
export function Celebration() {
  const id = useCelebrate((s) => s.id);
  const event = useCelebrate((s) => s.event);
  if (!event) return null;
  return <Card key={id} id={id} />;
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(12,13,15,0.88)' },
  bit: { position: 'absolute', left: 0, top: 0, borderRadius: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 28 },
  halo: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: LIME },
  img: { width: 190, height: 190, borderRadius: 95, borderWidth: 4, borderColor: LIME, backgroundColor: '#26282C' },
  gains: { flexDirection: 'row', gap: 10, marginTop: 6 },
  gain: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: LIME, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
});
