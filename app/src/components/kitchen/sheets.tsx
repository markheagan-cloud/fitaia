/**
 * Feuilles de la cuisine : « Pas pour moi » (raison facultative), « Il me manque un ingrédient » (remplacements sûrs)
 * et « Je la mange » (vérification puis ajout au journal, avec annulation). Rien n'est ajouté au journal sans un appui
 * explicite sur « Ajouter à mon journal ».
 */
import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { V2, motion } from '@/theme/tokens';
import { useGame } from '@/store/useGame';
import { useRecipes, type RefuseReason } from '@/store/useRecipes';
import { dayKey } from '@/store/economy';
import { playSfx } from '@/services/sound';
import { familyLabel, recipeFamilies, safeSubstitutes, type RecipePrefs } from '@/coach/recipes';
import type { Recipe } from '@/data/recipes';
import { cap, fmtCount, recipeMeal, resolve, type Subs } from '@/kitchen/nutrition';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { Action, MacroTiles, Sheet, TickIcon } from './parts';

const ease = Easing.bezier(motion.bezier[0], motion.bezier[1], motion.bezier[2], motion.bezier[3]);

function Option({ label, on, onPress, hint }: { label: string; on?: boolean; onPress: () => void; hint?: string }) {
  const t = useTheme();
  return (
    <Press
      accessibilityLabel={label}
      accessibilityState={{ selected: !!on }}
      onPress={onPress}
      pressScale={0.97}
      style={[styles.option, { backgroundColor: on ? V2.lime : t.surf, borderColor: on ? V2.lime : t.line }]}
    >
      <Txt size={15} weight="semibold" color={on ? V2.obsidian : t.ink}>{label}</Txt>
      {hint ? <Txt size={12} color={on ? V2.obsidian : t.ink2}>{hint}</Txt> : null}
    </Press>
  );
}

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Press
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      pressScale={0.94}
      style={[styles.pill, { backgroundColor: on ? V2.lime : t.surf, borderColor: on ? V2.lime : t.line }]}
    >
      <Txt size={14} weight={on ? 'bold' : 'medium'} color={on ? V2.obsidian : t.ink}>{label}</Txt>
    </Press>
  );
}

const REASONS: { id: RefuseReason; label: string; hint: string }[] = [
  { id: 'ingredient', label: 'Je n’aime pas un ingrédient', hint: 'On ne te le proposera plus' },
  { id: 'complique', label: 'Trop compliqué', hint: 'Des recettes plus simples d’abord' },
  { id: 'manque', label: 'Je n’ai pas les ingrédients', hint: 'Elle reviendra dans quelques jours' },
  { id: 'envie', label: 'Pas envie aujourd’hui', hint: 'Juste pour aujourd’hui' },
  { id: 'autre', label: 'Je préfère autre chose', hint: 'On varie davantage' },
];

/** « Pas pour moi » : la raison est facultative, chacune a une conséquence différente. */
export function RefuseSheet({ recipe, onClose, onDone }: { recipe: Recipe | null; onClose: () => void; onDone: (msg: string) => void }) {
  const t = useTheme();
  const refuse = useRecipes((s) => s.refuse);
  const [askFamily, setAskFamily] = useState(false);
  if (!recipe) return null;
  const fams = recipeFamilies(recipe);
  const pick = (reason: RefuseReason, family?: string) => {
    if (reason === 'ingredient' && !family && fams.length > 1) {
      setAskFamily(true);
      return;
    }
    onDone(refuse(recipe.id, reason, family ?? (reason === 'ingredient' ? fams[0] : undefined)));
  };
  return (
    <Sheet visible onClose={onClose}>
      <View style={styles.sheetBody}>
        {askFamily ? (
          <>
            <Display size={22}>Quel ingrédient ?</Display>
            <Txt size={13} color={t.ink2}>On ne te proposera plus de recette avec cet aliment. Tu peux changer ça dans « Mes goûts ».</Txt>
            <View style={styles.wrap}>
              {fams.map((f) => (
                <Pill key={f} label={familyLabel(f)} on={false} onPress={() => pick('ingredient', f)} />
              ))}
            </View>
            <Press accessibilityLabel="Retour" onPress={() => setAskFamily(false)} style={styles.link}>
              <Txt size={14} weight="semibold" color={t.ink2}>Retour</Txt>
            </Press>
          </>
        ) : (
          <>
            <Display size={22}>Pas pour toi ?</Display>
            <Txt size={13} color={t.ink2}>Dis-nous pourquoi si tu veux, c’est facultatif. Ça aide à mieux choisir la prochaine fois.</Txt>
            <View style={{ gap: 8 }}>
              {REASONS.map((r) => (
                <Option key={r.id} label={r.label} hint={r.hint} onPress={() => pick(r.id)} />
              ))}
            </View>
            <Press accessibilityLabel="Passer sans raison" onPress={() => pick('aucune')} style={styles.link}>
              <Txt size={14} weight="semibold" color={t.ink2}>Passer sans raison</Txt>
            </Press>
          </>
        )}
      </View>
    </Sheet>
  );
}

