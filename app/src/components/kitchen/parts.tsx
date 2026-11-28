/**
 * Pièces communes de la cuisine FITAIA : icônes, photo de recette, bouton favori animé, feuille du bas,
 * indicateurs nutritionnels. Couleurs : tokens V2 (src/theme/tokens.ts) et thème clair/sombre.
 */
import React, { useEffect } from 'react';
import { Image, Modal, Pressable, StyleProp, StyleSheet, View, ViewStyle, type ImageStyle } from 'react-native';
import Animated, { Easing, FadeIn, SlideInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { V2, motion, shadow } from '@/theme/tokens';
import { RECIPE_PHOTOS } from '@/data/recipePhotos';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';

const ease = Easing.bezier(motion.bezier[0], motion.bezier[1], motion.bezier[2], motion.bezier[3]);

type IP = { size?: number; color?: string };
export function HeartIcon({ size = 20, color = V2.white, filled }: IP & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
    </Svg>
  );
}
export function BackIcon({ size = 20, color = V2.white }: IP) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M15 5l-7 7 7 7" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
export function ShareIcon({ size = 20, color = V2.white }: IP) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M5 12.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
export function ClockIcon({ size = 14, color = V2.grey }: IP) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8.5} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M12 7.5V12l3 2" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
export function TickIcon({ size = 14, color = V2.obsidian }: IP) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Photo d'une recette (embarquée dans l'app). Sans photo : un aplat graphite, jamais une image d'une autre recette. */
export function RecipePhoto({ id, style, label }: { id: string; style?: StyleProp<ImageStyle>; label?: string }) {
  const src = RECIPE_PHOTOS[id];
  if (!src) return <View style={[{ backgroundColor: V2.graphite2 }, style as StyleProp<ViewStyle>]} />;
  return <Image source={src} style={style} resizeMode="cover" accessibilityLabel={label} />;
}

/** Cœur favori : petit rebond (≈ 220 ms) quand il s'allume, sans animation si « Réduire les animations ». */
export function FavButton({ on, onPress, dark = true, size = 40, label }: { on: boolean; onPress: () => void; dark?: boolean; size?: number; label: string }) {
  const s = useSharedValue(1);
  const reduced = useReducedMotion();
  const first = React.useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (on && !reduced) s.set(withSequence(withTiming(1.25, { duration: 110, easing: ease }), withTiming(1, { duration: 110, easing: ease })));
  }, [on, reduced, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return (
    <Press
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      haptic="medium"
      style={[styles.round, { width: size, height: size, backgroundColor: dark ? 'rgba(11,13,16,0.55)' : 'transparent' }]}
    >
      <Animated.View style={anim}>
        <HeartIcon size={size * 0.5} filled={on} color={on ? V2.lime : dark ? V2.white : V2.grey} />
      </Animated.View>
    </Press>
  );
}

/** Bouton rond sur photo (retour, partage). */
export function RoundButton({ onPress, label, children }: { onPress: () => void; label: string; children: React.ReactNode }) {
  return (
    <Press accessibilityLabel={label} onPress={onPress} style={[styles.round, { width: 40, height: 40, backgroundColor: 'rgba(11,13,16,0.55)' }]}>
      {children}
    </Press>
  );
}

/** Feuille du bas commune (fond voilé, poignée, entrée glissée). */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(220)} style={styles.veil}>
        <Pressable accessibilityLabel="Fermer" onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <Animated.View entering={SlideInDown.duration(300).easing(ease)} style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: Math.max(20, insets.bottom + 10) }, shadow.xl]}>
          <View style={styles.grabWrap}><View style={[styles.grab, { backgroundColor: t.track }]} /></View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Quatre indicateurs : calories, protéines, glucides, lipides. */
export function MacroTiles({ kcal, p, g, l }: { kcal: number; p: number; g: number; l: number }) {
  const t = useTheme();
  const items: [string, string, string][] = [
    ['kcal', String(kcal), V2.lime],
    ['Protéines', p + ' g', V2.violet],
    ['Glucides', g + ' g', t.ink2],
    ['Lipides', l + ' g', t.ink2],
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {items.map(([k, v, c]) => (
        <View key={k} style={[styles.tile, { backgroundColor: t.surf }]} accessibilityLabel={k + ' : ' + v}>
          <View style={[styles.tileDot, { backgroundColor: c }]} />
          <Txt size={17} weight="bold" num>{v}</Txt>
          <Txt size={11} color={t.ink2}>{k}</Txt>
        </View>
      ))}
    </View>
  );
}

/** Pastille d'information sur photo (« 12 min »). */
export function PhotoPill({ children }: { children: React.ReactNode }) {
  return <View style={styles.pill}>{children}</View>;
}

/** Bouton principal lime / secondaire. */
/** `block` : pleine largeur dans une colonne (sinon, partage la ligne avec les autres boutons). */
export function Action({ label, onPress, kind = 'primary', disabled, style, block }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost'; disabled?: boolean; style?: StyleProp<ViewStyle>; block?: boolean }) {
  const t = useTheme();
  const primary = kind === 'primary';
  return (
    <Press
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      haptic={primary ? 'medium' : 'light'}
      style={[styles.action, !block && { flex: 1 }, primary ? { backgroundColor: V2.lime } : { borderWidth: 1, borderColor: t.line, backgroundColor: t.surf }, disabled && { opacity: 0.5 }, primary && shadow.btn, style]}
    >
      <Txt size={15} weight="bold" color={primary ? V2.obsidian : t.ink} numberOfLines={1}>{label}</Txt>
    </Press>
  );
}

export const kitchenStyles = StyleSheet.create({
  /** Photo qui remplit son cadre (le web ne dimensionne pas une image avec seulement top/left/right/bottom). */
  cover: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  shadowText: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } },
});

const styles = StyleSheet.create({
  round: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,13,16,0.56)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', maxHeight: '92%' },
  grabWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  grab: { width: 38, height: 5, borderRadius: 9, opacity: 0.6 },
  tile: { flex: 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 10, gap: 1 },
  tileDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(11,13,16,0.6)', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 9 },
  action: { height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
});
