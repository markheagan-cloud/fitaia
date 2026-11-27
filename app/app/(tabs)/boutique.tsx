/**
 * Boutique V2 : la tenue vedette d'abord, sur le perso de la personne ; puis sa progression vers la prochaine tenue,
 * les éditions limitées, les collections (chacune son ambiance) et un « Prochain drop » compact.
 * Même économie qu'avant : mêmes prix, mêmes raretés, mêmes collections, même registre (useEco). Rien n'est simulé.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { OBSIDIAN, RARITY_STYLE, V2, shadow } from '@/theme/tokens';
import { CUR_NAMES, fmt } from '@/data/content';
import { useGame } from '@/store/useGame';
import { useEco } from '@/store/useEco';
import { displayableOutfits, skinOf } from '@/avatar/outfits';
import { caricatureConfigured } from '@/services/caricature';
import type { CosmeticItem, Rarity } from '@/inventory/types';
import { Screen } from '@/components/Screen';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CoinIcon } from '@/components/Icons';
import { COLLECTIONS, CollectionId, UPCOMING, UPCOMING_LABEL, isNew, limitedState, onSale, sheetOf, WINDOWS } from '@/shop/catalogue';
import { KindGlyph, OutfitArt, useMyOutfits } from '@/shop/ShopArt';
import { useWishlist } from '@/shop/useWishlist';
import { daysToAfford, delayOf, inDays, nextEvents } from '@/shop/rythme';
import { usePace } from '@/shop/usePace';
import { dailyEarnable } from '@/economy/dailyEarnings';
import { achatsPossibles, reprendreAchats } from '@/services/achats';
import { Chip, ChipRow, FillBar, RarityTag, RewardTrack, SectionTitle } from '@/ui/kit';

type Tab = 'decouvrir' | 'tenues' | 'limitees' | 'collections' | 'liste';
type Owned = 'tout' | 'a-moi' | 'a-prendre';
const RARITIES: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];

/** Ambiance de chaque collection : une couleur et un fond, pour qu'on les reconnaisse au premier coup d'œil. */
const COLLECTION_LOOK: Record<CollectionId, { c: string; bg: [string, string] }> = {
  essentiels: { c: V2.lime, bg: ['#1A2010', V2.graphite] },
  evasion: { c: '#3DDCCB', bg: ['#0C2321', V2.graphite] },
  arene: { c: '#FF8A4C', bg: ['#2A160C', V2.graphite] },
  neon: { c: '#FF7AB8', bg: ['#2A0F1F', V2.graphite] },
  prestige: { c: V2.gold, bg: ['#2B1F0A', V2.graphite] },
};

