import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { buzz } from '@/services/haptics';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { motion } from '@/theme/tokens';
import { playSfx } from '@/services/sound';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const ease = Easing.bezier(motion.bezier[0], motion.bezier[1], motion.bezier[2], motion.bezier[3]);

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Échelle à l'appui — .fx-press de la maquette : scale(.95) */
  pressScale?: number;
  /** Décalage vertical au repos → à l'appui (cartes : -1 ; boutons lime : 0) */
  haptic?: 'light' | 'medium' | 'none';
  children?: React.ReactNode;
};

/** Pressable avec feedback tactile + micro-animation d'échelle (équivalent .fx-press / .fx-lime). */
export function Press({ style, pressScale = 0.95, haptic = 'light', onPress, onPressIn, onPressOut, children, disabled, hitSlop, ...rest }: Props) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const target = reduced ? 1 : pressScale;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, ...(rest.accessibilityState ?? {}) }}
      disabled={disabled}
      hitSlop={hitSlop ?? 6}
      {...rest}
      onPressIn={(e) => {
        scale.set(withTiming(target, { duration: motion.press, easing: ease }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(reduced ? 1 : withSpring(1, { damping: 11, stiffness: 320 }));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic !== 'none') buzz(haptic);
        if (haptic === 'medium') playSfx('tap');
        onPress?.(e);
      }}
      style={[style, disabled && { opacity: 0.55 }, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}
