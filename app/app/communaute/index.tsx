/**
 * Communauté — accueil. Première visite : adhésion (opt-in). Ensuite, l'écran répond à deux questions :
 * « qu'est-ce que je peux faire maintenant ? » (UNE action principale : Trouver quelqu'un)
 * et « qu'est-ce qui s'est passé chez mes personnes depuis ma dernière visite ? » (fil fini, 3 éléments au maximum).
 */
import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow } from '@/theme/tokens';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { useGame } from '@/store/useGame';
import { useCommunity, useSocial } from '@/community/store';
import { useMyPoints } from '@/community/hooks/usePoints';
import { unreadConversations, unreadCount } from '@/community/services/inbox';
import { activeNearby, feedEvents, greeting, todayFeed, welcomeBack } from '@/community/services/feed';
import type { FeedItem, FeedKind } from '@/community/services/feed';
import { suggest } from '@/social/fitmatch/matching';
import { reactionOf } from '@/social/messages/assist';
import { NEEDS, STATUSES, activeNeed, activeStatus, needLabel } from '@/community/models/intentions';
import type { StatusId } from '@/community/models/intentions';
import { Join } from '@/community/components/Join';
import { AvatarPortrait } from '@/community/components/AvatarPortrait';
import { MainButton, clock, since, useNow } from '@/community/components/ui';
import { Figure, Head, HeadStack, IconButton, LiveDot, SectionHead, Sheet, Studio, Tag, TextLink, studio } from '@/community/components/kit';
import { Icon, NEED_ICON, STATUS_ICON } from '@/community/components/icons';
import type { IconName } from '@/community/components/icons';
import { CR } from '@/community/routes';

export default function CommunityHome() {
  const status = useCommunity((s) => s.status);
  return status === 'active' ? <Hub /> : <Join />;
}

const KIND_ICON: Record<FeedKind, IconName> = {
  reponse: 'chat',
  demande: 'userPlus',
  encouragement: 'heart',
  arrivee: 'spark',
  objectif: 'flame',
  actif: 'wave',
};

