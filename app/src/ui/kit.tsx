/**
 * Composants communs FITAIA V2 (design system « Athletic Gaming »). Un seul endroit pour les titres de section,
 * les pastilles de filtre, l'étiquette de rareté, le compteur de Fitcoins, l'anneau de progression et la piste
 * de récompenses. Tout vient des tokens (src/theme/tokens.ts) ; aucun module natif ajouté.
 */
import React, { useEffect } from 'react';
import { ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { RARITY_STYLE, V2, motion } from '@/theme/tokens';
import type { Rarity } from '@/inventory/types';
import { fmt } from '@/data/content';
import { useCountUp } from '@/fx/AnimatedNumber';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CoinIcon } from '@/components/Icons';

const ease = Easing.bezier(motion.bezier[0], motion.bezier[1], motion.bezier[2], motion.bezier[3]);

/** Titre de section : court, avec une indication à droite ou une action (« Tout voir »). */
export function SectionTitle({ title, hint, action, onAction, color }: { title: string; hint?: string; action?: string; onAction?: () => void; color?: string }) {
  const t = useTheme();
  return (
    <View style={styles.section}>
      <Txt size={17} weight="bold" color={color ?? t.ink} numberOfLines={1} style={{ flexShrink: 1 }}>{title}</Txt>
      {action && onAction ? (
        <Press onPress={onAction} haptic="none" accessibilityLabel={action} style={{ paddingVertical: 4, paddingLeft: 8 }}>
          <Txt size={13} weight="semibold" color={t.ink2}>{action + ' ›'}</Txt>
        </Press>
      ) : hint ? (
        <Txt size={12} color={t.ink2} numberOfLines={1}>{hint}</Txt>
      ) : null}
    </View>
  );
}

/** Pastille sélectionnable (catégories, filtres). Lime quand active : c'est l'action. */
export function Chip({ label, on, onPress, count, small }: { label: string; on: boolean; onPress: () => void; count?: number; small?: boolean }) {
  const t = useTheme();
  return (
    <Press
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label + (count ? ', ' + count : '')}
      haptic="light"
      pressScale={0.94}
      onPress={onPress}
      style={[styles.chip, small && styles.chipSmall, { backgroundColor: on ? V2.lime : t.surf, borderColor: on ? V2.lime : t.line }]}
    >
      <Txt size={small ? 12 : 13} weight={on ? 'bold' : 'medium'} color={on ? V2.obsidian : t.ink}>{label}</Txt>
      {count ? <Txt size={small ? 11 : 12} weight="bold" num color={on ? V2.obsidian : t.ink2}>{count}</Txt> : null}
    </Press>
  );
}

/** Rangée horizontale de pastilles, alignée sur la marge de l'écran. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
      {children}
    </ScrollView>
  );
}

/** Étiquette de rareté : symbole + nom, dans la couleur de la rareté. Pas d'effet lumineux. */
export function RarityTag({ rarity, onDark, size = 11 }: { rarity: Rarity; onDark?: boolean; size?: number }) {
  const t = useTheme();
  const r = RARITY_STYLE[rarity];
  const c = rarity === 'COMMON' && !onDark && !t.dark ? '#5B626E' : r.c;
  return (
    <View style={styles.tag} accessibilityLabel={'Rareté ' + r.label}>
      <Txt size={size - 1} color={c}>{r.symbol}</Txt>
      <Txt size={size} weight="bold" color={c} style={{ letterSpacing: 0.6 }}>{r.label.toUpperCase()}</Txt>
    </View>
  );
}