/** « Il me manque un ingrédient » : remplacements vérifiés contre les allergies, le régime et les aliments refusés. */
export function SwapSheet({ recipe, subs, prefs, visible, onClose, onChange }: { recipe: Recipe; subs: Subs; prefs: RecipePrefs; visible: boolean; onClose: () => void; onChange: (s: Subs) => void }) {
  const t = useTheme();
  const rows = recipe.ingredients.map((ing, i) => ({ ing, i, alts: safeSubstitutes(recipe, i, prefs, subs) }));
  const set = (i: number, choice: string | undefined) => {
    const next = { ...subs };
    if (choice === undefined) delete next[i];
    else next[i] = choice;
    onChange(next);
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={styles.sheetBody}>
        <Display size={22}>Il te manque un ingrédient ?</Display>
        <Txt size={13} color={t.ink2}>Choisis un remplacement : calories et protéines sont recalculées. Seuls les remplacements compatibles avec tes allergies et ton régime sont proposés.</Txt>
        {rows.map(({ ing, i, alts }) => (
          <View key={i} style={{ gap: 8 }}>
            <Txt size={14} weight="bold">{cap(ing.name)}</Txt>
            {alts.length || ing.pantry ? (
              <View style={styles.wrap}>
                <Pill label={cap(ing.name)} on={subs[i] === undefined} onPress={() => set(i, undefined)} />
                {alts.map((a) => (
                  <Pill key={a.food} label={cap(a.name)} on={subs[i] === a.food} onPress={() => set(i, a.food)} />
                ))}
                {ing.pantry ? <Pill label="Sans" on={subs[i] === 'sans'} onPress={() => set(i, 'sans')} /> : null}
              </View>
            ) : (
              <Txt size={12} color={t.ink2}>Pas de remplacement sûr pour celui-là.</Txt>
            )}
          </View>
        ))}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
        <Action label="C’est bon" onPress={onClose} block />
      </View>
    </Sheet>
  );
}

const EATEN = [0.5, 1, 1.5, 2];
const WHEN: { label: string; ago: number }[] = [
  { label: 'Maintenant', ago: 0 },
  { label: 'Il y a 30 min', ago: 30 },
  { label: 'Il y a 1 h', ago: 60 },
  { label: 'Il y a 2 h', ago: 120 },
];

/**
 * « Je la mange » : on vérifie la recette, la portion mangée, l'heure, les changements et la nutrition avant d'ajouter.
 * Ajout en un seul passage même si l'on tape deux fois ; « Annuler » retire le repas ajouté.
 */
type EatProps = { recipe: Recipe; subs: Subs; prepared?: number; visible: boolean; onClose: () => void; onLogged?: () => void; onUndone?: () => void };
export function EatSheet(props: EatProps) {
  // contenu monté à chaque ouverture : portion, heure et état repartent de zéro
  return props.visible ? <EatBody {...props} /> : null;
}

