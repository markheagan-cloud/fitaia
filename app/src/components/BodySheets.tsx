import React, { useState } from 'react';
import { View, StyleSheet, Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow } from '@/theme/tokens';
import { useGame } from '@/store/useGame';
import { ACTIVITY, Activity, PACE, Pace, Sex, currentWeight, dailyGoal } from '@/store/profile';
import { fmt, fmtKg } from '@/data/content';
import { Press } from './Press';
import { Txt, Display } from './Txt';
import { CloseIcon } from './Icons';

function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
        <Pressable accessibilityLabel="Fermer" onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <Animated.View entering={SlideInDown.duration(320)} style={[styles.sheet, { backgroundColor: t.surf, paddingBottom: insets.bottom + 16 }, shadow.xl]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Display size={20}>{title}</Display>
            <Press accessibilityLabel="Fermer" onPress={onClose} style={[styles.close, { backgroundColor: t.bg }]}>
              <CloseIcon color={t.ink} />
            </Press>
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Num({ label, value, onChange, unit, autoFocus }: { label: string; value: string; onChange: (v: string) => void; unit: string; autoFocus?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Txt size={12} color={t.ink2}>{label}</Txt>
      <View style={[styles.input, { borderColor: t.line, backgroundColor: t.bg }]}>
        <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType="decimal-pad" autoFocus={autoFocus} placeholder="0" placeholderTextColor={t.ink2} style={[styles.inputText, { color: t.ink }]} />
        <Txt size={13} color={t.ink2}>{unit}</Txt>
      </View>
    </View>
  );
}

function Chips<T extends string>({ options, value, onChange }: { options: { id: T; label: string; hint?: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Press key={o.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(o.id)} style={[styles.chip, { backgroundColor: on ? t.ink : t.bg, borderColor: on ? t.ink : t.line }]}>
            <Txt size={13} weight="semibold" color={on ? t.bg : t.ink}>{o.label}</Txt>
            {o.hint ? <Txt size={11} color={on ? t.track : t.ink2}>{o.hint}</Txt> : null}
          </Press>
        );
      })}
    </View>
  );
}

const parse = (v: string) => Number(v.replace(',', '.')) || 0;

/** Poids du jour. */
export function WeightSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const profile = useGame((s) => s.profile);
  const weights = useGame((s) => s.weights);
  const addWeight = useGame((s) => s.addWeight);
  const now = currentWeight(profile, weights);
  const [kg, setKg] = useState(fmtKg(now));
  const v = parse(kg);
  const valid = v >= 30 && v <= 300;
  return (
    <Sheet visible={visible} onClose={onClose} title="Mon poids aujourd’hui">
      <Num label="Poids" value={kg} onChange={setKg} unit="kg" autoFocus />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[-0.5, -0.2, 0.2, 0.5].map((d) => (
          <Press key={d} onPress={() => setKg(fmtKg(Math.max(30, v + d)))} style={[styles.chip, { backgroundColor: t.bg, borderColor: t.line, flex: 1, alignItems: 'center' }]}>
            <Txt size={13} weight="semibold" num>{d > 0 ? '+' : ''}{fmtKg(d)}</Txt>
          </Press>
        ))}
      </View>
      <Txt size={12} color={t.ink2}>Pèse-toi le matin, à jeun, pour une courbe fiable. {weights.length ? weights.length + ' pesée' + (weights.length > 1 ? 's' : '') + ' enregistrée' + (weights.length > 1 ? 's' : '') + '.' : 'Première pesée : elle devient ton point de départ.'}</Txt>
      <Press haptic="medium" disabled={!valid} onPress={() => { addWeight(v); onClose(); }} style={[styles.primary, { backgroundColor: valid ? LIME : t.track }, shadow.btn]}>
        <Txt size={16} weight="bold" color={OBSIDIAN}>Enregistrer</Txt>
      </Press>
    </Sheet>
  );
}

/** Profil : sexe, âge, taille, objectif, activité, rythme → objectif kcal calculé. */
export function ProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const profile = useGame((s) => s.profile);
  const weights = useGame((s) => s.weights);
  const setProfile = useGame((s) => s.setProfile);
  const goal = useGame((s) => s.goal);
  const [sex, setSex] = useState<Sex>(profile.sex);
  const [age, setAge] = useState(String(profile.age));
  const [height, setHeight] = useState(String(profile.heightCm));
  const [start, setStart] = useState(fmtKg(profile.startKg));
  const [target, setTarget] = useState(fmtKg(profile.targetKg));
  const [activity, setActivity] = useState<Activity>(profile.activity);
  const [pace, setPace] = useState<Pace>(profile.pace);
  const draft = { ...profile, sex, age: Math.round(parse(age)), heightCm: Math.round(parse(height)), startKg: parse(start), targetKg: parse(target), activity, pace, autoGoal: true };
  const valid = draft.age >= 14 && draft.age <= 100 && draft.heightCm >= 120 && draft.heightCm <= 230 && draft.startKg >= 30 && draft.targetKg >= 30;
  const preview = valid ? dailyGoal(draft, currentWeight(draft, weights)) : goal;
  return (
    <Sheet visible={visible} onClose={onClose} title="Mon profil">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }} style={{ maxHeight: 440 }}>
        <Chips options={[{ id: 'f', label: 'Femme' }, { id: 'm', label: 'Homme' }, { id: 'x', label: 'Autre' }]} value={sex} onChange={setSex} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Num label="Âge" value={age} onChange={setAge} unit="ans" />
          <Num label="Taille" value={height} onChange={setHeight} unit="cm" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Num label="Poids de départ" value={start} onChange={setStart} unit="kg" />
          <Num label="Objectif" value={target} onChange={setTarget} unit="kg" />
        </View>
        <View style={{ gap: 6 }}>
          <Txt size={12} color={t.ink2}>Activité</Txt>
          <Chips options={(Object.keys(ACTIVITY) as Activity[]).map((k) => ({ id: k, label: ACTIVITY[k].label, hint: ACTIVITY[k].hint }))} value={activity} onChange={setActivity} />
        </View>
        <View style={{ gap: 6 }}>
          <Txt size={12} color={t.ink2}>Rythme</Txt>
          <Chips options={(Object.keys(PACE) as Pace[]).map((k) => ({ id: k, label: PACE[k].label, hint: PACE[k].hint }))} value={pace} onChange={setPace} />
        </View>
        <View style={[styles.goalBox, { backgroundColor: t.bg }]}>
          <Txt size={12} color={t.ink2}>Budget calorique calculé (Mifflin-St Jeor)</Txt>
          <Display size={26} num>{fmt(preview)} <Display size={14} color={t.ink2}>kcal / jour</Display></Display>
          <Txt size={11} color={t.ink2}>Jamais sous 1 200 (femme) / 1 500 (homme). Repère indicatif, pas un avis médical.</Txt>
        </View>
      </ScrollView>
      <Press haptic="medium" disabled={!valid} onPress={() => { setProfile(draft); onClose(); }} style={[styles.primary, { backgroundColor: valid ? LIME : t.track }, shadow.btn]}>
        <Txt size={16} weight="bold" color={OBSIDIAN}>Enregistrer mon profil</Txt>
      </Press>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 16, paddingHorizontal: 16, gap: 14 },
  close: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  input: { height: 50, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputText: { flex: 1, minWidth: 0, fontSize: 17, fontFamily: 'DMSans_600SemiBold', fontVariant: ['tabular-nums'] },
  chip: { minHeight: 40, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, justifyContent: 'center' },
  goalBox: { borderRadius: 18, padding: 12, gap: 3 },
  primary: { height: 54, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