export default function Boutique() {
  const t = useTheme();
  const router = useRouter();
  const { ready, error, statuses, catalog, inventory, wallet, grantPaid } = useEco();
  const say = useGame((s) => s.say);
  const mine = useMyOutfits();
  const caricature = useGame((s) => s.caricature);
  const outfits = useMemo(() => displayableOutfits(catalog), [catalog]);
  const balance = wallet?.balance ?? 0;
  const wish = useWishlist((s) => s.ids);
  const [tab, setTab] = useState<Tab>('decouvrir');
  const [rarity, setRarity] = useState<Rarity | null>(null);
  const [owned, setOwned] = useState<Owned>('tout');
  const [cheapFirst, setCheapFirst] = useState(true);
  const [howOpen, setHowOpen] = useState(false);
  const now = new Date();
  // tenues pas encore dessinées sur ce perso (nouvelles tenues) : on les complète en arrière-plan
  const completeMyOutfits = useGame((s) => s.completeMyOutfits);
  useEffect(() => {
    if (caricatureConfigured && caricature) void completeMyOutfits();
  }, [caricature?.id, completeMyOutfits]); // eslint-disable-line react-hooks/exhaustive-deps

  const ownedIds = new Set(inventory?.items.map((i) => i.itemId) ?? []);
  const worn = inventory?.equipped.FULL_OUTFIT;
  const drawn = (i: CosmeticItem) => !!mine?.[skinOf(i.id)?.id ?? ''];
  const buyable = (i: CosmeticItem) => !ownedIds.has(i.id) && i.priceFitcoins !== null && onSale(i.id, now);
  const open = (id: string) => router.push({ pathname: '/article/[id]', params: { id } });

  // Tenue vedette : la plus prestigieuse en vente que la personne n'a pas, de préférence déjà dessinée sur son perso
  const featured = [...outfits.filter(buyable)].sort(
    (a, b) => Number(drawn(b)) - Number(drawn(a)) || Number(!!sheetOf(b.id)?.limited) - Number(!!sheetOf(a.id)?.limited) || (b.priceFitcoins ?? 0) - (a.priceFitcoins ?? 0),
  )[0];

  // Prochaine tenue à portée : la moins chère au-dessus du solde (vrai prix, vrai solde, vrai rythme)
  const goal = outfits.filter(buyable).sort((x, y) => (x.priceFitcoins ?? 0) - (y.priceFitcoins ?? 0)).find((i) => (i.priceFitcoins ?? 0) > balance) ?? outfits.find(buyable);
  const goalPrice = goal?.priceFitcoins ?? 0;
  const { pace, start, doneToday } = usePace();
  const goalDays = goal ? delayOf(daysToAfford(goalPrice, pace.week, start), doneToday) : null;
  const agenda = nextEvents(outfits.filter(buyable).map((i) => ({ id: i.id, name: i.name, price: i.priceFitcoins ?? 0 })), pace, start, 5);
  const today = dailyEarnable(statuses);

  const limited = outfits.filter((i) => sheetOf(i.id)?.limited && (onSale(i.id, now) || ownedIds.has(i.id)));
  const season = WINDOWS.hiver;
  const seasonOpen = limitedState(season, now).open;

  const filtered = outfits
    .filter((i) => (rarity ? i.rarity === rarity : true))
    .filter((i) => (owned === 'a-moi' ? ownedIds.has(i.id) : owned === 'a-prendre' ? !ownedIds.has(i.id) : true))
    .sort((a, b) => ((a.priceFitcoins ?? 0) - (b.priceFitcoins ?? 0)) * (cheapFirst ? 1 : -1));

  const restore = async () => {
    if (!achatsPossibles()) {
      say('Achats en euros disponibles sur l’app iPhone', 'bad');
      return;
    }
    const found = await reprendreAchats((it) => grantPaid(it, false), true);
    say(found.length ? found.length + (found.length > 1 ? ' tenues retrouvées' : ' tenue retrouvée') : 'Aucun achat à restaurer sur ce compte Apple', found.length ? 'ok' : 'bad');
  };

  const card = (i: CosmeticItem, w: number | '100%', h: number) => (
    <OutfitCard key={i.id} item={i} width={w} height={h} owned={ownedIds.has(i.id)} worn={worn === i.id} wished={wish.includes(i.id)} now={now} onPress={() => open(i.id)} />
  );

  const vestiaireBtn = (
    <Press accessibilityLabel="Ouvrir mon vestiaire" onPress={() => router.push('/vestiaire')} haptic="light" style={[styles.headBtn, { backgroundColor: t.strong }]}>
      <Txt size={13} weight="bold" color={V2.violet}>Vestiaire</Txt>
    </Press>
  );

  return (
    <Screen name="shop" subtitle={seasonOpen ? 'Saison 1 · Hiver' : 'Tenues et collections'} right={vestiaireBtn}>
      <ChipRow>
        <Chip label="Découvrir" on={tab === 'decouvrir'} onPress={() => setTab('decouvrir')} />
        <Chip label="Tenues" count={outfits.length} on={tab === 'tenues'} onPress={() => setTab('tenues')} />
        {limited.length ? <Chip label="Éditions limitées" on={tab === 'limitees'} onPress={() => setTab('limitees')} /> : null}
        <Chip label="Collections" on={tab === 'collections'} onPress={() => setTab('collections')} />
        {wish.length ? <Chip label="Ma liste" count={wish.length} on={tab === 'liste'} onPress={() => setTab('liste')} /> : null}
        <Chip label="Mon vestiaire" on={false} onPress={() => router.push('/vestiaire')} />
      </ChipRow>
      {!ready && !error ? <ActivityIndicator size="small" color={t.ink2} /> : null}
      {error ? <Txt size={13} color={t.ink2}>La boutique ne s’est pas chargée. Ferme et rouvre l’app.</Txt> : null}

      {tab === 'decouvrir' ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: 12 }}>
          {featured ? <Featured item={featured} now={now} onPress={() => open(featured.id)} /> : null}

          {/* Ta progression : la prochaine tenue et ce qui tombe, au vrai rythme de la personne */}
          {goal ? (
            <View style={[styles.progress, { backgroundColor: t.surf, borderColor: t.line }]}>
              <Press onPress={() => open(goal.id)} pressScale={0.98} accessibilityLabel={'Ta prochaine tenue : ' + goal.name} style={{ gap: 8 }}>
                <View style={styles.rowBetween}>
                  <Txt size={12} weight="semibold" color={t.ink2}>TA PROCHAINE TENUE</Txt>
                  <Txt size={12} num color={t.ink2}>{fmt(Math.min(balance, goalPrice)) + ' / ' + fmt(goalPrice)}</Txt>
                </View>
                <Txt size={17} weight="bold">{goal.name}</Txt>
                <FillBar pct={balance / Math.max(1, goalPrice)} />
                <Txt size={12} num color={t.ink2}>
                  {balance >= goalPrice ? 'Tu peux la débloquer maintenant.' : 'Encore ' + fmt(goalPrice - balance) + ' ' + CUR_NAMES[0] + ', ' + (pace.mine ? 'à ton rythme ' : 'en jouant chaque jour ') + inDays(goalDays) + '.'}
                </Txt>
              </Press>
              {agenda.length ? (
                <RewardTrack
                  steps={agenda.slice(0, 5).map((e, i) => {
                    const d = delayOf(e.day, doneToday);
                    return { key: String(i), label: e.label, sub: d === 0 ? 'aujourd’hui' : d === 1 ? 'demain' : 'dans ' + d + ' j', done: false, current: i === 0, tone: e.kind === 'palier' ? 'gold' : 'lime' };
                  })}
                />
              ) : null}
              <Press haptic="medium" onPress={() => router.navigate('/(tabs)/defis')} style={styles.earn}>
                <Txt size={14} weight="bold" color={V2.obsidian}>{today > 0 ? 'Gagner +' + today + ' ' + CUR_NAMES[0] + ' aujourd’hui' : 'Gains du jour faits, reviens demain'}</Txt>
              </Press>
            </View>
          ) : null}

          {limited.length ? (
            <>
              <SectionTitle title="Éditions limitées" action="Tout voir" onAction={() => setTab('limitees')} />
              <Rail>{limited.map((i) => card(i, 168, 230))}</Rail>
            </>
          ) : null}

          {COLLECTIONS.map((c) => {
            const items = outfits.filter((i) => sheetOf(i.id)?.collection === c.id && !sheetOf(i.id)?.limited);
            if (!items.length) return null;
            return <CollectionBlock key={c.id} id={c.id} items={items} outfits={outfits} ownedIds={ownedIds} render={(i) => card(i, 140, 190)} />;
          })}

          <NextDrop onOpen={open} />

          <Press onPress={() => setHowOpen((v) => !v)} haptic="none" accessibilityLabel="Comment marche la boutique" style={[styles.how, { borderColor: t.line }]}>
            <View style={styles.rowBetween}>
              <Txt size={14} weight="semibold">Comment marche la boutique</Txt>
              <Txt size={14} color={t.ink2}>{howOpen ? '−' : '+'}</Txt>
            </View>
            {howOpen ? (
              <View style={{ gap: 6, marginTop: 8 }}>
                {[
                  'Chaque tenue est dessinée sur ton perso, avec ta tête : tu la vois sur toi avant de la prendre.',
                  'Pas de coffre ni de tirage : tu choisis, tu sais ce que tu as.',
                  'Tout se débloque avec les Fitcoins gagnés en faisant tes défis.',
                  'Les tenues rares et au-dessus ont aussi un prix fixe en euros. Payer va plus vite, ne donne rien de plus.',
                  'Ce que tu as débloqué reste à toi, même après la fin d’une édition.',
                ].map((l) => (
                  <Txt key={l} size={13} lineHeight={19} color={t.ink2}>{'· ' + l}</Txt>
                ))}
                <Press onPress={restore} accessibilityLabel="Restaurer mes achats" style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
                  <Txt size={13} weight="bold" color={V2.violet}>Restaurer mes achats</Txt>
                </Press>
              </View>
            ) : null}
          </Press>
        </Animated.View>
      ) : null}

      {tab === 'tenues' ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: 10 }}>
          <ChipRow>
            <Chip small label="Toutes" on={rarity === null} onPress={() => setRarity(null)} />
            {RARITIES.map((r) => (
              <Chip key={r} small label={RARITY_STYLE[r].label} on={rarity === r} onPress={() => setRarity(rarity === r ? null : r)} />
            ))}
          </ChipRow>
          <ChipRow>
            <Chip small label="À prendre" on={owned === 'a-prendre'} onPress={() => setOwned(owned === 'a-prendre' ? 'tout' : 'a-prendre')} />
            <Chip small label="À moi" on={owned === 'a-moi'} onPress={() => setOwned(owned === 'a-moi' ? 'tout' : 'a-moi')} />
            <Chip small label={cheapFirst ? 'Prix croissant' : 'Prix décroissant'} on={false} onPress={() => setCheapFirst((v) => !v)} />
          </ChipRow>
          {filtered.length ? <Grid items={filtered} render={card} /> : <Empty text="Aucune tenue avec ces filtres." />}
        </Animated.View>
      ) : null}

      {tab === 'limitees' ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: 10 }}>
          <Txt size={13} lineHeight={19} color={t.ink2}>Chaque édition affiche sa date de fin. Après, elle ne s’achète plus ; si tu l’as, elle reste à toi.</Txt>
          <Grid items={limited} render={card} />
        </Animated.View>
      ) : null}

      {tab === 'collections' ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: 12 }}>
          {COLLECTIONS.map((c) => {
            const items = outfits.filter((i) => sheetOf(i.id)?.collection === c.id);
            if (!items.length) return null;
            return <CollectionBlock key={c.id} id={c.id} items={items} outfits={outfits} ownedIds={ownedIds} render={(i) => card(i, 140, 190)} />;
          })}
        </Animated.View>
      ) : null}

      {tab === 'liste' ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: 10 }}>
          <Grid items={outfits.filter((i) => wish.includes(i.id))} render={card} />
          {UPCOMING.some((u) => wish.includes(u.id)) ? <NextDrop onOpen={open} only={wish} /> : null}
        </Animated.View>
      ) : null}
    </Screen>
  );
}

