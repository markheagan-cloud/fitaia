import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Image, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow } from '@/theme/tokens';
import { useGame } from '@/store/useGame';
import { Offer, buy, loadOffers, purchasesAvailable, restore } from '@/services/purchases';
import { SKINS } from '@/data/content';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CloseIcon } from '@/components/Icons';

/**
 * Paywall FITAIA Plus — règles (skill paywalls) : après le moment « aha » (premier défi réussi), jamais dans l'onboarding,
 * « Pas maintenant » visible, pas de compte à rebours factice, restauration des achats, prix réels uniquement.
 */
export default function Paywall() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const setPlus = useGame((s) => s.setPlus);
  const markPaywallShown = useGame((s) => s.markPaywallShown);
  const say = useGame((s) => s.say);
  const firstWinAt = useGame((s) => s.firstWinAt);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [choice, setChoice] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const available = purchasesAvailable();

  useEffect(() => {
    markPaywallShown();
    loadOffers()
      .then((o) => {
        setOffers(o);
        const year = o.find((x) => x.period === 'year');
        setChoice(year?.id ?? o[0]?.id ?? '');
      })
      .catch(() => setOffers([]));
  }, [markPaywallShown]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  const purchase = async () => {
    if (!choice) return;
    setBusy(true);
    try {
      const ok = await buy(choice);
      if (ok) {
        setPlus(true);
        say('FITAIA Plus activé', 'ok');
        close();
      }
    } catch {
      say('Achat non finalisé', 'bad');
    } finally {
      setBusy(false);
    }
  };
  const doRestore = async () => {
    setBusy(true);
    try {
      const ok = await restore();
      if (ok) {
        setPlus(true);
        say('Abonnement restauré', 'ok');
        close();
      } else say('Aucun abonnement à restaurer', 'ok');
    } catch {
      say('Restauration impossible pour le moment', 'bad');
    } finally {
      setBusy(false);
    }
  };

  const perks = [
    ['Tenues légendaires', 'Titane Néon et Atelier Noir débloquées'],
    ['Dessin HD de ton perso', 'Version dessinée par Fito, à partir de ton selfie'],
    ['550 FIT Points chaque mois', 'Pour le Pass Élite et la boutique'],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Press accessibilityLabel="Pas maintenant" onPress={close} style={[styles.close, { backgroundColor: t.surf }]}>
            <CloseIcon color={t.ink} />
          </Press>
        </View>
        <View style={[styles.hero, { backgroundColor: '#E6E4DF' }, shadow.lg]}>
          <Image source={SKINS.find((k) => k.id === 'titane')!.img} accessibilityLabel="Tenue Titane Néon" style={{ width: width - 32, height: 260 }} resizeMode="cover" />
        </View>
        <Display size={26}>Débloque les tenues légendaires pour ton perso</Display>
        <Txt size={14} lineHeight={20} color={t.ink2}>{firstWinAt ? 'Ton premier défi est validé. ' : ''}FITAIA Plus habille ton perso et finance son dessin HD, sans changer les défis gratuits.</Txt>
        <View style={{ gap: 8 }}>
          {perks.map(([k, v]) => (
            <View key={k} style={[styles.perk, { backgroundColor: t.surf }]}>
              <View style={[styles.dot, { backgroundColor: LIME }]} />
              <View style={{ flex: 1 }}>
                <Txt size={14} weight="bold">{k}</Txt>
                <Txt size={12} color={t.ink2}>{v}</Txt>
              </View>
            </View>
          ))}
        </View>

        {available && offers && offers.length ? (
          <View style={{ gap: 8 }}>
            {offers.map((o) => {
              const on = o.id === choice;
              return (
                <Press key={o.id} accessibilityState={{ selected: on }} onPress={() => setChoice(o.id)} style={[styles.offer, { borderColor: on ? t.ink : t.line, backgroundColor: on ? t.ink : t.surf }]}>
                  <View style={{ flex: 1 }}>
                    <Txt size={14} weight="bold" color={on ? t.bg : t.ink}>{o.period === 'year' ? 'Annuel' : o.period === 'month' ? 'Mensuel' : o.title}</Txt>
                    {o.period === 'year' ? <Txt size={12} color={on ? t.track : t.ink2}>2 mois offerts par rapport au mensuel</Txt> : null}
                  </View>
                  <Txt size={16} weight="bold" num color={on ? t.bg : t.ink}>{o.price}</Txt>
                </Press>
              );
            })}
            <Press haptic="medium" disabled={busy || !choice} onPress={purchase} style={[styles.primary, shadow.btn]}>
              <Txt size={16} weight="bold" color={OBSIDIAN}>{busy ? 'Un instant…' : 'Continuer'}</Txt>
            </Press>
            <Txt size={11} lineHeight={15} color={t.ink2} style={{ textAlign: 'center' }}>Abonnement renouvelé automatiquement, annulable à tout moment dans les réglages de ton compte App Store.</Txt>
          </View>
        ) : (
          <View style={[styles.perk, { backgroundColor: t.surf }]}>
            <Txt size={13} lineHeight={18} color={t.ink2}>
              {available ? 'Chargement des offres…' : 'Les abonnements s’activent dans la version App Store (paiement Apple). Rien n’est facturé ici.'}
            </Txt>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Press onPress={close} style={[styles.ghost, { borderColor: t.line }]}>
            <Txt size={14} weight="semibold">Pas maintenant</Txt>
          </Press>
          <Press disabled={busy || !available} onPress={doRestore} style={[styles.ghost, { borderColor: t.line }]}>
            <Txt size={14} weight="semibold">Restaurer mes achats</Txt>
          </Press>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  close: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  hero: { height: 260, borderRadius: 28, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, padding: 12 },
  dot: { width: 10, height: 10, borderRadius: 999 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, borderWidth: 1.5, padding: 14 },
  primary: { height: 54, borderRadius: 22, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  ghost: { flex: 1, height: 48, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
