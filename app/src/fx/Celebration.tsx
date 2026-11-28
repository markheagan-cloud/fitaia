import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { buzz } from '@/services/haptics';
import { useCelebrate } from './celebrate';
import { useCountUp } from './AnimatedNumber';
import { useGame } from '@/store/useGame';
import { LIME, OBSIDIAN, RARITY_STYLE, V2 } from '@/theme/tokens';
import type { Rarity } from '@/inventory/types';
import { Press } from '@/components/Press';
import { CUR_NAMES } from '@/data/content';
import { Txt, Display } from '@/components/Txt';
import { CoinIcon } from '@/components/Icons';
import { playSfx } from '@/services/sound';

const COLORS = [LIME, V2.violet, V2.gold, '#3DDCCB', V2.white];

/** Intensité de la révélation selon la rareté : délai avant d'afficher la tenue, confettis, rayons, ondes, durée. */
const TIER: Record<Rarity, { delay: number; bits: number; rays: boolean; rings: number; ms: number }> = {
  COMMON: { delay: 0, bits: 18, rays: false, rings: 0, ms: 2600 },
  RARE: { delay: 150, bits: 36, rays: false, rings: 2, ms: 3400 },
  EPIC: { delay: 350, bits: 56, rays: true, rings: 3, ms: 4200 },
  LEGENDARY: { delay: 800, bits: 80, rays: true, rings: 3, ms: 5200 },
};
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

/** Achat : onde de choc qui part du perso. */
function Ring({ delay, color }: { delay: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) })));
  }, [p, delay]);
  const st = useAnimatedStyle(() => ({ opacity: (1 - p.get()) * 0.9, transform: [{ scale: 0.5 + p.get() * 2.6 }] }));
  return <Animated.View style={[styles.ring, { borderColor: color }, st]} />;
}

/** Achat : rayons de lumière qui tournent derrière le perso. */
function Rays({ color }: { color?: string }) {
  const r = useSharedValue(0);
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withTiming(1, { duration: 400 }));
    r.set(withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1));
  }, [r, o]);
  const st = useAnimatedStyle(() => ({ opacity: o.get() * 0.26, transform: [{ rotate: `${r.get() * 360}deg` }] }));
  return (
    <Animated.View style={[styles.rays, st]}>
      {Array.from({ length: 12 }, (_, i) => (
        <View key={i} style={[styles.ray, { backgroundColor: color ?? COLORS[i % 4], transform: [{ rotate: `${i * 30}deg` }, { translateY: -150 }] }]} />
      ))}
    </Animated.View>
  );
}

/** Symbole de la rareté qui apparaît d'abord, seul, avant la tenue (révélation). */
function Symbol({ rarity }: { rarity: Rarity }) {
  const r = RARITY_STYLE[rarity];
  const p = useSharedValue(0);
  useEffect(() => {
    const d = TIER[rarity].delay;
    p.set(withSequence(withTiming(1, { duration: Math.min(380, d * 0.7), easing: Easing.out(Easing.back(2)) }), withDelay(Math.max(0, d * 0.3 - 120), withTiming(0, { duration: 200 }))));
  }, [p, rarity]);
  const st = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ scale: 0.4 + p.get() * 1.1 }] }));
  return (
    <Animated.View style={[styles.symbol, st]} pointerEvents="none">
      <Txt size={96} color={r.c}>{r.symbol}</Txt>
      <Txt size={14} weight="bold" color={r.c} style={{ letterSpacing: 3 }}>{r.label.toUpperCase()}</Txt>
    </Animated.View>
  );
}