/** Carte éditoriale : le perso de la personne dans la tenue vedette, éclairé par la couleur de la rareté. */
function Featured({ item, now, onPress }: { item: CosmeticItem; now: Date; onPress: () => void }) {
  const sheet = sheetOf(item.id);
  const r = RARITY_STYLE[item.rarity];
  const lim = sheet?.limited ? limitedState(sheet.limited, now) : null;
  return (
    <Press accessibilityLabel={'Tenue vedette : ' + item.name + ', ' + r.label} onPress={onPress} pressScale={0.985} style={[styles.hero, shadow.xl]}>
      <LinearGradient colors={[r.deep, OBSIDIAN]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.heroGlow, { backgroundColor: r.c, opacity: 0.16 + r.glow * 0.3 }]} />
      <OutfitArt itemId={item.id} rarity={item.rarity} height={430} contain />
      <LinearGradient colors={['transparent', 'rgba(11,13,16,0.55)', 'rgba(11,13,16,0.94)']} locations={[0.45, 0.68, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.heroTop}>
        <View style={[styles.heroPill, { borderColor: r.c }]}>
          <Txt size={10} weight="bold" color={r.c} style={{ letterSpacing: 1 }}>TENUE VEDETTE</Txt>
        </View>
      </View>
      <View style={styles.heroText}>
        <RarityTag rarity={item.rarity} onDark />
        <Display size={30} color={V2.white} numberOfLines={1}>{item.name}</Display>
        <Txt size={13} color="#C9CED6" numberOfLines={1}>{sheet?.tagline}</Txt>
        <View style={[styles.rowBetween, { marginTop: 8 }]}>
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <CoinIcon size={16} />
              <Txt size={18} weight="bold" num color={V2.white}>{fmt(item.priceFitcoins ?? 0)}</Txt>
            </View>
            {lim && lim.open ? <Txt size={11} num color={V2.grey}>{'Jusqu’au ' + lim.untilLabel}</Txt> : null}
          </View>
          <View style={styles.heroCta}>
            <Txt size={14} weight="bold" color={V2.obsidian}>Voir sur moi</Txt>
          </View>
        </View>
      </View>
    </Press>
  );
}

