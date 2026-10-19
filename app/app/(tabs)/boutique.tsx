import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, alert, shadow } from '@/theme/tokens';
import { CUR_NAMES, RARITY, RarityKey, SKINS, fmt } from '@/data/content';
import { SEASON, seasonProgress } from '@/store/economy';
import { useGame } from '@/store/useGame';
import { Screen, Row } from '@/components/Screen';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CoinIcon } from '@/components/Icons';

const RARITIES: RarityKey[] = ['commune', 'rare', 'epique', 'legendaire'];

export default function Boutique() {
  const t = useTheme();
  const a = alert(t);
  const { owned, equipped, skinAct } = useGame();
  const history = useGame((s) => s.history);
  const season = seasonProgress(history);

  return (
    <Screen name="shop">
      {/* Saison : progression gratuite, rien à payer */}
      <View accessibilityLabel="Saison" style={[styles.pass, shadow.xl]}>
        <LinearGradient colors={[OBSIDIAN, '#242628']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Txt size={13} weight="semibold" color={LIME}>{SEASON.name}</Txt>
          <Txt size={12} num color="#9EA2AA">{season.daysLeft > 0 ? 'fin dans ' + season.daysLeft + ' jour' + (season.daysLeft > 1 ? 's' : '') : 'saison terminée'}</Txt>
        </View>
        <Display size={24} num color="#F5F4F1">Palier {season.tier} sur {SEASON.tiers}</Display>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {Array.from({ length: 10 }, (_, i) => (
            <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: (i + 1) * 5 <= season.tier ? LIME : i * 5 < season.tier ? '#7C8A4A' : '#34373C' }} />
          ))}
        </View>
        <Txt size={12} num color="#9EA2AA">{fmt(season.earned)} {CUR_NAMES[0]} gagnés cette saison · prochain palier dans {fmt(season.toNext)}</Txt>
        <Txt size={13} lineHeight={19} color="#B7BBC2">
          Tout le jeu est gratuit : défis, niveaux et récompenses ne s’achètent pas. Seules quelques tenues se vendent, pour le style.
        </Txt>
      </View>

      {/* Tenues */}
      <Row>
        <Txt size={15} weight="bold">Tenues</Txt>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 4 }}>
        {RARITIES.map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: RARITY[k].c }} />
            <Txt size={12} color={t.ink2}>
              {RARITY[k].label + (k === 'epique' || k === 'legendaire' ? ', App Store' : ', en ' + CUR_NAMES[0])}
            </Txt>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {SKINS.map((sk) => {
          const r = RARITY[sk.rarity];
          const isOwned = owned.indexOf(sk.id) >= 0;
          const eq = equipped === sk.id;
          const store = sk.cur === 'store';
          const showPrice = !eq && !isOwned && !store && sk.price > 0;
          const cta = eq ? 'Équipée' : isOwned ? 'Équiper' : store ? 'Bientôt' : sk.price === 0 ? 'Gratuite' : fmt(sk.price) + ' ' + CUR_NAMES[0];
          return (
            <Press
              key={sk.id}
              accessibilityLabel={sk.name + ', ' + r.label + ', ' + cta}
              onPress={() => skinAct(sk)}
              pressScale={0.97}
              style={[styles.skin, { backgroundColor: t.surf, borderColor: eq ? LIME : 'transparent' }, shadow.card]}
            >
              <View style={styles.skinImgWrap}>
                <Image source={sk.img} style={styles.skinImg} resizeMode="cover" />
                <View style={[styles.skinBar, { backgroundColor: r.c }]} />
              </View>
              <View style={{ gap: 2, paddingHorizontal: 6, paddingBottom: 6 }}>
                <Txt size={14} weight="bold">{sk.name}</Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Txt size={12} weight="medium" color={t.ink2} numberOfLines={1} style={{ flexShrink: 1 }}>{r.label}</Txt>
                  <View style={{ flexGrow: 1, minWidth: 4 }} />
                  {showPrice ? <CoinIcon size={13} /> : null}
                  <Txt size={13} weight="semibold" num color={eq ? a.limeInk : t.ink} numberOfLines={1}>{showPrice ? fmt(sk.price) : cta}</Txt>
                </View>
              </View>
            </Press>
          );
        })}
      </View>

    </Screen>
  );
}

const styles = StyleSheet.create({
  pass: { borderRadius: 30, padding: 18, gap: 12, overflow: 'hidden', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  skin: { width: '48%', flexGrow: 1, borderRadius: 24, borderWidth: 2, padding: 6, gap: 8 },
  skinImgWrap: { height: 164, borderRadius: 18, overflow: 'hidden', backgroundColor: '#DAD7D1' },
  skinImg: { width: '100%', height: 164 },
  skinBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4 },
});
