/**
 * Mode cuisine : une étape à la fois, les ingrédients de l'étape avec leurs quantités, une barre de progression, un
 * minuteur juste même en arrière-plan (heure de fin absolue), l'écran allumé en option. La progression est gardée :
 * on peut quitter et reprendre. À la fin, rien n'est ajouté au journal sans confirmation.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Animated, { FadeIn, SlideInRight, SlideInLeft, useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { V2 } from '@/theme/tokens';
import { RECIPES } from '@/data/recipes';
import { cap, resolve, stepChanges } from '@/kitchen/nutrition';
import { useRecipes } from '@/store/useRecipes';
import { playSfx } from '@/services/sound';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CloseIcon } from '@/components/Icons';
import { Action, RecipePhoto, TickIcon } from '@/components/kitchen/parts';
import { EatSheet } from '@/components/kitchen/sheets';

const AWAKE_TAG = 'fitaia-cuisine';
const NOTIF_ID = 'fitaia-cuisine-minuteur';

const clock = () => Date.now();

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

/** Notification locale à la fin du minuteur, seulement si les notifications sont déjà autorisées (jamais de demande ici). */
async function notifyAt(end: number, title: string) {
  if (Platform.OS === 'web') return;
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    await Notifications.cancelScheduledNotificationAsync(NOTIF_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: { title: 'Minuteur terminé', body: title },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(end) },
    });
  } catch {
    // sans notification, le minuteur reste juste à l'écran
  }
}
function cancelNotif() {
  if (Platform.OS === 'web') return;
  Notifications.cancelScheduledNotificationAsync(NOTIF_ID).catch(() => {});
}

function ProgressBar({ step, count }: { step: number; count: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4, flex: 1 }} accessibilityLabel={'Étape ' + (step + 1) + ' sur ' + count}>
      {Array.from({ length: count }, (_, i) => (
        <Seg key={i} on={i <= step} track={t.track} />
      ))}
    </View>
  );
}
function Seg({ on, track }: { on: boolean; track: string }) {
  const v = useDerivedValue(() => withTiming(on ? 1 : 0, { duration: 300 }));
  const anim = useAnimatedStyle(() => ({ width: `${v.get() * 100}%` }));
  return (
    <View style={[styles.seg, { backgroundColor: track }]}>
      <Animated.View style={[styles.segFill, anim]} />
    </View>
  );
}