function OutfitCard({ item, width, height, owned, worn, wished, now, onPress }: { item: CosmeticItem; width: number | '100%'; height: number; owned: boolean; worn: boolean; wished: boolean; now: Date; onPress: () => void }) {
  const t = useTheme();
  const sheet = sheetOf(item.id);
  const r = RARITY_STYLE[item.rarity];
  const lim = sheet?.limited ? limitedState(sheet.limited, now) : null;
  const fresh = sheet ? isNew(sheet, new Date(now.getTime() + 14 * 86_400_000)) : false; // « Nouveau » : 7 premiers jours seulement
  const price = item.priceFitcoins;
  const state = worn ? 'Portée' : owned ? 'À toi' : lim && !lim.open ? 'Terminée' : price === null ? 'Offerte' : null;
  const badge = lim ? (lim.open ? (lim.daysLeft <= 7 ? 'Derniers jours' : 'Limitée') : 'Terminée') : fresh ? 'Nouveau' : null;
  return (
    <Press
      accessibilityLabel={item.name + ', ' + r.label + (state ? ', ' + state : ', ' + fmt(price ?? 0) + ' ' + CUR_NAMES[0])}
      onPress={onPress}
      pressScale={0.97}
      style={[styles.card, { width, backgroundColor: t.surf, borderColor: worn ? V2.lime : item.rarity === 'COMMON' ? t.line : r.c + '66' }]}
    >
      <View style={[styles.cardImg, { height, backgroundColor: r.deep }]}>
        <OutfitArt itemId={item.id} rarity={item.rarity} height={height} />
        {item.rarity !== 'COMMON' ? <LinearGradient colors={['transparent', r.c + '33']} start={{ x: 0.5, y: 0.6 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
        {badge ? (
          <View style={styles.badge}>
            <Txt size={10} weight="bold" color={V2.white}>{badge.toUpperCase()}</Txt>
          </View>
        ) : null}
        {wished ? <Txt size={13} color="#FF7AB8" style={styles.heart}>♥</Txt> : null}
      </View>
      <View style={{ gap: 3, padding: 10, paddingTop: 8 }}>
        <Txt size={14} weight="bold" numberOfLines={1}>{item.name}</Txt>
        <View style={styles.rowBetween}>
          <RarityTag rarity={item.rarity} size={10} />
          {state ? (
            <Txt size={12} weight="bold" color={worn ? (t.dark ? V2.lime : '#4F6B00') : t.ink2}>{state}</Txt>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <CoinIcon size={12} />
              <Txt size={13} weight="bold" num>{fmt(price ?? 0)}</Txt>
            </View>
          )}
        </View>
      </View>
    </Press>
  );
}

/** Grille 2 colonnes ; s'il reste une tenue seule, elle prend toute la largeur (pas de trou). */
function Grid({ items, render }: { items: CosmeticItem[]; render: (i: CosmeticItem, w: number | '100%', h: number) => React.ReactElement }) {
  if (!items.length) return <Empty text="Rien ici pour l’instant." />;
  const odd = items.length % 2 === 1;
  return (
    <View style={styles.grid}>
      {items.map((i, k) => (
        <View key={i.id} style={odd && k === items.length - 1 ? { width: '100%' } : { width: '48.5%' }}>
          {render(i, '100%', odd && k === items.length - 1 ? 260 : 200)}
        </View>
      ))}
    </View>
  );
}

function Rail({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
      {children}
    </ScrollView>
  );
}

function CollectionBlock({ id, items, outfits, ownedIds, render }: { id: CollectionId; items: CosmeticItem[]; outfits: CosmeticItem[]; ownedIds: Set<string>; render: (i: CosmeticItem) => React.ReactElement }) {
  const c = COLLECTIONS.find((x) => x.id === id)!;
  const look = COLLECTION_LOOK[id];
  const all = outfits.filter((i) => sheetOf(i.id)?.collection === id);
  const have = all.filter((i) => ownedIds.has(i.id)).length;
  return (
    <View style={[styles.coll, { borderColor: look.c + '33' }]}>
      <LinearGradient colors={look.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: look.c }} />
          <Txt size={17} weight="bold" color={V2.white}>{c.name}</Txt>
        </View>
        <Txt size={12} weight="bold" num color={look.c}>{have + ' / ' + all.length}</Txt>
      </View>
      <Txt size={12} lineHeight={17} color="#AEB4BE">{c.line}</Txt>
      <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <View style={{ width: `${(have / Math.max(1, all.length)) * 100}%`, height: '100%', backgroundColor: look.c }} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -14 }} contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}>
        {items.map(render)}
      </ScrollView>
    </View>
  );
}

