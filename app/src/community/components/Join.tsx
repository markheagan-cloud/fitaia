/**
 * Adhésion à la Communauté (opt-in). Un écran émotionnel (ton avatar, une promesse, trois visages, la confidentialité),
 * puis deux écrans courts de réglages. Rien n'est publié tant que la personne n'a pas touché « Rejoindre ».
 */
import React, { useState } from 'react';
import { View, ScrollView, TextInput, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, font } from '@/theme/tokens';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { useGame } from '@/store/useGame';
import { useCommunity } from '../store';
import type { Onboarding } from '../store';
import { useMyPoints } from '../hooks/usePoints';
import { AGE_RANGES, ACTIVITIES, GOALS, SLOTS, SUPPORT } from '../models/types';
import type { AgeRange, GoalCategory } from '../models/types';
import { Chip, MainButton } from './ui';
import { Figure, HeadStack, IconButton, Studio, studio, Tag } from './kit';
import { Icon } from './icons';
import { AvatarPortrait } from './AvatarPortrait';
import { hasPortraits } from '../avatars/portraits';
import { HeroAvatar } from '@/avatar/HeroAvatar';

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** Tranche d'âge et objectif pré-remplis depuis le profil de l'app (jamais publiés tels quels : seulement la tranche et la catégorie). */
function rangeOf(age: number): AgeRange {
  if (age <= 24) return '18-24';
  if (age <= 30) return '25-30';
  if (age <= 35) return '31-35';
  if (age <= 45) return '36-45';
  return '46+';
}

const FACES = ['demo:demo_sarah', 'demo:demo_nassim', 'demo:demo_ines'];

