import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, RED, AMBER, alert, shadow } from '@/theme/tokens';
import { RARITY, fmt, fmtKg } from '@/data/content';
import { useBody, useCalories, useEquippedSkin, useGame } from '@/store/useGame';
import { useCountUp } from '@/fx/AnimatedNumber';
import { Bar } from '@/fx/Bar';
import { HeroAvatar } from '@/avatar/HeroAvatar';
import { RULES } from '@/store/economy';
import { Screen, Card } from '@/components/Screen';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CoinIcon, PulseIcon } from '@/components/Icons';
import { CoachAvatar } from '@/components/CoachAvatar';
import { CommunityEntry } from '@/community/components/CommunityEntry';

const SEGS = 30;

export default function Home() {
  const t = useTheme();
  const a = alert(t);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const W = Math.max(0, width - 32);
  const cal = useCalories();
  const skin = useEquippedSkin();
  const { pushDone, openCoach } = useGame();
  const body = useBody();
  const remainingShown = useCountUp(Math.abs(cal.remaining));

  const barColor = cal.over ? RED : cal.near ? AMBER : LIME;
  const alertBg = cal.over ? a.overBg : cal.near ? a.nearBg : t.surf;
  const alertInk = cal.over ? a.overInk : cal.near ? a.nearInk : t.ink;
  const alertTitle = cal.over
    ? 'On a dépassé de ' + fmt(-cal.remaining) + ' kcal'
    : cal.near
      ? 'Plus que ' + fmt(cal.remaining) + ' kcal aujourd’hui'
      : 'Bonne journée, tu es dans les clous';
  const alertTip = cal.over
    ? '20 minutes de marche rapide en brûlent environ 120. Ton budget de demain ne change pas.'
    : cal.near
      ? 'Un yaourt grec et une pomme font environ 180 kcal et 15 g de protéines.'
      : 'Chaque défi réussi ajoute des calories à ton budget du jour.';

  const macros = [
    { label: 'Protéines', val: cal.p + ' g', pct: Math.min(1, cal.p / RULES.proteinGoal) },
    { label: 'Glucides', val: cal.g + ' g', pct: Math.min(1, cal.g / RULES.carbsGoal) },
    { label: 'Lipides', val: cal.l + ' g', pct: Math.min(1, cal.l / RULES.fatGoal) },
  ];

  return (
    <Screen name="home">
      {/* Perso */}
      <View accessibilityLabel="Ton personnage" style={[styles.hero, shadow.lg]}>
        <Svg width={W} height={372} viewBox="0 0 358 372" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          <Path d="M0 70 L120 0 H190 L0 150 Z" fill="#E3E1DC" />
          <Path d="M358 220 L230 372 H300 L358 300 Z" fill="#E3E1DC" />
          <Path d="M250 0 H358 V90 Z" fill="#D2CFC8" />
        </Svg>
        <HeroAvatar width={298} height={372} style={styles.heroImg} />
        <View style={styles.heroTag}>
          <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: RARITY[skin.rarity].c }} />
          <Txt size={12} weight="semibold" color="#F5F4F1">{skin.name}</Txt>
        </View>
        <Press onPress={() => router.navigate('/(tabs)/perso')} pressScale={0.98} style={[styles.levelBtn, shadow.md]}>
          <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.levelNum}>
            <Display size={17} color={LIME} num letterSpacing={-0.3}>{body.level}</Display>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt size={13} weight="bold" color={OBSIDIAN}>{body.tier.reached ? 'Objectif atteint' : 'Palier ' + body.tier.current + ' sur 5'}</Txt>
              <Txt size={13} num color="#5A5D63">{body.tier.reached ? fmtKg(body.now) + ' kg' : 'encore ' + fmtKg(body.tier.toNext) + ' kg'}</Txt>
            </View>
            <Bar pct={body.tier.progress} color={OBSIDIAN} track="#D6D3CD" height={5} />
          </View>
        </Press>
      </View>

      {/* Calories */}
      <Card radius={26} style={{ paddingTop: 18, paddingHorizontal: 16, paddingBottom: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <Display wide size={44} num lineHeight={44} letterSpacing={-2.2} color={cal.over ? RED : t.ink}>
              {cal.over ? '+' + fmt(remainingShown) : fmt(remainingShown)}
            </Display>
            <Txt size={13} color={t.ink2}>{cal.over ? 'kcal au-dessus de ton budget' : 'kcal restantes aujourd’hui'}</Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            {[
              ['Mangé', fmt(cal.eaten)],
              ['Brûlé', '+' + fmt(cal.burned)],
              ['Budget', fmt(cal.budget)],
            ].map(([k, v]) => (
              <View key={k} style={{ gap: 2, alignItems: 'flex-end' }}>
                <Txt size={12} color={t.ink2}>{k}</Txt>
                <Txt size={15} weight="bold" num>{v}</Txt>
              </View>
            ))}
          </View>
        </View>
        <View accessibilityRole="progressbar" accessibilityLabel="Calories consommées" accessibilityValue={{ min: 0, max: cal.budget, now: cal.eaten }} style={{ flexDirection: 'row', gap: 3 }}>
          {Array.from({ length: SEGS }, (_, i) => (
            <View key={i} style={{ flex: 1, height: 26, borderRadius: 3, backgroundColor: (i + 0.5) / SEGS <= Math.min(cal.ratio, 1) ? barColor : t.track }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {macros.map((m) => (
            <View key={m.label} style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt size={12} color={t.ink2}>{m.label}</Txt>
                <Txt size={12} weight="bold" num>{m.val}</Txt>
              </View>
              <Bar pct={m.pct} color={t.ink} track={t.track} height={4} />
            </View>
          ))}
        </View>
      </Card>

      {/* Alerte coach */}
      <Press onPress={openCoach} pressScale={0.98} style={[styles.alert, { backgroundColor: alertBg }, shadow.md]}>
        <CoachAvatar size={34} />
        <View style={{ flex: 1, gap: 3 }}>
          <Txt size={14} weight="bold" color={alertInk}>{alertTitle}</Txt>
          <Txt size={13} lineHeight={18} color={alertInk}>{alertTip}</Txt>
        </View>
      </Press>

      {/* Défi du jour */}
      <Press onPress={() => router.navigate('/(tabs)/defis')} pressScale={0.98} style={[styles.defi, { backgroundColor: t.strong }, shadow.md]}>
        <View style={styles.defiIcon}>
          <PulseIcon size={24} color={OBSIDIAN} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={15} weight="bold" color={t.strongInk}>{pushDone ? 'Défi du jour réussi' : 'Défi du jour : 5 pompes'}</Txt>
          <Txt size={13} color={t.strongInk2}>{pushDone ? 'Reviens demain pour le suivant' : 'Gratuit, comptées par la caméra'}</Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <CoinIcon size={13} />
          <Txt size={15} weight="bold" num color={t.strongInk}>{pushDone ? 'Gagné' : '+' + RULES.challengeReward}</Txt>
        </View>
      </Press>

      {/* Communauté (opt-in) */}
      <CommunityEntry />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 372, borderRadius: 32, backgroundColor: '#D6D3CC', overflow: 'hidden' },
  heroImg: { position: 'absolute', bottom: 0, alignSelf: 'center' },
  heroTag: {
    position: 'absolute',
    left: 14,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(28,29,31,0.88)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingLeft: 6,
    paddingRight: 10,
  },
  levelBtn: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(245,244,241,0.92)',
    borderRadius: 22,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 14,
    overflow: 'hidden',
  },
  levelNum: { width: 40, height: 40, borderRadius: 13, backgroundColor: OBSIDIAN, alignItems: 'center', justifyContent: 'center' },
  alert: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: 22, paddingVertical: 12, paddingLeft: 12, paddingRight: 14 },
  defi: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 24, padding: 14 },
  defiIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
});
