/**
 * « Besoin d’un coup de pouce ? » : la personne dit ce dont elle a besoin aujourd’hui, FITAIA propose
 * de parler à un FitMate ou de trouver quelqu’un qui traverse la même chose (FitMatch adapté au besoin).
 * Le besoin reste privé par défaut : il sert à adapter les suggestions.
 */
import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, shadow } from '@/theme/tokens';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { useCommunity, useSocial } from '@/community/store';
import { NEEDS, activeNeed, needAffinity, needSuggestions } from '@/community/models/intentions';
import type { NeedId } from '@/community/models/intentions';
import { MainButton, useNow } from '@/community/components/ui';
import { HeadStack, Tag, Toggle, TopBar } from '@/community/components/kit';
import { Icon, NEED_ICON } from '@/community/components/icons';
import { CR } from '@/community/routes';

export default function BoostScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { engine, myId, me } = useSocial();
  const setNeed = useCommunity((s) => s.setNeed);
  const now = useNow(60000);
  const [picked, setPicked] = useState<NeedId | null>(() => (me ? activeNeed(me, Date.now()) : null));
  const shared = !!me?.needPublic;
  if (!me) return null;

  const choose = (n: NeedId) => {
    const next = picked === n ? null : n;
    setPicked(next);
    setNeed(next, shared);
  };

  const sugg = picked ? needSuggestions(picked) : null;
  const matches = picked
    ? engine
        .candidates(myId, now, 10)
        .map((cd) => {
          const card = engine.card(myId, cd.userId);
          return card ? { card, aff: needAffinity(picked, { displayName: card.displayName, need: card.need, status: card.status }) } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x && x.aff.rank > 0)
        .sort((a, b) => b.aff.rank - a.aff.rank)
    : [];
  const friends = engine.friends(myId);
  const mates = [...friends].sort((a, b) => (engine.friendship(myId, b)?.relationshipType === 'fitmate' ? 1 : 0) - (engine.friendship(myId, a)?.relationshipType === 'fitmate' ? 1 : 0));
  const firstMate = mates[0] ? engine.card(myId, mates[0]) : null;
  const anyDemo = matches.some((m) => m.card.demo);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TopBar title="Coup de pouce" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 130, gap: 22 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 6, paddingHorizontal: 4 }}>
          <Display size={29} lineHeight={32}>Aujourd’hui,{'\n'}de quoi as-tu besoin ?</Display>
          <Txt size={14.5} color={t.ink2}>Choisis une chose. On te présente la bonne personne.</Txt>
        </View>

        <View style={styles.grid}>
          {NEEDS.map((n, i) => {
            const on = picked === n.id;
            const wide = i === NEEDS.length - 1;
            return (
              <Press
                key={n.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={n.label}
                onPress={() => choose(n.id)}
                pressScale={0.96}
                style={[styles.tile, wide && styles.wide, { backgroundColor: on ? t.strong : t.surf }, on ? shadow.md : shadow.sm]}
              >
                <View style={[styles.tileIcon, { backgroundColor: on ? LIME : t.bg }]}>
                  <Icon name={NEED_ICON[n.id]} size={20} color={on ? '#1C1D1F' : t.ink} strokeWidth={2} />
                </View>
                <Txt size={14} weight="bold" color={on ? t.strongInk : t.ink} lineHeight={18} style={{ flexShrink: 1 }}>{n.label}</Txt>
              </Press>
            );
          })}
        </View>

        {picked && sugg ? (
          <Animated.View key={picked} entering={FadeInDown.duration(280)} style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, flexWrap: 'wrap' }}>
              <Display size={19}>FITAIA te propose</Display>
              <View style={[styles.needPill, { backgroundColor: t.strong }]}>
                <Icon name={NEED_ICON[picked]} size={13} color={LIME} strokeWidth={2.2} />
                <Txt size={12} weight="bold" color={t.strongInk}>{NEEDS.find((n) => n.id === picked)!.label}</Txt>
              </View>
              {anyDemo ? <Tag kind="demo" /> : null}
            </View>

            <Press onPress={() => router.push(CR.fitmatchFor(picked))} pressScale={0.98} style={[styles.card, { backgroundColor: t.surf }, shadow.md]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Txt size={16} weight="bold" lineHeight={21}>{sugg.same}</Txt>
                  <Txt size={13} color={t.ink2}>{sugg.sameSub}</Txt>
                </View>
                <Icon name="chevron" size={18} color={t.ink2} />
              </View>
              {matches.length ? (
                <View style={[styles.people, { backgroundColor: t.bg }]}>
                  <HeadStack ids={matches.map((m) => ({ avatarId: m.card.avatarId }))} size={40} ring={t.bg} />
                  <Txt size={13} weight="semibold" style={{ flex: 1 }} numberOfLines={2}>
                    {matches[0].aff.line}
                    {matches.length > 1 ? ' Et ' + (matches.length - 1) + ' autre' + (matches.length > 2 ? 's' : '') + '.' : ''}
                  </Txt>
                </View>
              ) : (
                <Txt size={13} color={t.ink2}>Personne avec ce besoin pour l’instant : FitMatch te montre les personnes les plus proches de ton parcours.</Txt>
              )}
            </Press>

            <Press
              onPress={() => (firstMate ? router.push(CR.chat(firstMate.userId)) : router.push(CR.fitmatch))}
              pressScale={0.98}
              style={[styles.card, { backgroundColor: t.surf }, shadow.card]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Txt size={16} weight="bold">{sugg.fitmate}</Txt>
                  <Txt size={13} color={t.ink2}>
                    {firstMate ? (mates.length > 1 ? firstMate.displayName + ' et ' + (mates.length - 1) + ' autre' + (mates.length > 2 ? 's' : '') : firstMate.displayName) + ' : quelqu’un qui te connaît déjà.' : 'Tu n’as pas encore de FitMate. FitMatch peut t’en présenter un.'}
                  </Txt>
                </View>
                {firstMate ? <HeadStack ids={mates.slice(0, 3).map((id) => ({ avatarId: engine.s.profiles[id]?.avatarId ?? '' }))} size={36} ring={t.surf} /> : <Icon name="chevron" size={18} color={t.ink2} />}
              </View>
            </Press>

            <View style={[styles.share, { backgroundColor: t.surf }]}>
              <Toggle
                on={shared}
                onPress={() => setNeed(picked, !shared)}
                label="Le montrer aux personnes proches de toi"
                hint="Désactivé par défaut. Visible 12 heures, puis effacé."
              />
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: t.bg }]}>
        <MainButton
          label={!picked ? 'Choisis ce dont tu as besoin' : picked === 'aider' ? 'Trouver quelqu’un à aider' : 'Trouver quelqu’un'}
          disabled={!picked}
          onPress={() => picked && router.push(CR.fitmatchFor(picked))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48.5%', minHeight: 60, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  wide: { width: '100%' },
  tileIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 24, padding: 16, gap: 12 },
  people: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, padding: 10 },
  share: { borderRadius: 22, overflow: 'hidden' },
  needPill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: 13 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10 },
});