function Hub() {
  const t = useTheme();
  const c = studio(t);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { engine, myId, me } = useSocial();
  const readAt = useCommunity((s) => s.readAt);
  const syncPoints = useCommunity((s) => s.syncPoints);
  const refreshDemo = useCommunity((s) => s.refreshDemo);
  const visit = useCommunity((s) => s.visit);
  const respond = useCommunity((s) => s.respond);
  const encourage = useCommunity((s) => s.encourage);
  const setStatus = useCommunity((s) => s.setStatus);
  const say = useGame.getState().say;
  const points = useMyPoints();
  const now = useNow(30000);
  // dernière visite AVANT celle-ci : sert au fil « depuis ta dernière visite » et au retour après absence
  const [prevVisit] = useState(() => useCommunity.getState().lastVisitAt);
  const [statusSheet, setStatusSheet] = useState(false);
  const [cheered, setCheered] = useState<Record<string, boolean>>({});

  useEffect(() => {
    refreshDemo();
    visit();
  }, [refreshDemo, visit]);
  useEffect(() => {
    if (me && me.points !== points) syncPoints(points);
  }, [points, me, syncPoints]);
  if (!me) return null;

  const hour = new Date(now).getHours();
  const welcome = welcomeBack(prevVisit, now);
  const active = activeNearby(engine, myId, now);
  // trois visages : d'abord ceux qui sont en ligne, puis les plus proches de ton parcours
  const blocked = new Set(engine.s.blocks.flatMap((b) => (b.blockerId === myId ? [b.blockedId] : b.blockedId === myId ? [b.blockerId] : [])));
  const best = suggest(me, Object.values(engine.s.profiles), new Set([myId, ...blocked]), now, 6).map((x) => x.userId);
  const faces = [...active, ...best.filter((id) => !active.includes(id))].slice(0, 3);
  const feed = todayFeed(feedEvents(engine, myId, readAt, now), now, prevVisit);
  const convs = engine.conversationsOf(myId);
  const unreadIds = new Set(unreadConversations(engine, myId, readAt));
  const friends = engine.friends(myId);
  const fitmates = friends.filter((id) => engine.friendship(myId, id)?.relationshipType === 'fitmate');
  const myStatus = activeStatus(me, now);
  const myNeed = activeNeed(me, now);
  const anySim = feed.some((f) => f.simulated);

  const openItem = (f: FeedItem) => {
    if (f.kind === 'arrivee') return router.push(CR.fitmatch);
    if (!f.userId) return;
    if (f.kind === 'reponse') return router.push(CR.chat(f.userId));
    router.push(CR.profile(f.userId));
  };
  const feedAction = (f: FeedItem): { label: string; run: () => void } | null => {
    if (f.kind === 'reponse' && f.userId) return { label: 'Répondre', run: () => router.push(CR.chat(f.userId!)) };
    if (f.kind === 'demande' && f.userId) {
      const fr = engine.pendingFor(myId).find((x) => x.userA === f.userId);
      return fr ? { label: 'Accepter', run: () => { const r = respond(fr.id, true); say(r.ok ? 'Vous êtes maintenant amis' : r.reason ?? 'Action impossible', r.ok ? 'ok' : 'bad'); } } : null;
    }
    if ((f.kind === 'objectif' || f.kind === 'actif') && f.userId) {
      if (cheered[f.userId]) return { label: 'Envoyé', run: () => {} };
      return {
        label: 'Encourager',
        run: () => {
          const r = encourage(f.userId!);
          say(r.ok ? 'Encouragement envoyé' : r.reason ?? 'Action impossible', r.ok ? 'ok' : 'bad');
          if (r.ok) setCheered({ ...cheered, [f.userId!]: true });
        },
      };
    }
    if (f.kind === 'arrivee') return { label: 'Voir', run: () => router.push(CR.fitmatch) };
    return null;
  };

  const stageH = 226;
  const sideW = Math.round(Math.min(140, (W - 32) * 0.36));
  const midW = Math.round(Math.min(184, (W - 32) * 0.47));
  const activeLabel =
    active.length === 0
      ? 'Personne n’est en ligne pour l’instant. Les personnes proches de toi passent surtout le soir.'
      : active.length === 1
        ? '1 personne avec un parcours proche du tien est active'
        : active.length + ' personnes avec un parcours proche du tien sont actives';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 60, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 26 }} showsVerticalScrollIndicator={false}>
        {/* Bonjour */}
        <Animated.View entering={FadeInDown.duration(280)} style={{ gap: 10, paddingHorizontal: 4 }}>
          <Display size={32} lineHeight={35}>
            {welcome ? 'Content de te revoir, ' + me.displayName : greeting(hour) + ' ' + me.displayName + ' 👋'}
          </Display>
          <Press onPress={() => setStatusSheet(true)} accessibilityLabel="Choisir ton état du jour" pressScale={0.97} style={[styles.myStatus, { backgroundColor: t.surf }, shadow.sm]}>
            <AvatarPortrait avatarId="moi" size={28} mode="tete" style={{ backgroundColor: c.head }} />
            {myStatus ? (
              <>
                {STATUS_ICON[myStatus] ? <Icon name={STATUS_ICON[myStatus]!} size={15} color={t.ink} strokeWidth={2.1} /> : <LiveDot size={9} ring={t.surf} />}
                <Txt size={13} weight="semibold">{STATUSES.find((s) => s.id === myStatus)!.label}</Txt>
              </>
            ) : (
              <>
                <Icon name="plus" size={15} color={t.ink2} strokeWidth={2.2} />
                <Txt size={13} weight="semibold" color={t.ink2}>Ton état du jour</Txt>
              </>
            )}
          </Press>
          {welcome ? (
            <Txt size={14.5} color={t.ink2}>Voici ce qui s’est passé pendant ces {welcome.days} jours. Tu reprends où tu veux.</Txt>
          ) : null}
        </Animated.View>

        {/* Il se passe quelque chose ici : trois personnes, une action */}
        <Animated.View entering={FadeInDown.delay(60).duration(300)} style={[styles.hero, { backgroundColor: t.surf }, shadow.lg]}>
          <Studio height={stageH} glowY={0.6}>
            <View style={styles.trio}>
              {faces.map((id, i) => {
                const p = engine.s.profiles[id];
                if (!p) return null;
                const mid = faces.length === 3 ? i === 1 : i === 0;
                const on = active.includes(id);
                return (
                  <Press key={id} onPress={() => router.push(CR.profile(id))} pressScale={0.97} accessibilityLabel={'Voir le profil de ' + p.displayName} style={{ alignItems: 'center', zIndex: mid ? 2 : 1, marginHorizontal: -16 }}>
                    <Figure avatarId={p.avatarId} size={mid ? midW : sideW} mode="buste" delay={80 + i * 70} breathe={false} from={i === 0 ? -12 : i === 2 ? 12 : 0} />
                    <View style={[styles.nameTag, { backgroundColor: c.glass }, shadow.sm]}>
                      {on ? <LiveDot size={8} ring={c.glass} /> : null}
                      <Txt size={12} weight="bold">{p.displayName}</Txt>
                    </View>
                  </Press>
                );
              })}
            </View>
            {faces.some((id) => engine.s.profiles[id]?.demo) ? <Tag kind="demo" style={{ position: 'absolute', top: 12, right: 12 }} /> : null}
          </Studio>
          <View style={{ padding: 16, paddingTop: 14, gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              {active.length ? <View style={{ paddingTop: 5 }}><LiveDot size={10} ring={t.surf} /></View> : null}
              <Txt size={15.5} weight="semibold" lineHeight={21} style={{ flex: 1 }}>{activeLabel}</Txt>
            </View>
            <MainButton label="Trouver quelqu’un" onPress={() => router.push(CR.fitmatch)} />
          </View>
        </Animated.View>

        {/* Aujourd'hui dans ta communauté (fini : 3 au maximum) */}
        <Animated.View entering={FadeInDown.delay(120).duration(300)} style={{ gap: 12 }}>
          <SectionHead title="Aujourd’hui dans ta communauté" tag={anySim ? <Tag kind="sim" /> : undefined} />
          {feed.length ? (
            <View style={[styles.group, { backgroundColor: t.surf }, shadow.card]}>
              {feed.map((f, i) => {
                const p = f.userId ? engine.s.profiles[f.userId] : null;
                const act = feedAction(f);
                return (
                  <Press key={f.id} onPress={() => openItem(f)} pressScale={0.99} accessibilityLabel={f.text} style={[styles.feedRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
                    <View>
                      {p ? (
                        <Head avatarId={p.avatarId} size={46} />
                      ) : (
                        <View style={[styles.feedIcon, { backgroundColor: c.head }]}><Icon name="spark" size={20} color={t.ink} /></View>
                      )}
                      {p ? (
                        <View style={[styles.kind, { backgroundColor: t.strong, borderColor: t.surf }]}>
                          <Icon name={KIND_ICON[f.kind]} size={11} color={LIME} strokeWidth={2.3} />
                        </View>
                      ) : null}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt size={14.5} weight="semibold" lineHeight={19}>{f.text}</Txt>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {f.isNew ? <View style={[styles.newDot, { backgroundColor: LIME }]} /> : null}
                        <Txt size={12} color={t.ink2}>{f.isNew ? 'Nouveau · ' : ''}{since(f.at, now)}</Txt>
                      </View>
                    </View>
                    {act ? (
                      <Press onPress={act.run} pressScale={0.94} accessibilityLabel={act.label} style={[styles.miniBtn, { backgroundColor: act.label === 'Envoyé' ? t.track : t.bg }]}>
                        <Txt size={12.5} weight="bold" color={act.label === 'Envoyé' ? t.ink2 : t.ink}>{act.label}</Txt>
                      </Press>
                    ) : null}
                  </Press>
                );
              })}
            </View>
          ) : null}
          <Txt size={12.5} color={t.ink2} style={{ paddingHorizontal: 4 }}>
            {feed.length ? 'C’est tout pour aujourd’hui. Reviens demain pour la suite.' : 'Rien de neuf depuis ta dernière visite. Reviens demain.'}
          </Txt>
        </Animated.View>

        {/* Besoin d'un coup de pouce ? */}
        <Animated.View entering={FadeInDown.delay(170).duration(300)}>
          <Press onPress={() => router.push(CR.boost)} pressScale={0.98} accessibilityLabel="Besoin d’un coup de pouce ?" style={[styles.boost, { backgroundColor: t.strong }, shadow.md]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[styles.boostIcon, { backgroundColor: LIME }]}>
                <Icon name={myNeed ? NEED_ICON[myNeed] : 'bolt'} size={22} color={OBSIDIAN} strokeWidth={2.1} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Display size={18} color={t.strongInk}>Besoin d’un coup de pouce ?</Display>
                <Txt size={13} color={t.strongInk2}>
                  {myNeed ? 'Aujourd’hui : ' + needLabel(myNeed) + '. Voir qui peut t’aider.' : 'Dis ce dont tu as besoin, on te présente la bonne personne.'}
                </Txt>
              </View>
              <Icon name="chevron" size={18} color={t.strongInk2} />
            </View>
            {!myNeed ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {NEEDS.filter((n) => ['motivation', 'repas', 'moral'].includes(n.id)).map((n) => (
                  <View key={n.id} style={[styles.boostChip, { borderColor: 'rgba(255,255,255,0.14)' }]}>
                    <Icon name={NEED_ICON[n.id]} size={13} color={t.strongInk2} />
                    <Txt size={12} weight="semibold" color={t.strongInk}>{n.label}</Txt>
                  </View>
                ))}
              </View>
            ) : null}
          </Press>
        </Animated.View>

        {/* Tes messages */}
        <View style={{ gap: 12 }}>
          <SectionHead
            title="Tes messages"
            tag={unreadIds.size ? <Tag kind="new" label={unreadIds.size + (unreadIds.size > 1 ? ' non lus' : ' non lu')} /> : undefined}
            right={convs.length ? <TextLink label="Tout voir" onPress={() => router.push(CR.messages)} /> : undefined}
          />
          {convs.length ? (
            <View style={[styles.group, { backgroundColor: t.surf }, shadow.card]}>
              {convs.slice(0, 3).map((cv, i) => {
                const other = cv.members.find((m) => m !== myId) ?? '';
                const card = engine.card(myId, other);
                if (!card) return null;
                const list = engine.s.messages[cv.id] ?? [];
                const last = list[list.length - 1];
                const n = unreadCount(engine, myId, cv.id, readAt);
                const r = last ? reactionOf(last.content) : null;
                const preview = !last ? '' : last.moderationState !== 'ok' ? 'Message signalé' : (last.senderId === myId ? 'Toi : ' : '') + (r ? r.emoji + ' ' + r.label : last.content);
                return (
                  <Press key={cv.id} onPress={() => router.push(CR.chat(other))} pressScale={0.99} style={[styles.msgRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
                    <Head avatarId={card.avatarId} size={48} online={now - (engine.s.profiles[other]?.lastActiveAt ?? 0) < 15 * 60000} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Txt size={15} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{card.displayName}</Txt>
                        {card.demo ? <Tag kind="demo" /> : null}
                        <View style={{ flex: 1 }} />
                        {last ? <Txt size={12} color={n ? t.ink : t.ink2} weight={n ? 'bold' : 'regular'}>{clock(last.createdAt, now)}</Txt> : null}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Txt size={13.5} color={n ? t.ink : t.ink2} weight={n ? 'semibold' : 'regular'} numberOfLines={1} style={{ flex: 1 }}>{preview}</Txt>
                        {n ? <View style={[styles.count, { backgroundColor: LIME }]}><Txt size={11.5} weight="bold" color={OBSIDIAN}>{n}</Txt></View> : null}
                      </View>
                    </View>
                  </Press>
                );
              })}
            </View>
          ) : (
            <Press onPress={() => router.push(CR.fitmatch)} pressScale={0.99} style={[styles.empty, { backgroundColor: t.surf }, shadow.card]}>
              <HeadStack ids={best.slice(0, 3).map((id) => ({ avatarId: engine.s.profiles[id]?.avatarId ?? '' }))} size={38} ring={t.surf} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt size={14.5} weight="bold">Pas encore de discussion</Txt>
                <Txt size={13} color={t.ink2}>Dis bonjour à quelqu’un de proche de ton parcours.</Txt>
              </View>
              <Icon name="chevron" size={18} color={t.ink2} />
            </Press>
          )}
        </View>

        {/* Tes personnes */}
        <View style={{ gap: 12 }}>
          <SectionHead title="Tes personnes" sub={'FitMates : ' + fitmates.length + ' sur 3 · ' + friends.length + ' ami' + (friends.length > 1 ? 's' : '')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 4 }}>
            {friends.map((fid) => {
              const card = engine.card(myId, fid);
              if (!card) return null;
              const fit = fitmates.includes(fid);
              return (
                <Press key={fid} onPress={() => router.push(CR.profile(fid))} pressScale={0.95} style={styles.person}>
                  <Head avatarId={card.avatarId} size={66} ring={fit ? 'lime' : null} status={card.status} online={!card.status && now - (engine.s.profiles[fid]?.lastActiveAt ?? 0) < 15 * 60000} />
                  <Txt size={13} weight="bold" numberOfLines={1}>{card.displayName}</Txt>
                  <Txt size={11.5} color={t.ink2} numberOfLines={1}>{fit ? 'FitMate' : 'Ami'}</Txt>
                </Press>
              );
            })}
            {fitmates.length < 3 ? (
              <Press onPress={() => router.push(CR.fitmatch)} pressScale={0.95} accessibilityLabel="Trouver un FitMate" style={styles.person}>
                <View style={[styles.addSlot, { borderColor: t.line }]}>
                  <Icon name="plus" size={22} color={t.ink2} />
                </View>
                <Txt size={13} weight="bold" color={t.ink2}>FitMate</Txt>
                <Txt size={11.5} color={t.ink2}>{3 - fitmates.length} place{3 - fitmates.length > 1 ? 's' : ''}</Txt>
              </Press>
            ) : null}
          </ScrollView>
          {friends.length === 0 ? (
            <Txt size={13} color={t.ink2} style={{ paddingHorizontal: 4 }}>Un FitMate, c’est ton binôme de régularité. Tu peux en avoir trois.</Txt>
          ) : null}
        </View>

        {/* Bientôt : Cercles */}
        <View style={[styles.soon, { borderColor: t.line }]}>
          <View style={[styles.soonIcon, { backgroundColor: t.track }]}>
            <Icon name="circles" size={20} color={t.ink2} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt size={15} weight="bold" color={t.ink2}>Tes Cercles</Txt>
              <Tag kind="soon" />
            </View>
            <Txt size={12.5} color={t.ink2}>De petits groupes pour avancer ensemble. Ton profil et tes amis seront conservés.</Txt>
          </View>
        </View>

        <Press onPress={() => router.push(CR.privacy)} pressScale={0.99} style={styles.privacy}>
          <Icon name="lock" size={15} color={t.ink2} />
          <Txt size={12.5} color={t.ink2} style={{ flex: 1 }}>Tes données santé ne sont jamais publiques.</Txt>
          <Txt size={12.5} weight="bold" color={t.ink}>Confidentialité</Txt>
        </Press>
      </ScrollView>

      <View style={[styles.top, { paddingTop: insets.top + 6, backgroundColor: t.bg }]}>
        <IconButton icon="back" label="Retour" onPress={() => (router.canGoBack() ? router.back() : router.replace(CR.tabs))} size={40} />
        <Txt size={15} weight="bold" style={{ flex: 1, textAlign: 'center' }}>Communauté</Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton icon="chat" label="Messages" onPress={() => router.push(CR.messages)} size={40} badge={unreadIds.size || undefined} />
          <IconButton icon="shield" label="Confidentialité" onPress={() => router.push(CR.privacy)} size={40} />
        </View>
      </View>

      <Sheet visible={statusSheet} onClose={() => setStatusSheet(false)} label="Ton état du jour">
        <View style={{ gap: 4 }}>
          <Display size={22}>Ton état du jour</Display>
          <Txt size={13.5} color={t.ink2}>Il s’affiche à côté de ton avatar pendant 12 heures. Facultatif.</Txt>
        </View>
        <View style={{ gap: 8 }}>
          {STATUSES.map((s) => (
            <StatusOption key={s.id} id={s.id} on={myStatus === s.id} onPress={() => { setStatus(s.id); setStatusSheet(false); }} />
          ))}
          <Press onPress={() => { setStatus(null); setStatusSheet(false); }} style={[styles.statusRow, { borderColor: 'transparent' }]}>
            <View style={[styles.statusIcon, { backgroundColor: 'transparent' }]}>
              <Icon name="close" size={17} color={t.ink2} />
            </View>
            <Txt size={15} weight="semibold" color={t.ink2} style={{ flex: 1 }}>Ne rien afficher</Txt>
          </Press>
        </View>
      </Sheet>
    </View>
  );
}

function StatusOption({ id, on, onPress }: { id: StatusId; on: boolean; onPress: () => void }) {
  const t = useTheme();
  const icon = STATUS_ICON[id];
  return (
    <Press accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={STATUSES.find((s) => s.id === id)!.label} onPress={onPress} pressScale={0.98} style={[styles.statusRow, { borderColor: on ? t.strong : t.line, backgroundColor: on ? t.strong : 'transparent' }]}>
      <View style={[styles.statusIcon, { backgroundColor: on ? LIME : t.bg }]}>
        {icon ? <Icon name={icon} size={17} color={on ? OBSIDIAN : t.ink} strokeWidth={2.1} /> : <LiveDot size={11} ring={on ? LIME : t.bg} />}
      </View>
      <Txt size={15} weight="semibold" color={on ? t.strongInk : t.ink} style={{ flex: 1 }}>{STATUSES.find((s) => s.id === id)!.label}</Txt>
      {on ? <Icon name="check" size={18} color={LIME} strokeWidth={2.4} /> : null}
    </Press>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 8 },
  myStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', height: 36, paddingLeft: 4, paddingRight: 14, borderRadius: 18 },
  hero: { borderRadius: 30, overflow: 'hidden' },
  trio: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end' },
  nameTag: { position: 'absolute', bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 26, borderRadius: 13 },
  group: { borderRadius: 26, paddingHorizontal: 14 },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  feedIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  kind: { position: 'absolute', right: -3, bottom: -3, width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  newDot: { width: 7, height: 7, borderRadius: 4 },
  miniBtn: { height: 34, paddingHorizontal: 12, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  boost: { borderRadius: 26, padding: 16, gap: 14 },
  boostIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  boostChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 15, borderWidth: 1 },
  msgRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  count: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, padding: 14 },
  person: { width: 76, alignItems: 'center', gap: 4 },
  addSlot: { width: 66, height: 66, borderRadius: 33, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  soon: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, borderWidth: 1.5, borderStyle: 'dashed', padding: 14 },
  soonIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingVertical: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 8 },
  statusIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