function Card({ id }: { id: number }) {
  const event = useCelebrate((s) => s.event)!;
  const close = useCelebrate((s) => s.close);
  const portrait = useGame((s) => s.caricature?.portraitUri);
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const rarity: Rarity | null = event.rarity ?? null;
  const tier = rarity ? TIER[rarity] : null;
  const accent = rarity ? RARITY_STYLE[rarity].c : LIME;
  const reveal = !!rarity && !reduced && tier!.delay > 0;
  const scrim = useSharedValue(0);
  const pop = useSharedValue(reduced ? 1 : 0.6);
  const halo = useSharedValue(0);
  const [go, setGo] = useState(false); // les compteurs partent de 0 puis montent
  const [shown, setShown] = useState(!reveal); // la tenue apparaît après le symbole de rareté
  const coins = useCountUp(go ? event.coins ?? 0 : 0, 900);
  const points = useCountUp(go ? event.points ?? 0 : 0, 900);
  const img = event.image ?? portrait;
  const achat = event.kind === 'achat';
  const big = rarity === 'EPIC' || rarity === 'LEGENDARY';

  useEffect(() => {
    scrim.set(withTiming(1, { duration: 220 }));
    const delay = reveal ? tier!.delay : 0;
    pop.set(withDelay(delay, withSpring(1, { damping: 9, stiffness: 140 })));
    halo.set(withDelay(delay, withSequence(withTiming(1, { duration: 500 }), withTiming(0.6, { duration: 900 }))));
    if (rarity === 'LEGENDARY' || rarity === 'EPIC') playSfx('revelation');
    const s1 = setTimeout(() => {
      setShown(true);
      playSfx(achat ? 'achat' : 'succes');
      buzz('success');
      if (rarity !== 'COMMON') setTimeout(() => buzz('heavy'), 260);
      if (big) [420, 560, 700].forEach((ms) => setTimeout(() => buzz('medium'), ms));
    }, delay);
    const g = setTimeout(() => setGo(true), delay + 250);
    // avec des choix à faire, la carte attend ; sinon elle se ferme seule
    const t = event.actions?.length ? null : setTimeout(close, delay + (tier ? tier.ms : achat ? 4600 : 3400));
    return () => {
      clearTimeout(s1);
      clearTimeout(g);
      if (t) clearTimeout(t);
    };
  }, [id, scrim, pop, halo, close, achat, rarity, reveal, tier, big, event.actions?.length]);

  const scrimSt = useAnimatedStyle(() => ({ opacity: scrim.get() }));
  const popSt = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  const haloSt = useAnimatedStyle(() => ({ opacity: halo.get() * (img ? 0.55 : 0.18), transform: [{ scale: 0.8 + halo.get() * 0.5 }] }));
  const bits = tier ? tier.bits : achat ? N * 2 : N;
  const rays = tier ? tier.rays : achat;
  const rings = tier ? tier.rings : achat ? 3 : 0;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={event.title + (event.actions?.length ? '' : '. Toucher pour continuer')} onPress={event.actions?.length ? undefined : close} style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, rarity ? { backgroundColor: 'rgba(5,6,8,0.92)' } : null, scrimSt]} />
      {reveal ? <Symbol rarity={rarity!} /> : null}
      {shown && !reduced ? Array.from({ length: bits }, (_, i) => <Confetti key={id + ':' + i} i={i} w={width} h={height} />) : null}
      <Animated.View style={[styles.center, popSt, { opacity: shown ? 1 : 0 }]}>
        {shown && rays && !reduced ? <Rays color={rarity ? accent : undefined} /> : null}
        <Animated.View style={[styles.halo, { backgroundColor: accent }, haloSt]} />
        {shown && !reduced ? Array.from({ length: rings }, (_, i) => <Ring key={i} delay={i * 220} color={rarity ? accent : COLORS[i]} />) : null}
        {img ? <Image source={{ uri: img }} style={[styles.img, { borderColor: accent }, rarity ? styles.imgTall : null]} resizeMode="cover" /> : null}
        {rarity ? <Txt size={12} weight="bold" color={accent} style={{ letterSpacing: 2 }}>{RARITY_STYLE[rarity].symbol + ' ' + RARITY_STYLE[rarity].label.toUpperCase()}</Txt> : null}
        <Display size={30} color={V2.white} style={{ textAlign: 'center' }}>{event.title}</Display>
        {event.sub ? <Txt size={15} color="#C9CED6" style={{ textAlign: 'center' }}>{event.sub}</Txt> : null}
        {event.coins || event.points ? (
          <View style={styles.gains}>
            {event.coins ? (
              <View style={styles.gain}>
                <CoinIcon size={20} />
                <Txt size={20} weight="bold" num color={OBSIDIAN}>{'+' + coins + ' ' + CUR_NAMES[0]}</Txt>
              </View>
            ) : null}
            {event.points ? (
              <View style={[styles.gain, { backgroundColor: V2.white }]}>
                <Txt size={20} weight="bold" num color={OBSIDIAN}>{'+' + points + ' PF'}</Txt>
              </View>
            ) : null}
          </View>
        ) : null}
        {event.actions?.length ? (
          <View style={styles.actions}>
            {event.actions.map((a) => (
              <Press
                key={a.label}
                haptic={a.primary ? 'medium' : 'light'}
                onPress={() => {
                  close();
                  a.onPress();
                }}
                style={[styles.action, a.primary ? { backgroundColor: LIME } : { borderWidth: 1, borderColor: 'rgba(245,246,248,0.3)' }]}
              >
                <Txt size={15} weight="bold" color={a.primary ? OBSIDIAN : V2.white}>{a.label}</Txt>
              </Press>
            ))}
          </View>
        ) : (
          <Txt size={12} color={V2.grey}>Touche pour continuer</Txt>
        )}
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
  ring: { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 5 },
  rays: { position: 'absolute', width: 2, height: 2, alignItems: 'center', justifyContent: 'center' },
  ray: { position: 'absolute', width: 8, height: 200, borderRadius: 4 },
  halo: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: LIME },
  img: { width: 190, height: 190, borderRadius: 95, borderWidth: 4, borderColor: LIME, backgroundColor: '#26282C' },
  imgTall: { width: 220, height: 300, borderRadius: 28, borderWidth: 3 },
  symbol: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 10 },
  action: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  gains: { flexDirection: 'row', gap: 10, marginTop: 6 },
  gain: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: LIME, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
});
