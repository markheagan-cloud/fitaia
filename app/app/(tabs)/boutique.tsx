import React, { useEffect, useMemo, useState } from 'react';
import { View, Image, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow, screenAccent } from '@/theme/tokens';
import { CUR_NAMES, fmt } from '@/data/content';
import { useGame } from '@/store/useGame';
import { useDailyCoins, useEco } from '@/store/useEco';
import { useRouter } from 'expo-router';
import { displayableOutfits, skinOf } from '@/avatar/outfits';
import { caricatureConfigured } from '@/services/caricature';
import { buildParcours } from '@/progression/parcours';
import { STAGES } from '@/progression/progressionRules';
import type { CosmeticItem } from '@/inventory/types';
import { Screen, Row } from '@/components/Screen';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CoinIcon } from '@/components/Icons';
import {
  COLLECTIONS, KIND_FILTERS, KindFilter, UPCOMING, UPCOMING_LABEL, Upcoming, isNew, limitedLine, limitedState, onSale, sheetOf, upcomingMatches, upcomingPrice,
} from '@/shop/catalogue';
import { OutfitArt, UpcomingArt, rarityOf, useMyOutfits } from '@/shop/ShopArt';
import { useWishlist } from '@/shop/useWishlist';
import { daysToAfford, delayOf, inDays, nextEvents } from '@/shop/rythme';
import { usePace } from '@/shop/usePace';
import { achatsPossibles, reprendreAchats } from '@/services/achats';

