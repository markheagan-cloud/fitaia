import React, { useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, RED, AMBER, alert, shadow } from '@/theme/tokens';
import { CUR_NAMES, MEALS, fmt } from '@/data/content';
import { useCalories, useGame } from '@/store/useGame';
import { Screen, Card } from '@/components/Screen';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CoachAvatar } from '@/components/CoachAvatar';
import { ManualMealSheet } from '@/components/ManualMealSheet';
import { FoodSearch, PortionPicker } from '@/components/FoodSearch';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Food, fetchBarcode, toMeal } from '@/services/food';
import { useDailyCoins } from '@/store/useEco';
import { useCountUp } from '@/fx/AnimatedNumber';

type Mode = 'idle' | 'search' | 'portion' | 'barcode';

export default function Scanner() {
  const t = useTheme();
  const a = alert(t);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const W = Math.max(0, width - 32);
  const cal = useCalories();
  const { scanned, mealIdx, customMeal, doScan, nextMeal, addMeal, setCustomMeal, say } = useGame();
  const mealCoins = useDailyCoins('daily_meal');
  const [manual, setManual] = useState(false);
  const [mode, setMode] = useState<Mode>('idle');
  const [food, setFood] = useState<Food | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (f: Food) => {
    setFood(f);
    setMode('portion');
  };
  const confirm = (grams: number) => {
    if (!food) return;
    setCustomMeal(toMeal(food, grams));
    setMode('idle');
  };
  const onCode = async (code: string) => {
    setBusy(true);
    try {
      const f = await fetchBarcode(code);
      if (!f) say('Produit inconnu d’Open Food Facts : cherche-le par son nom', 'bad');
      else pick(f);
    } catch {
      say('Pas de réseau : cherche l’aliment par son nom', 'bad');
    } finally {
      setBusy(false);
    }
  };

  const meal = customMeal ?? MEALS[mealIdx];
  const after = cal.eaten + meal.kcal;
  const overAfter = after > cal.budget;
  const impact = overAfter
    ? { bg: a.overBg, ink: a.overInk, title: 'Attention.', text: 'Avec ce repas tu passes à ' + fmt(after) + ' kcal, ' + fmt(after - cal.budget) + ' de plus que ton budget.' }
    : { bg: a.goodBg, ink: a.goodInk, title: 'Dans le budget.', text: 'Après ce repas, il te restera ' + fmt(cal.budget - after) + ' kcal.' };
  const scoreColor = meal.score >= 70 ? LIME : meal.score >= 50 ? AMBER : RED;
  const reward = mealCoins;
  const kcalShown = useCountUp(meal.kcal, 500);

  if (!scanned && mode === 'search') {
    return (
      <Screen name="scan">
        <FoodSearch onPick={pick} autoFocus />
        <Press onPress={() => setMode('idle')} style={[styles.ghost, { borderColor: t.line, flex: 0 }]}>
          <Txt size={14} weight="semibold">Annuler</Txt>
        </Press>
      </Screen>
    );
  }
  if (!scanned && mode === 'portion' && food) {
    return (
      <Screen name="scan">
        <Card radius={28} pad={16} elevated>
          <PortionPicker food={food} onConfirm={confirm} onBack={() => setMode('search')} />
        </Card>
      </Screen>
    );
  }
  if (!scanned && mode === 'barcode') {
    return (
      <Screen name="scan">
        <BarcodeScanner onCode={onCode} onCancel={() => setMode('idle')} busy={busy} />
      </Screen>
    );
  }

  return (
    <Screen name="scan">
      <View style={[styles.cam, shadow.md]}>
        {!scanned ? <Txt size={13} color="#9AA0A8">Scanne, cherche ou écris ton repas</Txt> : null}
        <Svg width={W} height={268} viewBox="0 0 358 268" preserveAspectRatio="xMidYMid meet" style={StyleSheet.absoluteFill}>
          <Path
            d="M40 70V52a12 12 0 0 1 12-12h18M288 40h18a12 12 0 0 1 12 12v18M318 198v18a12 12 0 0 1-12 12h-18M70 228H52a12 12 0 0 1-12-12v-18"
            fill="none"
            stroke={LIME}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </Svg>
        {scanned ? (
          <View style={styles.items}>
            {meal.items.map((it, i) => (
              <Animated.View key={it} entering={FadeInDown.duration(280).delay(i * 80)} style={styles.chip}>
                <Txt size={13} weight="semibold" color={OBSIDIAN}>{it}</Txt>
              </Animated.View>
            ))}
          </View>
        ) : null}
      </View>

      {!scanned ? (
        <>
          <Press haptic="medium" onPress={() => setMode('barcode')} style={[styles.primary, { height: 56 }, shadow.btn]}>
            <Txt size={16} weight="bold" color={OBSIDIAN}>Scanner un code-barres</Txt>
          </Press>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Press onPress={() => setMode('search')} style={[styles.ghost, { borderColor: t.line }]}>
              <Txt size={14} weight="semibold">Chercher un aliment</Txt>
            </Press>
            <Press onPress={() => setManual(true)} style={[styles.ghost, { borderColor: t.line }]}>
              <Txt size={14} weight="semibold">Écrire mon repas</Txt>
            </Press>
          </View>
          <Press onPress={doScan} style={{ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 10 }}>
            <Txt size={12} color={t.ink2}>Voir un exemple de repas</Txt>
          </Press>
        </>
      ) : (
        <Animated.View entering={FadeIn.duration(300)}>
          <Card radius={28} pad={16} elevated style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ gap: 3 }}>
                <Txt size={13} color={t.ink2}>{customMeal ? meal.name : 'Exemple · ' + meal.name}</Txt>
                <Display wide size={34} num lineHeight={34} letterSpacing={-1.7}>
                  {fmt(kcalShown)}
                  <Display wide size={16} letterSpacing={0} color={t.ink2}> kcal</Display>
                </Display>
              </View>
              <View style={[styles.score, { borderColor: scoreColor }]}>
                <Txt size={18} weight="bold" num lineHeight={18}>{meal.score}</Txt>
                <Txt size={10} color={t.ink2}>score</Txt>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                ['Protéines', meal.p],
                ['Glucides', meal.g],
                ['Lipides', meal.l],
              ].map(([k, v]) => (
                <View key={String(k)} style={[styles.macro, { backgroundColor: t.bg }]}>
                  <Txt size={12} color={t.ink2}>{k}</Txt>
                  <Txt size={17} weight="bold" num>{v} g</Txt>
                </View>
              ))}
            </View>
            <View style={[styles.impact, { backgroundColor: impact.bg }]}>
              <CoachAvatar size={28} />
              <Txt size={13} lineHeight={18} color={impact.ink} style={{ flex: 1 }}>
                <Txt size={13} weight="bold" color={impact.ink}>{impact.title}</Txt> {impact.text}
              </Txt>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Press onPress={customMeal ? () => { useGame.getState().resetScan(); setMode(food ? 'portion' : 'idle'); } : nextMeal} style={[styles.ghost, { flex: 1, height: 52, borderRadius: 20, borderColor: t.line }]}>
                <Txt size={14} weight="semibold">{customMeal ? 'Modifier' : 'Autre exemple'}</Txt>
              </Press>
              {customMeal ? (
                <Press
                  haptic="medium"
                  onPress={() => {
                    addMeal();
                    router.navigate('/(tabs)');
                  }}
                  style={[styles.primary, { flex: 1.4, height: 52, borderRadius: 20 }, shadow.btn]}
                >
                  <Txt size={14} weight="bold" num color={OBSIDIAN}>{reward ? 'Ajouter, +' + reward + ' ' + CUR_NAMES[0] : 'Ajouter au journal'}</Txt>
                </Press>
              ) : (
                // exemple de démonstration : on le montre, il ne s'ajoute jamais au journal ni ne rapporte quoi que ce soit
                <Press onPress={() => useGame.getState().resetScan()} style={[styles.ghost, { flex: 1.4, height: 52, borderRadius: 20, borderColor: t.ink }]}>
                  <Txt size={14} weight="semibold">Fermer l’exemple</Txt>
                </Press>
              )}
            </View>
          </Card>
        </Animated.View>
      )}
      <ManualMealSheet visible={manual} onClose={() => setManual(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cam: { height: 268, borderRadius: 30, backgroundColor: '#26282C', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  items: { position: 'absolute', left: 52, top: 56, gap: 6, alignItems: 'flex-start' },
  chip: { backgroundColor: 'rgba(245,244,241,0.94)', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11 },
  primary: { borderRadius: 22, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  ghost: { flex: 1, height: 48, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  score: { width: 60, height: 60, borderRadius: 999, borderWidth: 5, alignItems: 'center', justifyContent: 'center' },
  macro: { flex: 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  impact: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: 18, paddingVertical: 11, paddingHorizontal: 12 },
});
