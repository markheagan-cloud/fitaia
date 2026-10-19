/**
 * Kit visuel de la Communauté : studio (fond FITAIA très léger derrière les avatars), têtes avec état du jour,
 * pastilles, feuille du bas, barre du haut, titres de section. Mêmes jetons que le reste de l'app.
 * Les portraits viennent de AvatarPortrait (rendus de l'usine d'avatars, ou repli vectoriel) : ce fichier ne fait que les mettre en scène.
 */
import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, StyleProp, ViewStyle, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, Path, RadialGradient, Stop, Rect } from 'react-native-svg';
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, motion, shadow } from '@/theme/tokens';
import type { Theme } from '@/theme/tokens';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { AvatarPortrait } from './AvatarPortrait';
import type { PortraitMode } from './AvatarPortrait';
import { Icon, STATUS_ICON } from './icons';
import type { IconName } from './icons';
import { statusLabel } from '../models/intentions';
import type { StatusId } from '../models/intentions';
import { CR } from '../routes';

export const ease = Easing.bezier(motion.bezier[0], motion.bezier[1], motion.bezier[2], motion.bezier[3]);

/** Couleurs du studio (fond des avatars), clair et sombre. */
export function studio(t: Theme) {
  return t.dark
    ? { top: '#2C2E33', bottom: '#17181B', beam: 'rgba(255,255,255,0.035)', glow: 'rgba(255,255,255,0.10)', floor: 'rgba(0,0,0,0.45)', head: '#2E3035', glass: 'rgba(29,31,34,0.82)' }
    : { top: '#F4F2EE', bottom: '#D9D6CF', beam: 'rgba(255,255,255,0.42)', glow: 'rgba(255,255,255,0.75)', floor: 'rgba(28,29,31,0.20)', head: '#DFDCD5', glass: 'rgba(245,244,241,0.88)' };
}

/** Fond studio : dégradé doux, deux faisceaux de lumière, halo derrière le personnage, ombre au sol. */
export function Studio({
  height, children, radius = 0, style, floor = true, glowY = 0.48, floorY,
}: { height: number; children?: React.ReactNode; radius?: number; style?: StyleProp<ViewStyle>; floor?: boolean; glowY?: number; floorY?: number }) {
  const t = useTheme();
  const c = studio(t);
  const { width: winW } = useWindowDimensions();
  const [w, setW] = useState(winW);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[{ height, borderRadius: radius, overflow: 'hidden' }, style]}>
      <LinearGradient colors={[c.top, c.bottom]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      <Svg width={w} height={height} style={StyleSheet.absoluteFill} accessible={Platform.OS === 'web' ? undefined : false}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy={`${glowY * 100}%`} rx="55%" ry="45%">
            <Stop offset="0" stopColor={c.glow} stopOpacity={1} />
            <Stop offset="1" stopColor={c.glow} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="floor" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={c.floor} stopOpacity={1} />
            <Stop offset="1" stopColor={c.floor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Path d={`M${w * 0.08} 0 L${w * 0.36} 0 L${w * 0.02} ${height * 0.62} L0 ${height * 0.62} L0 ${height * 0.2} Z`} fill={c.beam} />
        <Path d={`M${w * 0.7} 0 L${w * 0.86} 0 L${w} ${height * 0.28} L${w} ${height * 0.5} Z`} fill={c.beam} />
        <Rect x={0} y={0} width={w} height={height} fill="url(#glow)" />
        {floor ? <Ellipse cx={w / 2} cy={floorY ?? height - 10} rx={w * 0.34} ry={18} fill="url(#floor)" /> : null}
      </Svg>
      {children}
    </View>
  );
}

/** Pastille « en ligne » (seule animation en boucle autorisée : un léger battement). */
export function LiveDot({ size = 10, ring }: { size?: number; ring: string }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduced) o.set(withRepeat(withTiming(0.55, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [o, reduced]);
  const st = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: LIME, borderWidth: Math.max(1.5, size * 0.2), borderColor: ring }, st]} />;
}

