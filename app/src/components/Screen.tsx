import React from 'react';
import { View, ScrollView, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { motion, shadow } from '@/theme/tokens';
import { TITLES } from '@/data/content';
import { Header } from './Header';
import { NAV_H, NAV_BOTTOM } from './GlassTabBar';

const ease = Easing.bezier(motion.bezier[0], motion.bezier[1], motion.bezier[2], motion.bezier[3]);

/** Écran standard : header + zone scrollable (padding bas = barre de nav + marge), fade-in .fx-in. */
export function Screen({ name, children, gap = 12 }: { name: keyof typeof TITLES; children: React.ReactNode; gap?: number }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(NAV_BOTTOM, insets.bottom + 6) + NAV_H + 32;
  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <Header screen={name} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
      >
        <Animated.View entering={FadeInDown.duration(motion.card).easing(ease)} style={{ gap }}>
          {children}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

/** Carte surface (.fx-card) : fond surf, rayon, ombre composite. */
export function Card({ children, style, radius = 24, pad = 14, elevated = false }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: number; pad?: number; elevated?: boolean }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.surf, borderRadius: radius, padding: pad }, elevated ? shadow.md : shadow.card, style]}>{children}</View>;
}

/** Ligne titre + indication à droite ("Autres défis" / "Nouveaux dans 9 h"). */
export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4, paddingTop: 6 },
});
