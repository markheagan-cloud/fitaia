import React, { useState } from 'react';
import { View, StyleSheet, TextInput, ScrollView, KeyboardAvoidingView, Platform, Image, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow } from '@/theme/tokens';
import { useGame } from '@/store/useGame';
import { ACTIVITY, Activity, DEFAULT_PROFILE, PACE, Pace, Profile, Sex, dailyGoal } from '@/store/profile';
import { DEFAULT_SHEET, previewImage } from '@/data/character';
import { fmt, fmtKg } from '@/data/content';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { Bar } from '@/fx/Bar';

const parse = (v: string) => Number(v.replace(',', '.')) || 0;

function Num({ label, value, onChange, unit, autoFocus }: { label: string; value: string; onChange: (v: string) => void; unit: string; autoFocus?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Txt size={12} color={t.ink2}>{label}</Txt>
      <View style={[styles.input, { borderColor: t.line, backgroundColor: t.surf }]}>
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
          <Press key={o.id} accessibilityState={{ selected: on }} onPress={() => onChange(o.id)} style={[styles.chip, { backgroundColor: on ? t.ink : t.surf, borderColor: on ? t.ink : t.line }]}>
            <Txt size={13} weight="semibold" color={on ? t.bg : t.ink}>{o.label}</Txt>
            {o.hint ? <Txt size={11} color={on ? t.track : t.ink2}>{o.hint}</Txt> : null}
          </Press>
        );
      })}
    </View>
  );
}

/** Premier lancement : 3 étapes, 60 secondes, puis le perso. Valeur avant toute demande. */
export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const finish = useGame((s) => s.finishOnboarding);
  const [step, setStep] = useState(0);
  const [sex, setSex] = useState<Sex>('m');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [kg, setKg] = useState('');
  const [target, setTarget] = useState('');
  const [activity, setActivity] = useState<Activity>('modere');
  const [pace, setPace] = useState<Pace>('normal');

  const A = Math.round(parse(age)), H = Math.round(parse(height)), K = parse(kg), T = parse(target);
  const ok1 = A >= 14 && A <= 100 && H >= 120 && H <= 230;
  const ok2 = K >= 30 && K <= 300 && T >= 30 && T <= 300;
  const profile: Profile = { ...DEFAULT_PROFILE, sex, age: A || 30, heightCm: H || 170, startKg: K || 80, targetKg: T || 75, activity, pace, autoGoal: true };
  const goal = ok1 && ok2 ? dailyGoal(profile, K) : 0;
  const delta = T - K;

  const next = () => {
    if (step < 2) setStep(step + 1);
    else {
      finish(profile, K);
      router.replace('/creator');
    }
  };
  const canNext = step === 0 ? ok1 : step === 1 ? ok2 : true;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 16 }}>
        <View style={{ gap: 10 }}>
          <Bar pct={(step + 1) / 3} color={t.ink} track={t.track} height={4} />
          <Txt size={12} color={t.ink2}>Étape {step + 1} sur 3 · une minute</Txt>
        </View>

        {step === 0 ? (
          <View style={{ gap: 16 }}>
            <Display size={28}>Ton budget, calculé pour toi</Display>
            <Txt size={14} lineHeight={20} color={t.ink2}>Trois réponses et FITAIA calcule ton budget calorique à partir de ton métabolisme (formule Mifflin-St Jeor). Tout reste sur ton téléphone.</Txt>
            <Chips options={[{ id: 'f', label: 'Femme' }, { id: 'm', label: 'Homme' }, { id: 'x', label: 'Autre' }]} value={sex} onChange={setSex} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Num label="Âge" value={age} onChange={setAge} unit="ans" autoFocus />
              <Num label="Taille" value={height} onChange={setHeight} unit="cm" />
            </View>
          </View>
        ) : step === 1 ? (
          <View style={{ gap: 16 }}>
            <Display size={28}>Où tu pars, où tu vas</Display>
            <Txt size={14} lineHeight={20} color={t.ink2}>Le chemin est découpé en 5 paliers. Ton perso change à chaque palier franchi.</Txt>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Num label="Poids aujourd’hui" value={kg} onChange={setKg} unit="kg" autoFocus />
              <Num label="Objectif" value={target} onChange={setTarget} unit="kg" />
            </View>
            {ok2 ? (
              <Txt size={13} color={t.ink2}>
                {Math.abs(delta) < 0.5 ? 'Maintien : ton budget suivra ton métabolisme.' : delta < 0 ? fmtKg(-delta) + ' kg à perdre, soit ' + fmtKg(-delta / 5) + ' kg par palier.' : fmtKg(delta) + ' kg à prendre, soit ' + fmtKg(delta / 5) + ' kg par palier.'}
              </Txt>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            <Display size={28}>Ton rythme</Display>
            <View style={{ gap: 6 }}>
              <Txt size={12} color={t.ink2}>Activité</Txt>
              <Chips options={(Object.keys(ACTIVITY) as Activity[]).map((k) => ({ id: k, label: ACTIVITY[k].label, hint: ACTIVITY[k].hint }))} value={activity} onChange={setActivity} />
            </View>
            {Math.abs(delta) >= 0.5 ? (
              <View style={{ gap: 6 }}>
                <Txt size={12} color={t.ink2}>Vitesse</Txt>
                <Chips options={(Object.keys(PACE) as Pace[]).map((k) => ({ id: k, label: PACE[k].label, hint: PACE[k].hint }))} value={pace} onChange={setPace} />
              </View>
            ) : null}
            <View style={[styles.goalBox, { backgroundColor: t.surf }, shadow.card]}>
              <Txt size={12} color={t.ink2}>Ton budget calorique</Txt>
              <Display size={34} num>{fmt(goal)} <Display size={15} color={t.ink2}>kcal / jour</Display></Display>
              <Txt size={12} lineHeight={17} color={t.ink2}>Chaque défi réussi en ajoute. Jamais sous 1 200 (femme) / 1 500 (homme). Repère indicatif, pas un avis médical : en cas de doute, parle-en à un médecin.</Txt>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Image source={previewImage({ ...DEFAULT_SHEET, appearance: sex === 'f' ? 'fem' : sex === 'x' ? 'neutre' : 'masc' })} accessibilityLabel="Ton perso" style={{ width: Math.min(width - 32, 180), height: 225, borderRadius: 20 }} resizeMode="cover" />
              <Txt size={12} color={t.ink2}>Prochaine étape : ton perso, à ton image.</Txt>
            </View>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {step > 0 ? (
            <Press onPress={() => setStep(step - 1)} style={[styles.ghost, { borderColor: t.line }]}>
              <Txt size={14} weight="semibold">Retour</Txt>
            </Press>
          ) : null}
          <Press haptic="medium" disabled={!canNext} onPress={next} style={[styles.primary, { flex: 2 }, shadow.btn]}>
            <Txt size={16} weight="bold" color={OBSIDIAN}>{step < 2 ? 'Continuer' : 'Créer mon perso'}</Txt>
          </Press>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: { height: 52, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputText: { flex: 1, minWidth: 0, fontSize: 18, fontFamily: 'DMSans_600SemiBold', fontVariant: ['tabular-nums'] },
  chip: { minHeight: 44, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6, justifyContent: 'center' },
  goalBox: { borderRadius: 22, padding: 14, gap: 4 },
  ghost: { flex: 1, height: 54, borderWidth: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  primary: { height: 54, borderRadius: 22, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
});
