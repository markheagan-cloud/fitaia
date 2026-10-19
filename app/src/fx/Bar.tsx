import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { motion } from '@/theme/tokens';

const ease = Easing.bezier(motion.bezier[0], motion.bezier[1], motion.bezier[2], motion.bezier[3]);

/** Barre de progression animée (0–1), même langage que la maquette : piste + remplissage. */
export function Bar({ pct, color, track, height = 6, radius = 9 }: { pct: number; color: string; track: string; height?: number; radius?: number }) {
  const w = useSharedValue(0);
  const reduced = useReducedMotion();
  const target = Math.max(0, Math.min(1, pct));
  useEffect(() => {
    if (reduced) w.set(target);
    else w.set(withTiming(target, { duration: 700, easing: ease }));
  }, [target, w, reduced]);
  const st = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View style={[styles.track, { height, borderRadius: radius, backgroundColor: track }]}>
      <Animated.View style={[styles.fill, { height, borderRadius: radius, backgroundColor: color }, st]} />
    </View>
  );
}

const styles = StyleSheet.create({ track: { width: '100%', overflow: 'hidden' }, fill: { position: 'absolute', left: 0, top: 0 } });
