/**
 * Mon vestiaire : les tenues qu'on possède, et s'habiller pièce par pièce en mélangeant leurs pièces (le haut d'une
 * tenue, le bas d'une autre, les chaussures d'une troisième, l'accessoire, le décor). Le mélange est DESSINÉ sur le
 * perso par le service (mode « mix ») : l'aperçu ne montre jamais un collage ni l'image d'une autre tenue. Tant que
 * le mélange n'est pas dessiné, l'écran le dit.
 */
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow } from '@/theme/tokens';
import { useGame } from '@/store/useGame';
import { useEco } from '@/store/useEco';
import { useCelebrate } from '@/fx/celebrate';
import { skinOf } from '@/avatar/outfits';
import { caricatureConfigured } from '@/services/caricature';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CloseIcon } from '@/components/Icons';
import { PIECE_LABEL, sheetOf } from '@/shop/catalogue';
import { useMyOutfits } from '@/shop/ShopArt';
import { useLook } from '@/shop/useLook';
import { PLEIN, SLOTS, hasPiece, mixKey, mixOfOutfit, mixProblem, setPiece, wholeOutfit, type Mix, type Slot } from '@/shop/melange';

const ROWS: (Slot | 'fond')[] = [...SLOTS, 'fond'];
const ROW_LABEL: Record<Slot | 'fond', string> = { ...PIECE_LABEL, accessoire: 'Accessoire', fond: 'Décor' };

