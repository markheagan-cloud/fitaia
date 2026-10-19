/**
 * Briques d'interface de la Communauté : écran avec retour, bouton principal, puces, étiquette « démonstration ».
 * Mêmes jetons que le reste de l'app (src/theme/tokens), une action principale évidente par écran.
 */
import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow } from '@/theme/tokens';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CR } from '../routes';

export function BackIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M15 5l-7 7 7 7" stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CommunityScreen({
  title, sub, children, scroll = true, footer, right, overlay,
}: { title: string; sub?: string; children: React.ReactNode; scroll?: boolean; footer?: React.ReactNode; right?: React.ReactNode; overlay?: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const body = (
    <Animated.View entering={FadeInDown.duration(260)} style={{ gap: 14 }}>
      {children}
    </Animated.View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[styles.head, { paddingTop: insets.top + 6, backgroundColor: t.bg }]}>
        <Press accessibilityLabel="Retour" onPress={() => (router.canGoBack() ? router.back() : router.replace(CR.tabs))} style={[styles.back, { backgroundColor: t.surf }, shadow.sm]} pressScale={0.9}>
          <BackIcon color={t.ink} />
        </Press>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Display size={21} numberOfLines={1}>{title}</Display>
          {sub ? <Txt size={12.5} color={t.ink2} numberOfLines={1}>{sub}</Txt> : null}
        </View>
        {right}
      </View>
      {scroll ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + (footer ? 116 : 36) }} showsVerticalScrollIndicator={false}>
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: t.bg }]}>{footer}</View> : null}
      {overlay}
    </View>
  );
}

export function MainButton({ label, onPress, disabled, style, ghost }: { label: string; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; ghost?: boolean }) {
  const t = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      haptic="medium"
      style={[
        styles.btn,
        ghost ? { backgroundColor: t.surf, borderWidth: 1, borderColor: t.line } : { backgroundColor: LIME },
        disabled && { opacity: 0.45 },
        !ghost && shadow.btn,
        style,
      ]}
    >
      <Txt size={16} weight="bold" color={ghost ? t.ink : OBSIDIAN}>{label}</Txt>
    </Press>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Press
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: on ? t.strong : t.surf, borderColor: on ? t.strong : t.line }]}
    >
      <Txt size={13} weight="semibold" color={on ? t.strongInk : t.ink}>{label}</Txt>
    </Press>
  );
}

export function DemoTag({ label = 'Profil de démonstration' }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: t.track }]}>
      <Txt size={10.5} weight="semibold" color={t.ink2}>{label}</Txt>
    </View>
  );
}

export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
        <Display size={18}>{title}</Display>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Heure courante, rafraîchie à intervalle régulier (rendu pur : pas de Date.now() pendant le rendu). */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Temps écoulé, court : « 5 min », « 2 h », « 3 j ». */
export function ago(ts: number, now: number): string {
  const m = Math.round((now - ts) / 60000);
  if (m < 1) return 'à l’instant';
  if (m < 60) return m + ' min';
  const h = Math.round(m / 60);
  if (h < 24) return h + ' h';
  const d = Math.round(h / 24);
  return d + ' j';
}

/** Ancienneté lisible : « à l’instant », « il y a 5 min », « il y a 2 h », « hier », « il y a 3 j ». */
export function since(ts: number, now: number): string {
  const m = Math.round((now - ts) / 60000);
  if (m < 1) return 'à l’instant';
  if (m < 60) return 'il y a ' + m + '\u00a0min';
  const h = Math.round(m / 60);
  if (h < 24) return 'il y a ' + h + '\u00a0h';
  const d = Math.round(h / 24);
  return d === 1 ? 'hier' : 'il y a ' + d + '\u00a0j';
}

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

/** Heure d'un message : « 14:02 » aujourd'hui, « Hier », puis le jour de la semaine, puis la date. */
export function clock(ts: number, now: number): string {
  const d = new Date(ts);
  const n = new Date(now);
  const startToday = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  if (ts >= startToday) return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  if (ts >= startToday - 86400000) return 'Hier';
  if (ts >= startToday - 6 * 86400000) return DAYS[d.getDay()];
  return d.getDate() + '/' + (d.getMonth() + 1).toString().padStart(2, '0');
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12 },
  btn: { height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  chip: { paddingHorizontal: 14, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
});
