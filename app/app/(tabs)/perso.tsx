import { caricatureConfigured } from '@/services/caricature';
import React, { useState } from 'react';
import { View, StyleSheet, Image, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow, screenAccent } from '@/theme/tokens';
import { useBody, useGame } from '@/store/useGame';
import { useEquippedSkin } from '@/avatar/outfits';
import { transactionLabel, useEco } from '@/store/useEco';
import { Bar } from '@/fx/Bar';
import { WeightSheet, ProfileSheet } from '@/components/BodySheets';
import { HeroAvatar, useHeroSource, useHeroStage } from '@/avatar/HeroAvatar';
import { BODY_STAGES } from '@/avatar/bodyStages';
import { fmt, fmtKg } from '@/data/content';
import { Screen, Card } from '@/components/Screen';
import { Press } from '@/components/Press';
import { useSound } from '@/services/sound';
import { connectWatch, useWatch, watchSupported } from '@/services/watch';
import { Txt } from '@/components/Txt';
import { CoinIcon } from '@/components/Icons';
import { previewImage } from '@/data/character';

export default function Perso() {
  const t = useTheme();
  const sound = useSound();
  const watch = useWatch();
  const [watchNote, setWatchNote] = useState('');
  const router = useRouter();
  const { width } = useWindowDimensions();
  const heroW = Math.max(0, width - 32 - 8 - 96);
  const ledger = useEco((s) => s.transactions);
  const catalog = useEco((s) => s.catalog);
  const skin = useEquippedSkin();
  const avatar = useGame((s) => s.avatar);
  const sheet = useGame((s) => s.character);
  const goal = useGame((s) => s.goal);
  const recent = ledger.slice(0, 5);
  const body = useBody();
  const [weightOpen, setWeightOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const tier = body.tier;
  const stage = useHeroStage();
  const hero = useHeroSource();
  const goalPortraitUri = useGame((s) => s.avatar3d?.goalPortraitUri ?? null);
  const caricatureGoal = useGame((s) => s.caricature?.bodies.athletique ?? null);
  // avatar personnel : le prochain palier montre SON corps à l'objectif, jamais le héros générique
  const goalPortrait = hero.personal ? caricatureGoal ?? goalPortraitUri : null;

  const stats = [
    { name: 'Force', lvl: body.stats.force.level, pct: body.stats.force.pct },
    { name: 'Forme', lvl: body.stats.forme.level, pct: body.stats.forme.pct },
    { name: 'Énergie', lvl: body.stats.energie.level, pct: body.stats.energie.pct },
    { name: 'Discipline', lvl: body.stats.discipline.level, pct: body.stats.discipline.pct },
  ];

  return (
    <Screen name="perso">
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <Press onPress={() => router.push(caricatureConfigured ? '/creator' : '/corps')} pressScale={0.98} accessibilityLabel={caricatureConfigured ? 'Mon perso' : 'Voir mon corps en 3D'} style={[styles.heroWrap, shadow.lg]}>
          <HeroAvatar width={heroW} height={300} />
          <View style={styles.tag}>
            <Txt size={12} weight="semibold" color="#F5F4F1">{tier.reached ? 'Objectif atteint' : 'Aujourd’hui, palier ' + tier.current}</Txt>
          </View>
          {caricatureConfigured ? null : (
            <View style={styles.tag3d}>
              <Txt size={12} weight="bold" color={OBSIDIAN}>3D</Txt>
            </View>
          )}
        </Press>
        <View style={[styles.next, { backgroundColor: t.surf, borderColor: t.line }, shadow.md]}>
          <Image source={goalPortrait ? { uri: goalPortrait } : caricatureConfigured ? hero.source : avatar && avatar.outfit === skin.id ? { uri: avatar.uri } : stage !== null ? BODY_STAGES[Math.min(2, stage + 1)].img : previewImage(sheet)} accessibilityLabel="Prochain palier" style={{ width: 64, height: 86, borderRadius: 14, opacity: goalPortrait || stage !== null ? 0.6 : 0.35 }} resizeMode="cover" />
          <Txt size={12} weight="semibold" num color={t.ink2} lineHeight={16} style={{ textAlign: 'center' }}>
            {tier.reached ? 'Niveau ' + body.level : 'Palier ' + Math.min(5, tier.current + 1) + '\n' + 'dans ' + fmtKg(tier.toNext) + ' kg'}
          </Txt>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 2 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.step, i < (tier.reached ? 5 : tier.current) ? { backgroundColor: t.ink } : { backgroundColor: t.track, opacity: 0.5 }]} />
        ))}
      </View>

      <Press onPress={() => setWeightOpen(true)} pressScale={0.98} accessibilityLabel="Enregistrer mon poids" style={[styles.weights, { backgroundColor: t.surf }, shadow.card]}>
        {[
          ['Départ', fmtKg(body.profile.startKg) + ' kg'],
          ['Aujourd’hui', fmtKg(body.now) + ' kg'],
          ['Objectif', fmtKg(body.profile.targetKg) + ' kg'],
        ].map(([k, v]) => (
          <View key={k} style={{ flex: 1 }}>
            <Txt size={12} color={t.ink2}>{k}</Txt>
            <Txt size={18} weight="bold" num>{v}</Txt>
          </View>
        ))}
        <View style={[styles.plus, { backgroundColor: t.ink }]}>
          <Txt size={18} weight="bold" color={t.bg} lineHeight={20}>+</Txt>
        </View>
      </Press>
      <Txt size={12} color={t.ink2} style={{ paddingHorizontal: 4, marginTop: -6 }}>
        {body.weights.length ? 'Dernière pesée : ' + body.weights[body.weights.length - 1].day.split('-').reverse().slice(0, 2).join('/') + ' · ' : 'Appuie pour ta première pesée · '}
        budget {fmt(goal)} kcal{body.profile.autoGoal ? ' (calculé)' : ''}
      </Txt>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {stats.map((st) => (
          <View key={st.name} style={[styles.stat, { backgroundColor: t.surf }, shadow.sm]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt size={14} weight="bold">{st.name}</Txt>
              <Txt size={14} num color={t.ink2}>niv. {st.lvl}</Txt>
            </View>
            <Bar pct={st.pct / 100} color={t.ink} track={t.track} height={4} />
          </View>
        ))}
      </View>

      <Card style={{ gap: 10 }}>
        <Txt size={16} weight="bold" color={screenAccent(t, 'perso')}>Son</Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([['music', 'Musique'], ['sfx', 'Bruitages'], ['voice', 'Voix du coach']] as const).map(([k, label]) => {
            const on = sound[k];
            return (
              <Press
                key={k}
                haptic="medium"
                accessibilityState={{ selected: on }}
                onPress={() => sound.set(k, !on)}
                style={{ flex: 1, height: 46, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', borderColor: on ? LIME : t.line, backgroundColor: on ? LIME : 'transparent' }}
              >
                <Txt size={13} weight={on ? 'bold' : 'semibold'} color={on ? OBSIDIAN : t.ink2}>{label}</Txt>
              </Press>
            );
          })}
        </View>
        <Txt size={11} color={t.ink2}>Vert = activé. Le bouton silencieux de l’iPhone coupe musique et bruitages, et ta propre musique n’est jamais coupée.</Txt>
      </Card>

      <Card style={{ gap: 10 }}>
        <Press
          haptic="medium"
          accessibilityRole="switch"
          accessibilityState={{ checked: watch.on }}
          onPress={async () => {
            if (watch.on) {
              watch.setOn(false);
              setWatchNote('');
              return;
            }
            if (!watchSupported) {
              setWatchNote('Disponible sur iPhone, dans la version installée depuis TestFlight ou l’App Store.');
              return;
            }
            const ok = await connectWatch();
            setWatchNote(ok ? '' : 'Santé n’a pas répondu. Réessaie, ou autorise FITAIA dans Réglages › Santé › Accès aux données.');
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', borderColor: watch.on ? LIME : t.line, backgroundColor: watch.on ? LIME : 'transparent' }}>
            {watch.on ? <Txt size={15} weight="bold" color={OBSIDIAN}>✓</Txt> : null}
          </View>
          <Txt size={14} weight="bold" style={{ flex: 1 }}>Montre connectée</Txt>
        </Press>
        <Txt size={11} color={t.ink2}>
          {watchNote || (watch.on
            ? 'Tes pas, calories actives, rythme cardiaque et séances du jour s’affichent sur l’accueil. Si rien n’apparaît, vérifie l’accès dans Réglages › Santé › Accès aux données › FITAIA.'
            : 'Coche pour afficher sur l’accueil ce que ton Apple Watch mesure (pas, calories actives, cœur, séances), via Santé. Lecture seule, rien ne quitte ton iPhone.')}
        </Txt>
      </Card>

      {recent.length ? (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt size={16} weight="bold" color={screenAccent(t, 'perso')}>Derniers mouvements</Txt>
            <Txt size={12} color={t.ink2}>{ledger.length >= 30 ? "30 derniers" : ledger.length + " au total"}</Txt>
          </View>
          {recent.map((e) => {
            const d = new Date(e.createdAt);
            const when = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            return (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, gap: 1 }}>
                  <Txt size={13} weight="semibold" numberOfLines={1}>{transactionLabel(e, catalog)}</Txt>
                  <Txt size={11} color={t.ink2}>{when}</Txt>
                </View>
                <CoinIcon size={12} />
                <Txt size={14} weight="bold" num color={e.amount < 0 ? t.ink2 : t.ink}>{e.amount > 0 ? '+' : ''}{fmt(e.amount)}</Txt>
              </View>
            );
          })}
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Press haptic="medium" onPress={() => router.push('/creator')} style={[styles.selfieBtn, { borderColor: t.line, flex: 1.3 }]}>
          <Txt size={14} weight="semibold">Mon perso</Txt>
        </Press>
        <Press onPress={() => setProfileOpen(true)} style={[styles.selfieBtn, { borderColor: t.line, flex: 1 }]}>
          <Txt size={14} weight="semibold">Mon profil</Txt>
        </Press>
      </View>
      <Press haptic="medium" accessibilityLabel="Mon vestiaire" onPress={() => router.push('/vestiaire')} style={[styles.selfieBtn, { borderColor: t.line }]}>
        <Txt size={14} weight="semibold">Mon vestiaire · m’habiller pièce par pièce</Txt>
      </Press>
      {__DEV__ ? (
        <Press onPress={() => router.push('/human-engine-debug')} style={[styles.selfieBtn, { borderColor: t.line, borderStyle: 'dashed' }]}>
          <Txt size={13} weight="semibold" color={t.ink2}>Labo 3D (interne)</Txt>
        </Press>
      ) : null}
      <WeightSheet visible={weightOpen} onClose={() => setWeightOpen(false)} />
      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroWrap: { flex: 1, height: 300, borderRadius: 28, backgroundColor: '#D6D3CC', overflow: 'hidden' },
  tag3d: { position: 'absolute', right: 10, top: 10, backgroundColor: LIME, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  tag: { position: 'absolute', left: 10, bottom: 10, backgroundColor: 'rgba(28,29,31,0.88)', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 },
  next: { width: 96, height: 220, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 10 },
  step: { flex: 1, height: 5, borderRadius: 9 },
  stat: { width: '48%', flexGrow: 1, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 14, gap: 9 },
  selfieBtn: { height: 52, borderWidth: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  weights: { borderRadius: 24, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center' },
  plus: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
