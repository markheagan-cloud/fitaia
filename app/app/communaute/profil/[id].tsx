/**
 * Profil d'un membre : son avatar en grand dans le studio FITAIA, son étape, quelques repères, son parcours
 * (jamais de poids, de calories ni de mensurations) et sa tenue, dont chaque vêtement raconte une histoire.
 * Uniquement ce que ses réglages de confidentialité autorisent. Signaler / bloquer restent à portée de main.
 */
import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, RED, alert, shadow } from '@/theme/tokens';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { useGame } from '@/store/useGame';
import { useCommunity, useSocial } from '@/community/store';
import { REPORT_REASONS } from '@/community/models/types';
import { compatibility, compatibilityBreakdown } from '@/social/fitmatch/matching';
import { NEED_LINE } from '@/community/models/intentions';
import { journeyLine, profileHighlights, stageTrack } from '@/community/services/highlights';
import type { HighlightId } from '@/community/services/highlights';
import { originLabel, SLOT_LABEL } from '@/community/models/outfit';
import type { Garment } from '@/community/models/outfit';
import { demoLook, demoStats } from '@/community/services/devData';
import { MainButton, useNow } from '@/community/components/ui';
import { Figure, IconButton, Sheet, StatusPill, Studio, Tag, TopBar, studio } from '@/community/components/kit';
import { Icon, NEED_ICON, SLOT_ICON } from '@/community/components/icons';
import type { IconName } from '@/community/components/icons';
import { CompatSheet } from '@/community/components/CompatSheet';
import { AvatarPortrait } from '@/community/components/AvatarPortrait';
import { CR } from '@/community/routes';

const HL_ICON: Record<HighlightId, IconName> = { regulier: 'flame', encouragements: 'heart', defis: 'target' };

