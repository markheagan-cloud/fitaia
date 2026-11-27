/**
 * Fiche d'un article de la boutique : la tenue sur le perso de la personne, en grand, et tout ce qu'il faut savoir
 * avant de la prendre (pièces, chaussures, décor, collection, date de fin, prix). Ou la fiche d'un article à venir.
 */
import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow } from '@/theme/tokens';
import { CUR_NAMES, fmt } from '@/data/content';
import { useGame } from '@/store/useGame';
import { useEco } from '@/store/useEco';
import { useCelebrate } from '@/fx/celebrate';
import { skinOf } from '@/avatar/outfits';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CloseIcon, CoinIcon } from '@/components/Icons';
import {
  COLLECTIONS, PIECE_LABEL, PieceKind, UPCOMING, UPCOMING_LABEL, isNew, limitedLine, limitedState, onSale, sheetOf, upcomingPrice,
} from '@/shop/catalogue';
import { OutfitArt, UpcomingArt, rarityOf, useMyOutfits } from '@/shop/ShopArt';
import { useWishlist } from '@/shop/useWishlist';
import { PERSONAS, daysToAfford, delayOf, inDays } from '@/shop/rythme';
import { usePace } from '@/shop/usePace';
import { eurosLabel, palierOf } from '@/shop/prixEuros';
import { achatsPossibles, acheterEnEuros, prixApple } from '@/services/achats';

const PIECES: PieceKind[] = ['haut', 'bas', 'chaussures', 'accessoire'];