/** Prochain drop : les articles en préparation, en petit. Pas d'image tant qu'ils ne sont pas dessinés, pas de date. */
function NextDrop({ onOpen, only }: { onOpen: (id: string) => void; only?: string[] }) {
  const t = useTheme();
  const items = UPCOMING.filter((u) => (only ? only.includes(u.id) : true));
  if (!items.length) return null;
  return (
    <>
      <SectionTitle title="Prochain drop" hint={items.length + ' en préparation'} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {items.map((u) => {
          const r = RARITY_STYLE[u.rarity];
          return (
            <Press key={u.id} onPress={() => onOpen(u.id)} pressScale={0.96} accessibilityLabel={u.name + ', ' + UPCOMING_LABEL[u.kind] + ', en préparation'} style={[styles.drop, { backgroundColor: t.surf, borderColor: t.line }]}>
              <View style={[styles.dropIcon, { backgroundColor: r.deep }]}>
                <KindGlyph kind={u.kind} size={24} color={r.c} />
              </View>
              <View style={{ gap: 1, maxWidth: 120 }}>
                <Txt size={13} weight="bold" numberOfLines={1}>{u.name}</Txt>
                <Txt size={11} color={t.ink2} numberOfLines={1}>{UPCOMING_LABEL[u.kind]}</Txt>
              </View>
            </Press>
          );
        })}
      </ScrollView>
    </>
  );
}