export default function MemberProfile() {
  const t = useTheme();
  const c = studio(t);
  const a = alert(t);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: H, width: W } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { engine, myId, me } = useSocial();
  const addFriend = useCommunity((s) => s.addFriend);
  const respond = useCommunity((s) => s.respond);
  const encourage = useCommunity((s) => s.encourage);
  const block = useCommunity((s) => s.block);
  const report = useCommunity((s) => s.report);
  const now = useNow(60000);
  const [garment, setGarment] = useState<Garment | null>(null);
  const [why, setWhy] = useState(false);
  const [addSheet, setAddSheet] = useState(false);
  const [safety, setSafety] = useState(false);
  const [reporting, setReporting] = useState(false);
  const say = useGame.getState().say;

  const card = id ? engine.card(myId, id) : null;
  const other = id ? engine.s.profiles[id] : undefined;
  if (!id || !card || !other || !me) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <TopBar title="Profil" />
        <View style={{ padding: 20, gap: 8 }}>
          <Display size={22}>Profil indisponible</Display>
          <Txt size={14} color={t.ink2}>Cette personne a masqué son profil ou vous ne pouvez plus échanger.</Txt>
        </View>
      </View>
    );
  }

  const f = engine.friendship(myId, id);
  const isFriend = f?.status === 'accepte';
  const fitmate = isFriend && f?.relationshipType === 'fitmate';
  const incoming = f?.status === 'en_attente' && f.userB === myId ? f : null;
  const outgoing = f?.status === 'en_attente' && f.userA === myId;
  const msg = engine.canMessage(myId, id);
  const conv = engine.conversationWith(myId, id);
  const stats = card.demo ? demoStats(id) : null;
  const highlights = profileHighlights({ helpfulness: card.helpfulness, stats });
  const track = stageTrack(other.points, other.highestHistoricalPoints);
  const look = card.demo ? demoLook(id) : null;
  const match = compatibility(me, other, now);
  const breakdown = match.eligible ? compatibilityBreakdown(me, other) : null;
  const online = now - other.lastActiveAt < 15 * 60000;
  const fitmateCount = engine.friends(myId).filter((x) => engine.friendship(myId, x)?.relationshipType === 'fitmate').length;

  const stageH = Math.round(Math.min(520, H * 0.58)) + insets.top;
  const figW = Math.round(Math.min(W * 0.6, (stageH - insets.top - 96) / 1.6));

  const add = (asFitmate: boolean) => {
    setAddSheet(false);
    if (incoming) {
      const r = respond(incoming.id, true);
      return say(r.ok ? 'Vous êtes maintenant amis' : r.reason ?? 'Action impossible', r.ok ? 'ok' : 'bad');
    }
    const r = addFriend(id, asFitmate);
    if (!r.ok) return say(r.reason ?? 'Action impossible', 'bad');
    say(card.demo ? card.displayName + ' a accepté (démonstration)' : asFitmate ? 'Demande de FitMate envoyée' : 'Demande envoyée');
  };
  const cheer = () => {
    const r = encourage(id);
    say(r.ok ? 'Encouragement envoyé à ' + card.displayName : r.reason ?? 'Action impossible', r.ok ? 'ok' : 'bad');
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false} bounces={false}>
        <Studio height={stageH} glowY={0.5} floorY={stageH - 44}>
          <View style={[styles.figure, { bottom: 40 }]}>
            <Figure avatarId={card.avatarId} size={figW} mode="corps" />
          </View>
          <View style={[styles.onStage, { top: insets.top + 60 }]}>
            {card.demo ? <Tag kind="demo" label="Profil de démonstration" style={{ alignSelf: 'flex-start' }} /> : null}
            {card.status ? <StatusPill status={card.status} glass /> : online ? (
              <View style={[styles.online, { backgroundColor: c.glass }]}>
                <View style={[styles.dot, { backgroundColor: LIME }]} />
                <Txt size={12.5} weight="semibold">En ligne</Txt>
              </View>
            ) : null}
          </View>
        </Studio>

        <Animated.View entering={FadeInDown.delay(80).duration(300)} style={[styles.sheet, { backgroundColor: t.bg }]}>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Display size={36} lineHeight={39}>{card.displayName}</Display>
              {fitmate ? (
                <Tag kind="new" label="FitMate" />
              ) : isFriend ? (
                <Tag kind="soon" label="Ami" />
              ) : outgoing ? (
                <Tag kind="demo" label="Demande envoyée" />
              ) : (
                <Press onPress={() => setAddSheet(true)} accessibilityLabel={incoming ? 'Accepter sa demande' : 'Ajouter'} pressScale={0.94} style={[styles.addChip, { borderColor: t.ink }]}>
                  <Icon name="userPlus" size={15} color={t.ink} strokeWidth={2.1} />
                  <Txt size={13} weight="bold">{incoming ? 'Accepter' : 'Ajouter'}</Txt>
                </Press>
              )}
            </View>
            <Txt size={15.5} weight="semibold" color={t.ink2}>{journeyLine(card.stage, card.joinedDays)}</Txt>
          </View>

          {highlights.length ? (
            <View style={[styles.hlRow, { backgroundColor: t.surf }, shadow.card]}>
              {highlights.map((h, i) => (
                <View key={h.id} style={[styles.hl, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.line }]}>
                  <Icon name={HL_ICON[h.id]} size={17} color={t.ink} strokeWidth={2.1} />
                  <Display size={h.id === 'regulier' ? 15 : 20} lineHeight={22} num>{h.value}</Display>
                  <Txt size={11.5} color={t.ink2} numberOfLines={1}>{h.caption}</Txt>
                </View>
              ))}
            </View>
          ) : null}

          {breakdown ? (
            <Press onPress={() => setWhy(true)} pressScale={0.97} accessibilityLabel={'Pourquoi ' + breakdown.score + ' % ?'} style={[styles.score, { backgroundColor: t.strong }]}>
              <Display size={18} color={LIME} num>{breakdown.score} %</Display>
              <Txt size={13.5} weight="semibold" color="#F5F4F1" style={{ flex: 1 }} numberOfLines={1}>de parcours en commun</Txt>
              <Icon name="info" size={18} color="#A2A6AD" strokeWidth={2} />
            </Press>
          ) : null}

          {card.need ? (
            <View style={[styles.need, { backgroundColor: a.goodBg }]}>
              <Icon name={NEED_ICON[card.need]} size={16} color={a.goodInk} strokeWidth={2.1} />
              <Txt size={13.5} weight="semibold" color={a.goodInk} style={{ flex: 1 }}>
                {card.displayName} {NEED_LINE[card.need].replace(' aussi', '')}.
              </Txt>
            </View>
          ) : null}

          {/* Son parcours */}
          <View style={{ gap: 12 }}>
            <Display size={19} style={{ paddingHorizontal: 2 }}>Son parcours</Display>
            <View style={[styles.card, { backgroundColor: t.surf }, shadow.card]}>
              <View style={styles.track}>
                {track.map((s, i) => (
                  <React.Fragment key={s.id}>
                    {i > 0 ? <View style={[styles.link, { backgroundColor: s.state === 'futur' ? t.track : t.ink }]} /> : null}
                    <View style={[styles.stop, s.state === 'actuel' ? { backgroundColor: t.strong, borderColor: LIME, borderWidth: 3, width: 22, height: 22 } : { backgroundColor: s.state === 'passe' ? t.ink : t.track }]} />
                  </React.Fragment>
                ))}
              </View>
              <View style={styles.trackLabels}>
                {track.map((s) => (
                  <Txt key={s.id} size={10.5} weight={s.state === 'actuel' ? 'bold' : 'medium'} color={s.state === 'actuel' ? t.ink : t.ink2} style={{ width: 52, textAlign: 'center' }} numberOfLines={1}>
                    {s.name}
                  </Txt>
                ))}
              </View>
              <View style={[styles.sep, { backgroundColor: t.line }]} />
              {card.goalLabel ? <Line label="Objectif" value={card.goalLabel} /> : null}
              {card.activityLabels.length ? <Line label="Bouge surtout" value={card.activityLabels.join(', ')} /> : null}
              {card.supportLabels.length ? <Line label="Ce qui l’aide" value={card.supportLabels.join(', ').toLowerCase()} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 }}>
                <Icon name={card.showBodyProgress ? 'eye' : 'lock'} size={15} color={t.ink2} />
                <Txt size={12.5} color={t.ink2} style={{ flex: 1 }}>
                  {card.showBodyProgress ? 'Évolution de l’avatar partagée avec toi.' : 'Évolution de l’avatar : privée.'} Jamais de poids ni de calories ici.
                </Txt>
              </View>
            </View>
          </View>

          {/* Sa tenue */}
          {look ? (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 }}>
                <Display size={19}>Sa tenue</Display>
                <Txt size={12.5} color={t.ink2}>Touche un vêtement</Txt>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {look.items.map((g) => (
                  <Press key={g.id} onPress={() => setGarment(g)} pressScale={0.96} accessibilityLabel={g.name + ', ' + originLabel(g)} style={[styles.garment, { backgroundColor: t.surf }, shadow.card]}>
                    <View style={[styles.garmentIcon, { backgroundColor: c.head }]}>
                      <Icon name={SLOT_ICON[g.slot]} size={24} color={t.ink} />
                    </View>
                    <Txt size={13.5} weight="bold" numberOfLines={1}>{g.name}</Txt>
                    <Txt size={11.5} lineHeight={15} color={t.ink2} numberOfLines={2}>{originLabel(g)}</Txt>
                  </Press>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <Press onPress={() => setSafety(true)} pressScale={0.99} style={styles.safetyRow}>
            <Icon name="shield" size={15} color={t.ink2} />
            <Txt size={13} color={t.ink2} style={{ flex: 1 }}>Signaler ou bloquer {card.displayName}</Txt>
            <Icon name="chevron" size={15} color={t.ink2} />
          </Press>
          {!msg.ok ? <Txt size={12.5} color={t.ink2} style={{ paddingHorizontal: 2 }}>{msg.reason}</Txt> : null}
        </Animated.View>
      </ScrollView>

      <TopBar overlay right={<IconButton icon="more" label="Plus d’options" onPress={() => setSafety(true)} variant="glass" size={40} />} />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: t.bg }]}>
        <Press onPress={cheer} accessibilityLabel={'Encourager ' + card.displayName} pressScale={0.95} style={[styles.cheer, { backgroundColor: t.surf }, shadow.sm]}>
          <Icon name="flame" size={20} color={t.ink} strokeWidth={2.1} />
          <Txt size={15} weight="bold">Encourager</Txt>
        </Press>
        <View style={{ flex: 1 }}>
          {msg.ok ? (
            <MainButton label={conv ? 'Écrire' : 'Dire bonjour'} onPress={() => router.push(CR.chat(id))} />
          ) : (
            <MainButton label={incoming ? 'Accepter sa demande' : outgoing ? 'Demande envoyée' : 'Ajouter en ami'} disabled={outgoing || isFriend} onPress={() => setAddSheet(true)} />
          )}
        </View>
      </View>

      <CompatSheet visible={why} onClose={() => setWhy(false)} breakdown={breakdown} name={card.displayName} />

      <Sheet visible={!!garment} onClose={() => setGarment(null)} label={garment?.name ?? 'Vêtement'}>
        {garment ? (
          <>
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
              <View style={[styles.garmentBig, { backgroundColor: c.head }]}>
                <AvatarPortrait avatarId={card.avatarId} size={92} mode="buste" radius={24} style={{ backgroundColor: 'transparent' }} />
                <View style={[styles.slotBadge, { backgroundColor: t.strong, borderColor: t.surf }]}>
                  <Icon name={SLOT_ICON[garment.slot]} size={15} color={LIME} strokeWidth={2} />
                </View>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={12} weight="bold" color={t.ink2}>{SLOT_LABEL[garment.slot]}</Txt>
                <Display size={23}>{garment.name}</Display>
                <Txt size={14.5} weight="bold">{originLabel(garment)}</Txt>
              </View>
            </View>
            <Txt size={15} lineHeight={21} color={t.ink2}>{garment.story}</Txt>
            {look?.demo ? <Tag kind="demo" label="Tenue d’un profil de démonstration" style={{ alignSelf: 'flex-start' }} /> : null}
            <MainButton label="Fermer" ghost onPress={() => setGarment(null)} />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={addSheet} onClose={() => setAddSheet(false)} label="Ajouter">
        <Display size={22}>{incoming ? card.displayName + ' veut t’ajouter' : 'Ajouter ' + card.displayName}</Display>
        <Option icon="userPlus" title="Ajouter en ami" sub="Vous pourrez vous écrire et vous encourager." onPress={() => add(false)} />
        {!incoming ? (
          <Option
            icon="flame"
            title="Proposer d’être FitMates"
            sub={'Un binôme de régularité. Trois au maximum (' + fitmateCount + ' sur 3).'}
            onPress={() => add(true)}
            disabled={fitmateCount >= 3}
          />
        ) : null}
      </Sheet>

      <Sheet visible={safety} onClose={() => { setSafety(false); setReporting(false); }} label="Sécurité">
        <Display size={22}>Sécurité</Display>
        {!reporting ? (
          <>
            <Option icon="info" title="Signaler" sub="Un motif, et on vérifie. Personne ne sait que c’est toi." onPress={() => setReporting(true)} />
            <Option
              icon="ban"
              title={'Bloquer ' + card.displayName}
              sub="Plus de messages ni de suggestions, dans les deux sens."
              danger
              onPress={() => {
                block(id);
                setSafety(false);
                say(card.displayName + ' est bloqué·e');
                router.back();
              }}
            />
          </>
        ) : (
          <View style={{ gap: 8 }}>
            {REPORT_REASONS.map((r) => (
              <Press
                key={r.id}
                onPress={() => {
                  report(id, r.id);
                  setReporting(false);
                  setSafety(false);
                  say('Signalement enregistré. Pour ne plus voir cette personne, bloque-la.');
                }}
                style={[styles.reason, { borderColor: t.line }]}
              >
                <Txt size={14.5} weight="semibold">{r.label}</Txt>
              </Press>
            ))}
          </View>
        )}
      </Sheet>
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Txt size={13} color={t.ink2} style={{ width: 104 }}>{label}</Txt>
      <Txt size={13.5} weight="semibold" style={{ flex: 1 }}>{value}</Txt>
    </View>
  );
}

