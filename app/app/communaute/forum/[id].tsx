/**
 * Un forum ouvert (ou le running club d'une ville).
 * - Règles acceptées avant la première publication ; filtre avant publication (models/forums.ts : checkPost).
 * - Chaque message : Signaler (disparaît tout de suite de l'écran), Masquer, Bloquer l'auteur.
 * - Running club : sorties proposées par les membres (toutes les deux semaines par défaut), lieu public, « Je viens ».
 * Mode local + démonstration : rien ne part sur un serveur, et l'écran le dit.
 */
import React, { useState } from 'react';
import { View, ScrollView, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, alert, shadow } from '@/theme/tokens';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { useGame } from '@/store/useGame';
import { useCommunity, useSocial } from '@/community/store';
import { REPORT_REASONS } from '@/community/models/types';
import {
  FORUM_RULES, PACES, POST_LIMITS, RUN_SAFETY, defaultRunStart, forumById, runDateLabel, shortDay, upcomingRuns, visiblePosts,
} from '@/community/models/forums';
import type { ForumPost, Pace } from '@/community/models/forums';
import { Head, Sheet, Tag, Toggle, TopBar } from '@/community/components/kit';
import { Icon } from '@/community/components/icons';
import { MainButton, since, useNow } from '@/community/components/ui';
import { CR } from '@/community/routes';

const HOURS = [7, 8, 9, 10, 12, 18, 19, 20];
const DISTANCES = [3, 5, 8, 10];

