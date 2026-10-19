/**
 * Entrée de la Communauté sur l'Accueil : une ligne discrète (la barre d'onglets reste à 5 emplacements fixes).
 * Avant activation : invitation. Après : réponses et demandes en attente, sinon les visages des personnes en ligne.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow } from '@/theme/tokens';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { useCommunity, useSocial } from '../store';
import { AvatarPortrait } from './AvatarPortrait';
import { HeadStack, studio } from './kit';
import { Icon } from './icons';
import { unreadConversations } from '../services/inbox';
import { activeNearby } from '../services/feed';
import { useNow } from './ui';
import { CR } from '../routes';

export function CommunityEntry() {
  const t = useTheme();
  const router = useRouter();
  const status = useCommunity((s) => s.status);
  const refreshDemo = useCommunity((s) => s.refreshDemo);
  const { engine, myId } = useSocial();
  const readAt = useCommunity((s) => s.readAt);
  const now = useNow(60000);
  useEffect(() => {
    refreshDemo();
  }, [refreshDemo]);

  const title = 'Communauté';
  let sub = 'Progresse avec des gens comme toi';
  let count = 0;
  let faces: string[] = [];
  if (status === 'active') {
    const pending = engine.pendingFor(myId).length;
    const unread = unreadConversations(engine, myId, readAt).length;
    count = pending + unread;
    const active = activeNearby(engine, myId, now);
    faces = active.slice(0, 3).map((id) => engine.s.profiles[id]?.avatarId ?? '');
    sub =
      count > 0
        ? (unread ? unread + ' réponse' + (unread > 1 ? 's' : '') : '') + (unread && pending ? ' · ' : '') + (pending ? pending + ' demande' + (pending > 1 ? 's' : '') : '')
        : active.length
          ? active.length + ' personne' + (active.length > 1 ? 's' : '') + ' proche' + (active.length > 1 ? 's' : '') + ' de toi en ligne'
          : 'Trouve quelqu’un au même point que toi';
  } else if (status === 'refuse') {
    sub = 'Désactivée · tu peux la rejoindre quand tu veux';
  }

  return (
    <Press accessibilityLabel={title + ', ' + sub} onPress={() => router.push(CR.home)} pressScale={0.98} style={[styles.row, { backgroundColor: t.surf }, shadow.card]}>
      {faces.length ? (
        <HeadStack ids={faces.map((a) => ({ avatarId: a }))} size={38} ring={t.surf} />
      ) : (
        <AvatarPortrait avatarId="moi" size={44} style={{ backgroundColor: studio(t).head }} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={15} weight="bold">{title}</Txt>
        <Txt size={13} color={t.ink2} numberOfLines={1}>{sub}</Txt>
      </View>
      {count > 0 ? (
        <View style={[styles.badge, { backgroundColor: LIME }]}>
          <Txt size={12} weight="bold" color={OBSIDIAN}>{count}</Txt>
        </View>
      ) : (
        <Icon name="chevron" size={18} color={t.ink2} />
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, paddingVertical: 10, paddingLeft: 10, paddingRight: 16 },
  badge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