/** Solde de Fitcoins qui compte vers sa nouvelle valeur (gain ou dépense). */
export function CoinCounter({ value, size = 15, color, style }: { value: number; size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const v = useCountUp(value, 700);
  return (
    <View style={[styles.coin, style]}>
      <CoinIcon size={size + 1} />
      <Txt size={size} weight="bold" num color={color ?? t.ink}>{fmt(v)}</Txt>
    </View>
  );
}

const ACircle = Animated.createAnimatedComponent(Circle);

/** Anneau de progression qui se remplit (0 → pct) à l'apparition puis suit la valeur. */
export function ProgressRing({ pct, size = 64, stroke = 7, color = V2.lime, track, children }: { pct: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = useSharedValue(reduced ? pct : 0);
  useEffect(() => {
    p.set(reduced ? pct : withTiming(Math.max(0, Math.min(1, pct)), { duration: 700, easing: ease }));
  }, [pct, reduced, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.get()) }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? t.track} strokeWidth={stroke} fill="none" />
        <ACircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          animatedProps={props}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

/** Barre fine qui se remplit à l'apparition. */
export function FillBar({ pct, color = V2.lime, height = 6, track }: { pct: number; color?: string; height?: number; track?: string }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? pct : 0);
  useEffect(() => {
    p.set(reduced ? pct : withTiming(Math.max(0, Math.min(1, pct)), { duration: 600, easing: ease }));
  }, [pct, reduced, p]);
  const st = useAnimatedStyle(() => ({ width: `${p.get() * 100}%` }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track ?? t.track, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', borderRadius: height / 2, backgroundColor: color }, st]} />
    </View>
  );
}

export type TrackStep = { key: string; label: string; sub?: string; done: boolean; current?: boolean; tone?: 'lime' | 'gold' | 'violet' };

/** Piste de récompenses horizontale : étapes franchies, étape en cours, prochaines récompenses. */
export function RewardTrack({ steps, onDark }: { steps: TrackStep[]; onDark?: boolean }) {
  const t = useTheme();
  const ink = onDark ? V2.white : t.ink;
  const ink2 = onDark ? V2.grey : t.ink2;
  const line = onDark ? '#2A2F39' : t.track;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
      {steps.map((s, i) => {
        const tone = s.tone === 'gold' ? V2.gold : s.tone === 'violet' ? V2.violet : V2.lime;
        return (
          <View key={s.key} style={styles.step} accessible accessibilityLabel={s.label + (s.sub ? ', ' + s.sub : '') + (s.done ? ', obtenu' : '')}>
            <View style={styles.stepTop}>
              <View style={[styles.stepLine, { backgroundColor: i === 0 ? 'transparent' : s.done || s.current ? tone : line }]} />
              <View style={[styles.node, { borderColor: s.done || s.current ? tone : line, backgroundColor: s.done ? tone : 'transparent' }]}>
                {s.done ? <Txt size={11} weight="bold" color={V2.obsidian}>✓</Txt> : s.current ? <View style={[styles.nodeDot, { backgroundColor: tone }]} /> : null}
              </View>
              <View style={[styles.stepLine, { backgroundColor: i === steps.length - 1 ? 'transparent' : s.done ? tone : line }]} />
            </View>
            <Txt size={12} weight={s.current ? 'bold' : 'semibold'} color={s.done ? ink2 : ink} numberOfLines={2} style={{ textAlign: 'center' }}>{s.label}</Txt>
            {s.sub ? <Txt size={11} num color={ink2} numberOfLines={1} style={{ textAlign: 'center' }}>{s.sub}</Txt> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

/** Gros chiffre + libellé (statistiques). */
export function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 2, minWidth: 0 }}>
      <Display size={20} num color={color ?? t.ink} numberOfLines={1}>{value}</Display>
      <Txt size={11} color={t.ink2} numberOfLines={1}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2, paddingTop: 10, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1 },
  chipSmall: { height: 30, borderRadius: 15, paddingHorizontal: 11 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  coin: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  step: { width: 104, alignItems: 'center', gap: 4 },
  stepTop: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 4 },
  stepLine: { flex: 1, height: 2 },
  node: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  nodeDot: { width: 8, height: 8, borderRadius: 4 },
});

/** Analyse en cours : ondes lime qui partent du centre (organique, sans durée artificielle). */
export function ScanPulse({ size = 96 }: { size?: number }) {
  const reduced = useReducedMotion();
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Analyse en cours">
      {reduced ? null : [0, 1, 2].map((i) => <PulseRing key={i} size={size} delay={i * 450} />)}
      <View style={{ width: size * 0.32, height: size * 0.32, borderRadius: size, backgroundColor: V2.lime }} />
    </View>
  );
}

function PulseRing({ size, delay }: { size: number; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    const id = setTimeout(() => p.set(withRepeat(withTiming(1, { duration: 1350, easing: Easing.out(Easing.quad) }), -1)), delay);
    return () => clearTimeout(id);
  }, [p, delay]);
  const st = useAnimatedStyle(() => ({ opacity: 0.7 * (1 - p.get()), transform: [{ scale: 0.35 + p.get() * 0.65 }] }));
  return <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: V2.lime }, st]} />;
}