export function Join() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: H, width: W } = useWindowDimensions();
  const activate = useCommunity((s) => s.activate);
  const decline = useCommunity((s) => s.decline);
  const status = useCommunity((s) => s.status);
  const points = useMyPoints();
  const profile = useGame((s) => s.profile);
  const goal: GoalCategory = profile.targetKg < profile.startKg - 0.5 ? 'perdre' : profile.targetKg > profile.startKg + 0.5 ? 'muscler' : 'garder';
  const [step, setStep] = useState(0);
  const [o, setO] = useState<Onboarding>({
    displayName: '', ageRange: rangeOf(profile.age), goalCategory: goal, language: 'fr', slots: ['soir'], activities: ['marche'], support: ['encouragement'],
  });
  const nameOk = o.displayName.trim().length >= 2;
  const c = studio(t);

  if (step === 0) {
    const stageH = Math.round(Math.min(430, H * 0.47));
    const fig = Math.round((stageH - 70) / 1.6);
    // rendu de l'usine (fond transparent) : posé dans le studio ; sinon l'illustration du perso, en pleine largeur comme sur l'Accueil
    const rendered = hasPortraits('moi');
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 140 }} showsVerticalScrollIndicator={false} bounces={false}>
          <Studio height={stageH + insets.top} style={{ borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }} glowY={0.55} floorY={stageH + insets.top - 26}>
            {rendered ? (
              <View style={{ position: 'absolute', bottom: 18, left: 0, right: 0, alignItems: 'center' }}>
                <Figure avatarId="moi" size={fig} mode="corps" breathe={false} />
              </View>
            ) : (
              <Animated.View entering={FadeIn.duration(320)} style={StyleSheet.absoluteFill}>
                <HeroAvatar width={W} height={Math.round(W * 1.25)} />
              </Animated.View>
            )}
            <Animated.View entering={FadeIn.delay(260).duration(300)} style={[styles.you, { bottom: 18, backgroundColor: c.glass }]}>
              <Txt size={12.5} weight="semibold">Ton avatar, celui que les autres verront</Txt>
            </Animated.View>
          </Studio>
          <View style={{ paddingHorizontal: 22, paddingTop: 20, gap: 13 }}>
            <Animated.View entering={FadeInDown.delay(80).duration(300)}>
              <Display size={30} lineHeight={33}>Tu n’as plus besoin d’avancer seul.</Display>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(140).duration(300)}>
              <Txt size={15.5} lineHeight={22} color={t.ink2}>
                Rencontre des personnes qui vivent un parcours proche du tien. Discute, échange et progresse ensemble.
              </Txt>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(200).duration(300)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <HeadStack ids={FACES.map((a) => ({ avatarId: a }))} size={46} ring={t.bg} />
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={14} weight="semibold">Des gens au même point que toi</Txt>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Tag kind="demo" label="Exemples de démonstration" />
                </View>
              </View>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(260).duration(300)} style={[styles.lock, { backgroundColor: t.surf }]}>
              <View style={[styles.lockIcon, { backgroundColor: t.strong }]}>
                <Icon name="lock" size={18} color={LIME} strokeWidth={2.1} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt size={14.5} weight="bold">Tes données santé restent privées</Txt>
                <Txt size={13} lineHeight={18} color={t.ink2}>Poids, calories, mensurations et photos ne sont jamais partagés automatiquement.</Txt>
              </View>
            </Animated.View>
          </View>
        </ScrollView>
        <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
          <IconButton icon="back" label="Retour" onPress={() => router.back()} variant="glass" size={40} />
        </View>
        <View style={[styles.footer, { paddingBottom: insets.bottom + 10, backgroundColor: t.bg }]}>
          <MainButton label="Commencer" onPress={() => setStep(1)} />
          <Press accessibilityRole="button" onPress={() => { decline(); router.back(); }} style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Txt size={14} weight="semibold" color={t.ink2}>{status === 'refuse' ? 'Toujours pas, merci' : 'Pas maintenant'}</Txt>
          </Press>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
        <IconButton icon="back" label="Étape précédente" onPress={() => setStep(step - 1)} size={40} />
        <View style={{ flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
          {[1, 2].map((i) => (
            <View key={i} style={{ width: i === step ? 26 : 8, height: 8, borderRadius: 4, backgroundColor: i <= step ? t.ink : t.track }} />
          ))}
        </View>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 130, gap: 22 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {step === 1 ? (
          <Animated.View key="s1" entering={FadeInDown.duration(260)} style={{ gap: 22 }}>
            <View style={{ gap: 6 }}>
              <Display size={27}>Comment veux-tu apparaître ?</Display>
              <Txt size={14.5} color={t.ink2}>Les autres voient ton avatar et ton prénom. Jamais ta photo.</Txt>
            </View>
            <View style={[styles.nameRow, { backgroundColor: t.surf }]}>
              <AvatarPortrait avatarId="moi" size={58} mode="tete" style={{ backgroundColor: c.head }} />
              <TextInput
                value={o.displayName}
                onChangeText={(v) => setO({ ...o, displayName: v })}
                placeholder="Ton prénom ou pseudo"
                placeholderTextColor={t.ink2}
                maxLength={24}
                autoFocus={false}
                style={[styles.input, { color: t.ink }]}
              />
            </View>
            <Group title="Ton âge" hint="Seule ta tranche d’âge peut être montrée, si tu le veux.">
              {AGE_RANGES.map((a) => <Chip key={a.id} label={a.label} on={o.ageRange === a.id} onPress={() => setO({ ...o, ageRange: a.id })} />)}
            </Group>
            <Group title="Ton objectif">
              {GOALS.map((g) => <Chip key={g.id} label={g.label} on={o.goalCategory === g.id} onPress={() => setO({ ...o, goalCategory: g.id })} />)}
            </Group>
          </Animated.View>
        ) : (
          <Animated.View key="s2" entering={FadeInDown.duration(260)} style={{ gap: 22 }}>
            <View style={{ gap: 6 }}>
              <Display size={27}>Quand es-tu dispo ?</Display>
              <Txt size={14.5} color={t.ink2}>On te présente des personnes qui bougent aux mêmes moments que toi.</Txt>
            </View>
            <Group title="Tes moments">
              {SLOTS.map((g) => <Chip key={g.id} label={g.label} on={o.slots.includes(g.id)} onPress={() => setO({ ...o, slots: toggle(o.slots, g.id) })} />)}
            </Group>
            <Group title="Ce que tu aimes faire">
              {ACTIVITIES.map((g) => <Chip key={g.id} label={g.label} on={o.activities.includes(g.id)} onPress={() => setO({ ...o, activities: toggle(o.activities, g.id) })} />)}
            </Group>
            <Group title="Ce qui t’aide">
              {SUPPORT.map((g) => <Chip key={g.id} label={g.label} on={o.support.includes(g.id)} onPress={() => setO({ ...o, support: toggle(o.support, g.id) })} />)}
            </Group>
          </Animated.View>
        )}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: t.bg }]}>
        {step === 1 ? (
          <MainButton label="Continuer" disabled={!nameOk} onPress={() => setStep(2)} />
        ) : (
          <MainButton label="Rejoindre la Communauté" disabled={!nameOk || !o.slots.length} onPress={() => activate(o, points)} />
        )}
        <Txt size={12} color={t.ink2} style={{ textAlign: 'center', marginTop: 8 }}>Tu pourras tout changer dans Confidentialité.</Txt>
      </View>
    </View>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Txt size={15} weight="bold">{title}</Txt>
        {hint ? <Txt size={12.5} color={t.ink2}>{hint}</Txt> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 14, top: 0 },
  you: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 12, height: 30, borderRadius: 15, justifyContent: 'center' },
  lock: { flexDirection: 'row', gap: 12, alignItems: 'center', borderRadius: 22, padding: 14, marginTop: 4 },
  lockIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 10 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, padding: 10, paddingRight: 16 },
  input: { flex: 1, height: 52, fontSize: 18, fontFamily: font.semibold },
});