export default function Boutique() {
  const t = useTheme();
  const { ready, error, account, statuses, catalog, inventory, wallet, grantPaid } = useEco();
  const say = useGame((s) => s.say);
  const mine = useMyOutfits();
  const caricature = useGame((s) => s.caricature);
  const outfits = useMemo(() => displayableOutfits(catalog), [catalog]);
  const parcours = useMemo(() => (account ? buildParcours(account, statuses, STAGES, catalog) : null), [account, statuses, catalog]);
  const balance = wallet?.balance ?? 0;
  const router = useRouter();
  const todayCoins = useDailyCoins('daily_challenge') + useDailyCoins('daily_meal');
  const wish = useWishlist((s) => s.ids);
  const [filter, setFilter] = useState<KindFilter>('tout');
  const now = new Date();
  // tenues pas encore dessinées sur ce perso (nouvelles tenues) : on les complète en arrière-plan
  const completeMyOutfits = useGame((s) => s.completeMyOutfits);
  useEffect(() => {
    if (caricatureConfigured && caricature) void completeMyOutfits();
  }, [caricature?.id, completeMyOutfits]); // eslint-disable-line react-hooks/exhaustive-deps
  const ownedIds = new Set(inventory?.items.map((i) => i.itemId) ?? []);
  const ownedSkins = outfits.filter((i) => ownedIds.has(i.id)).map((i) => skinOf(i.id)!.id);
  const [restoring, setRestoring] = useState(false);
  const restore = async () => {
    if (restoring) return;
    if (!achatsPossibles()) {
      say('Achats en euros disponibles sur l’app iPhone', 'bad');
      return;
    }
    setRestoring(true);
    try {
      const found = await reprendreAchats((it) => grantPaid(it, false), true);
      say(found.length ? found.length + (found.length > 1 ? ' tenues retrouvées' : ' tenue retrouvée') : 'Aucun achat à restaurer sur ce compte Apple', found.length ? 'ok' : 'bad');
    } finally {
      setRestoring(false);
    }
  };
  const buyable = (i: CosmeticItem) => !ownedIds.has(i.id) && i.priceFitcoins !== null && onSale(i.id, now);
  // Objectif : la tenue pas encore possédée la plus proche du solde (vrai prix, vraie progression)
  const goal = outfits.filter(buyable).sort((x, y) => (x.priceFitcoins ?? 0) - (y.priceFitcoins ?? 0)).find((i) => (i.priceFitcoins ?? 0) > balance)
    ?? outfits.find(buyable);
  const goalSkin = goal ? skinOf(goal.id) : undefined;
  const goalPrice = goal?.priceFitcoins ?? 0;

  const limited = outfits.filter((i) => sheetOf(i.id)?.limited && (onSale(i.id, now) || ownedIds.has(i.id)));
  // À la une : l'édition limitée en vente qui se termine le plus tôt (puis la plus rare)
  const featured = [...limited]
    .filter((i) => onSale(i.id, now) && !ownedIds.has(i.id))
    .sort((a, b) => (sheetOf(a.id)!.limited!.until.localeCompare(sheetOf(b.id)!.limited!.until)) || (b.priceFitcoins ?? 0) - (a.priceFitcoins ?? 0))[0];
  // Ma liste : un article gardé de côté qui est en vente maintenant
  const wishOnSale = outfits.filter((i) => wish.includes(i.id) && buyable(i));
  const { pace, start, doneToday } = usePace();
  const goalDays = goal ? daysToAfford(goalPrice, pace.week, start) : null;
  // Calendrier : prochains bonus et prochaines tenues, au rythme réel de la personne (ou au profil Régulier)
  const agenda = nextEvents(outfits.filter(buyable).map((i) => ({ id: i.id, name: i.name, price: i.priceFitcoins ?? 0 })), pace, start, 5);
  const open = (id: string) => router.push({ pathname: '/article/[id]', params: { id } });
  const upcoming = UPCOMING.filter((u) => (filter === 'liste' ? wish.includes(u.id) : upcomingMatches(u, filter)));

  const outfitGrid = (items: CosmeticItem[]) => (
    <View style={styles.grid}>
      {items.map((item) => (
        <OutfitCard key={item.id} item={item} owned={ownedIds.has(item.id)} worn={inventory?.equipped.FULL_OUTFIT === item.id} wished={wish.includes(item.id)} now={now} onPress={() => open(item.id)} />
      ))}
    </View>
  );

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
          Défis, niveaux et récompenses sont gratuits. Chaque tenue est dessinée sur ton perso, avec ta tête. Tout se débloque avec tes Fitcoins ; les tenues rares et au-dessus aussi tout de suite en euros.
        </Txt>
      </View>

      {/* Solde + objectif : ce qu'il manque, et ce qu'on peut gagner aujourd'hui */}
      <View style={[styles.goal, { backgroundColor: t.surf }, shadow.card]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CoinIcon size={22} />
          <Display size={30} num>{fmt(balance)}</Display>
          <Txt size={13} color={t.ink2} style={{ marginTop: 8 }}>{CUR_NAMES[0]}</Txt>
        </View>
        {goal && goalSkin ? (
          <Press onPress={() => open(goal.id)} pressScale={0.98} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            {mine?.[goalSkin.id] ? <Image source={{ uri: mine[goalSkin.id] }} style={styles.goalImg} /> : null}
            <View style={{ flex: 1, gap: 6 }}>
              <Txt size={12} color={t.ink2}>Ta prochaine tenue</Txt>
              <Txt size={16} weight="bold">{goal.name}</Txt>
              <View style={[styles.track, { backgroundColor: t.line }]}>
                <View style={{ width: `${Math.min(100, Math.round((balance / Math.max(1, goalPrice)) * 100))}%`, height: '100%', borderRadius: 3, backgroundColor: LIME }} />
              </View>
              <Txt size={12} num color={t.ink2}>
                {balance >= goalPrice ? 'Tu peux la débloquer maintenant.' : 'Encore ' + fmt(goalPrice - balance) + ' ' + CUR_NAMES[0] + ' · ' + (pace.mine ? 'à ton rythme, ' : 'en jouant chaque jour, ') + inDays(delayOf(goalDays, doneToday)) + '.'}
              </Txt>
            </View>
          </Press>
        ) : null}
        <Press haptic="medium" onPress={() => router.navigate('/(tabs)/defis')} style={[styles.earn, shadow.btn]}>
          <Txt size={14} weight="bold" color={OBSIDIAN}>
            {todayCoins > 0 ? 'Gagner +' + todayCoins + ' ' + CUR_NAMES[0] + ' aujourd’hui' : 'Défis du jour faits : reviens demain'}
          </Txt>
        </Press>
      </View>

      {/* Mon vestiaire : ses tenues, et les mélanger pièce par pièce */}
      <Press accessibilityLabel="Ouvrir mon vestiaire" onPress={() => router.push('/vestiaire')} pressScale={0.98} style={[styles.note, { backgroundColor: OBSIDIAN, flexDirection: 'row', alignItems: 'center', gap: 12 }, shadow.card]}>
        <View style={{ flexDirection: 'row' }}>
          {ownedSkins.slice(0, 3).map((sk, i) => (mine?.[sk] ? <Image key={sk} source={{ uri: mine[sk] }} style={[styles.closet, { marginLeft: i ? -18 : 0 }]} /> : null))}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={15} weight="bold" color="#F5F4F1">Mon vestiaire</Txt>
          <Txt size={12} lineHeight={17} color="#B7BBC2">{ownedSkins.length + (ownedSkins.length > 1 ? ' tenues à toi' : ' tenue à toi') + ' · mélange hauts, bas, chaussures et accessoires'}</Txt>
        </View>
        <Txt size={18} weight="bold" color={LIME}>›</Txt>
      </Press>

      {/* Ton calendrier : ce qui tombe, et quand, si tu continues comme ça */}
      {agenda.length > 0 ? (
        <View style={[styles.note, { backgroundColor: t.surf }, shadow.card]}>
          <Row style={{ paddingHorizontal: 0, paddingTop: 0 }}>
            <Txt size={16} weight="bold" color={screenAccent(t, 'shop')}>Ton calendrier</Txt>
            <Txt size={12} color={t.ink2}>{pace.mine ? 'd’après tes 14 derniers jours' : 'défi du jour + 2 repas, 6 j / 7'}</Txt>
          </Row>
          {agenda.map((e, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.when, { backgroundColor: e.kind === 'palier' ? LIME : t.line }]}>
                <Txt size={11} weight="bold" num color={OBSIDIAN}>{delayOf(e.day, doneToday) === 0 ? 'AUJ.' : delayOf(e.day, doneToday) === 1 ? 'DEMAIN' : 'J+' + delayOf(e.day, doneToday)}</Txt>
              </View>
              <Txt size={13} weight={e.kind === 'article' ? 'semibold' : 'regular'} style={{ flex: 1 }} numberOfLines={1}>
                {e.kind === 'article' ? 'Tu peux prendre ' + e.label : e.label}
              </Txt>
            </View>
          ))}
          <Txt size={12} lineHeight={17} color={t.ink2}>
            Calculé avec les vrais gains de l’app : +50 Fitcoins pour le défi du jour, +10 pour un repas, et les bonus d’étape du Parcours.
          </Txt>
        </View>
      ) : null}

      {/* De ta liste, en vente maintenant */}
      {wishOnSale.length > 0 ? (
        <Press onPress={() => open(wishOnSale[0].id)} pressScale={0.98} style={[styles.wishBar, { backgroundColor: t.surf }, shadow.card]}>
          <Txt size={18}>♥</Txt>
          <Txt size={13} weight="semibold" style={{ flex: 1 }}>
            {'De ta liste : ' + wishOnSale.map((i) => i.name).join(', ') + (wishOnSale.length > 1 ? ' sont en vente' : ' est en vente')}
          </Txt>
        </Press>
      ) : null}

      {/* À la une */}
      {featured ? (
        <Press accessibilityLabel={'À la une : ' + featured.name} onPress={() => open(featured.id)} pressScale={0.98} style={[styles.hero, shadow.xl]}>
          <OutfitArt itemId={featured.id} rarity={featured.rarity} height={300} />
          <LinearGradient colors={['transparent', 'rgba(15,16,18,0.92)']} start={{ x: 0, y: 0.35 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={styles.heroTop}>
            <LinearGradient colors={['#FF4FA3', '#FFC93C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.pill}>
              <Txt size={10} weight="bold" color={OBSIDIAN}>À LA UNE · ÉDITION LIMITÉE</Txt>
            </LinearGradient>
          </View>
          <View style={styles.heroText}>
            <Txt size={12} weight="semibold" color={rarityOf(featured.rarity).c === '#8A8E96' ? '#C9CCD2' : '#FFD66B'}>{rarityOf(featured.rarity).label + ' · ' + COLLECTIONS.find((c) => c.id === sheetOf(featured.id)?.collection)?.name}</Txt>
            <Display size={28} color="#F5F4F1">{featured.name}</Display>
            <Txt size={13} color="#D7D9DD">{sheetOf(featured.id)?.tagline}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <Txt size={12} num color="#B7BBC2">{limitedLine(sheetOf(featured.id)!.limited!, now)}</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <CoinIcon size={15} />
                <Txt size={16} weight="bold" num color="#F5F4F1">{fmt(featured.priceFitcoins ?? 0)}</Txt>
              </View>
            </View>
          </View>
        </Press>
      ) : null}

      {/* Rayons */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {KIND_FILTERS.map((f) => {
          const on = f.id === filter;
          const count = f.id === 'liste' ? wish.length : null;
          return (
            <Press key={f.id} accessibilityState={{ selected: on }} onPress={() => setFilter(f.id)} style={[styles.chip, { backgroundColor: on ? LIME : t.surf }, on ? null : shadow.card]}>
              <Txt size={13} weight={on ? 'bold' : 'medium'} color={on ? OBSIDIAN : t.ink}>{f.label + (count ? ' · ' + count : '')}</Txt>
            </Press>
          );
        })}
      </ScrollView>
      {!ready && !error ? <ActivityIndicator size="small" color={t.ink2} /> : null}
      {error ? <Txt size={13} color={t.ink2} style={{ paddingHorizontal: 4 }}>La boutique ne s’est pas chargée. Ferme et rouvre l’app.</Txt> : null}

      {filter === 'tout' ? (
        <>
          <Section title="Éditions limitées" hint={limited.length + ' tenues · date de fin affichée'} />
          {outfitGrid(limited)}
          {COLLECTIONS.map((c) => {
            const items = outfits.filter((i) => sheetOf(i.id)?.collection === c.id && !sheetOf(i.id)?.limited);
            if (!items.length) return null;
            const all = outfits.filter((i) => sheetOf(i.id)?.collection === c.id);
            const have = all.filter((i) => ownedIds.has(i.id)).length;
            return (
              <React.Fragment key={c.id}>
                <Section title={'Collection ' + c.name} hint={have + ' / ' + all.length + ' possédées'} sub={c.line} />
                {outfitGrid(items)}
              </React.Fragment>
            );
          })}
        </>
      ) : null}
      {filter === 'limitees' ? (
        <>
          <Section title="Éditions limitées" sub="Chaque édition affiche sa date de fin. Après, elle ne s’achète plus ; si tu l’as, elle reste à toi." />
          {outfitGrid(limited)}
        </>
      ) : null}
      {filter === 'tenues' ? (
        <>
          <Section title={'Tenues · ' + outfits.length} sub="Chaque tenue vient avec son haut, son bas, ses chaussures et ses accessoires, tous dessinés sur ton perso." />
          {outfitGrid([...outfits].sort((a, b) => (a.priceFitcoins ?? 0) - (b.priceFitcoins ?? 0)))}
        </>
      ) : null}
      {filter === 'chaussures' ? (
        <View style={[styles.note, { backgroundColor: t.surf }, shadow.card]}>
          <Txt size={16} weight="bold" color={screenAccent(t, 'shop')}>Les chaussures à part arrivent</Txt>
          <Txt size={13} lineHeight={19} color={t.ink2}>
            Aujourd’hui, chaque tenue a ses propres chaussures (elles sont dans sa fiche). Bientôt, tu pourras choisir une paire et la garder avec n’importe quelle tenue. Garde de côté celles qui te plaisent.
          </Txt>
        </View>
      ) : null}
      {filter === 'liste' && wish.length === 0 ? (
        <View style={[styles.note, { backgroundColor: t.surf }, shadow.card]}>
          <Txt size={16} weight="bold" color={screenAccent(t, 'shop')}>Ta liste est vide</Txt>
          <Txt size={13} lineHeight={19} color={t.ink2}>Ouvre un article et touche « Garder dans ma liste ». On te le montre ici, et en haut de la boutique dès qu’il est en vente.</Txt>
        </View>
      ) : null}
      {filter === 'liste' ? outfitGrid(outfits.filter((i) => wish.includes(i.id))) : null}

      {upcoming.length > 0 && filter !== 'limitees' ? (
        <>
          <Section title={filter === 'liste' ? 'À venir, dans ta liste' : 'À venir'} hint={upcoming.length + ' articles'} sub={filter === 'tout' || filter === 'avenir' ? 'Chaussures, casquettes, lunettes et nouvelles tenues. Pas encore de dessin sur ton perso : on ne te montre rien de faux.' : undefined} />
          <View style={styles.grid}>
            {upcoming.map((u) => (
              <UpcomingCard key={u.id} u={u} wished={wish.includes(u.id)} onPress={() => open(u.id)} />
            ))}
          </View>
        </>
      ) : null}

      {/* Les engagements de la boutique : ce que les joueurs reprochent le plus aux boutiques de jeux */}
      {filter === 'tout' || filter === 'avenir' ? (
        <View style={[styles.note, { backgroundColor: t.surf }, shadow.card]}>
          <Txt size={16} weight="bold" color={screenAccent(t, 'shop')}>Comment marche la boutique</Txt>
          {[
            'Tu vois chaque tenue sur ton perso avant de la prendre.',
            'Aucun coffre ni tirage au hasard : tu choisis, tu sais ce que tu as.',
            'Le prix est écrit sur chaque article, en Fitcoins, et les Fitcoins se gagnent en faisant tes défis.',
            'Les tenues rares et au-dessus ont aussi un prix fixe en euros : pas de monnaie à acheter, pas de lot, pas de reste.',
            'Payer va plus vite, ne donne rien de plus : la même tenue s’obtient en jouant.',
            'Une édition limitée affiche sa date de fin, sans compte à rebours.',
            'Ce que tu as débloqué reste à toi, même après la fin d’une édition.',
          ].map((l) => (
            <View key={l} style={{ flexDirection: 'row', gap: 8 }}>
              <Txt size={13} color="#6E8F14">✓</Txt>
              <Txt size={13} lineHeight={19} color={t.ink2} style={{ flex: 1 }}>{l}</Txt>
            </View>
          ))}
          <Press onPress={restore} accessibilityLabel="Restaurer mes achats" style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
            <Txt size={13} weight="semibold" color={t.ink}>{restoring ? 'Recherche de tes achats…' : 'Restaurer mes achats'}</Txt>
          </Press>
        </View>
      ) : null}
    </Screen>
  );
}

function Section({ title, hint, sub }: { title: string; hint?: string; sub?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4, paddingTop: 8 }}>
      <Row>
        <Txt size={16} weight="bold">{title}</Txt>
        {hint ? <Txt size={12} color={t.ink2}>{hint}</Txt> : null}
      </Row>
      {sub ? <Txt size={13} lineHeight={18} color={t.ink2} style={{ paddingHorizontal: 4 }}>{sub}</Txt> : null}
    </View>
  );
}

function OutfitCard({ item, owned, worn, wished, now, onPress }: { item: CosmeticItem; owned: boolean; worn: boolean; wished: boolean; now: Date; onPress: () => void }) {
  const t = useTheme();
  const sheet = sheetOf(item.id);
  const r = rarityOf(item.rarity);
  const lim = sheet?.limited ? limitedState(sheet.limited, now) : null;
  const special = !!lim;
  const fresh = sheet ? isNew(sheet, now) : false;
  const price = item.priceFitcoins;
  const cta = worn ? 'Portée' : owned ? 'À toi' : lim && !lim.open ? 'Terminée' : price === null ? 'Offerte' : null;
  return (
    <LinearGradient
      colors={worn ? [LIME, LIME] : special ? ['#FF4FA3', '#FFC93C', '#27E0D0'] : ['transparent', 'transparent']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.frame}
    >
      <Press accessibilityLabel={item.name + ', ' + r.label + (cta ? ', ' + cta : ', ' + fmt(price ?? 0) + ' ' + CUR_NAMES[0])} onPress={onPress} pressScale={0.97} style={[styles.skin, { backgroundColor: t.surf }, shadow.card]}>
        <View style={styles.skinImgWrap}>
          <OutfitArt itemId={item.id} rarity={item.rarity} height={190} />
          <View style={[styles.skinBar, { backgroundColor: r.c }]} />
          {special ? (
            <LinearGradient colors={['#FF4FA3', '#FFC93C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.badge}>
              <Txt size={10} weight="bold" color={OBSIDIAN}>{lim && lim.open ? (lim.daysLeft <= 7 ? 'DERNIERS JOURS' : 'ÉDITION LIMITÉE') : 'ÉDITION TERMINÉE'}</Txt>
            </LinearGradient>
          ) : fresh ? (
            <View style={[styles.badge, { backgroundColor: LIME }]}>
              <Txt size={10} weight="bold" color={OBSIDIAN}>NOUVEAU</Txt>
            </View>
          ) : null}
          {wished ? (
            <View style={[styles.heart, { backgroundColor: 'rgba(15,16,18,0.7)' }]}>
              <Txt size={12} color="#FF4FA3">♥</Txt>
            </View>
          ) : null}
        </View>
        <View style={{ gap: 2, paddingHorizontal: 6, paddingBottom: 6 }}>
          <Txt size={14} weight="bold" numberOfLines={1}>{item.name}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Txt size={12} weight="medium" color={t.ink2} numberOfLines={1} style={{ flexShrink: 1 }}>{r.label}</Txt>
            <View style={{ flexGrow: 1, minWidth: 4 }} />
            {cta ? null : <CoinIcon size={13} />}
            <Txt size={13} weight="semibold" num color={worn ? '#5E7A12' : t.ink} numberOfLines={1}>{cta ?? fmt(price ?? 0)}</Txt>
          </View>
        </View>
      </Press>
    </LinearGradient>
  );
}

function UpcomingCard({ u, wished, onPress }: { u: Upcoming; wished: boolean; onPress: () => void }) {
  const t = useTheme();
  const r = rarityOf(u.rarity);
  const price = upcomingPrice(u);
  return (
    <View style={styles.frame}>
      <Press accessibilityLabel={u.name + ', à venir'} onPress={onPress} pressScale={0.97} style={[styles.skin, { backgroundColor: t.surf }, shadow.card]}>
        <View style={[styles.skinImgWrap, { height: 130 }]}>
          <UpcomingArt kind={u.kind} rarity={u.rarity} height={130} />
          <View style={[styles.badge, { backgroundColor: '#F5F4F1' }]}>
            <Txt size={10} weight="bold" color={OBSIDIAN}>À VENIR</Txt>
          </View>
          {wished ? (
            <View style={[styles.heart, { backgroundColor: 'rgba(15,16,18,0.7)' }]}>
              <Txt size={12} color="#FF4FA3">♥</Txt>
            </View>
          ) : null}
        </View>
        <View style={{ gap: 2, paddingHorizontal: 6, paddingBottom: 6 }}>
          <Txt size={14} weight="bold" numberOfLines={1}>{u.name}</Txt>
          <Txt size={12} color={t.ink2} numberOfLines={1}>{UPCOMING_LABEL[u.kind] + ' · ' + r.label}</Txt>
          <Txt size={12} num color={t.ink2} numberOfLines={1}>{u.eta ? 'Prévu ' + u.eta : u.how}{price !== null ? ' · ' + fmt(price) + ' ' + CUR_NAMES[0] : ''}</Txt>
        </View>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  closet: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: OBSIDIAN },
  pass: { borderRadius: 30, padding: 18, gap: 12, overflow: 'hidden', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  goal: { borderRadius: 28, padding: 16, gap: 14 },
  goalImg: { width: 84, height: 84, borderRadius: 18 },
  earn: { height: 50, borderRadius: 18, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  wishBar: { borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  hero: { borderRadius: 30, overflow: 'hidden', height: 300, backgroundColor: OBSIDIAN },
  heroTop: { position: 'absolute', left: 14, top: 14 },
  heroText: { position: 'absolute', left: 18, right: 18, bottom: 16, gap: 3 },
  pill: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  chip: { height: 38, borderRadius: 19, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  note: { borderRadius: 24, padding: 16, gap: 8 },
  when: { minWidth: 58, height: 24, borderRadius: 8, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  frame: { width: '48%', flexGrow: 1, maxWidth: '50%', borderRadius: 26, padding: 2.5 },
  skin: { flex: 1, borderRadius: 24, padding: 6, gap: 8 },
  badge: { position: 'absolute', left: 8, top: 8, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 8 },
  heart: { position: 'absolute', right: 8, top: 8, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  skinImgWrap: { height: 190, borderRadius: 18, overflow: 'hidden', backgroundColor: '#DAD7D1' },
  skinBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4 },
});