/** Tête d'un membre (listes, messages, fil) : portrait de l'usine, état du jour en médaillon. */
export function Head({
  avatarId, size, online, status, ring, style,
}: { avatarId: string; size: number; online?: boolean; status?: StatusId | null; ring?: 'lime' | 'bg' | null; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const c = studio(t);
  const badge = Math.round(size * 0.38);
  const icon = status ? STATUS_ICON[status] : null;
  const ringColor = ring === 'lime' ? LIME : ring === 'bg' ? t.bg : null;
  return (
    <View style={[{ width: size, height: size }, style]}>
      <View style={ringColor ? { borderRadius: size, borderWidth: 2.5, borderColor: ringColor, padding: 1.5 } : undefined}>
        <AvatarPortrait avatarId={avatarId} size={ringColor ? size - 8 : size} mode="tete" style={{ backgroundColor: c.head }} />
      </View>
      {icon ? (
        <View style={[styles.badge, { width: badge, height: badge, borderRadius: badge / 2, backgroundColor: t.strong, borderColor: t.bg }]}>
          <Icon name={icon} size={badge * 0.58} color={LIME} strokeWidth={2.2} />
        </View>
      ) : online || status === 'dispo' ? (
        <View style={{ position: 'absolute', right: size * 0.02, bottom: size * 0.02 }}>
          <LiveDot size={Math.max(10, size * 0.24)} ring={t.bg} />
        </View>
      ) : null}
    </View>
  );
}

/** Pastille d'état du jour (« Dispo pour parler »). */
export function StatusPill({ status, glass, style }: { status: StatusId; glass?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const c = studio(t);
  const icon = STATUS_ICON[status];
  return (
    <View style={[styles.pill, { backgroundColor: glass ? c.glass : t.surf }, glass && shadow.sm, style]}>
      {icon ? <Icon name={icon} size={14} color={t.ink} strokeWidth={2.1} /> : <LiveDot size={9} ring={glass ? c.glass : t.surf} />}
      <Txt size={12.5} weight="semibold">{statusLabel(status)}</Txt>
    </View>
  );
}

export type TagKind = 'demo' | 'sim' | 'new' | 'soon';
/** Petite étiquette : « Démo », « Simulé », « Nouveau », « Bientôt ». */
export function Tag({ kind, label, style }: { kind: TagKind; label?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const txt = label ?? { demo: 'Démo', sim: 'Simulé', new: 'Nouveau', soon: 'Bientôt' }[kind];
  const bg = kind === 'new' ? LIME : kind === 'soon' ? t.strong : t.track;
  const ink = kind === 'new' ? OBSIDIAN : kind === 'soon' ? t.strongInk : t.ink2;
  return (
    <View style={[styles.tag, { backgroundColor: bg }, style]}>
      <Txt size={10.5} weight="bold" color={ink} style={{ letterSpacing: 0.2 }}>{txt}</Txt>
    </View>
  );
}

/** Titre de section : Archivo, phrase normale (pas de majuscules décoratives). */
export function SectionHead({ title, right, tag, sub }: { title: string; right?: React.ReactNode; tag?: React.ReactNode; sub?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 2, paddingHorizontal: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Display size={19} numberOfLines={2} style={{ flexShrink: 1 }}>{title}</Display>
          {tag}
        </View>
        {right}
      </View>
      {sub ? <Txt size={13} color={t.ink2}>{sub}</Txt> : null}
    </View>
  );
}

/** Lien texte à droite d'un titre (« Tout voir »). */
export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Press onPress={onPress} accessibilityRole="link" accessibilityLabel={label} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 }}>
      <Txt size={13.5} weight="semibold" color={t.ink2}>{label}</Txt>
      <Icon name="chevron" size={15} color={t.ink2} />
    </Press>
  );
}

/** Bouton rond à icône (44 px). */
export function IconButton({
  icon, label, onPress, variant = 'surf', size = 44, badge,
}: { icon: IconName; label: string; onPress: () => void; variant?: 'surf' | 'glass' | 'strong'; size?: number; badge?: number }) {
  const t = useTheme();
  const c = studio(t);
  const bg = variant === 'glass' ? c.glass : variant === 'strong' ? t.strong : t.surf;
  const ink = variant === 'strong' ? t.strongInk : t.ink;
  return (
    <Press accessibilityLabel={label} onPress={onPress} pressScale={0.9} style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, shadow.sm]}>
      <Icon name={icon} size={size * 0.46} color={ink} />
      {badge ? (
        <View style={[styles.count, { backgroundColor: LIME, borderColor: t.bg }]}>
          <Txt size={10.5} weight="bold" color={OBSIDIAN}>{badge}</Txt>
        </View>
      ) : null}
    </Press>
  );
}

/** Barre du haut, transparente (posée sur un studio) ou sur le fond de l'écran. */
export function TopBar({ title, right, overlay, onBack }: { title?: string; right?: React.ReactNode; overlay?: boolean; onBack?: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace(CR.tabs)));
  return (
    <View style={[styles.top, { paddingTop: insets.top + 6 }, overlay ? styles.overlay : { backgroundColor: t.bg }]}>
      <IconButton icon="back" label="Retour" onPress={back} variant={overlay ? 'glass' : 'surf'} size={40} />
      <View style={{ flex: 1, alignItems: 'center' }}>{title ? <Txt size={15} weight="bold" numberOfLines={1}>{title}</Txt> : null}</View>
      <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

/**
 * Feuille du bas (explication du score, tenue, état du jour…). Fond voilé, panneau qui monte en 280 ms.
 * Rendue en surimpression de l'écran courant : à placer en dernier enfant de l'écran.
 */
export function Sheet({ visible, onClose, children, label }: { visible: boolean; onClose: () => void; children: React.ReactNode; label: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  useEffect(() => {
    const d = reduced ? 0 : 280;
    if (visible) p.set(withTiming(1, { duration: d, easing: ease }));
    else
      p.set(
        withTiming(0, { duration: reduced ? 0 : 200, easing: Easing.out(Easing.quad) }, (fin) => {
          if (fin) runOnJS(setMounted)(false);
        }),
      );
  }, [visible, p, reduced]);
  const back = useAnimatedStyle(() => ({ opacity: p.get() }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.get()) * 420 }] }));
  if (!mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(16,17,19,0.46)' }, back]}>
        <Press accessibilityLabel="Fermer" onPress={onClose} haptic="none" pressScale={1} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={label}
        style={[styles.sheet, { backgroundColor: t.surf, paddingBottom: insets.bottom + 18 }, shadow.toast, panel]}
      >
        <View style={[styles.grab, { backgroundColor: t.line }]} />
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 14 }} bounces={false} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/**
 * Personnage mis en scène : arrivée douce (montée, léger pivot, fondu) puis respiration très lente.
 * Mouvement désactivé si l'utilisateur a demandé moins d'animations.
 */