function EatBody({ recipe, subs, prepared = 1, onClose, onLogged, onUndone }: EatProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const setCustomMeal = useGame((s) => s.setCustomMeal);
  const addMeal = useGame((s) => s.addMeal);
  const updateMeal = useGame((s) => s.updateMeal);
  const removeMeal = useGame((s) => s.removeMeal);
  const say = useGame((s) => s.say);
  const [eaten, setEaten] = useState(1);
  const [ago, setAgo] = useState(0);
  const [doneId, setDoneId] = useState<string | null>(null);
  const busy = useRef(false);
  const tick = useSharedValue(0);
  const meal = useMemo(() => recipeMeal(recipe, eaten, subs), [recipe, eaten, subs]);
  const changes = resolve(recipe, 1, subs).filter((x) => x.swapped || x.removed);
  const minutesToday = new Date().getHours() * 60 + new Date().getMinutes();
  const whens = WHEN.filter((w) => w.ago <= minutesToday);
  const tickStyle = useAnimatedStyle(() => ({ transform: [{ scale: tick.get() }], opacity: Math.min(1, tick.get()) }));

  const confirm = () => {
    if (busy.current) return; // double appui : un seul repas
    busy.current = true;
    const before = new Set((useGame.getState().meals[dayKey()] ?? []).map((m) => m.id));
    setCustomMeal(meal);
    addMeal();
    const entry = (useGame.getState().meals[dayKey()] ?? []).find((m) => !before.has(m.id));
    if (!entry) {
      busy.current = false;
      return;
    }
    if (ago) updateMeal(entry.id, { at: Date.now() - ago * 60_000 });
    setDoneId(entry.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    playSfx('succes');
    tick.set(reduced ? 1 : withSequence(withTiming(1.15, { duration: 260, easing: ease }), withTiming(1, { duration: 160, easing: ease })));
    onLogged?.();
  };
  const undo = () => {
    if (!doneId) return;
    removeMeal(doneId);
    setDoneId(null);
    busy.current = false;
    say('Repas retiré du journal');
    onUndone?.();
    onClose();
  };

  return (
    <Sheet visible onClose={onClose}>
      {doneId ? (
        <Animated.View entering={FadeIn.duration(200)} style={[styles.sheetBody, { alignItems: 'center', paddingVertical: 18 }]}>
          <Animated.View style={[styles.doneTick, tickStyle]}>
            <TickIcon size={34} color={V2.obsidian} />
          </Animated.View>
          <Display size={22} style={{ textAlign: 'center' }}>Ajouté à ton journal</Display>
          <Txt size={14} color={t.ink2} style={{ textAlign: 'center' }} num>{meal.name} · {meal.kcal} kcal · {meal.p} g de protéines</Txt>
          <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 8 }}>
            <Action kind="ghost" label="Annuler" onPress={undo} />
            <Action label="Terminé" onPress={onClose} />
          </View>
        </Animated.View>
      ) : (
        <ScrollView style={{ maxHeight: 540 }} contentContainerStyle={styles.sheetBody}>
          <Display size={22}>Je la mange</Display>
          <Txt size={13} color={t.ink2}>Vérifie avant d’ajouter à ton journal.</Txt>
          <Txt size={14} weight="bold">Portion mangée{prepared !== 1 ? ' (sur ' + fmtCount(prepared) + ' préparées)' : ''}</Txt>
          <View style={styles.wrap}>
            {EATEN.map((e) => (
              <Pill key={e} label={fmtCount(e) + (e > 1 ? ' portions' : ' portion')} on={eaten === e} onPress={() => setEaten(e)} />
            ))}
          </View>
          <Txt size={14} weight="bold">Quand ?</Txt>
          <View style={styles.wrap}>
            {whens.map((w) => (
              <Pill key={w.ago} label={w.label} on={ago === w.ago} onPress={() => setAgo(w.ago)} />
            ))}
          </View>
          {changes.length ? (
            <View style={{ gap: 4 }}>
              <Txt size={14} weight="bold">Tes changements</Txt>
              {changes.map((c) => (
                <Txt key={c.index} size={13} color={t.ink2}>
                  {c.removed ? 'Sans ' + recipe.ingredients[c.index].name : cap(recipe.ingredients[c.index].name) + ' → ' + c.name}
                </Txt>
              ))}
            </View>
          ) : null}
          <MacroTiles kcal={meal.kcal} p={meal.p} g={meal.g} l={meal.l} />
          <Txt size={11} color={t.ink2}>Estimation d’après la table Ciqual 2025 (Anses). Les vraies valeurs dépendent des produits utilisés.</Txt>
        </ScrollView>
      )}
      {doneId ? null : (
        <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
          <Action label="Ajouter à mon journal" onPress={confirm} block />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheetBody: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6, gap: 12 },
  option: { borderRadius: 18, borderWidth: 1, paddingVertical: 13, paddingHorizontal: 16, gap: 2 },
  pill: { borderRadius: 999, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  link: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  doneTick: { width: 72, height: 72, borderRadius: 36, backgroundColor: V2.lime, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
