import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '@/store/useGame';
import { RED, OBSIDIAN, motion, shadow } from '@/theme/tokens';
import { NAV_H, NAV_BOTTOM } from './GlassTabBar';
import { Txt } from './Txt';

const ease = Easing.bezier(motion.bezier[0], motion.bezier[1], motion.bezier[2], motion.bezier[3]);

/**
 * Toast global (.fx-toast) : au-dessus de la barre de nav, 2,8 s.
 * Toujours monté ; l'apparition/disparition est pilotée par des valeurs partagées
 * (pas d'entering/exiting : fiable sur iOS, Android et web).
 */
export function Toast() {
  const toast = useGame((s) => s.toast);
  const toastKind = useGame((s) => s.toastKind);
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<{ text: string; kind: 'ok' | 'bad' } | null>(null);
  const progress = useSharedValue(0); // 0 = caché, 1 = visible

  // État dérivé pendant le rendu (pattern React officiel) : un nouveau toast remplace l'affiché.
  if (toast && (shown?.text !== toast || shown.kind !== toastKind)) {
    setShown({ text: toast, kind: toastKind });
  }

  useEffect(() => {
    if (toast) {
      progress.set(0);
      progress.set(withTiming(1, { duration: motion.toast, easing: ease }));
    } else {
      progress.set(withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished) runOnJS(setShown)(null);
      }));
    }
  }, [toast, toastKind, progress]);

  const anim = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * 14 }, { scale: 0.96 + 0.04 * progress.get() }],
  }));

  if (!shown) return null;
  const bottom = Math.max(NAV_BOTTOM, insets.bottom + 6) + NAV_H + 12;
  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.toast, { bottom, backgroundColor: shown.kind === 'bad' ? RED : OBSIDIAN }, shadow.toast, anim]}
    >
      <Txt size={14} weight="semibold" color={shown.kind === 'bad' ? '#FFFFFF' : '#F5F4F1'}>{shown.text}</Txt>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 20,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 20,
    pointerEvents: 'none',
  },
});
