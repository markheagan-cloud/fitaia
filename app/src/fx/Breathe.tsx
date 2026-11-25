import React, { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

/** Respiration douce du perso (2 % d'échelle, léger flottement) : il a l'air vivant sans distraire. Fil d'interface uniquement. */
export function Breathe({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) p.set(withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [p, reduced]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * p.get() }, { scale: 1 + 0.02 * p.get() }] }));
  return <Animated.View style={[style, st]}>{children}</Animated.View>;
}
