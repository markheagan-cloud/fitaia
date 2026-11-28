import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Breathe } from '@/fx/Breathe';
import { fenetre, forme } from '@/coach/forme';
import { useWatchTiles } from '@/services/watch';
import { streak } from '@/store/economy';
import { challengeTarget } from '@/coach/challengeTarget';
import { poseReady } from '@/pose/usePushupCamera';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, RED, AMBER, V2, alert, shadow } from '@/theme/tokens';
import { RARITY, fmt, fmtKg, todayLabel } from '@/data/content';
import { useBody, useCalories, useGame } from '@/store/useGame';
import { useEquippedSkin } from '@/avatar/outfits';
import { useEco } from '@/store/useEco';
import { dailyEarnable } from '@/economy/dailyEarnings';
import { FillBar, ProgressRing } from '@/ui/kit';
import { useCountUp } from '@/fx/AnimatedNumber';
import { Bar } from '@/fx/Bar';
import { HeroAvatar } from '@/avatar/HeroAvatar';
import { RULES } from '@/store/economy';
import { Screen, Card } from '@/components/Screen';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CoinIcon } from '@/components/Icons';
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
  const history = useGame((x) => x.history);
  const pushTotal = useGame((x) => x.pushTotal);
  const jauges = forme(pushTotal, history, streak(history));
  const win = fenetre(pushDone);
  const montre = useWatchTiles();
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

  // Prochaine action utile, selon ce qui est déjà fait aujourd'hui et l'heure
  const hour = new Date().getHours();
  const mealsToday = useGame((x) => (x.meals[x.day] ?? []).length);
  const statuses = useEco((x) => x.statuses);
  const toEarn = dailyEarnable(statuses);
  const next = !pushDone
    ? { label: 'Faire le défi du jour', sub: (poseReady ? challengeTarget(history) : 5) + ' pompes, comptées par la caméra', go: () => router.navigate('/(tabs)/defis') }
    : mealsToday === 0
      ? { label: 'Enregistrer un repas', sub: 'Photo, code-barres ou recherche', go: () => router.navigate('/(tabs)/scanner') }
      : hour >= 20
        ? { label: 'Journée complète', sub: 'Repos, sommeil, eau : ton perso récupère aussi', go: () => router.navigate('/(tabs)/perso') }
        : { label: 'Voir les défis bonus', sub: 'Squats, gainage, marche : à ton rythme', go: () => router.navigate('/(tabs)/defis') };
  const greet = hour < 5 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  return (
    <Screen name="home" subtitle={greet + ' · ' + todayLabel()}>
      {/* Perso, sur la même scène studio que le vestiaire */}
      <View accessibilityLabel="Ton personnage" style={[styles.hero, shadow.lg]}>
        <LinearGradient colors={['#1C2029', OBSIDIAN]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.heroLight} />
        <LinearGradient colors={['rgba(169,147,255,0.22)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 0.5, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <View style={styles.heroFloor} />
        <Breathe style={styles.heroImg}>
          <HeroAvatar width={W} height={340} />
        </Breathe>
        <View style={styles.heroTag}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: RARITY[skin.rarity].c }} />
          <Txt size={12} weight="semibold" color={V2.white}>{skin.name}</Txt>
        </View>
        <Press onPress={() => router.navigate('/(tabs)/perso')} pressScale={0.98} accessibilityLabel={'Niveau ' + body.level + ', ouvrir Mon perso'} style={styles.levelBtn}>
          <View style={styles.levelNum}>
            <Display size={17} color={V2.obsidian} num letterSpacing={-0.3}>{body.level}</Display>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt size={13} weight="bold" color={V2.white}>{body.tier.reached ? 'Objectif atteint' : 'Palier ' + body.tier.current + ' sur 5'}</Txt>
              <Txt size={13} num color={V2.grey}>{body.tier.reached ? fmtKg(body.now) + ' kg' : 'encore ' + fmtKg(body.tier.toNext) + ' kg'}</Txt>
            </View>
            <FillBar pct={body.tier.progress} color={V2.violet} track="#2A2F39" height={5} />
          </View>
        </Press>
      </View>

      {/* Ta journée : trois anneaux et la prochaine action utile */}
      <Card radius={26} style={{ padding: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {[
            { k: 'Défi', pct: pushDone ? 1 : 0, v: pushDone ? '✓' : '0/1', c: V2.lime },
            { k: 'Repas', pct: Math.min(1, mealsToday / 3), v: mealsToday + '/3', c: '#3DDCCB' },
            { k: 'Calories', pct: Math.min(1, cal.ratio), v: Math.round(Math.min(cal.ratio, 9.99) * 100) + '%', c: cal.over ? RED : cal.near ? AMBER : V2.violet },
          ].map((r) => (
            <View key={r.k} style={{ alignItems: 'center', gap: 6, flex: 1 }} accessible accessibilityLabel={r.k + ' : ' + r.v}>
              <ProgressRing pct={r.pct} size={66} stroke={7} color={r.c}>
                <Txt size={14} weight="bold" num>{r.v}</Txt>
              </ProgressRing>
              <Txt size={12} color={t.ink2}>{r.k}</Txt>
            </View>
          ))}
        </View>
        <Press haptic="medium" onPress={next.go} style={[styles.next, { backgroundColor: !pushDone || mealsToday === 0 ? V2.lime : t.strong }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt size={15} weight="bold" color={!pushDone || mealsToday === 0 ? V2.obsidian : t.strongInk}>{next.label}</Txt>
            <Txt size={12} color={!pushDone || mealsToday === 0 ? '#2B3410' : t.strongInk2} numberOfLines={1}>{next.sub}</Txt>
          </View>
          {toEarn > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <CoinIcon size={13} />
              <Txt size={14} weight="bold" num color={!pushDone || mealsToday === 0 ? V2.obsidian : t.strongInk}>{'+' + toEarn}</Txt>
            </View>
          ) : null}
        </Press>
      </Card>

      {/* Forme : trois niveaux sur 4, tirés de ce qui a vraiment été fait */}
      <Card radius={26} style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {jauges.map((j) => (
            <View key={j.id} style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Txt size={12} weight="semibold">{j.label}</Txt>
                <Txt size={12} weight="bold" num>{j.level}/4</Txt>
              </View>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {[1, 2, 3, 4].map((n) => (
                  <View key={n} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: n <= j.level ? LIME : t.line }} />
                ))}
              </View>
              <Txt size={10} color={t.ink2} numberOfLines={1}>{j.hint}</Txt>
            </View>
          ))}
        </View>
        <Txt size={12} color={t.ink2}>{win.text}</Txt>
      </Card>

      {/* Montre connectée : mesures du jour lues dans Santé (rien d'affiché tant qu'il n'y a pas de vraie mesure) */}
      {montre.length ? (
        <Card radius={26} style={{ padding: 16, gap: 10 }}>
          <Txt size={12} weight="semibold" color={t.ink2}>Ta montre aujourd’hui</Txt>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {montre.map((m) => (
              <View key={m.id} style={{ flex: 1, gap: 2 }}>
                <Txt size={16} weight="bold" num numberOfLines={1} adjustsFontSizeToFit>{m.value}</Txt>
                <Txt size={10} color={t.ink2} numberOfLines={1}>{m.label}{m.hint ? ' · ' + m.hint : ''}</Txt>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

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

      {/* Communauté (opt-in) */}
      <CommunityEntry />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 340, borderRadius: 30, backgroundColor: OBSIDIAN, overflow: 'hidden' },
  heroLight: { position: 'absolute', alignSelf: 'center', top: -60, width: 340, height: 340, borderRadius: 170, backgroundColor: 'rgba(245,246,248,0.06)' },
  heroFloor: { position: 'absolute', alignSelf: 'center', bottom: 30, width: 200, height: 22, borderRadius: 100, backgroundColor: 'rgba(0,0,0,0.5)' },
  next: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  heroImg: { position: 'absolute', bottom: 0, alignSelf: 'center' },
  heroTag: {
    position: 'absolute',
    left: 14,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(11,13,16,0.7)',
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
    backgroundColor: 'rgba(23,26,32,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 22,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 14,
    overflow: 'hidden',
  },
  levelNum: { width: 40, height: 40, borderRadius: 13, backgroundColor: V2.violet, alignItems: 'center', justifyContent: 'center' },
  alert: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: 22, paddingVertical: 12, paddingLeft: 12, paddingRight: 14 },
  defi: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 24, padding: 14 },
  defiIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
});