export default function Article() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const say = useGame((s) => s.say);
  const celebrate = useCelebrate((s) => s.celebrate);
  const { catalog, inventory, wallet, buy, equip, grantPaid } = useEco();
  const mine = useMyOutfits();
  const wished = useWishlist((s) => s.ids.includes(String(id)));
  const toggleWish = useWishlist((s) => s.toggle);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [applePrice, setApplePrice] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (id) prixApple([String(id)]).then((p) => live && setApplePrice(p[String(id)] ?? null));
    return () => {
      live = false;
    };
  }, [id]);
  const { pace, start, doneToday } = usePace();
  const now = new Date();
  const item = catalog.find((i) => i.id === id);
  const sheet = item ? sheetOf(item.id) : undefined;
  const up = UPCOMING.find((u) => u.id === id);
  const close = () => (router.canGoBack() ? router.back() : router.navigate('/(tabs)/boutique'));
  const wishBtn = (
    <Press
      onPress={() => {
        const on = toggleWish(String(id));
        say(on ? 'Gardée dans ta liste' : 'Retirée de ta liste', 'ok');
      }}
      style={[styles.ghost, { borderColor: t.line }]}
    >
      <Txt size={14} weight="semibold" color={wished ? '#D8327F' : t.ink}>{wished ? '♥ Dans ma liste' : '♡ Garder dans ma liste'}</Txt>
    </Press>
  );

  const top = (
    <Press accessibilityLabel="Fermer" onPress={close} style={[styles.close, { top: insets.top + 10, backgroundColor: 'rgba(15,16,18,0.55)' }]}>
      <CloseIcon size={14} color="#F5F4F1" />
    </Press>
  );

  if (!sheet && up) {
    const r = rarityOf(up.rarity);
    const price = upcomingPrice(up);
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          <View style={{ height: 300 + insets.top }}>
            <UpcomingArt kind={up.kind} rarity={up.rarity} height={300 + insets.top} />
          </View>
          <View style={styles.body}>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Tag label="À VENIR" bg="#F5F4F1" />
              <Tag label={r.label.toUpperCase()} bg={r.c} ink="#FFFFFF" />
            </View>
            <Display size={30}>{up.name}</Display>
            <Txt size={15} lineHeight={22} color={t.ink2}>{up.detail}</Txt>
            <Facts rows={[
              ['Type', UPCOMING_LABEL[up.kind]],
              ['Comment l’avoir', up.how],
              ['Prix', price !== null ? fmt(price) + ' ' + CUR_NAMES[0] + ' (prévu)' : up.how === 'Fitcoins' ? 'Annoncé à la sortie' : 'Ne s’achète pas'],
              ['Sortie', up.eta ? 'Prévue ' + up.eta + ' (indicatif)' : 'Pas encore datée'],
            ]} />
            <View style={[styles.note, { backgroundColor: t.surf }, shadow.card]}>
              <Txt size={13} lineHeight={19} color={t.ink2}>
                Cet article n’est pas encore dessiné sur ton perso, donc on ne t’en montre pas d’image. Garde-le dans ta liste : il apparaîtra en haut de la boutique dès sa sortie.
              </Txt>
            </View>
            {wishBtn}
          </View>
        </ScrollView>
        {top}
      </View>
    );
  }

  if (!item || !sheet) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <Txt size={15}>Cet article n’existe plus.</Txt>
        <Press onPress={close} style={[styles.cta, { backgroundColor: LIME }]}><Txt size={15} weight="bold" color={OBSIDIAN}>Retour à la boutique</Txt></Press>
      </View>
    );
  }

  const r = rarityOf(item.rarity);
  const owned = inventory?.items.some((i) => i.itemId === item.id) ?? false;
  const worn = inventory?.equipped.FULL_OUTFIT === item.id;
  const balance = wallet?.balance ?? 0;
  const price = item.priceFitcoins;
  const lim = sheet.limited ? limitedState(sheet.limited, now) : null;
  const sale = onSale(item.id, now);
  const coll = COLLECTIONS.find((c) => c.id === sheet.collection);
  const collItems = catalog.filter((i) => sheetOf(i.id)?.collection === sheet.collection);
  const have = collItems.filter((i) => inventory?.items.some((x) => x.itemId === i.id)).length;
  const missing = price !== null ? Math.max(0, price - balance) : 0;
  // Délai pour l'avoir en jouant : au rythme réel de la personne, et en mettant le paquet (3 défis, 3 repas par jour)
  const wait = !owned && sale && price !== null && missing > 0 ? delayOf(daysToAfford(price, pace.week, start), doneToday) : null;
  const waitMax = wait !== null && price !== null ? delayOf(daysToAfford(price, PERSONAS[0].week, start), doneToday) : null;
  const daysLeft = lim && lim.open ? lim.daysLeft - 1 : null;
  const tooLate = wait !== null && daysLeft !== null && wait > daysLeft;
  const palier = palierOf(item);
  const euros = palier ? applePrice ?? eurosLabel(palier.euros) : null;
  const canPay = !owned && sale && euros !== null;

  const pay = async () => {
    if (paying || busy) return;
    if (!achatsPossibles()) {
      say('Achat en euros disponible sur l’app iPhone', 'bad');
      return;
    }
    setPaying(true);
    try {
      const res = await acheterEnEuros(item.id, (it) => grantPaid(it));
      const sk = skinOf(item.id);
      if (res.ok) celebrate({ kind: 'achat', title: item.name + ' débloquée', sub: 'Elle est à toi pour toujours, et déjà sur ton perso.', image: sk ? mine?.[sk.id] : undefined });
      else if (!res.annule) say(res.message, 'bad');
    } finally {
      setPaying(false);
    }
  };

  const cta = worn ? 'Sur ton perso' : owned ? 'La mettre sur mon perso' : !sale ? 'Édition terminée' : price === null ? 'Offerte, déjà à toi' : missing > 0 ? 'Il te manque ' + fmt(missing) + ' ' + CUR_NAMES[0] : 'Débloquer pour ' + fmt(price) + ' ' + CUR_NAMES[0];
  const canAct = !worn && (owned || (sale && price !== null && missing === 0));

  const act = async () => {
    if (busy) return;
    if (!canAct) {
      if (missing > 0 && sale && !owned) router.navigate('/(tabs)/defis');
      return;
    }
    setBusy(true);
    try {
      const res = owned ? await equip(item.id) : await buy(item.id);
      const sk = skinOf(item.id);
      if (res.ok && !owned) celebrate({ kind: 'achat', title: item.name + ' débloquée', sub: 'Elle est sur ton perso.', image: sk ? mine?.[sk.id] : undefined });
      else say(res.ok ? item.name + ' est sur ton perso' : res.message, res.ok ? 'ok' : 'bad');
    } catch {
      say('Action impossible pour le moment, réessaie', 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + (canPay ? 180 : 120) }}>
        <View style={{ height: 420 + insets.top, backgroundColor: OBSIDIAN }}>
          <OutfitArt itemId={item.id} rarity={item.rarity} height={420 + insets.top} />
          <View style={[styles.rarityBar, { backgroundColor: r.c }]} />
        </View>
        <View style={styles.body}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Tag label={r.label.toUpperCase()} bg={r.c} ink="#FFFFFF" />
            {lim ? <Tag label={lim.open ? 'ÉDITION LIMITÉE' : 'ÉDITION TERMINÉE'} gradient /> : null}
            {isNew(sheet, now) ? <Tag label="NOUVEAU" bg={LIME} /> : null}
            {worn ? <Tag label="PORTÉE" bg={LIME} /> : owned ? <Tag label="À TOI" bg="#E4E2DD" /> : null}
          </View>
          <Display size={30}>{item.name}</Display>
          <Txt size={15} lineHeight={22} color={t.ink2}>{sheet.tagline}</Txt>
          {lim && sheet.limited ? (
            <View style={[styles.limit, { backgroundColor: t.surf }, shadow.card]}>
              <Txt size={13} weight="bold">{sheet.limited.label}</Txt>
              <Txt size={13} num color={t.ink2}>{limitedLine(sheet.limited, now)}</Txt>
              <Txt size={12} lineHeight={17} color={t.ink2}>Après cette date, elle ne s’achète plus. Si tu l’as, elle reste à toi.</Txt>
            </View>
          ) : null}

          <Txt size={16} weight="bold" style={{ marginTop: 6 }}>Dans la tenue</Txt>
          <View style={[styles.pieces, { backgroundColor: t.surf }, shadow.card]}>
            {PIECES.filter((k) => sheet.pieces[k]).map((k, i) => (
              <View key={k} style={[styles.pieceRow, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line } : null]}>
                <Txt size={13} color={t.ink2} style={{ width: 92 }}>{PIECE_LABEL[k]}</Txt>
                <Txt size={14} weight="medium" style={{ flex: 1 }}>{sheet.pieces[k]}</Txt>
              </View>
            ))}
            <View style={[styles.pieceRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
              <Txt size={13} color={t.ink2} style={{ width: 92 }}>Décor</Txt>
              <Txt size={14} weight="medium" style={{ flex: 1 }}>{sheet.decor}</Txt>
            </View>
          </View>

          <Facts rows={[
            ['Collection', (coll?.name ?? '') + ' · ' + have + ' / ' + collItems.length + ' possédées'],
            ['Rareté', r.label],
            ['Prix', price === null ? 'Offerte à l’inscription' : fmt(price) + ' ' + CUR_NAMES[0] + (euros ? ' ou ' + euros : '')],
            ['Ton solde', fmt(balance) + ' ' + CUR_NAMES[0]],
            ...(wait !== null ? [[pace.mine ? 'À ton rythme' : 'En jouant', inDays(wait) + (pace.mine ? '' : ' (défi + 2 repas, 6 j / 7)')] as [string, string]] : []),
          ]} />
          {wait !== null ? (
            <View style={[styles.limit, { backgroundColor: t.surf }, shadow.card]}>
              <Txt size={13} weight="bold">{tooLate ? 'À ce rythme, l’édition sera finie avant' : 'Deux façons de l’avoir'}</Txt>
              <Txt size={13} lineHeight={19} color={t.ink2}>
                {'En bossant : ' + (waitMax !== null && waitMax < (wait ?? 0) ? '3 défis et 3 repas par jour, tu l’as ' + inDays(waitMax) + (tooLate && daysLeft !== null && waitMax <= daysLeft ? ', avant la fin.' : '.') : 'défi du jour et repas, ' + inDays(wait) + '.')}
              </Txt>
              {euros ? (
                <Txt size={13} lineHeight={19} color={t.ink2}>{'Tout de suite : ' + euros + ', achat Apple. Même tenue, rien de plus : payer va juste plus vite.'}</Txt>
              ) : null}
            </View>
          ) : null}
          <Txt size={12} lineHeight={17} color={t.ink2}>
            Dessinée sur ton perso, à ta silhouette. Illustration : le rendu peut varier un peu d’une tenue à l’autre.
          </Txt>
          {!owned && sale ? wishBtn : null}
        </View>
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: insets.bottom + 12, backgroundColor: t.bg, borderTopColor: t.line }]}>
        <Press haptic="medium" disabled={busy || (worn || (!canAct && !(missing > 0 && sale && !owned)))} onPress={act} style={[styles.cta, { backgroundColor: canAct ? LIME : t.surf }, canAct ? shadow.btn : shadow.card]}>
          {busy ? <ActivityIndicator color={OBSIDIAN} /> : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {!owned && sale && price !== null && missing === 0 ? <CoinIcon size={16} /> : null}
              <Txt size={15} weight="bold" num color={canAct ? OBSIDIAN : t.ink}>{cta}</Txt>
            </View>
          )}
        </Press>
        {canPay ? (
          <Press haptic="medium" disabled={paying || busy} onPress={pay} accessibilityLabel={'Acheter ' + item.name + ' pour ' + euros} style={[styles.pay, { borderColor: t.ink }]}>
            {paying ? <ActivityIndicator color={t.ink} /> : <Txt size={15} weight="bold" num>{'L’avoir tout de suite · ' + euros}</Txt>}
          </Press>
        ) : null}
        {!owned && sale && missing > 0 ? <Txt size={12} color={t.ink2} style={{ textAlign: 'center' }}>{canPay ? 'Fitcoins : touche le bouton vert pour aller aux défis du jour.' : 'Touche pour aller aux défis du jour et gagner des Fitcoins.'}</Txt> : null}
      </View>
      {top}
    </View>
  );
}

