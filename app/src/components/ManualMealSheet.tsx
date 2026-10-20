import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import Animated, { Easing, FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, RED, AMBER, motion, shadow } from '@/theme/tokens';
import { useGame } from '@/store/useGame';
import type { MealEntry } from '@/data/content';
import { mealScore } from '@/store/economy';
import { Press } from './Press';
import { Txt, Display } from './Txt';
import { CloseIcon } from './Icons';

const ease = Easing.bezier(motion.bezier[0], motion.bezier[1], motion.bezier[2], motion.bezier[3]);

/** `edit` : repas du journal à corriger (sinon, saisie d'un nouveau repas). */
type Props = { visible: boolean; onClose: () => void; edit?: MealEntry | null };

function Field({ label, value, onChange, unit, keyboard = 'numeric', autoFocus }: { label: string; value: string; onChange: (v: string) => void; unit?: string; keyboard?: 'numeric' | 'default'; autoFocus?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Txt size={12} color={t.ink2}>{label}</Txt>
      <View style={[styles.input, { borderColor: t.line, backgroundColor: t.surf }]}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          keyboardType={keyboard}
          autoFocus={autoFocus}
          placeholder={keyboard === 'numeric' ? '0' : 'Ex. : poulet, riz, brocolis'}
          placeholderTextColor={t.ink2}
          style={[styles.inputText, { color: t.ink }]}
        />
        {unit ? <Txt size={13} color={t.ink2}>{unit}</Txt> : null}
      </View>
    </View>
  );
}

/** Saisie manuelle d'un repas (nom, calories, macros → score) ou correction d'un repas déjà au journal. */
export function ManualMealSheet({ visible, onClose, edit }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const setCustomMeal = useGame((s) => s.setCustomMeal);
  const updateMeal = useGame((s) => s.updateMeal);
  const say = useGame((s) => s.say);
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [g, setG] = useState('');
  const [l, setL] = useState('');
  // à chaque ouverture : champs vides pour un nouveau repas, valeurs actuelles pour une correction
  useEffect(() => {
    if (!visible) return;
    setName(edit?.name ?? '');
    setKcal(edit ? String(edit.kcal) : '');
    setP(edit ? String(edit.p) : '');
    setG(edit ? String(edit.g) : '');
    setL(edit ? String(edit.l) : '');
  }, [visible, edit]);

  const n = (v: string) => Math.max(0, Math.round(Number(v.replace(',', '.')) || 0));
  const K = n(kcal), P = n(p), G = n(g), L = n(l);
  const valid = name.trim().length > 0 && K > 0;
  const score = useMemo(() => (K > 0 ? mealScore(K, P, G, L) : 0), [K, P, G, L]);
  const scoreColor = score >= 70 ? LIME : score >= 50 ? AMBER : RED;

  const submit = () => {
    if (!valid) return;
    if (edit) {
      updateMeal(edit.id, { name: name.trim(), kcal: K, p: P, g: G, l: L, score });
      say(name.trim() + ' corrigé', 'ok');
      onClose();
      return;
    }
    setCustomMeal({
      name: name.trim(),
      kcal: K,
      p: P,
      g: G,
      l: L,
      score,
      items: [name.trim(), K + ' kcal', P + ' g de protéines'],
      origin: 'manual',
    });
    setName(''); setKcal(''); setP(''); setG(''); setL('');
    onClose();
  };

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(260)} style={styles.veil}>
        <Pressable accessibilityLabel="Fermer" onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        <Animated.View entering={SlideInDown.duration(motion.sheet).easing(ease)} style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: Math.max(24, insets.bottom + 12) }, shadow.xl]}>
          <View style={styles.grabWrap}><View style={[styles.grab, { backgroundColor: t.track }]} /></View>
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 1 }}>
              <Display size={20}>{edit ? 'Corriger le repas' : 'Écrire mon repas'}</Display>
              <Txt size={12} color={t.ink2}>Les valeurs sont sur l’emballage ou l’appli du restaurant</Txt>
            </View>
            <Press accessibilityLabel="Fermer" onPress={onClose} style={[styles.close, { backgroundColor: t.surf }, shadow.sm]}>
              <CloseIcon color={t.ink} />
            </Press>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
            <Field label="Nom du repas" value={name} onChange={setName} keyboard="default" autoFocus />
            <Field label="Calories" value={kcal} onChange={setKcal} unit="kcal" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Field label="Protéines" value={p} onChange={setP} unit="g" />
              <Field label="Glucides" value={g} onChange={setG} unit="g" />
              <Field label="Lipides" value={l} onChange={setL} unit="g" />
            </View>
            <View style={[styles.scoreRow, { backgroundColor: t.surf }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt size={13} weight="bold">Score estimé</Txt>
                <Txt size={12} color={t.ink2}>Plus de protéines et moins de calories vides = meilleur score</Txt>
              </View>
              <View style={[styles.score, { borderColor: K > 0 ? scoreColor : t.track }]}>
                <Txt size={18} weight="bold" num lineHeight={18}>{K > 0 ? score : '–'}</Txt>
              </View>
            </View>
            <Press haptic="medium" disabled={!valid} onPress={submit} style={[styles.primary, { backgroundColor: valid ? LIME : '#5A5D63' }, shadow.btn]}>
              <Txt size={16} weight="bold" color={OBSIDIAN}>{edit ? 'Enregistrer' : 'Analyser ce repas'}</Txt>
            </Press>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,11,12,0.52)' },
  kav: { flex: 1, justifyContent: 'flex-end', pointerEvents: 'box-none' },
  sheet: { borderTopLeftRadius: 34, borderTopRightRadius: 34, overflow: 'hidden', maxHeight: '92%' },
  grabWrap: { alignItems: 'center', paddingTop: 8 },
  grab: { width: 38, height: 5, borderRadius: 9, opacity: 0.6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  close: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  input: { height: 50, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  inputText: { flex: 1, minWidth: 0, fontSize: 15, fontFamily: 'DMSans_400Regular' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 14 },
  score: { width: 52, height: 52, borderRadius: 999, borderWidth: 5, alignItems: 'center', justifyContent: 'center' },
  primary: { height: 54, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
