/**
 * Confidentialité de la Communauté : même logique (exposition minimale par défaut), présentée en trois groupes simples.
 * Ce qui n'est jamais partagé (poids, calories, mensurations, photo, adresse, position, santé) n'a pas d'interrupteur :
 * ces données ne font pas partie du profil social.
 */
import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, RED, shadow } from '@/theme/tokens';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { useGame } from '@/store/useGame';
import { useCommunity, useSocial, COMMUNITY_MODE } from '@/community/store';
import type { PrivacySettings, Visibility } from '@/community/models/types';
import { Choice, Head, Toggle, TopBar } from '@/community/components/kit';
import { Icon } from '@/community/components/icons';
import type { IconName } from '@/community/components/icons';
import { CR } from '@/community/routes';

const AVATAR: { id: Visibility; label: string; icon: IconName }[] = [
  { id: 'moi', label: 'Moi seulement', icon: 'lock' },
  { id: 'amis', label: 'Amis', icon: 'users' },
  { id: 'public', label: 'Tout le monde', icon: 'globe' },
];
const MSG: { id: PrivacySettings['allowMessages']; label: string; icon: IconName }[] = [
  { id: 'tous', label: 'Tout le monde', icon: 'globe' },
  { id: 'amis', label: 'Mes amis', icon: 'users' },
  { id: 'personne', label: 'Personne', icon: 'ban' },
];

function Group({ icon, title, sub, children }: { icon: IconName; title: string; sub?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
        <Icon name={icon} size={19} color={t.ink} />
        <View style={{ flex: 1 }}>
          <Display size={18}>{title}</Display>
          {sub ? <Txt size={12.5} color={t.ink2}>{sub}</Txt> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

export default function PrivacyScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { engine, myId, me } = useSocial();
  const update = useCommunity((s) => s.updatePrivacy);
  const unblock = useCommunity((s) => s.unblock);
  const leave = useCommunity((s) => s.leave);
  const [more, setMore] = useState(false);
  const say = useGame.getState().say;
  if (!me) return null;
  const p = me.privacy;
  const blocked = engine.s.blocks.filter((b) => b.blockerId === myId);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TopBar title="Confidentialité" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: insets.bottom + 36, gap: 24 }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(280)} style={[styles.hero, { backgroundColor: t.strong }, shadow.md]}>
          <View style={[styles.lock, { backgroundColor: LIME }]}>
            <Icon name="lock" size={22} color="#1C1D1F" strokeWidth={2.2} />
          </View>
          <Display size={21} color={t.strongInk} lineHeight={25}>Tes données santé ne sont jamais publiques.</Display>
          <Txt size={13.5} lineHeight={19} color={t.strongInk2}>
            Poids, calories, mensurations, photos, adresse et position ne font pas partie de ton profil social. Les autres voient ton avatar.
          </Txt>
        </Animated.View>

        <Group icon="user" title="Mon profil">
          <View style={[styles.card, { backgroundColor: t.surf }, shadow.card]}>
            <Toggle on={p.allowFitMatch} onPress={() => update({ allowFitMatch: !p.allowFitMatch })} label="Apparaître dans FitMatch" hint="Être présenté à des personnes au même point que toi." />
            <View style={[styles.sep, { backgroundColor: t.line }]} />
            <Toggle on={p.showAge} onPress={() => update({ showAge: !p.showAge })} label="Montrer mon âge" hint="Ta tranche d’âge seulement, jamais ta date de naissance." />
            <View style={[styles.sep, { backgroundColor: t.line }]} />
            <Toggle on={p.showCountry} onPress={() => update({ showCountry: !p.showCountry })} label="Montrer mon pays" hint="Jamais ta ville ni ta position." />
            {more ? (
              <Animated.View entering={FadeIn.duration(200)}>
                <View style={[styles.sep, { backgroundColor: t.line }]} />
                <Toggle on={p.showGoal} onPress={() => update({ showGoal: !p.showGoal })} label="Montrer mon objectif" hint="Par exemple « Perdre du poids », jamais un chiffre." />
                <View style={[styles.sep, { backgroundColor: t.line }]} />
                <Toggle on={p.profileVisible} onPress={() => update({ profileVisible: !p.profileVisible })} label="Profil visible hors amis" hint="Sinon, seuls tes amis voient ton profil." />
              </Animated.View>
            ) : null}
            <Press onPress={() => setMore(!more)} accessibilityRole="button" accessibilityState={{ expanded: more }} style={[styles.more, { borderTopColor: t.line }]}>
              <Txt size={13.5} weight="semibold" color={t.ink2}>{more ? 'Moins d’options' : 'Plus d’options'}</Txt>
              <View style={{ transform: [{ rotate: more ? '180deg' : '0deg' }] }}>
                <Icon name="chevronDown" size={16} color={t.ink2} />
              </View>
            </Press>
          </View>
        </Group>

        <Group icon="eye" title="Mon avatar" sub="Qui voit l’évolution de ton avatar">
          <Choice value={p.bodyProgress} options={AVATAR} onChange={(v) => update({ bodyProgress: v })} />
        </Group>

        <Group icon="chat" title="Messages" sub="Qui peut t’écrire en premier">
          <Choice value={p.allowMessages} options={MSG} onChange={(v) => update({ allowMessages: v })} />
          <Txt size={12.5} color={t.ink2} style={{ paddingHorizontal: 4 }}>
            Dans tous les cas : 2 messages au plus avant une réponse, pas de numéro de téléphone au premier échange.
          </Txt>
        </Group>

        {blocked.length > 0 ? (
          <Group icon="ban" title="Personnes bloquées">
            <View style={[styles.card, { backgroundColor: t.surf }, shadow.card]}>
              {blocked.map((b, i) => {
                const prof = engine.s.profiles[b.blockedId];
                return (
                  <View key={b.blockedId} style={[styles.blockRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
                    {prof ? <Head avatarId={prof.avatarId} size={38} /> : null}
                    <Txt size={15} weight="semibold" style={{ flex: 1 }}>{prof?.displayName ?? 'Membre'}</Txt>
                    <Press onPress={() => unblock(b.blockedId)} style={[styles.small, { backgroundColor: t.bg }]}>
                      <Txt size={13} weight="bold">Débloquer</Txt>
                    </Press>
                  </View>
                );
              })}
            </View>
          </Group>
        ) : null}

        <View style={[styles.state, { borderColor: t.line }]}>
          <Icon name="info" size={16} color={t.ink2} />
          <Txt size={12.5} lineHeight={17} color={t.ink2} style={{ flex: 1 }}>
            {COMMUNITY_MODE === 'local-demo'
              ? 'Version d’essai : tes réglages restent sur ce téléphone et les autres membres sont des profils de démonstration. Rien n’est encore envoyé sur Internet.'
              : 'Tes réglages sont synchronisés avec ton compte.'}
          </Txt>
        </View>

        <Press
          onPress={() => {
            leave();
            say('Tu as quitté la Communauté. Ton profil est masqué.');
            router.replace(CR.tabs);
          }}
          style={styles.leave}
        >
          <Txt size={14.5} weight="bold" color={RED}>Quitter la Communauté</Txt>
        </Press>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 28, padding: 18, gap: 10 },
  lock: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  card: { borderRadius: 24, overflow: 'hidden' },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 14 },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 44, borderTopWidth: StyleSheet.hairlineWidth },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  small: { paddingHorizontal: 12, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  state: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 18, padding: 13 },
  leave: { height: 50, alignItems: 'center', justifyContent: 'center' },
});