export default function ForumScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const forum = forumById(String(id ?? ''));
  const { engine, myId } = useSocial();
  const forums = useCommunity((s) => s.forums);
  const accept = useCommunity((s) => s.acceptForumRules);
  const join = useCommunity((s) => s.joinForum);
  const leave = useCommunity((s) => s.leaveForum);
  const post = useCommunity((s) => s.postInForum);
  const hide = useCommunity((s) => s.hideForumPost);
  const reportPost = useCommunity((s) => s.reportForumPost);
  const block = useCommunity((s) => s.block);
  const toggleGoing = useCommunity((s) => s.toggleGoing);
  const cancelRun = useCommunity((s) => s.cancelRun);
  const say = useGame.getState().say;
  const now = useNow(60000);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<ForumPost | null>(null);
  const [reporting, setReporting] = useState(false);
  const [runOpen, setRunOpen] = useState(false);

  if (!forum) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <TopBar title="Forum" />
        <View style={{ padding: 22 }}><Txt size={15}>Ce forum n’existe pas.</Txt></View>
      </View>
    );
  }

  const blocked = new Set(engine.s.blocks.flatMap((b) => (b.blockerId === myId ? [b.blockedId] : b.blockedId === myId ? [b.blockerId] : [])));
  const posts = visiblePosts(forums, forum.id, blocked);
  const runs = forum.kind === 'running' ? upcomingRuns(forums, forum.id, now, blocked) : [];
  const joined = forums.joined.includes(forum.id);
  const rulesOk = !!forums.rulesAcceptedAt;
  const anyDemo = posts.some((p) => engine.s.profiles[p.authorId]?.demo);

  const needRules = () => {
    if (rulesOk) return false;
    setRulesOpen(true);
    return true;
  };

  const pickPhoto = async () => {
    if (needRules()) return;
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.7 });
      if (!r.canceled && r.assets?.[0]?.uri) setPhoto(r.assets[0].uri);
    } catch {
      say('Impossible d’ouvrir tes photos', 'bad');
    }
  };

  const submit = () => {
    if (needRules()) return;
    const r = post(forum.id, text, photo);
    if (!r.ok) return say(r.reason ?? 'Publication impossible', 'bad');
    setText('');
    setPhoto(undefined);
    say('Publié', 'ok');
  };

  const nameOf = (uid: string) => (uid === myId ? 'Toi' : engine.s.profiles[uid]?.displayName ?? 'Membre');
  const avatarOf = (uid: string) => (uid === myId ? 'moi' : engine.s.profiles[uid]?.avatarId ?? '');

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TopBar title={forum.kind === 'running' ? 'Running club' : 'Forum'} onBack={() => (router.canGoBack() ? router.back() : router.replace(CR.forums))} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 24, gap: 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(260)} style={{ gap: 8, paddingHorizontal: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name={forum.kind === 'running' ? 'shoe' : 'users'} size={18} color={t.ink2} />
              <Txt size={12.5} weight="bold" color={t.ink2}>{forum.kind === 'running' ? 'Running club · groupe ouvert' : 'Forum ouvert'}</Txt>
              {anyDemo ? <Tag kind="demo" label="Démo" /> : null}
            </View>
            <Display size={28} lineHeight={31}>{forum.title}</Display>
            <Txt size={14.5} color={t.ink2} lineHeight={20}>{forum.description}</Txt>
            {!joined ? (
              <MainButton label={forum.kind === 'running' ? 'Rejoindre le club' : 'Rejoindre le forum'} onPress={() => { join(forum.id); say('Tu as rejoint ' + forum.title, 'ok'); }} style={{ marginTop: 6 }} />
            ) : null}
          </Animated.View>

          {forum.kind === 'running' ? (
            <View style={{ gap: 10 }}>
              <Txt size={17} weight="bold" style={{ paddingHorizontal: 4 }}>Prochaines sorties</Txt>
              {runs.length ? (
                runs.map(({ m, at }) => {
                  const mine = m.organizerId === myId;
                  const going = m.going.includes(myId);
                  return (
                    <View key={m.id} style={[styles.run, { backgroundColor: t.surf }, shadow.card]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Icon name="calendar" size={16} color={t.ink} />
                        <Txt size={15} weight="bold" style={{ flex: 1 }}>{runDateLabel(at)}</Txt>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Icon name="pin" size={16} color={t.ink2} />
                        <Txt size={14} style={{ flex: 1 }}>{m.place}</Txt>
                      </View>
                      <Txt size={13} color={t.ink2}>
                        {m.distanceKm} km · {PACES.find((p) => p.id === m.pace)!.label}{m.everyTwoWeeks ? ' · toutes les deux semaines' : ''} · proposée par {m.organizerId === myId ? 'toi' : nameOf(m.organizerId)}
                      </Txt>
                      <Txt size={13} color={t.ink2}>{m.going.length} {m.going.length > 1 ? 'personnes viennent' : 'personne vient'}</Txt>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Press onPress={() => toggleGoing(m.id)} pressScale={0.95} accessibilityLabel={going ? 'Je ne viens plus' : 'Je viens'} style={[styles.small, { backgroundColor: going ? t.track : LIME }]}>
                          <Txt size={13} weight="bold" color={going ? t.ink : OBSIDIAN}>{going ? 'Je ne viens plus' : 'Je viens'}</Txt>
                        </Press>
                        {mine ? (
                          <Press onPress={() => { cancelRun(m.id); say('Sortie annulée', 'ok'); }} pressScale={0.95} style={[styles.small, { backgroundColor: t.bg }]}>
                            <Txt size={13} weight="bold">Annuler la sortie</Txt>
                          </Press>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={[styles.run, { backgroundColor: t.surf }, shadow.card]}>
                  <Txt size={14.5} weight="semibold">Aucune sortie prévue pour l’instant.</Txt>
                  <Txt size={13} color={t.ink2} lineHeight={18}>Propose la première : un lieu public, une heure, une distance. Les membres du club pourront dire « Je viens ».</Txt>
                </View>
              )}
              <MainButton label="Proposer une sortie" ghost onPress={() => { if (!needRules()) setRunOpen(true); }} />
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            <Txt size={17} weight="bold" style={{ paddingHorizontal: 4 }}>Discussions</Txt>
            {posts.length ? (
              posts.map((p) => {
                const demo = engine.s.profiles[p.authorId]?.demo;
                return (
                  <View key={p.id} style={[styles.post, { backgroundColor: t.surf }, shadow.card]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Press onPress={() => p.authorId !== myId && router.push(CR.profile(p.authorId))} disabled={p.authorId === myId} accessibilityLabel={'Profil de ' + nameOf(p.authorId)}>
                        <Head avatarId={avatarOf(p.authorId)} size={38} />
                      </Press>
                      <View style={{ flex: 1, gap: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Txt size={14} weight="bold">{nameOf(p.authorId)}</Txt>
                          {demo ? <Tag kind="demo" /> : null}
                        </View>
                        <Txt size={11.5} color={t.ink2}>{since(p.createdAt, now)}</Txt>
                      </View>
                      <Press onPress={() => { setActionsFor(p); setReporting(false); }} accessibilityLabel="Options du message" pressScale={0.9} style={styles.more}>
                        <Icon name="more" size={18} color={t.ink2} />
                      </Press>
                    </View>
                    {p.text ? <Txt size={14.5} lineHeight={20}>{p.text}</Txt> : null}
                    {p.photoUri ? <Image source={{ uri: p.photoUri }} style={styles.photo} resizeMode="cover" accessibilityLabel="Photo partagée" /> : null}
                  </View>
                );
              })
            ) : (
              <Txt size={13.5} color={t.ink2} style={{ paddingHorizontal: 4 }}>Personne n’a encore écrit ici. Lance la discussion.</Txt>
            )}
          </View>

          {joined ? (
            <Press onPress={() => { leave(forum.id); say('Tu as quitté ' + forum.title, 'ok'); }} style={{ alignSelf: 'center', padding: 8 }}>
              <Txt size={13} weight="bold" color={t.ink2}>Quitter {forum.kind === 'running' ? 'le club' : 'le forum'}</Txt>
            </Press>
          ) : null}
        </ScrollView>

        {/* Zone d'écriture */}
        <View style={[styles.composer, { paddingBottom: insets.bottom + 10, backgroundColor: t.bg, borderTopColor: t.line }]}>
          {photo ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 }}>
              <Image source={{ uri: photo }} style={styles.thumb} />
              <Txt size={12.5} color={t.ink2} style={{ flex: 1 }}>Photo jointe. Seulement toi, habillé, personne d’autre sans accord.</Txt>
              <Press onPress={() => setPhoto(undefined)} accessibilityLabel="Retirer la photo"><Icon name="close" size={18} color={t.ink2} /></Press>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, alignItems: 'flex-end' }}>
            <Press onPress={pickPhoto} accessibilityLabel="Joindre une photo" pressScale={0.9} style={[styles.send, { backgroundColor: t.surf }, shadow.sm]}>
              <Icon name="image" size={20} color={t.ink} />
            </Press>
            <TextInput
              value={text}
              onChangeText={setText}
              onFocus={() => needRules()}
              placeholder="Écris dans le forum"
              placeholderTextColor={t.ink2}
              multiline
              maxLength={POST_LIMITS.maxLength}
              style={[styles.input, { backgroundColor: t.surf, color: t.ink }, shadow.sm]}
            />
            <Press accessibilityLabel="Publier" disabled={!text.trim() && !photo} onPress={submit} haptic="medium" pressScale={0.9} style={[styles.send, { backgroundColor: text.trim() || photo ? LIME : t.track }]}>
              <Icon name="arrowUp" size={21} color={OBSIDIAN} strokeWidth={2.5} />
            </Press>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Règles (obligatoires avant d'écrire) */}
      <Sheet visible={rulesOpen} onClose={() => setRulesOpen(false)} label="Règles des forums">
        <Display size={22}>Règles des forums</Display>
        <View style={{ gap: 10 }}>
          {FORUM_RULES.map((r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
              <Icon name="check" size={16} color={t.ink} strokeWidth={2.4} />
              <Txt size={14} lineHeight={19} style={{ flex: 1 }}>{r}</Txt>
            </View>
          ))}
        </View>
        <Txt size={12.5} color={t.ink2} lineHeight={18}>Aucune tolérance : un compte qui ne respecte pas ces règles est retiré des forums.</Txt>
        <MainButton label="J’accepte les règles" onPress={() => { accept(); setRulesOpen(false); }} />
      </Sheet>

      {/* Options d'un message */}
      <Sheet visible={!!actionsFor} onClose={() => setActionsFor(null)} label="Options du message">
        {actionsFor && !reporting ? (
          <View style={{ gap: 8 }}>
            {actionsFor.authorId !== myId ? (
              <>
                <Option icon="shield" label="Signaler ce message" onPress={() => setReporting(true)} />
                <Option icon="eye" label="Masquer ce message" onPress={() => { hide(actionsFor.id); setActionsFor(null); say('Message masqué', 'ok'); }} />
                <Option icon="ban" label={'Bloquer ' + nameOf(actionsFor.authorId)} danger onPress={() => { block(actionsFor.authorId); setActionsFor(null); say(nameOf(actionsFor.authorId) + ' est bloqué(e)', 'ok'); }} />
              </>
            ) : (
              <Option icon="close" label="Supprimer mon message" danger onPress={() => { hide(actionsFor.id); setActionsFor(null); say('Message supprimé', 'ok'); }} />
            )}
          </View>
        ) : actionsFor ? (
          <View style={{ gap: 8 }}>
            <Display size={20}>Pourquoi signaler ?</Display>
            <Txt size={13} color={t.ink2}>Le message disparaît tout de suite de ton écran.</Txt>
            {REPORT_REASONS.map((r) => (
              <Option key={r.id} icon="chevron" label={r.label} onPress={() => { reportPost(actionsFor.id, r.id); setActionsFor(null); setReporting(false); say('Merci, message signalé', 'ok'); }} />
            ))}
          </View>
        ) : null}
      </Sheet>

      {forum.kind === 'running' ? <RunSheet visible={runOpen} onClose={() => setRunOpen(false)} forumId={forum.id} /> : null}
    </View>
  );
}

function Option({ icon, label, onPress, danger }: { icon: 'shield' | 'eye' | 'ban' | 'close' | 'chevron'; label: string; onPress: () => void; danger?: boolean }) {
  const t = useTheme();
  const a = alert(t);
  return (
    <Press onPress={onPress} accessibilityLabel={label} pressScale={0.98} style={[styles.option, { borderColor: t.line }]}>
      <Icon name={icon} size={18} color={danger ? a.overInk : t.ink} />
      <Txt size={15} weight="semibold" color={danger ? a.overInk : t.ink} style={{ flex: 1 }}>{label}</Txt>
    </Press>
  );
}

/** Proposer une sortie : date dans les 14 prochains jours, heure, lieu public, distance, allure, répétition. */
function RunSheet({ visible, onClose, forumId }: { visible: boolean; onClose: () => void; forumId: string }) {
  const t = useTheme();
  const propose = useCommunity((s) => s.proposeRun);
  const say = useGame.getState().say;
  const [base] = useState(() => defaultRunStart(Date.now()));
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i + 1);
    return d.getTime();
  });
  const [day, setDay] = useState(() => days.find((d) => new Date(d).getDate() === new Date(base).getDate()) ?? days[0]);
  const [hour, setHour] = useState(9);
  const [place, setPlace] = useState('');
  const [km, setKm] = useState(5);
  const [pace, setPace] = useState<Pace>('tranquille');
  const [repeat, setRepeat] = useState(true);

  const submit = () => {
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const r = propose({ forumId, startAt: start.getTime(), everyTwoWeeks: repeat, place, distanceKm: km, pace });
    if (!r.ok) return say(r.reason ?? 'Sortie impossible', 'bad');
    say('Sortie proposée', 'ok');
    setPlace('');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} label="Proposer une sortie">
      <Display size={22}>Proposer une sortie</Display>
      <Txt size={13} weight="bold">Jour</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {days.map((d) => (
          <Pill key={d} label={shortDay(d)} on={d === day} onPress={() => setDay(d)} />
        ))}
      </ScrollView>
      <Txt size={13} weight="bold">Heure</Txt>
      <View style={styles.wrap}>{HOURS.map((h) => <Pill key={h} label={h + ' h'} on={h === hour} onPress={() => setHour(h)} />)}</View>
      <Txt size={13} weight="bold">Point de rendez-vous (lieu public)</Txt>
      <TextInput
        value={place}
        onChangeText={setPlace}
        placeholder="Ex. Entrée principale du parc"
        placeholderTextColor={t.ink2}
        maxLength={80}
        style={[styles.field, { backgroundColor: t.bg, color: t.ink, borderColor: t.line }]}
      />
      <Txt size={13} weight="bold">Distance</Txt>
      <View style={styles.wrap}>{DISTANCES.map((d) => <Pill key={d} label={d + ' km'} on={d === km} onPress={() => setKm(d)} />)}</View>
      <Txt size={13} weight="bold">Allure</Txt>
      <View style={styles.wrap}>{PACES.map((p) => <Pill key={p.id} label={p.label} on={p.id === pace} onPress={() => setPace(p.id)} />)}</View>
      <Toggle on={repeat} onPress={() => setRepeat(!repeat)} label="Toutes les deux semaines" hint="Même jour, même heure, même lieu" />
      <View style={[styles.safety, { backgroundColor: t.bg }]}>
        {RUN_SAFETY.map((s) => (
          <View key={s} style={{ flexDirection: 'row', gap: 8 }}>
            <Icon name="shield" size={14} color={t.ink2} />
            <Txt size={12.5} color={t.ink2} lineHeight={17} style={{ flex: 1 }}>{s}</Txt>
          </View>
        ))}
      </View>
      <MainButton label="Proposer la sortie" disabled={place.trim().length < 4} onPress={submit} />
    </Sheet>
  );
}

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Press accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label} onPress={onPress} pressScale={0.95} style={[styles.pill, { backgroundColor: on ? LIME : t.bg, borderColor: on ? LIME : t.line }]}>
      <Txt size={13} weight="semibold" color={on ? OBSIDIAN : t.ink}>{label}</Txt>
    </Press>
  );
}

const styles = StyleSheet.create({
  run: { borderRadius: 22, padding: 14, gap: 8 },
  small: { height: 36, paddingHorizontal: 14, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  post: { borderRadius: 22, padding: 14, gap: 10 },
  more: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 16 },
  composer: { paddingTop: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 13 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { height: 36, paddingHorizontal: 13, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  field: { height: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  safety: { borderRadius: 16, padding: 12, gap: 8 },
});