function Option({ icon, title, sub, onPress, danger, disabled }: { icon: IconName; title: string; sub: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Press onPress={onPress} disabled={disabled} pressScale={0.98} style={[styles.option, { borderColor: t.line }]}>
      <View style={[styles.optionIcon, { backgroundColor: danger ? 'rgba(226,72,61,0.12)' : t.bg }]}>
        <Icon name={icon} size={19} color={danger ? RED : t.ink} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={15} weight="bold" color={danger ? RED : t.ink}>{title}</Txt>
        <Txt size={12.5} color={t.ink2}>{sub}</Txt>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  figure: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  onStage: { position: 'absolute', left: 16, gap: 8 },
  online: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 15 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  sheet: { marginTop: -30, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 22, gap: 18 },
  hlRow: { flexDirection: 'row', borderRadius: 22, paddingVertical: 12 },
  hl: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3, paddingHorizontal: 6 },
  score: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: 17, paddingHorizontal: 14 },
  need: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 },
  card: { borderRadius: 26, padding: 16, gap: 10 },
  track: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 },
  link: { flex: 1, height: 3, borderRadius: 2 },
  stop: { width: 12, height: 12, borderRadius: 11 },
  trackLabels: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -6 },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  garment: { width: 156, borderRadius: 22, padding: 12, gap: 5 },
  garmentIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  garmentBig: { width: 92, height: 92, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  slotBadge: { position: 'absolute', right: -6, bottom: -6, width: 30, height: 30, borderRadius: 15, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  safetyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2, paddingVertical: 6 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, flexDirection: 'row', gap: 10, alignItems: 'center' },
  cheer: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 56, paddingHorizontal: 18, borderRadius: 20 },
  addChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 20, padding: 12 },
  optionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  reason: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
});