function Tag({ label, bg, ink = OBSIDIAN, gradient }: { label: string; bg?: string; ink?: string; gradient?: boolean }) {
  if (gradient)
    return (
      <LinearGradient colors={['#FF4FA3', '#FFC93C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tag}>
        <Txt size={10} weight="bold" color={OBSIDIAN}>{label}</Txt>
      </LinearGradient>
    );
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Txt size={10} weight="bold" color={ink}>{label}</Txt>
    </View>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  const t = useTheme();
  return (
    <View style={[styles.pieces, { backgroundColor: t.surf }, shadow.card]}>
      {rows.map(([k, v], i) => (
        <View key={k} style={[styles.pieceRow, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line } : null]}>
          <Txt size={13} color={t.ink2} style={{ width: 112 }}>{k}</Txt>
          <Txt size={14} weight="medium" num style={{ flex: 1 }}>{v}</Txt>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  close: { position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 10 },
  rarityBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 5 },
  tag: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9 },
  limit: { borderRadius: 20, padding: 14, gap: 4 },
  note: { borderRadius: 20, padding: 14 },
  pieces: { borderRadius: 20, paddingHorizontal: 14 },
  pieceRow: { flexDirection: 'row', paddingVertical: 12, gap: 8, alignItems: 'flex-start' },
  ghost: { height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, gap: 6, borderTopWidth: StyleSheet.hairlineWidth },
  pay: { height: 50, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  cta: { height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
});
