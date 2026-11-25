import React, { useState } from 'react';
import { View, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, RED, AMBER, alert, shadow } from '@/theme/tokens';
import { CUR_NAMES, MEALS, ORIGIN_LABEL, fmt } from '@/data/content';
import { useCalories, useGame } from '@/store/useGame';
import { Screen, Card } from '@/components/Screen';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CoachAvatar } from '@/components/CoachAvatar';
import { ManualMealSheet } from '@/components/ManualMealSheet';
import { MealJournal } from '@/components/MealJournal';
import type { MealEntry } from '@/data/content';
import { FoodSearch, PortionPicker } from '@/components/FoodSearch';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Food, fetchBarcode, toMeal } from '@/services/food';
import { useDailyCoins } from '@/store/useEco';
import { useCountUp } from '@/fx/AnimatedNumber';
import * as ImagePicker from 'expo-image-picker';
import { analyseMealPhoto, estimateToMeal, mealPhotoConfigured, type MealEstimate } from '@/services/mealPhoto';

const PORTIONS: [string, number][] = [['Petite', 0.7], ['Normale', 1], ['Grande', 1.3]];

type Mode = 'idle' | 'search' | 'portion' | 'barcode' | 'photo';

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
  const [editing, setEditing] = useState<MealEntry | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [food, setFood] = useState<Food | null>(null);
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState<MealEstimate | null>(null);
  const [factor, setFactor] = useState(1);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const res = perm.granted
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    setMode('photo');
    setEstimate(null);
    setPhotoErr(null);
    setFactor(1);
    setBusy(true);
    try {
      const e = await analyseMealPhoto(res.assets[0].uri);
      if (!e) setPhotoErr('Je ne vois pas de repas sur cette photo. Reprends-la de plus près, ou cherche l’aliment par son nom.');
      setEstimate(e);
    } catch (err) {
      setPhotoErr(err instanceof Error ? err.message : 'Analyse impossible. Vérifie ta connexion et réessaie.');
    } finally {
      setBusy(false);
    }
  };

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
  if (!scanned && mode === 'photo') {
    const m = estimate ? estimateToMeal(estimate, factor) : null;
    return (
      <Screen name="scan">
        <Card radius={28} pad={16} elevated style={{ gap: 14 }}>
          {busy ? (
            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
              <ActivityIndicator color={LIME} size="large" />
              <Txt size={15} weight="semibold">J’analyse ton assiette…</Txt>
              <Txt size={12} color={t.ink2}>Environ 20 à 40 secondes</Txt>
            </View>
          ) : m ? (
            <>
              <View style={{ gap: 3 }}>
                <Txt size={13} color={t.ink2}>{m.name}</Txt>
                <Display wide size={34} num lineHeight={34} letterSpacing={-1.7}>
                  {'≈ ' + fmt(m.kcal)}
                  <Display wide size={16} letterSpacing={0} color={t.ink2}> kcal</Display>
                </Display>
              </View>
              <View style={{ gap: 6 }}>
                {m.items.map((it) => (
                  <View key={it} style={[styles.chip, { alignSelf: 'flex-start' }]}>
                    <Txt size={13} weight="semibold" color={OBSIDIAN}>{it}</Txt>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {PORTIONS.map(([label, f]) => {
                  const on = factor === f;
                  return (
                    <Press key={label} onPress={() => setFactor(f)} style={[styles.ghost, { height: 44, borderColor: on ? LIME : t.line, backgroundColor: on ? LIME : 'transparent' }]}>
                      <Txt size={14} weight={on ? 'bold' : 'semibold'} color={on ? OBSIDIAN : t.ink}>{label}</Txt>
                    </Press>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Press onPress={() => { setManual(true); }} style={[styles.ghost, { height: 52, borderRadius: 20, borderColor: t.line }]}>
                  <Txt size={14} weight="semibold">Corriger</Txt>
                </Press>
                <Press haptic="medium" onPress={() => { setCustomMeal(m); setMode('idle'); setEstimate(null); }} style={[styles.primary, { flex: 1.4, height: 52, borderRadius: 20 }, shadow.btn]}>
                  <Txt size={14} weight="bold" color={OBSIDIAN}>Valider ce repas</Txt>
                </Press>
              </View>
            </>
          ) : (
            <View style={{ gap: 10, paddingVertical: 12 }}>
              <Txt size={14} lineHeight={20}>{photoErr ?? 'Aucune photo.'}</Txt>
              <Press haptic="medium" onPress={takePhoto} style={[styles.primary, { height: 52 }, shadow.btn]}>
                <Txt size={14} weight="bold" color={OBSIDIAN}>Reprendre la photo</Txt>
              </Press>
            </View>
          )}
        </Card>
        {!busy ? (
          <Press onPress={() => { setMode('idle'); setEstimate(null); }} style={[styles.ghost, { borderColor: t.line, flex: 0 }]}>
            <Txt size={14} weight="semibold">Annuler</Txt>
          </Press>
        ) : null}
        <ManualMealSheet visible={manual} edit={null} onClose={() => setManual(false)} />
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
        {!scanned ? <Txt size={13} color="#9AA0A8">Photo, code-barres ou recherche : ton repas compté en un geste</Txt> : null}
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
          {mealPhotoConfigured ? (
            <Press haptic="medium" onPress={takePhoto} style={[styles.primary, { height: 56 }, shadow.btn]}>
              <Txt size={16} weight="bold" color={OBSIDIAN}>Prendre mon assiette en photo</Txt>
            </Press>
          ) : null}
          <Press haptic="medium" onPress={() => setMode('barcode')} style={mealPhotoConfigured ? [styles.ghost, { flex: 0, height: 52, borderColor: t.ink }] : [styles.primary, { height: 56 }, shadow.btn]}>
            <Txt size={mealPhotoConfigured ? 15 : 16} weight="bold" color={mealPhotoConfigured ? t.ink : OBSIDIAN}>Scanner un code-barres</Txt>
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
          <MealJournal onEdit={(m) => { setEditing(m); setManual(true); }} />
        </>
      ) : (
        <Animated.View entering={FadeIn.duration(300)}>
          <Card radius={28} pad={16} elevated style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ gap: 3 }}>
                <Txt size={13} color={t.ink2}>{customMeal ? meal.name : 'Exemple · ' + meal.name}</Txt>
                {customMeal?.origin ? <Txt size={11} color={t.ink2}>{ORIGIN_LABEL[customMeal.origin]}</Txt> : null}
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
      <ManualMealSheet visible={manual} edit={editing} onClose={() => { setManual(false); setEditing(null); }} />
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