function Empty({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View style={[styles.how, { borderColor: t.line, alignItems: 'center' }]}>
      <Txt size={13} color={t.ink2}>{text}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  headBtn: { height: 34, borderRadius: 17, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  hero: { height: 430, borderRadius: 28, overflow: 'hidden', backgroundColor: OBSIDIAN },
  heroGlow: { position: 'absolute', width: 340, height: 340, borderRadius: 170, top: 30, alignSelf: 'center' },
  heroTop: { position: 'absolute', left: 16, top: 16 },
  heroPill: { borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: 'rgba(11,13,16,0.5)' },
  heroText: { position: 'absolute', left: 18, right: 18, bottom: 18, gap: 3 },
  heroCta: { height: 44, borderRadius: 22, paddingHorizontal: 18, backgroundColor: V2.lime, alignItems: 'center', justifyContent: 'center' },
  progress: { borderRadius: 24, padding: 16, gap: 14, borderWidth: 1 },
  earn: { height: 46, borderRadius: 23, backgroundColor: V2.lime, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
  cardImg: { overflow: 'hidden' },
  badge: { position: 'absolute', left: 8, top: 8, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: 'rgba(11,13,16,0.72)' },
  heart: { position: 'absolute', right: 10, top: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  coll: { borderRadius: 24, padding: 14, gap: 10, overflow: 'hidden', borderWidth: 1 },
  drop: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 8, paddingRight: 14, borderWidth: 1 },
  dropIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  how: { borderRadius: 18, padding: 14, borderWidth: 1 },
});
