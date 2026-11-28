/**
 * Forums : groupes OUVERTS (tout le monde entre, lit et écrit) + running club de ta ville.
 * Mode actuel « local + démonstration » : rien ne part sur un serveur ; l'écran le dit en clair.
 * La ville est choisie à la main dans une liste (jamais de GPS, jamais de quartier).
 */
import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow } from '@/theme/tokens';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { useCommunity, useSocial, COMMUNITY_MODE } from '@/community/store';
import { RUN_CITIES, THEME_FORUMS, repliesOf, runDateLabel, runningForum, upcomingRuns, visiblePosts } from '@/community/models/forums';
import { HeadStack, SectionHead, Sheet, Tag, TopBar } from '@/community/components/kit';
import { Icon } from '@/community/components/icons';
import { since, useNow } from '@/community/components/ui';
import { CR } from '@/community/routes';

export default function ForumsScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { engine, myId } = useSocial();
  const forums = useCommunity((s) => s.forums);
  const setRunCity = useCommunity((s) => s.setRunCity);
  const refreshDemo = useCommunity((s) => s.refreshDemo);
  const now = useNow(60000);
  const [cityOpen, setCityOpen] = useState(false);

  useEffect(() => {
    refreshDemo();
  }, [refreshDemo]);

  const blocked = new Set(engine.s.blocks.flatMap((b) => (b.blockerId === myId ? [b.blockedId] : b.blockedId === myId ? [b.blockerId] : [])));
  const club = forums.city ? runningForum(forums.city) : null;
  const next = club ? upcomingRuns(forums, club.id, now, blocked)[0] : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TopBar title="Forums" />
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 24 }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(260)} style={{ gap: 8, paddingHorizontal: 4 }}>
          <Display size={30} lineHeight={33}>Forums</Display>
          <Txt size={14.5} color={t.ink2} lineHeight={20}>Des groupes ouverts : tu entres, tu lis, tu partages tes progrès et tes photos.</Txt>
        </Animated.View>

        {COMMUNITY_MODE === 'local-demo' ? (
          <View style={[styles.notice, { backgroundColor: t.surf }, shadow.card]}>
            <Icon name="info" size={17} color={t.ink2} />
            <Txt size={12.5} color={t.ink2} lineHeight={18} style={{ flex: 1 }}>
              Aperçu : les forums ne sont pas encore en ligne. Les messages marqués « Démo » sont fictifs, et les tiens restent sur ton téléphone tant que le serveur n’est pas ouvert.
            </Txt>
          </View>
        ) : null}

        {/* Running club */}
        <Animated.View entering={FadeInDown.delay(60).duration(280)} style={{ gap: 12 }}>
          <SectionHead title="Running club" sub="Courir ensemble toutes les deux semaines, dans ta ville" />
          {club ? (
            <Press onPress={() => router.push(CR.forum(club.id))} pressScale={0.98} accessibilityLabel={club.title} style={[styles.club, { backgroundColor: t.strong }, shadow.md]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.clubIcon, { backgroundColor: LIME }]}>
                  <Icon name="shoe" size={22} color={OBSIDIAN} strokeWidth={2.1} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Display size={19} color={t.strongInk}>{club.title}</Display>
                  <Txt size={13} color={t.strongInk2}>
                    {next ? 'Prochaine sortie : ' + runDateLabel(next.at) : 'Aucune sortie prévue. Propose la première.'}
                  </Txt>
                </View>
                <Icon name="chevron" size={18} color={t.strongInk2} />
              </View>
              {next ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="pin" size={14} color={t.strongInk2} />
                  <Txt size={12.5} color={t.strongInk} numberOfLines={1} style={{ flex: 1 }}>{next.m.place} · {next.m.distanceKm} km</Txt>
                </View>
              ) : null}
            </Press>
          ) : (
            <Press onPress={() => setCityOpen(true)} pressScale={0.98} accessibilityLabel="Choisir ta ville" style={[styles.pick, { backgroundColor: t.surf }, shadow.card]}>
              <View style={[styles.clubIcon, { backgroundColor: t.track }]}>
                <Icon name="pin" size={20} color={t.ink} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt size={15} weight="bold">Choisis ta ville</Txt>
                <Txt size={12.5} color={t.ink2}>On ne lit pas ta position : tu choisis toi-même.</Txt>
              </View>
              <Icon name="chevron" size={18} color={t.ink2} />
            </Press>
          )}
          {club ? (
            <Press onPress={() => setCityOpen(true)} style={{ alignSelf: 'flex-start', paddingHorizontal: 4 }} accessibilityLabel="Changer de ville">
              <Txt size={13} weight="bold">Changer de ville</Txt>
            </Press>
          ) : null}
        </Animated.View>

        {/* Forums thématiques */}
        <Animated.View entering={FadeInDown.delay(110).duration(280)} style={{ gap: 12 }}>
          <SectionHead title="Forums ouverts" />
          <View style={[styles.group, { backgroundColor: t.surf }, shadow.card]}>
            {THEME_FORUMS.map((f, i) => {
              const posts = visiblePosts(forums, f.id, blocked);
              const last = posts[0];
              const authors = [...new Set(posts.map((p) => p.authorId))].slice(0, 3);
              const joined = forums.joined.includes(f.id);
              const open = posts.filter((p) => p.tag === 'question' && p.authorId !== myId && !repliesOf(forums, p.id, blocked).length).length;
              return (
                <Press key={f.id} onPress={() => router.push(CR.forum(f.id))} pressScale={0.99} accessibilityLabel={f.title} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Txt size={15} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{f.title}</Txt>
                      {joined ? <Tag kind="new" label="Rejoint" /> : null}
                    </View>
                    <Txt size={13} color={t.ink2} numberOfLines={1}>
                      {last ? (last.authorId === myId ? 'Toi' : engine.s.profiles[last.authorId]?.displayName ?? 'Membre') + ' : ' + (last.text || 'Photo') : f.description}
                    </Txt>
                    {last ? (
                      <Txt size={11.5} color={t.ink2}>
                        {since(last.createdAt, now)}
                        {open ? <Txt size={11.5} weight="bold" color={t.ink}>{' · ' + open + (open > 1 ? ' questions attendent' : ' question attend') + ' une réponse'}</Txt> : null}
                      </Txt>
                    ) : null}
                  </View>
                  {authors.length ? (
                    <HeadStack ids={authors.map((id) => ({ avatarId: id === myId ? 'moi' : engine.s.profiles[id]?.avatarId ?? '' }))} size={28} ring={t.surf} />
                  ) : null}
                  <Icon name="chevron" size={17} color={t.ink2} />
                </Press>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>

      <Sheet visible={cityOpen} onClose={() => setCityOpen(false)} label="Ta ville">
        <View style={{ gap: 4 }}>
          <Display size={22}>Ta ville</Display>
          <Txt size={13.5} color={t.ink2} lineHeight={19}>Tu rejoins le running club de cette ville. Ta position n’est jamais lue ni partagée.</Txt>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {RUN_CITIES.map((c) => {
            const on = forums.city === c;
            return (
              <Press key={c} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { setRunCity(c); setCityOpen(false); }} pressScale={0.95} style={[styles.city, { backgroundColor: on ? LIME : t.bg, borderColor: on ? LIME : t.line }]}>
                <Txt size={13.5} weight="semibold" color={on ? OBSIDIAN : t.ink}>{c}</Txt>
              </Press>
            );
          })}
        </View>
        {forums.city ? (
          <Press onPress={() => { setRunCity(null); setCityOpen(false); }} style={{ alignSelf: 'flex-start' }}>
            <Txt size={13} weight="bold" color={t.ink2}>Ne plus afficher de running club</Txt>
          </Press>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: 20, padding: 14 },
  club: { borderRadius: 26, padding: 16, gap: 12 },
  clubIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, padding: 14 },
  group: { borderRadius: 26, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  city: { height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