export function Figure({
  avatarId, size, mode = 'buste', delay = 0, breathe = true, from = 0,
}: { avatarId: string; size: number; mode?: PortraitMode; delay?: number; breathe?: boolean; from?: number }) {
  const reduced = useReducedMotion();
  const enter = useSharedValue(reduced ? 1 : 0);
  const b = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    enter.set(withDelay(delay, withTiming(1, { duration: 300, easing: ease })));
    if (breathe) b.set(withDelay(delay + 320, withRepeat(withSequence(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.sin) })), -1)));
  }, [enter, b, reduced, delay, breathe]);
  const st = useAnimatedStyle(() => {
    const e = enter.get();
    return {
      opacity: e,
      transform: [
        { translateX: (1 - e) * from },
        { translateY: (1 - e) * 22 - b.get() * 1.5 },
        { rotate: `${(1 - e) * (from >= 0 ? 2.5 : -2.5)}deg` },
        { scale: 0.965 + 0.035 * e + b.get() * 0.008 },
      ],
    };
  });
  return (
    <Animated.View style={[{ transformOrigin: 'bottom' } as ViewStyle, st]}>
      <AvatarPortrait avatarId={avatarId} size={size} mode={mode} radius={0} style={{ backgroundColor: 'transparent' }} />
    </Animated.View>
  );
}

/** Interrupteur (confidentialité). */
export function Toggle({ on, onPress, label, hint }: { on: boolean; onPress: () => void; label: string; hint?: string }) {
  const t = useTheme();
  return (
    <Press accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={onPress} pressScale={0.99} style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={15} weight="semibold">{label}</Txt>
        {hint ? <Txt size={12.5} color={t.ink2}>{hint}</Txt> : null}
      </View>
      <View style={[styles.track, { backgroundColor: on ? (t.dark ? LIME : OBSIDIAN) : t.track }]}>
        <View style={[styles.knob, { backgroundColor: on ? (t.dark ? OBSIDIAN : LIME) : '#FFFFFF', transform: [{ translateX: on ? 20 : 0 }] }, shadow.sm]} />
      </View>
    </Press>
  );
}

/** Choix exclusif en cartes (icône + libellé). */
export function Choice<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; icon: IconName }[]; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <Press
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.id)}
            pressScale={0.97}
            style={[styles.choice, { backgroundColor: on ? t.strong : t.surf, borderColor: on ? t.strong : t.line }, on && shadow.md]}
          >
            <Icon name={o.icon} size={20} color={on ? LIME : t.ink2} />
            <Txt size={13} weight={on ? 'bold' : 'semibold'} color={on ? t.strongInk : t.ink} style={{ textAlign: 'center' }} numberOfLines={2}>{o.label}</Txt>
          </Press>
        );
      })}
    </View>
  );
}

/** Pile de têtes qui se chevauchent (accueil, adhésion, coup de pouce). */
export function HeadStack({ ids, size, max = 3, ring }: { ids: { avatarId: string; online?: boolean }[]; size: number; max?: number; ring: string }) {
  const c = studio(useTheme());
  return (
    <View style={{ flexDirection: 'row' }}>
      {ids.slice(0, max).map((x, i) => (
        <View key={x.avatarId + i} style={{ marginLeft: i ? -size * 0.28 : 0, borderRadius: size, borderWidth: 2.5, borderColor: ring, zIndex: max - i }}>
          <AvatarPortrait avatarId={x.avatarId} size={size} mode="tete" style={{ backgroundColor: c.head }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', right: -2, bottom: -2, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 30, borderRadius: 15, alignSelf: 'flex-start' },
  tag: { paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 7, alignSelf: 'center' },
  count: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 8, zIndex: 10 },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 10, gap: 10, maxHeight: '90%' },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  track: { width: 48, height: 28, borderRadius: 14, padding: 3 },
  knob: { width: 22, height: 22, borderRadius: 11 },
  choice: { flex: 1, minHeight: 78, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 10 },
});
