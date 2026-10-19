import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, shadow } from '@/theme/tokens';
import { CUR_NAMES, TITLES, fmt, todayLabel } from '@/data/content';
import { useBody, useEconomy, useGame } from '@/store/useGame';
import { Press } from './Press';
import { Txt, Display } from './Txt';
import { CoinIcon, GoldIcon } from './Icons';
import { CoachAvatar } from './CoachAvatar';

export const HEADER_CONTENT_H = 48; // 40px avatar + padding 8 bas

function LiveDot({ bg }: { bg: string }) {
  const o = useSharedValue(1);
  React.useEffect(() => {
    o.set(withRepeat(withTiming(0.8, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [o]);
  const st = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[styles.dot, { borderColor: bg }, st]} />;
}

/** En-tête commun : coach + titre d'écran + deux monnaies. Fidèle au <header> de la maquette. */
export function Header({ screen }: { screen: keyof typeof TITLES }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { earn, prem, openCoach, say } = useGame();
  const eco = useEconomy();
  const body = useBody();
  const [title, baseSub] = TITLES[screen];
  const sub = screen === 'defis' && eco.streak >= 2 ? 'Série de ' + eco.streak + ' jours' : screen === 'home' ? todayLabel() : screen === 'perso' ? 'Niveau ' + body.level : baseSub;

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: insets.top + 8, backgroundColor: t.bg, borderBottomColor: t.line },
        shadow.card,
      ]}
    >
      <Press accessibilityLabel="Parler à Fito, ton coach" onPress={openCoach} style={styles.left} pressScale={0.97}>
        <View style={{ width: 40, height: 40 }}>
          <CoachAvatar size={40} style={styles.avatar} />
          <LiveDot bg={t.bg} />
        </View>
        <View style={{ gap: 1, flexShrink: 1, minWidth: 0 }}>
          <Display size={20} numberOfLines={1}>{title}</Display>
          <Txt size={12} color={t.ink2} numberOfLines={1}>{sub}</Txt>
        </View>
      </Press>

      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Press
          accessibilityLabel={CUR_NAMES[0] + ' : en gagner avec les défis'}
          onPress={() => {
            router.navigate('/(tabs)/defis');
            say('Les ' + CUR_NAMES[0] + ' se gagnent avec les défis gratuits', 'ok');
          }}
          style={[styles.pill, { backgroundColor: t.strong }, shadow.sm]}
        >
          <CoinIcon size={15} />
          <Txt size={14} weight="bold" num color={t.strongInk}>{fmt(earn)}</Txt>
        </Press>
        <Press
          accessibilityLabel={CUR_NAMES[1] + ' : recharger'}
          onPress={() => {
            router.navigate('/(tabs)/boutique');
            say('Les ' + CUR_NAMES[1] + ' se rechargent en bas de la boutique', 'ok');
          }}
          style={[styles.pill, { backgroundColor: t.surf, borderWidth: 1, borderColor: t.line }, shadow.sm]}
        >
          <GoldIcon size={16} />
          <Txt size={14} weight="bold" num>{fmt(prem)}</Txt>
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    zIndex: 5,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minWidth: 0, marginRight: 8 },
  avatar: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.08)' },
  dot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: LIME,
    borderWidth: 2,
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, borderRadius: 999, paddingLeft: 9, paddingRight: 11 },
});
