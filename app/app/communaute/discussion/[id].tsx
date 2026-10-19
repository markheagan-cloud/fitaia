/**
 * Discussion privée. Au premier contact : ce que vous avez en commun, trois amorces, trois réactions.
 * L'aide se retire d'elle-même après quelques échanges (assistLevel) : la discussion devient normale.
 * Signalement d'un message par appui long ; limites anti-harcèlement appliquées par le moteur (2 messages avant réponse…).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeInDown, FadeInUp, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, font, shadow } from '@/theme/tokens';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { useGame } from '@/store/useGame';
import { useCommunity, useSocial } from '@/community/store';
import { REPORT_REASONS } from '@/community/models/types';
import type { Message } from '@/community/models/types';
import { LIMITS } from '@/social/messages/safety';
import { FIRST_STARTERS, REACTIONS, assistLevel, frenchSpacing, reactionOf, reactionText, waitingForReply } from '@/social/messages/assist';
import { humanReasons } from '@/social/fitmatch/matching';
import { statusLabel } from '@/community/models/intentions';
import { clock, useNow } from '@/community/components/ui';
import { Head, IconButton, studio } from '@/community/components/kit';
import { Icon } from '@/community/components/icons';
import { AvatarPortrait } from '@/community/components/AvatarPortrait';
import { CR } from '@/community/routes';

function TypingDots({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const d0 = useSharedValue(0.35);
  const d1 = useSharedValue(0.35);
  const d2 = useSharedValue(0.35);
  useEffect(() => {
    if (reduced) return;
    [d0, d1, d2].forEach((x, i) =>
      x.set(withDelay(i * 160, withRepeat(withSequence(withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }), withTiming(0.35, { duration: 320 })), -1))),
    );
  }, [reduced, d0, d1, d2]);
  const s0 = useAnimatedStyle(() => ({ opacity: d0.get() }));
  const s1 = useAnimatedStyle(() => ({ opacity: d1.get() }));
  const s2 = useAnimatedStyle(() => ({ opacity: d2.get() }));
  return (
    <View style={{ flexDirection: 'row', gap: 4, paddingVertical: 4 }}>
      {[s0, s1, s2].map((st, i) => (
        <Animated.View key={i} style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }, st]} />
      ))}
    </View>
  );
}

export default function Discussion() {
  const t = useTheme();
  const c = studio(t);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { engine, myId, me } = useSocial();
  const send = useCommunity((s) => s.send);
  const report = useCommunity((s) => s.report);
  const markRead = useCommunity((s) => s.markRead);
  const typingUntil = useCommunity((s) => (id ? s.typingUntil[id] ?? 0 : 0));
  const [text, setText] = useState('');
  const [reportFor, setReportFor] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const now = useNow(1000);
  const say = useGame.getState().say;

  // ouvrir la discussion = lue (y compris les réponses qui arrivent pendant qu'elle est ouverte)
  const convId = id ? engine.conversationWith(myId, id)?.id : undefined;
  const msgCount = convId ? (engine.s.messages[convId]?.length ?? 0) : 0;
  useEffect(() => {
    if (convId) markRead(convId);
  }, [convId, msgCount, markRead]);

  const card = id ? engine.card(myId, id) : null;
  const other = id ? engine.s.profiles[id] : undefined;
  if (!id || !card || !other || !me) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top + 12, paddingHorizontal: 16, gap: 14 }}>
        <IconButton icon="back" label="Retour" onPress={() => router.back()} size={40} />
        <Display size={22}>Discussion indisponible</Display>
        <Txt size={14} color={t.ink2}>Vous ne pouvez plus échanger avec cette personne.</Txt>
      </View>
    );
  }

  const conv = engine.conversationWith(myId, id);
  const msgs: Message[] = conv ? engine.s.messages[conv.id] ?? [] : [];
  const allowed = engine.canMessage(myId, id);
  const level = assistLevel(msgs, myId);
  const waiting = waitingForReply(msgs, myId);
  // « écrit… » seulement tant que la réponse simulée n'est pas arrivée
  const typing = now < typingUntil && msgs.length > 0 && msgs[msgs.length - 1].senderId === myId;
  // bulles : graphite en clair ; en sombre, un gris plus clair que le fond et que les bulles reçues
  const mineBg = t.dark ? '#3A3D44' : OBSIDIAN;
  const online = now - other.lastActiveAt < 15 * 60000;
  const common = humanReasons(me, other, now, 3);
  const sub = card.demo ? 'Démo · réponses simulées' : online ? 'En ligne' : card.status ? statusLabel(card.status) : 'Étape ' + card.stage;

  const submit = (content: string, type: 'texte' | 'encouragement' = 'texte') => {
    const r = send(id, content, type);
    if (!r.ok) return say(r.reason ?? 'Message non envoyé', 'bad');
    if (type === 'texte') setText('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[styles.head, { paddingTop: insets.top + 6, backgroundColor: t.bg }, shadow.sm]}>
        <IconButton icon="back" label="Retour" onPress={() => (router.canGoBack() ? router.back() : router.replace(CR.messages))} size={40} />
        <Press onPress={() => router.push(CR.profile(id))} pressScale={0.98} accessibilityLabel={'Profil de ' + card.displayName} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Head avatarId={card.avatarId} size={42} online={online} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt size={16} weight="bold" numberOfLines={1}>{card.displayName}</Txt>
            <Txt size={12} color={t.ink2} numberOfLines={1}>{sub}</Txt>
          </View>
        </Press>
        <IconButton icon="more" label={'Profil de ' + card.displayName} onPress={() => router.push(CR.profile(id))} size={40} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 56}>
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 16, paddingBottom: 12 }}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {level === 'full' ? (
            <Animated.View entering={FadeInDown.duration(300)} style={[styles.intro, { backgroundColor: t.surf }, shadow.card]}>
              <View style={{ flexDirection: 'row' }}>
                <View style={[styles.introHead, { borderColor: t.surf }]}>
                  <AvatarPortrait avatarId="moi" size={60} mode="tete" style={{ backgroundColor: c.head }} />
                </View>
                <View style={[styles.introHead, { borderColor: t.surf, marginLeft: -16 }]}>
                  <AvatarPortrait avatarId={card.avatarId} size={60} mode="tete" style={{ backgroundColor: c.head }} />
                </View>
              </View>
              <Display size={20} style={{ textAlign: 'center' }}>Vous avez plusieurs choses en commun</Display>
              <View style={styles.commonRow}>
                {common.map((r) => (
                  <View key={r} style={[styles.commonChip, { backgroundColor: t.bg }]}>
                    <Icon name="check" size={13} color={t.ink} strokeWidth={2.6} />
                    <Txt size={12.5} weight="semibold">{r}</Txt>
                  </View>
                ))}
              </View>
              <Txt size={13} color={t.ink2} style={{ textAlign: 'center' }}>Une question simple suffit pour commencer.</Txt>
            </Animated.View>
          ) : level === 'light' ? (
            <Animated.View entering={FadeIn.duration(260)} style={[styles.introLight, { borderColor: t.line }]}>
              <Icon name="spark" size={15} color={t.ink2} />
              <Txt size={12.5} color={t.ink2} style={{ flex: 1 }} numberOfLines={2}>En commun : {common.join(', ').toLowerCase()}</Txt>
            </Animated.View>
          ) : null}

          {msgs.length > 0 ? (
            <Txt size={11.5} weight="semibold" color={t.ink2} style={{ textAlign: 'center', marginVertical: 12 }}>
              {clock(msgs[0].createdAt, now).includes(':') ? 'Aujourd’hui · ' + clock(msgs[0].createdAt, now) : clock(msgs[0].createdAt, now)}
            </Txt>
          ) : null}

          {msgs.map((m, i) => {
            const mine = m.senderId === myId;
            const next = msgs[i + 1];
            const prev = msgs[i - 1];
            const lastOfGroup = !next || next.senderId !== m.senderId;
            const firstOfGroup = !prev || prev.senderId !== m.senderId;
            const flagged = m.moderationState !== 'ok';
            const r = !flagged ? reactionOf(m.content) : null;
            return (
              <Animated.View key={m.id} entering={FadeInUp.duration(220)} style={{ marginTop: firstOfGroup && i > 0 ? 12 : 3, flexDirection: 'row', alignItems: 'flex-end', gap: 8, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                {!mine ? (lastOfGroup ? <Head avatarId={card.avatarId} size={28} /> : <View style={{ width: 28 }} />) : null}
                <Press
                  onLongPress={mine ? undefined : () => setReportFor(m.id)}
                  accessibilityHint={mine ? undefined : 'Appui long pour signaler'}
                  haptic="none"
                  pressScale={1}
                  style={{ maxWidth: '78%' }}
                >
                  {r ? (
                    <View style={[styles.sticker, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
                      <View style={[styles.stickerBubble, { backgroundColor: mine ? mineBg : t.surf }, shadow.sm]}>
                        <Txt size={30} lineHeight={36}>{r.emoji}</Txt>
                      </View>
                      <Txt size={12.5} weight="bold" color={t.ink2}>{r.label}</Txt>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.bubble,
                        mine ? { backgroundColor: mineBg } : [{ backgroundColor: t.surf }, shadow.sm],
                        lastOfGroup && (mine ? { borderBottomRightRadius: 7 } : { borderBottomLeftRadius: 7 }),
                      ]}
                    >
                      {flagged ? (
                        <Txt size={13} color={mine ? '#A2A6AD' : t.ink2}>Message signalé · en cours de vérification</Txt>
                      ) : (
                        <Txt size={15.5} lineHeight={21} color={mine ? '#F5F4F1' : t.ink}>{frenchSpacing(m.content)}</Txt>
                      )}
                    </View>
                  )}
                </Press>
              </Animated.View>
            );
          })}

          {typing ? (
            <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <Head avatarId={card.avatarId} size={28} />
              <View style={[styles.bubble, { backgroundColor: t.surf, borderBottomLeftRadius: 7, paddingVertical: 12 }, shadow.sm]}>
                <TypingDots color={t.ink2} />
              </View>
            </Animated.View>
          ) : null}

          {level === 'full' && allowed.ok ? (
            <Animated.View entering={FadeInDown.delay(140).duration(300)} style={{ marginTop: 18, gap: 8, alignItems: 'flex-end' }}>
              <Txt size={12.5} weight="semibold" color={t.ink2} style={{ alignSelf: 'flex-end', marginRight: 4 }}>Pour lancer la discussion</Txt>
              {FIRST_STARTERS.map((s) => {
                const on = text === s;
                return (
                  <Press
                    key={s}
                    onPress={() => { setText(s); input.current?.focus(); }}
                    pressScale={0.97}
                    accessibilityLabel={'Utiliser : ' + s}
                    style={[styles.starter, on ? { backgroundColor: mineBg, borderColor: mineBg } : { borderColor: t.ink2 }]}
                  >
                    <Txt size={14.5} weight="semibold" color={on ? '#F5F4F1' : t.ink}>{s}</Txt>
                  </Press>
                );
              })}
            </Animated.View>
          ) : null}
        </ScrollView>

        {reportFor ? (
          <View style={[styles.report, { backgroundColor: t.surf }, shadow.md]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt size={15} weight="bold">Signaler ce message</Txt>
              <Press onPress={() => setReportFor(null)} hitSlop={10}><Txt size={13.5} weight="semibold" color={t.ink2}>Annuler</Txt></Press>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {REPORT_REASONS.map((r) => (
                <Press
                  key={r.id}
                  onPress={() => {
                    report(id, r.id, reportFor);
                    setReportFor(null);
                    say('Merci. Le message est masqué en attendant la vérification.');
                  }}
                  style={[styles.reason, { borderColor: t.line }]}
                >
                  <Txt size={13}>{r.label}</Txt>
                </Press>
              ))}
            </View>
          </View>
        ) : null}

        {allowed.ok ? (
          <View style={[styles.composer, { paddingBottom: insets.bottom + 10, backgroundColor: t.bg }]}>
            {waiting ? (
              <View style={[styles.wait, { backgroundColor: t.surf }]}>
                <Icon name="heart" size={15} color={t.ink2} />
                <Txt size={13} color={t.ink2} style={{ flex: 1 }}>
                  Tu as envoyé {LIMITS.firstMessagesBeforeReply} messages. Laisse à {card.displayName} le temps de répondre.
                </Txt>
              </View>
            ) : level !== 'none' ? (
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12 }}>
                {REACTIONS.map((q) => (
                  <Press key={q.label} onPress={() => submit(reactionText(q), 'encouragement')} pressScale={0.92} accessibilityLabel={'Envoyer ' + q.label} style={[styles.quick, { backgroundColor: t.surf }, shadow.sm]}>
                    <Txt size={21} lineHeight={25}>{q.emoji}</Txt>
                    <Txt size={12} weight="bold" numberOfLines={1}>{q.label}</Txt>
                  </Press>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, alignItems: 'flex-end' }}>
              <TextInput
                ref={input}
                value={text}
                onChangeText={setText}
                placeholder={msgs.length ? 'Écris un message' : 'Écris ton premier message'}
                placeholderTextColor={t.ink2}
                multiline
                maxLength={LIMITS.maxLength}
                editable={!waiting}
                style={[styles.input, { backgroundColor: t.surf, color: t.ink }, shadow.sm]}
              />
              <Press
                accessibilityLabel="Envoyer"
                disabled={!text.trim() || waiting}
                onPress={() => submit(text)}
                haptic="medium"
                pressScale={0.9}
                style={[styles.send, { backgroundColor: text.trim() && !waiting ? LIME : t.track }, text.trim() ? shadow.btn : null]}
              >
                <Icon name="arrowUp" size={21} color={OBSIDIAN} strokeWidth={2.5} />
              </Press>
            </View>
          </View>
        ) : (
          <View style={[styles.composer, { paddingBottom: insets.bottom + 14, paddingHorizontal: 16, backgroundColor: t.bg }]}>
            <View style={[styles.wait, { backgroundColor: t.surf }]}>
              <Icon name="lock" size={15} color={t.ink2} />
              <Txt size={13} color={t.ink2} style={{ flex: 1 }}>{allowed.reason}</Txt>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 10, zIndex: 2 },
  intro: { borderRadius: 28, padding: 18, paddingTop: 20, gap: 12, alignItems: 'center', marginTop: 18 },
  introHead: { borderRadius: 40, borderWidth: 3 },
  commonRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  commonChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: 15 },
  introLight: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubble: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 22 },
  sticker: { gap: 4 },
  stickerBubble: { width: 58, height: 58, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  starter: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 20, borderBottomRightRadius: 7, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '86%' },
  report: { marginHorizontal: 12, marginBottom: 8, gap: 10, borderRadius: 22, padding: 14 },
  reason: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  composer: { paddingTop: 8, gap: 10 },
  wait: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  quick: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1, height: 58, borderRadius: 18, paddingHorizontal: 6 },
  input: { flex: 1, minHeight: 48, maxHeight: 120, borderRadius: 24, paddingHorizontal: 18, paddingTop: 13, paddingBottom: 13, fontSize: 15.5, fontFamily: font.body },
  send: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