export default function CookMode() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = RECIPES.find((r) => r.id === id);
  const state = useRecipes((s) => (id ? s.cooking[id] : undefined));
  const saveCook = useRecipes((s) => s.saveCook);
  const endCook = useRecipes((s) => s.endCook);
  const [now, setNow] = useState(clock);
  const [awake, setAwake] = useState(false);
  const [finished, setFinished] = useState(false);
  const [eat, setEat] = useState(false);
  const [dir, setDir] = useState(1);
  const rang = useRef<number | null>(null);
  const logged = useRef(false);

  const timerEnd = state?.timerEnd ?? null;
  // minuteur : on recalcule depuis l'heure de fin, donc il reste juste après un passage en arrière-plan
  useEffect(() => {
    if (!timerEnd) return;
    const iv = setInterval(() => setNow(clock()), 250);
    const sub = AppState.addEventListener('change', () => setNow(clock()));
    return () => {
      clearInterval(iv);
      sub.remove();
    };
  }, [timerEnd]);
  useEffect(() => {
    if (timerEnd && now >= timerEnd && rang.current !== timerEnd) {
      rang.current = timerEnd;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      playSfx('succes');
    }
  }, [now, timerEnd]);
  useEffect(() => {
    if (!awake) return;
    activateKeepAwakeAsync(AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(AWAKE_TAG);
    };
  }, [awake]);

  if (!recipe || !state) {
    return (
      <View style={[styles.fill, { backgroundColor: t.bg, padding: 20, paddingTop: insets.top + 20, gap: 12 }]}>
        <Display size={22}>Rien en cours</Display>
        <Action label="Retour" onPress={() => router.back()} block />
      </View>
    );
  }
  const count = recipe.steps.length;
  const stepIdx = Math.min(state.step, count - 1);
  const step = recipe.steps[stepIdx];
  const items = resolve(recipe, state.servings, state.subs);
  const uses = (step.uses ?? []).map((i) => items[i]).filter((x) => x && !x.removed);
  const timerHere = state.timerStep === stepIdx && timerEnd;
  const left = timerHere ? timerEnd - now : (step.timer ?? 0) * 1000;
  const ringing = !!timerHere && left <= 0;

  const go = (d: number) => {
    const next = stepIdx + d;
    setDir(d);
    if (next >= count) {
      setFinished(true);
      return;
    }
    if (next < 0) return;
    saveCook(recipe.id, { step: next });
  };
  const startTimer = () => {
    if (!step.timer) return;
    const end = clock() + step.timer * 1000;
    setNow(clock());
    saveCook(recipe.id, { timerEnd: end, timerStep: stepIdx });
    notifyAt(end, recipe.name + ' : étape ' + (stepIdx + 1));
  };
  const stopTimer = () => {
    saveCook(recipe.id, { timerEnd: null, timerStep: null });
    cancelNotif();
  };
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/scanner'));
  const done = () => {
    cancelNotif();
    endCook(recipe.id);
    leave();
  };

  if (finished) {
    return (
      <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + 12 }]}>
        <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1, padding: 20, gap: 16, justifyContent: 'center' }}>
          <RecipePhoto id={recipe.id} style={styles.endPhoto} />
          <Display size={28} style={{ textAlign: 'center' }}>C’est prêt !</Display>
          <Txt size={15} color={t.ink2} style={{ textAlign: 'center' }}>Tu veux l’ajouter à ton journal ? Tu choisis la portion que tu manges.</Txt>
        </Animated.View>
        <View style={[styles.bottom, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
          <Action kind="ghost" label="Pas maintenant" onPress={done} />
          <Action label="Ajouter au journal" onPress={() => setEat(true)} />
        </View>
        <EatSheet
          recipe={recipe}
          subs={state.subs}
          prepared={state.servings}
          visible={eat}
          onLogged={() => (logged.current = true)}
          onUndone={() => (logged.current = false)}
          onClose={() => {
            setEat(false);
            if (logged.current) done(); // ajouté : on referme le mode cuisine
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + 8 }]}>
      <View style={styles.head}>
        <Press accessibilityLabel="Quitter (la progression est gardée)" onPress={leave} style={[styles.close, { backgroundColor: t.surf }]}>
          <CloseIcon size={14} color={t.ink} />
        </Press>
        <ProgressBar step={stepIdx} count={count} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}>
        <Txt size={13} weight="semibold" color={t.ink2} num>Étape {stepIdx + 1} sur {count} · {recipe.name}</Txt>
        <Animated.View key={stepIdx} entering={(dir > 0 ? SlideInRight : SlideInLeft).duration(260)} style={{ gap: 18 }}>
          {uses.length ? (
            <View style={styles.uses}>
              {uses.map((x) => (
                <View key={x.index} style={[styles.use, { backgroundColor: t.surf }]}>
                  <Txt size={14} weight="semibold">{cap(x.name)}</Txt>
                  <Txt size={13} color={t.ink2} num>{x.qty}</Txt>
                </View>
              ))}
            </View>
          ) : null}
          <Display size={26} lineHeight={34}>{step.t}</Display>
          {stepChanges(recipe, step.uses, state.subs).map((c) => (
            <Txt key={c} size={15} weight="semibold" color={V2.violet}>Avec tes changements : {c}</Txt>
          ))}
          {step.timer ? (
            <View style={[styles.timer, { backgroundColor: ringing ? V2.lime : t.surf }]}>
              <Txt size={13} weight="semibold" color={ringing ? V2.obsidian : t.ink2}>{ringing ? 'Temps écoulé' : timerHere ? 'Minuteur en cours' : 'Minuteur'}</Txt>
              <Display size={52} num color={ringing ? V2.obsidian : t.ink} accessibilityLiveRegion="polite">{mmss(left)}</Display>
              <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
                {timerHere ? (
                  <>
                    <Action kind="ghost" label="Arrêter" onPress={stopTimer} />
                    <Action label="Relancer" onPress={startTimer} />
                  </>
                ) : (
                  <Action label={'Lancer ' + Math.round(step.timer / 60) + ' min'} onPress={startTimer} />
                )}
              </View>
            </View>
          ) : null}
        </Animated.View>
        <View style={[styles.awake, { borderColor: t.line }]}>
          <Txt size={14} style={{ flex: 1 }}>Garder l’écran allumé</Txt>
          <Switch value={awake} onValueChange={setAwake} trackColor={{ true: V2.lime, false: t.track }} thumbColor={V2.white} accessibilityLabel="Garder l’écran allumé" />
        </View>
      </ScrollView>
      <View style={[styles.bottom, { borderTopWidth: 1, borderTopColor: t.line, paddingBottom: Math.max(16, insets.bottom + 8) }]}>
        <Press accessibilityLabel="Étape précédente" disabled={stepIdx === 0} onPress={() => go(-1)} style={[styles.big, { backgroundColor: t.surf, opacity: stepIdx === 0 ? 0.4 : 1 }]}>
          <Txt size={17} weight="bold">Précédent</Txt>
        </Press>
        <Press accessibilityLabel={stepIdx === count - 1 ? 'Terminer' : 'Étape suivante'} haptic="medium" onPress={() => go(1)} style={[styles.big, { backgroundColor: V2.lime, flex: 1.4 }]}>
          {stepIdx === count - 1 ? <TickIcon size={18} /> : null}
          <Txt size={17} weight="bold" color={V2.obsidian}>{stepIdx === count - 1 ? 'Terminé' : 'Suivant'}</Txt>
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  seg: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  segFill: { height: '100%', backgroundColor: V2.lime, borderRadius: 3 },
  uses: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  use: { borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, gap: 2 },
  timer: { borderRadius: 24, padding: 18, alignItems: 'center', gap: 10 },
  awake: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14 },
  bottom: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  big: { flex: 1, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  endPhoto: { width: '100%', height: 240, borderRadius: 26 },
});
