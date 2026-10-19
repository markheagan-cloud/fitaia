/**
 * Messages : la liste des discussions privées (avatar, prénom, dernier message, heure, non-lus).
 * Les personnes bloquées n'y apparaissent plus.
 */
import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow } from '@/theme/tokens';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { useCommunity, useSocial } from '@/community/store';
import { unreadCount } from '@/community/services/inbox';
import { suggest } from '@/social/fitmatch/matching';
import { reactionOf } from '@/social/messages/assist';
import { statusLabel } from '@/community/models/intentions';
import { MainButton, clock, useNow } from '@/community/components/ui';
import { Head, HeadStack, Tag, TopBar } from '@/community/components/kit';
import { CR } from '@/community/routes';

export default function MessagesScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { engine, myId, me } = useSocial();
  const convs = engine.conversationsOf(myId);
  const now = useNow(30000);
  const readAt = useCommunity((s) => s.readAt);
  const typingUntil = useCommunity((s) => s.typingUntil);
  const counts = convs.map((c) => unreadCount(engine, myId, c.id, readAt));
  const totalUnread = counts.filter((n) => n > 0).length;

  if (convs.length === 0) {
    const faces = me ? suggest(me, Object.values(engine.s.profiles), new Set([myId]), now, 3).map((x) => engine.s.profiles[x.userId]?.avatarId ?? '') : [];
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <TopBar title="Messages" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
          <HeadStack ids={faces.map((a) => ({ avatarId: a }))} size={58} ring={t.bg} />
          <Display size={23} style={{ textAlign: 'center' }}>Pas encore de discussion</Display>
          <Txt size={14.5} color={t.ink2} style={{ textAlign: 'center' }}>Dis bonjour à quelqu’un qui vit un parcours proche du tien. FitMatch te le présente.</Txt>
        </View>
        <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 12 }}>
          <MainButton label="Trouver quelqu’un" onPress={() => router.replace(CR.fitmatch)} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TopBar title="Messages" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: insets.bottom + 30, gap: 14 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4 }}>
          <Display size={28}>Tes discussions</Display>
          {totalUnread ? <Tag kind="new" label={totalUnread + (totalUnread > 1 ? ' non lues' : ' non lue')} /> : null}
        </View>
        <Animated.View entering={FadeInDown.duration(260)} style={[styles.group, { backgroundColor: t.surf }, shadow.card]}>
          {convs.map((c, i) => {
            const other = c.members.find((m) => m !== myId) ?? '';
            const card = engine.card(myId, other);
            if (!card) return null;
            const list = engine.s.messages[c.id] ?? [];
            const last = list[list.length - 1];
            const n = counts[i];
            const r = last ? reactionOf(last.content) : null;
            const body = !last ? '' : last.moderationState !== 'ok' ? 'Message signalé' : r ? r.emoji + ' ' + r.label : last.content;
            const online = now - (engine.s.profiles[other]?.lastActiveAt ?? 0) < 15 * 60000;
            const typing = now < (typingUntil[other] ?? 0);
            return (
              <Press key={c.id} onPress={() => router.push(CR.chat(other))} pressScale={0.99} accessibilityLabel={'Discussion avec ' + card.displayName + (n ? ', ' + n + ' non lu' : '')} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
                <Head avatarId={card.avatarId} size={56} online={online && !card.status} status={card.status} />
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Txt size={16} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{card.displayName}</Txt>
                    {card.demo ? <Tag kind="demo" /> : null}
                    <View style={{ flex: 1 }} />
                    {last ? <Txt size={12.5} num weight={n ? 'bold' : 'regular'} color={n ? t.ink : t.ink2}>{clock(last.createdAt, now)}</Txt> : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Txt size={14} numberOfLines={1} weight={n ? 'semibold' : 'regular'} color={n || typing ? t.ink : t.ink2} style={{ flex: 1 }}>
                      {typing ? 'écrit…' : (last?.senderId === myId ? 'Toi : ' : '') + body}
                    </Txt>
                    {n ? (
                      <View style={[styles.count, { backgroundColor: LIME }]}>
                        <Txt size={12} weight="bold" color={OBSIDIAN}>{n}</Txt>
                      </View>
                    ) : null}
                  </View>
                  {card.status ? <Txt size={12} color={t.ink2} numberOfLines={1}>{statusLabel(card.status)}</Txt> : null}
                </View>
              </Press>
            );
          })}
        </Animated.View>
        <Txt size={12.5} color={t.ink2} style={{ textAlign: 'center', paddingHorizontal: 20 }}>
          Appui long sur un message pour le signaler. Les personnes bloquées disparaissent de la liste.
        </Txt>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: 26, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13 },
  count: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