export default function Vestiaire() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const say = useGame((s) => s.say);
  const caricature = useGame((s) => s.caricature);
  const drawMyMix = useGame((s) => s.drawMyMix);
  const celebrate = useCelebrate((s) => s.celebrate);
  const { inventory, equip } = useEco();
  const mine = useMyOutfits() ?? {};
  const worn = useLook((s) => s.worn);
  const saved = useLook((s) => s.saved);
  const wear = useLook((s) => s.wear);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // tenues à soi, dans l'ordre du catalogue (identifiants de skin)
  const owned = useMemo(
    () => (inventory?.items ?? []).map((i) => skinOf(i.itemId)?.id).filter((x): x is string => !!x && !!sheetOf('outfit_' + x)),
    [inventory],
  );
  const equippedSkin = skinOf(inventory?.equipped.FULL_OUTFIT)?.id ?? owned[0] ?? 'origine';
  const startMix = saved.find((s) => s.key === worn)?.mix ?? mixOfOutfit(equippedSkin);
  const [mix, setMix] = useState<Mix>(startMix);

  const key = mixKey(mix);
  const whole = wholeOutfit(mix);
  const drawn = whole ? mine[whole] : mine[key];
  const problem = mixProblem(mix);
  const isWorn = whole ? !worn && whole === equippedSkin : worn === key;
  const close = () => (router.canGoBack() ? router.back() : router.navigate('/(tabs)/perso'));

  const act = async () => {
    if (busy || problem || isWorn) return;
    if (whole) {
      const r = await equip('outfit_' + whole);
      say(r.ok ? 'Tenue ' + (skinOf('outfit_' + whole)?.name ?? '') + ' sur ton perso' : r.message, r.ok ? 'ok' : 'bad');
      return;
    }
    if (drawn) {
      wear(key, mix);
      say('Ton look est sur ton perso', 'ok');
      return;
    }
    setBusy(true);
    abort.current = new AbortController();
    try {
      const k = await drawMyMix(mix as Record<string, string>, abort.current.signal);
      wear(k, mix);
      const uri = useGame.getState().caricature?.outfits?.[k];
      celebrate({ title: 'Nouveau look', sub: 'Dessiné sur ton perso. Il est dans tes looks.', image: uri });
    } catch (e) {
      say(e instanceof Error ? e.message : 'Dessin impossible pour le moment', 'bad');
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const cta = problem
    ? problem
    : isWorn
      ? 'Sur ton perso'
      : whole
        ? 'Mettre cette tenue'
        : drawn
          ? 'Porter ce look'
          : 'Dessiner ce look sur mon perso';
  const canAct = !problem && !isWorn && !busy && (whole || drawn || (caricature && caricatureConfigured));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <View style={{ height: 400 + insets.top, backgroundColor: OBSIDIAN }}>
          {drawn ? (
            <Image source={{ uri: drawn }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel="Ton perso dans ce look" />
          ) : caricature ? (
            <View style={styles.pending}>
              <Image source={{ uri: caricature.portraitUri }} style={styles.pendingFace} accessibilityLabel="Ton perso" />
              <Txt size={15} weight="bold" color="#F5F4F1" style={{ textAlign: 'center' }}>
                {busy ? 'Ton perso s’habille…' : 'Ce look n’est pas encore dessiné'}
              </Txt>
              <Txt size={13} lineHeight={19} color="#B7BBC2" style={{ textAlign: 'center' }}>
                {busy ? 'Quelques secondes, jusqu’à une minute si le service se réveille.' : 'Choisis tes pièces, puis touche « Dessiner ». Le look est dessiné sur ton perso, pas collé.'}
              </Txt>
              {busy ? <ActivityIndicator color={LIME} /> : null}
            </View>
          ) : (
            <View style={styles.pending}>
              <Txt size={15} weight="bold" color="#F5F4F1" style={{ textAlign: 'center' }}>Crée ton perso pour t’habiller</Txt>
              <Press onPress={() => router.push('/selfie')} style={[styles.small, { backgroundColor: LIME }]}>
                <Txt size={14} weight="bold" color={OBSIDIAN}>Prendre mon selfie</Txt>
              </Press>
            </View>
          )}
        </View>
        <Press accessibilityLabel="Fermer" onPress={close} style={[styles.close, { top: insets.top + 10 }]}>
          <CloseIcon size={14} color="#F5F4F1" />
        </Press>

        <View style={styles.body}>
          <Display size={28}>Mon vestiaire</Display>
          <Txt size={14} lineHeight={20} color={t.ink2}>
            {owned.length + (owned.length > 1 ? ' tenues à toi. ' : ' tenue à toi. ') + 'Prends le haut de l’une, le bas d’une autre, les chaussures d’une troisième : chaque pièce que tu as débloquée se mélange.'}
          </Txt>

          {ROWS.map((row) => {
            const blocked = row === 'bas' && !!mix.haut && PLEIN.has(mix.haut);
            const choices = owned.filter((s) => (row === 'fond' ? true : hasPiece(s, row)));
            return (
              <View key={row} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Txt size={15} weight="bold">{ROW_LABEL[row]}</Txt>
                  <Txt size={12} color={t.ink2} numberOfLines={1} style={{ flexShrink: 1, marginLeft: 12 }}>
                    {blocked ? 'Combinaison : pas de bas' : mix[row] ? label(mix[row]!, row) : row === 'chaussures' ? 'Baskets blanches unies' : row === 'fond' ? 'Celui du haut' : row === 'accessoire' ? 'Aucun' : 'À choisir'}
                  </Txt>
                </View>
                {blocked ? null : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                    {choices.map((s) => {
                      const on = mix[row] === s;
                      const img = mine[s];
                      return (
                        <Press
                          key={s}
                          accessibilityLabel={ROW_LABEL[row] + ' : ' + label(s, row)}
                          accessibilityState={{ selected: on }}
                          onPress={() => setMix((m) => setPiece(m, row, s))}
                          style={[styles.chip, { backgroundColor: t.surf, borderColor: on ? LIME : 'transparent' }, shadow.card]}
                        >
                          <View style={styles.thumb}>
                            {img ? <Image source={{ uri: img }} style={[styles.thumbImg, cropFor(row)]} resizeMode="cover" /> : <View style={[styles.thumbImg, { backgroundColor: OBSIDIAN }]} />}
                          </View>
                          <Txt size={11} weight={on ? 'bold' : 'medium'} numberOfLines={2} style={{ width: 84 }}>{label(s, row)}</Txt>
                        </Press>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            );
          })}

          {saved.length ? (
            <View style={{ gap: 6 }}>
              <Txt size={15} weight="bold">Mes looks</Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {saved.filter((l) => mine[l.key]).map((l) => (
                  <Press key={l.key} accessibilityLabel="Reprendre ce look" onPress={() => setMix(l.mix)} style={[styles.look, { borderColor: l.key === key ? LIME : 'transparent' }]}>
                    <Image source={{ uri: mine[l.key] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  </Press>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <Txt size={12} lineHeight={17} color={t.ink2}>
            Un nouveau look est dessiné une fois, puis il reste dans tes looks. Illustration : le rendu peut varier un peu d’un look à l’autre.
          </Txt>
        </View>
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: insets.bottom + 12, backgroundColor: t.bg, borderTopColor: t.line }]}>
        <Press haptic="medium" disabled={!canAct} onPress={act} style={[styles.cta, { backgroundColor: canAct ? LIME : t.surf }, canAct ? shadow.btn : shadow.card]}>
          {busy ? <ActivityIndicator color={OBSIDIAN} /> : <Txt size={15} weight="bold" color={canAct ? OBSIDIAN : t.ink}>{cta}</Txt>}
        </Press>
      </View>
    </View>
  );
}

/** Nom de la pièce (fiche de la tenue), ou nom de la tenue pour le décor. */
function label(skin: string, row: Slot | 'fond'): string {
  const sheet = sheetOf('outfit_' + skin);
  if (row === 'fond') return sheet?.decor ?? skin;
  return sheet?.pieces[row] ?? skinOf('outfit_' + skin)?.name ?? skin;
}

/** Vignette cadrée sur la pièce dans le dessin de la tenue entière (haut, bas, pieds, tête). */
function cropFor(row: Slot | 'fond') {
  if (row === 'haut') return { transform: [{ scale: 2 }, { translateY: -2 }] };
  if (row === 'bas') return { transform: [{ scale: 2 }, { translateY: -14 }] };
  if (row === 'chaussures') return { transform: [{ scale: 2.4 }, { translateY: -26 }] };
  if (row === 'accessoire') return { transform: [{ scale: 1.6 }, { translateY: 8 }] };
  return {};
}

const styles = StyleSheet.create({
  close: { position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,16,18,0.55)' },
  pending: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 28 },
  pendingFace: { width: 150, height: 150, borderRadius: 75, opacity: 0.9 },
  small: { borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16 },
  body: { padding: 16, gap: 16 },
  chip: { borderRadius: 16, padding: 6, gap: 6, borderWidth: 2 },
  thumb: { width: 84, height: 84, borderRadius: 12, overflow: 'hidden' },
  thumbImg: { width: 84, height: 84 },
  look: { width: 96, height: 96, borderRadius: 16, overflow: 'hidden', borderWidth: 2 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
});
