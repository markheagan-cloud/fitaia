/**
 * FitMatch : une personne à la fois, son avatar au centre (≈ 45 % de l'écran), le pourcentage expliqué,
 * trois ou quatre raisons humaines, UNE action principale : « Dire bonjour ». « Passer » enchaîne en douceur.
 * La liste est finie (10 personnes au plus) : une fois vue, c'est terminé pour aujourd'hui.
 * Ni poids, ni calories, ni photo : seulement l'avatar, l'étape et les raisons du rapprochement.
 */
import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, alert, shadow } from '@/theme/tokens';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { useCommunity, useSocial } from '@/community/store';
import { compatibilityBreakdown, humanReasons, humanSentence } from '@/social/fitmatch/matching';
import { NEEDS, needAffinity, needLabel, rankByNeed } from '@/community/models/intentions';
import type { NeedId } from '@/community/models/intentions';
import { MainButton } from '@/community/components/ui';
import { Figure, HeadStack, StatusPill, Studio, Tag, TopBar, ease, studio } from '@/community/components/kit';
import { Icon, NEED_ICON } from '@/community/components/icons';
import { CompatSheet } from '@/community/components/CompatSheet';
import { CR } from '@/community/routes';

export default function FitMatchScreen() {
  const t = useTheme();
  const c = studio(t);
  const a = alert(t);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const reduced = useReducedMotion();
  const params = useLocalSearchParams<{ besoin?: string }>();
  const need = NEEDS.some((n) => n.id === params.besoin) ? (params.besoin as NeedId) : null;
  const { engine, myId, me } = useSocial();
  const pass = useCommunity((s) => s.pass);
  const updatePrivacy = useCommunity((s) => s.updatePrivacy);
  const refreshDemo = useCommunity((s) => s.refreshDemo);
  const [shownAt] = useState(() => Date.now());
  const [why, setWhy] = useState(false);
  const leave = useSharedValue(0);

  useEffect(() => {
    refreshDemo();
  }, [refreshDemo]);

  let list = engine.candidates(myId, shownAt, 10);
  if (need) {
    list = rankByNeed(list, (x) => {
      const cd = engine.card(myId, x.userId);
      return cd ? needAffinity(need, { displayName: cd.displayName, need: cd.need, status: cd.status }).rank : 0;
    });
  }
  const [total] = useState(() => list.length);
  const cand = list[0];
  const card = cand ? engine.card(myId, cand.userId) : null;
  const other = cand ? engine.s.profiles[cand.userId] : undefined;

  // nouvelle personne affichée : l'animation de sortie de la précédente est remise à zéro APRÈS le rendu (pas de flash)
  useEffect(() => {
    leave.set(0);
  }, [cand?.userId, leave]);

  const leaveFig = useAnimatedStyle(() => ({
    opacity: 1 - leave.get(),
    transform: [{ translateX: -leave.get() * 70 }, { rotate: `${-leave.get() * 4}deg` }],
  }));
  const leaveText = useAnimatedStyle(() => ({ opacity: 1 - leave.get(), transform: [{ translateX: -leave.get() * 28 }] }));

  if (!me) return null;

  if (!me.privacy.allowFitMatch) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <TopBar title="FitMatch" />
        <View style={{ padding: 20, gap: 12 }}>
          <Display size={24}>FitMatch est désactivé</Display>
          <Txt size={14.5} color={t.ink2}>Tu l’as désactivé dans ta confidentialité : personne ne te propose et on ne te propose personne.</Txt>
          <MainButton label="Réactiver FitMatch" onPress={() => updatePrivacy({ allowFitMatch: true })} />
        </View>
      </View>
    );
  }

  const stageH = Math.round(Math.min(410, H * 0.45)) + insets.top;
  const fig = Math.round(Math.min(W * 0.9, (stageH - insets.top) * 0.9));
  const position = Math.max(1, total - list.length + 1);

  if (!cand || !card || !other) {
    const seen = Object.values(engine.s.profiles).filter((p) => p.userId !== myId && p.demo).slice(0, 3);
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Studio height={Math.round(H * 0.34) + insets.top} style={{ borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}>
          <View style={{ position: 'absolute', bottom: 34, left: 0, right: 0, alignItems: 'center' }}>
            <HeadStack ids={seen.map((p) => ({ avatarId: p.avatarId }))} size={64} ring={c.top} />
          </View>
        </Studio>
        <TopBar overlay title="FitMatch" />
        <View style={{ padding: 22, gap: 10 }}>
          <Display size={26}>Tu as vu tout le monde pour aujourd’hui</Display>
          <Txt size={15} lineHeight={21} color={t.ink2}>
            On te présente seulement des personnes proches de ton étape, de ton âge et de ton objectif. De nouvelles personnes arrivent chaque jour.
          </Txt>
        </View>
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: t.bg }]}>
          <MainButton label="Revenir à la Communauté" onPress={() => router.replace(CR.home)} />
        </View>
      </View>
    );
  }

  const reasons = humanReasons(me, other, shownAt, 4);
  const sentence = humanSentence(me, other);
  const breakdown = compatibilityBreakdown(me, other);
  const aff = need ? needAffinity(need, { displayName: card.displayName, need: card.need, status: card.status }) : null;
  const meta = [card.ageLabel, card.country].filter(Boolean).join(' · ') || 'Étape ' + card.stage;
  const id = cand.userId;

  const doPass = (who: string) => pass(who);
  const onPass = () => {
    if (reduced) return doPass(id);
    leave.set(
      withTiming(1, { duration: 210, easing: ease }, (fin) => {
        if (fin) runOnJS(doPass)(id);
      }),
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false} bounces={false}>
        <Studio height={stageH} style={{ borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }} glowY={0.58}>
          <Animated.View style={[styles.figure, leaveFig]}>
            <Press onPress={() => router.push(CR.profile(id))} pressScale={0.985} haptic="none" accessibilityLabel={'Voir le profil de ' + card.displayName}>
              <Figure key={id} avatarId={card.avatarId} size={fig} mode="buste" from={position > 1 ? 36 : 0} />
            </Press>
          </Animated.View>
          <Animated.View style={[styles.onStage, { top: insets.top + 60 }, leaveText]}>
            {card.status ? <StatusPill status={card.status} glass /> : null}
            {card.demo ? <Tag kind="demo" label="Profil de démonstration" style={{ alignSelf: 'flex-start' }} /> : null}
          </Animated.View>
        </Studio>

        <Animated.View style={leaveText}>
        <Animated.View key={id} entering={FadeInDown.delay(position > 1 ? 120 : 160).duration(280)} style={{ paddingHorizontal: 20, paddingTop: 16, gap: 13 }}>
          <View style={{ gap: 4 }}>
            <Display size={36} lineHeight={38}>{card.displayName}</Display>
            <Txt size={15} color={t.ink2}>{meta}</Txt>
          </View>

          <Press onPress={() => setWhy(true)} pressScale={0.97} accessibilityLabel={'Pourquoi ' + cand.compatibilityScore + ' % ? Voir l’explication'} style={[styles.score, { backgroundColor: t.strong }, shadow.md]}>
            <Display size={22} color={LIME} num>{breakdown.score} %</Display>
            <Txt size={14.5} weight="semibold" color="#F5F4F1" style={{ flex: 1 }} numberOfLines={1}>de parcours en commun</Txt>
            <View style={styles.why}>
              <Icon name="info" size={18} color="#F5F4F1" strokeWidth={2} />
            </View>
          </Press>

          {aff?.line ? (
            <View style={[styles.need, { backgroundColor: a.goodBg }]}>
              <Icon name={NEED_ICON[need!]} size={17} color={a.goodInk} strokeWidth={2.1} />
              <Txt size={14} weight="semibold" color={a.goodInk} style={{ flex: 1 }}>{aff.line}</Txt>
            </View>
          ) : null}

          <View style={styles.reasons}>
            {reasons.map((r) => (
              <View key={r} style={styles.reason}>
                <View style={[styles.check, { backgroundColor: t.strong }]}>
                  <Icon name="check" size={11} color={LIME} strokeWidth={3.2} />
                </View>
                <Txt size={15.5} weight="semibold" style={{ flexShrink: 1 }}>{r}</Txt>
              </View>
            ))}
          </View>

          <Txt size={15} lineHeight={22} color={t.ink2}>« {sentence} »</Txt>
        </Animated.View>
        </Animated.View>
      </ScrollView>

      <TopBar
        overlay
        title={need ? undefined : 'FitMatch'}
        right={
          need ? (
            <Press onPress={() => router.replace(CR.fitmatch)} accessibilityLabel={'Retirer le filtre ' + needLabel(need)} style={[styles.needChip, { backgroundColor: c.glass }, shadow.sm]}>
              <Icon name={NEED_ICON[need]} size={14} color={t.ink} strokeWidth={2.1} />
              <Txt size={12.5} weight="bold" numberOfLines={1}>{needLabel(need)}</Txt>
              <Icon name="close" size={13} color={t.ink2} strokeWidth={2.2} />
            </Press>
          ) : (
            <View style={[styles.pager, { backgroundColor: c.glass }]}>
              {list.length > 1 ? <HeadStack ids={list.slice(1, 3).map((x) => ({ avatarId: engine.s.profiles[x.userId]?.avatarId ?? '' }))} size={20} ring={c.glass} /> : null}
              <Txt size={12.5} weight="bold" num>{position}{'\u00a0'}/{'\u00a0'}{Math.max(total, position)}</Txt>
            </View>
          )
        }
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: t.bg }]}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Press onPress={onPass} accessibilityRole="button" accessibilityLabel="Passer" pressScale={0.95} style={[styles.pass, { backgroundColor: t.surf }, shadow.sm]}>
            <Txt size={15.5} weight="bold">Passer</Txt>
          </Press>
          <MainButton label="Dire bonjour" onPress={() => router.push(CR.chat(id))} style={{ flex: 1 }} />
        </View>
      </View>

      <CompatSheet visible={why} onClose={() => setWhy(false)} breakdown={breakdown} name={card.displayName} />
    </View>
  );
}

const styles = StyleSheet.create({
  figure: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  onStage: { position: 'absolute', left: 16, gap: 8 },
  score: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, paddingLeft: 16, paddingRight: 8, height: 54 },
  why: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  need: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 },
  reasons: { gap: 9 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10 },
  pass: { height: 56, paddingHorizontal: 24, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pager: { flexDirection: 'row', gap: 6, height: 32, paddingLeft: 5, paddingRight: 11, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  needChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 11, borderRadius: 17, maxWidth: 210 },
});
