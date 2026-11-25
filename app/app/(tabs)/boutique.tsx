import React, { useMemo, useState } from 'react';
import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, alert, shadow } from '@/theme/tokens';
import { CUR_NAMES, RARITY, RarityKey, fmt } from '@/data/content';
import { useGame } from '@/store/useGame';
import { useEco } from '@/store/useEco';
import { displayableOutfits, skinOf } from '@/avatar/outfits';
import { useAvatarBase } from '@/avatar/HeroAvatar';
import { caricatureConfigured } from '@/services/caricature';
import { buildParcours } from '@/progression/parcours';
import { STAGES } from '@/progression/progressionRules';
import type { CosmeticItem, Rarity } from '@/inventory/types';
import { Screen, Row } from '@/components/Screen';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CoinIcon } from '@/components/Icons';

const RARITIES: RarityKey[] = ['commune', 'rare', 'epique', 'legendaire'];
const RARITY_KEY: Record<Rarity, RarityKey> = { COMMON: 'commune', RARE: 'rare', EPIC: 'epique', LEGENDARY: 'legendaire' };

export default function Boutique() {
  const t = useTheme();
  const a = alert(t);
  const say = useGame((s) => s.say);
  const { ready, error, account, statuses, catalog, inventory, wallet, buy, equip } = useEco();
  // tenues dessinées sur le perso de la personne (selfie) : c'est elles qu'on montre, pas un mannequin
  const base = useAvatarBase();
  const caricature = useGame((s) => s.caricature);
  const mine = caricature && caricature.base === base ? caricature.outfits : undefined;
  const [busy, setBusy] = useState<string | null>(null);
  const outfits = useMemo(() => displayableOutfits(catalog), [catalog]);
  const parcours = useMemo(() => (account ? buildParcours(account, statuses, STAGES, catalog) : null), [account, statuses, catalog]);
  const balance = wallet?.balance ?? 0;

  const act = async (item: CosmeticItem) => {
    if (busy) return;
    const owned = inventory?.items.some((i) => i.itemId === item.id) ?? false;
    if (inventory?.equipped.FULL_OUTFIT === item.id) return say(item.name + ' est déjà sur ton perso', 'ok');
    if (!owned && item.source === 'STORE') return say(item.name + ' arrive avec les achats App Store', 'bad');
    if (!owned && item.priceFitcoins === null) return say(item.name + ' se gagne, elle ne s’achète pas', 'bad');
    if (!owned && item.priceFitcoins !== null && balance < item.priceFitcoins) return say('Il te manque ' + fmt(item.priceFitcoins - balance) + ' ' + CUR_NAMES[0] + '. Fais tes défis du jour.', 'bad');
    setBusy(item.id);
    try {
      const r = owned ? await equip(item.id) : await buy(item.id);
      say(r.ok ? item.name + (owned ? ' équipée' : ' débloquée et équipée') : r.message, r.ok ? 'ok' : 'bad');
    } catch {
      say('Action impossible pour le moment, réessaie', 'bad');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen name="shop">
      {/* Parcours FITAIA : progression gratuite, rien à payer */}
      <View accessibilityLabel="Parcours FITAIA" style={[styles.pass, shadow.xl]}>
        <LinearGradient colors={[OBSIDIAN, '#242628']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Txt size={13} weight="semibold" color={LIME}>Parcours FITAIA</Txt>
          <Txt size={12} num color="#9EA2AA">{parcours ? fmt(parcours.lifetimePoints) + ' PF' : ''}</Txt>
        </View>
        <Display size={24} color="#F5F4F1">{parcours ? 'Étape ' + parcours.stage.label : error ? 'Parcours indisponible' : 'Chargement…'}</Display>
        <View style={[styles.track, { backgroundColor: '#34373C' }]}>
          <View style={{ width: `${Math.round((parcours?.stageProgress ?? 0) * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: LIME }} />
        </View>
        {parcours ? (
          <Txt size={12} num color="#9EA2AA">
            {parcours.nextStage ? 'Encore ' + fmt(parcours.pointsToNextStage ?? 0) + ' PF avant ' + parcours.nextStage.label : 'Dernière étape atteinte'}
            {parcours.upcoming[0]?.kind === 'reward' ? ' · prochain palier : ' + parcours.upcoming[0].label + ' à ' + fmt(parcours.upcoming[0].atPoints) + ' PF' : ''}
          </Txt>
        ) : null}
        <Txt size={13} lineHeight={19} color="#B7BBC2">
          Défis, niveaux et récompenses sont gratuits. Chaque tenue est dessinée sur ton perso, avec ta tête. Les éditions spéciales se débloquent avec tes Fitcoins.
        </Txt>
      </View>

      {/* Tenues */}
      <Row>
        <Txt size={15} weight="bold">Tenues</Txt>
        {!ready && !error ? <ActivityIndicator size="small" color={t.ink2} /> : null}
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 4 }}>
        {RARITIES.map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: RARITY[k].c }} />
            <Txt size={12} color={t.ink2}>
              {RARITY[k].label + (k === 'epique' || k === 'legendaire' ? ', édition spéciale' : '')}
            </Txt>
          </View>
        ))}
      </View>
      {error ? <Txt size={13} color={t.ink2} style={{ paddingHorizontal: 4 }}>La boutique ne s’est pas chargée. Ferme et rouvre l’app.</Txt> : null}
      <View style={styles.grid}>
        {outfits.map((item) => {
          const sk = skinOf(item.id);
          if (!sk) return null;
          const r = RARITY[RARITY_KEY[item.rarity]];
          const isOwned = inventory?.items.some((i) => i.itemId === item.id) ?? false;
          const eq = inventory?.equipped.FULL_OUTFIT === item.id;
          const price = item.priceFitcoins;
          const showPrice = !eq && !isOwned && price !== null;
          const special = item.source === 'LIMITED' || item.source === 'STORE';
          const cta = eq ? 'Équipée' : isOwned ? 'Équiper' : item.source === 'STORE' ? 'Bientôt' : price === null ? 'Récompense' : fmt(price) + ' ' + CUR_NAMES[0];
          return (
            <LinearGradient
              key={item.id}
              colors={eq ? [LIME, LIME] : special ? ['#FF4FA3', '#FFC93C', '#27E0D0'] : ['transparent', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.frame, special && !eq ? styles.glow : null]}
            >
            <Press
              accessibilityLabel={item.name + ', ' + r.label + ', ' + cta}
              onPress={() => act(item)}
              disabled={busy !== null}
              pressScale={0.97}
              style={[styles.skin, { backgroundColor: t.surf, opacity: busy && busy !== item.id ? 0.6 : 1 }, shadow.card]}
            >
              <View style={styles.skinImgWrap}>
                {mine?.[sk.id] ? (
                  <Image source={{ uri: mine[sk.id] }} style={styles.skinImg} resizeMode="cover" />
                ) : caricatureConfigured ? (
                  <LinearGradient colors={[r.c, OBSIDIAN]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.skinImg, { alignItems: 'center', justifyContent: 'center', padding: 12 }]}>
                    <Txt size={12} weight="semibold" color="#F5F4F1" style={{ textAlign: 'center' }}>{caricature ? 'Redessine ton perso pour l’essayer' : 'Se dessine sur ton perso…'}</Txt>
                  </LinearGradient>
                ) : (
                  <Image source={sk.img} style={styles.skinImg} resizeMode="cover" />
                )}
                <View style={[styles.skinBar, { backgroundColor: r.c }]} />
                {special ? (
                  <LinearGradient colors={['#FF4FA3', '#FFC93C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.badge}>
                    <Txt size={10} weight="bold" color={OBSIDIAN}>ÉDITION SPÉCIALE</Txt>
                  </LinearGradient>
                ) : null}
                {eq ? (
                  <View style={[styles.badge, { left: undefined, right: 8, backgroundColor: LIME }]}>
                    <Txt size={10} weight="bold" color={OBSIDIAN}>PORTÉE</Txt>
                  </View>
                ) : null}
              </View>
              <View style={{ gap: 2, paddingHorizontal: 6, paddingBottom: 6 }}>
                <Txt size={14} weight="bold">{item.name}</Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Txt size={12} weight="medium" color={t.ink2} numberOfLines={1} style={{ flexShrink: 1 }}>{r.label}</Txt>
                  <View style={{ flexGrow: 1, minWidth: 4 }} />
                  {busy === item.id ? <ActivityIndicator size="small" color={t.ink2} /> : showPrice ? <CoinIcon size={13} /> : null}
                  <Txt size={13} weight="semibold" num color={eq ? a.limeInk : t.ink} numberOfLines={1}>{showPrice ? fmt(price) : cta}</Txt>
                </View>
                {special && !isOwned ? <Txt size={11} color={t.ink2}>Achat en euros : bientôt sur l’App Store</Txt> : null}
              </View>
            </Press>
            </LinearGradient>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pass: { borderRadius: 30, padding: 18, gap: 12, overflow: 'hidden', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  frame: { width: '48%', flexGrow: 1, borderRadius: 26, padding: 2.5 },
  glow: { shadowColor: '#FF4FA3', shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  skin: { flex: 1, borderRadius: 24, padding: 6, gap: 8 },
  badge: { position: 'absolute', left: 8, top: 8, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 8 },
  skinImgWrap: { height: 190, borderRadius: 18, overflow: 'hidden', backgroundColor: '#DAD7D1' },
  skinImg: { width: '100%', height: 190 },
  skinBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4 },
});
