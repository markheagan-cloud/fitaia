import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, alert, shadow } from '@/theme/tokens';
import { CUR_NAMES, PACKS, PASS_PRICE, RARITY, RarityKey, SKINS, fmt } from '@/data/content';
import { SEASON, seasonProgress } from '@/store/economy';
import { useGame } from '@/store/useGame';
import { Screen, Row } from '@/components/Screen';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CoinIcon, GoldIcon } from '@/components/Icons';
import { purchasesAvailable } from '@/services/purchases';

const RARITIES: RarityKey[] = ['commune', 'rare', 'epique', 'legendaire'];

export default function Boutique() {
  const t = useTheme();
  const router = useRouter();
  const a = alert(t);
  const { owned, equipped, pass, skinAct, buyPack, buyPass } = useGame();
  const history = useGame((s) => s.history);
  const plus = useGame((s) => s.plus);
  const season = seasonProgress(history);

  return (
    <Screen name="shop">
      {/* Pass de saison */}
      <View accessibilityLabel="Pass de saison" style={[styles.pass, shadow.xl]}>
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
          La voie gratuite donne des {CUR_NAMES[0]} et des tenues communes. La voie Élite ajoute 2 tenues légendaires animées et te rend 1 200 {CUR_NAMES[1]} au fil des paliers.
        </Txt>
        <Press haptic="medium" onPress={buyPass} disabled={pass} style={[styles.passBtn, { backgroundColor: pass ? '#5A5D63' : LIME }, shadow.btn]}>
          <Txt size={15} weight="bold" num color={OBSIDIAN}>{pass ? 'Pass Élite actif' : 'Passer Élite pour ' + fmt(PASS_PRICE) + ' ' + CUR_NAMES[1]}</Txt>
        </Press>
      </View>
      <Press onPress={() => router.push('/paywall')} pressScale={0.98} style={[styles.plusRow, { backgroundColor: t.surf, borderColor: t.line }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={14} weight="bold">{plus ? 'FITAIA Plus actif' : 'FITAIA Plus'}</Txt>
          <Txt size={12} color={t.ink2}>{plus ? 'Tenues légendaires, dessin HD, 550 FIT Points par mois' : 'Tenues légendaires, dessin HD de ton perso, 550 FIT Points par mois'}</Txt>
        </View>
        <Txt size={13} weight="semibold" color={t.ink2}>{plus ? 'Gérer' : 'Voir'}</Txt>
      </Press>

      {/* Tenues */}
      <Row>
        <Txt size={15} weight="bold">Tenues</Txt>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 4 }}>
        {RARITIES.map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: RARITY[k].c }} />
            <Txt size={12} color={t.ink2}>
              {RARITY[k].label + (k === 'epique' || k === 'legendaire' ? ', en ' + CUR_NAMES[1] : ', en ' + CUR_NAMES[0])}
            </Txt>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {SKINS.map((sk) => {
          const r = RARITY[sk.rarity];
          const isOwned = owned.indexOf(sk.id) >= 0;
          const eq = equipped === sk.id;
          const showPrice = !eq && !isOwned && sk.price > 0;
          const cta = eq ? 'Équipée' : isOwned ? 'Équiper' : sk.price === 0 ? 'Gratuite' : fmt(sk.price) + ' ' + (sk.cur === 'earn' ? CUR_NAMES[0] : CUR_NAMES[1]);
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
                  {showPrice ? (sk.cur === 'earn' ? <CoinIcon size={13} /> : <GoldIcon size={14} />) : null}
                  <Txt size={13} weight="semibold" num color={eq ? a.limeInk : t.ink} numberOfLines={1}>{showPrice ? fmt(sk.price) : cta}</Txt>
                </View>
              </View>
            </Press>
          );
        })}
      </View>

      {/* Recharge : seulement avec de vrais achats intégrés (RevenueCat), jamais de paiement simulé */}
      {purchasesAvailable() ? (<>
      <Row>
        <Txt size={15} weight="bold">Recharger en {CUR_NAMES[1]}</Txt>
        <Txt size={12} color={t.ink2}>Paiement Apple</Txt>
      </Row>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PACKS.map((pk) => (
          <Press
            key={pk.n}
            accessibilityLabel={pk.amount + ' ' + CUR_NAMES[1] + ' pour ' + pk.price}
            onPress={() => buyPack(pk.n, pk.amount)}
            pressScale={0.97}
            style={[styles.pack, { backgroundColor: t.surf, borderColor: pk.n === 550 ? t.ink : 'transparent' }, shadow.btn]}
          >
            <Display size={19} num letterSpacing={-0.6}>{pk.amount}</Display>
            <Txt size={13} color={t.ink2}>{pk.price}</Txt>
            <Txt size={11} weight="bold" color={a.limeInk} style={{ height: 14 }}>{pk.tag}</Txt>
          </Press>
        ))}
      </View>
      </>) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  plusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14 },
  pass: { borderRadius: 30, padding: 18, gap: 12, overflow: 'hidden', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  passBtn: { height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  skin: { width: '48%', flexGrow: 1, borderRadius: 24, borderWidth: 2, padding: 6, gap: 8 },
  skinImgWrap: { height: 164, borderRadius: 18, overflow: 'hidden', backgroundColor: '#DAD7D1' },
  skinImg: { width: '100%', height: 164 },
  skinBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4 },
  pack: { flex: 1, borderRadius: 20, borderWidth: 2, paddingTop: 14, paddingBottom: 12, paddingHorizontal: 4, alignItems: 'center', gap: 3 },
});
