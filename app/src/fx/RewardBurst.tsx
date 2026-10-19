import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useGame } from '@/store/useGame';
import { CoinIcon, GoldIcon } from '@/components/Icons';

const N = 14;

function Coin({ i, cur, w, h }: { i: number; cur: 'earn' | 'prem'; w: number; h: number }) {
  const p = useSharedValue(0);
  const seed = (i * 9301 + 49297) % 233280 / 233280; // pseudo-aléatoire stable
  const x0 = w / 2 + (seed - 0.5) * 60;
  const dx = (seed - 0.5) * 260;
  const rise = 160 + seed * 160;
  useEffect(() => {
    p.set(0);
    p.set(withDelay(i * 28, withTiming(1, { duration: 900 + seed * 300, easing: Easing.out(Easing.cubic) })));
  }, [p, i, seed]);
  const st = useAnimatedStyle(() => {
    const k = p.get();
    const up = Math.sin(k * Math.PI); // monte puis retombe
    return {
      opacity: k < 0.85 ? 1 : (1 - k) / 0.15,
      transform: [
        { translateX: x0 + dx * k },
        { translateY: h * 0.62 - rise * up + 40 * k * k },
        { rotate: `${k * 360 * (seed > 0.5 ? 1 : -1)}deg` },
        { scale: 0.7 + 0.5 * up },
      ],
    };
  });
  return <Animated.View style={[styles.coin, st]}>{cur === 'prem' ? <GoldIcon size={22} /> : <CoinIcon size={22} />}</Animated.View>;
}

/** Pluie de crédits à chaque gain (défi, repas, coffre). Montée uniquement sur un événement, jamais en boucle. */
export function RewardBurst() {
  const burst = useGame((s) => s.burst);
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const [live, setLive] = useState<{ id: number; cur: 'earn' | 'prem' } | null>(null);
  // État dérivé pendant le rendu : un nouveau gain déclenche une nouvelle pluie.
  if (burst.id && live?.id !== burst.id) setLive({ id: burst.id, cur: burst.cur });
  useEffect(() => {
    if (!live) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const t = setTimeout(() => setLive(null), 1500);
    return () => clearTimeout(t);
  }, [live]);
  if (!live || reduced) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: N }, (_, i) => (
        <Coin key={live.id + ':' + i} i={i} cur={live.cur} w={width} h={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ coin: { position: 'absolute', left: -11, top: 0 } });
