import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, RED, AMBER, shadow } from '@/theme/tokens';
import { Food, offSearchAvailable, portionPresets, searchLocal, searchOff, toMeal } from '@/services/food';
import { mealScore } from '@/store/economy';
import { fmt } from '@/data/content';
import { Press } from './Press';
import { Txt, Display } from './Txt';

const NUTRI: Record<string, string> = { a: '#1E8F4E', b: '#5BB54B', c: '#F5C33B', d: '#EF8A2B', e: '#E2483D' };

/** Recherche d'aliments : base locale instantanée + Open Food Facts (réseau), sans clé ni compte. */
export function FoodSearch({ onPick, autoFocus }: { onPick: (food: Food) => void; autoFocus?: boolean }) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const term = q.trim();
  const local = useMemo(() => searchLocal(q), [q]);
  // Résultat réseau, étiqueté par le terme cherché : aucun setState synchrone dans l'effet.
  const [net, setNet] = useState<{ term: string; remote: Food[]; err: string; done: boolean }>({ term: '', remote: [], err: '', done: true });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    abort.current?.abort();
    if (term.length < 3) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    const timer = setTimeout(() => {
      searchOff(term, ctrl.signal)
        .then((r) => {
          if (!ctrl.signal.aborted) setNet({ term, remote: r, err: '', done: true });
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          const msg = e instanceof Error && /Network|fetch/i.test(e.message) ? 'Hors ligne : seuls les aliments courants sont proposés' : 'Open Food Facts ne répond pas, aliments courants seulement';
          setNet({ term, remote: [], err: msg, done: true });
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [term]);

  const fresh = net.term === term;
  const remote = fresh ? net.remote : [];
  const err = fresh ? net.err : '';
  const loading = term.length >= 3 && !fresh;

  const list = [...local, ...remote.filter((r) => !local.some((l) => l.name.toLowerCase() === r.name.toLowerCase()))].slice(0, 14);

  return (
    <View style={{ gap: 8 }}>
      <View style={[styles.input, { borderColor: t.line, backgroundColor: t.surf }]}>
        <TextInput
          accessibilityLabel="Chercher un aliment"
          value={q}
          onChangeText={setQ}
          autoFocus={autoFocus}
          autoCorrect={false}
          placeholder="Ex. : yaourt grec, riz, poulet…"
          placeholderTextColor={t.ink2}
          style={[styles.inputText, { color: t.ink }]}
          returnKeyType="search"
        />
        {loading ? <ActivityIndicator color={t.ink2} /> : null}
      </View>
      {err ? <Txt size={12} color={t.ink2} style={{ paddingHorizontal: 4 }}>{err}</Txt> : null}
      {list.map((f) => (
        <Press key={f.id} onPress={() => onPick(f)} pressScale={0.985} style={[styles.row, { backgroundColor: t.surf }, shadow.sm]}>
          {f.image ? <Image source={{ uri: f.image }} style={styles.thumb} contentFit="cover" /> : <View style={[styles.thumb, { backgroundColor: t.bg }]} />}
          <View style={{ flex: 1, gap: 1 }}>
            <Txt size={14} weight="semibold" numberOfLines={1}>{f.name}</Txt>
            <Txt size={12} color={t.ink2} numberOfLines={1}>
              {f.brand ? f.brand + ' · ' : ''}{fmt(f.per100.kcal)} kcal / 100 g · P {f.per100.p} · G {f.per100.g} · L {f.per100.l}
            </Txt>
          </View>
          {f.nutriscore ? (
            <View style={[styles.nutri, { backgroundColor: NUTRI[f.nutriscore] }]}>
              <Txt size={11} weight="bold" color="#FFF">{f.nutriscore.toUpperCase()}</Txt>
            </View>
          ) : f.source === 'local' ? (
            <Txt size={11} color={t.ink2}>moyen</Txt>
          ) : null}
        </Press>
      ))}
      {term.length >= 3 && !loading && list.length === 0 ? <Txt size={13} color={t.ink2} style={{ paddingHorizontal: 4 }}>Rien trouvé. Essaie un mot plus simple, ou écris ton repas à la main.</Txt> : null}
      {term.length === 0 ? <Txt size={12} color={t.ink2} style={{ paddingHorizontal: 4 }}>{offSearchAvailable ? 'Aliments courants instantanés + produits du commerce via Open Food Facts (base ouverte, gratuite).' : 'Sur ordinateur : aliments courants et code-barres. Sur ton iPhone, Open Food Facts complète la recherche.'}</Txt> : null}
    </View>
  );
}

/** Choix de la portion → repas prêt à ajouter. */
export function PortionPicker({ food, onConfirm, onBack }: { food: Food; onConfirm: (grams: number) => void; onBack: () => void }) {
  const t = useTheme();
  const presets = portionPresets(food);
  const [grams, setGrams] = useState(presets[0] ?? 100);
  const [txt, setTxt] = useState(String(presets[0] ?? 100));
  const meal = toMeal(food, grams);
  const score = mealScore(meal.kcal, meal.p, meal.g, meal.l);
  const scoreColor = score >= 70 ? LIME : score >= 50 ? AMBER : RED;
  const setBoth = (g: number) => {
    const v = Math.max(1, Math.min(2000, Math.round(g)));
    setGrams(v);
    setTxt(String(v));
  };
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {food.image ? <Image source={{ uri: food.image }} style={styles.big} contentFit="cover" /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={15} weight="bold" numberOfLines={2}>{food.name}</Txt>
          <Txt size={12} color={t.ink2}>{food.brand ? food.brand + ' · ' : ''}{fmt(food.per100.kcal)} kcal / 100 g{food.source === 'local' ? ' · valeurs moyennes' : ''}</Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {presets.map((p) => (
          <Press key={p} onPress={() => setBoth(p)} style={[styles.chip, { backgroundColor: grams === p ? t.ink : t.surf, borderColor: grams === p ? t.ink : t.line }]}>
            <Txt size={13} weight="semibold" num color={grams === p ? t.bg : t.ink}>{p} g</Txt>
          </Press>
        ))}
      </View>
      <View style={[styles.stepper, { backgroundColor: t.surf, borderColor: t.line }]}>
        <Press accessibilityLabel="Moins" onPress={() => setBoth(grams - 10)} style={[styles.stepBtn, { backgroundColor: t.bg }]}><Txt size={18} weight="bold">−</Txt></Press>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
          <TextInput accessibilityLabel="Quantité en grammes" value={txt} onChangeText={(v) => { setTxt(v); const n = Number(v.replace(',', '.')); if (n > 0) setGrams(Math.min(2000, Math.round(n))); }} keyboardType="number-pad" style={[styles.gramInput, { color: t.ink }]} />
          <Txt size={14} color={t.ink2}>g</Txt>
        </View>
        <Press accessibilityLabel="Plus" onPress={() => setBoth(grams + 10)} style={[styles.stepBtn, { backgroundColor: t.bg }]}><Txt size={18} weight="bold">+</Txt></Press>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Display wide size={30} num lineHeight={32} letterSpacing={-1.4}>{fmt(meal.kcal)}<Display wide size={14} letterSpacing={0} color={t.ink2}> kcal</Display></Display>
        <Txt size={13} num color={t.ink2}>P {meal.p} g · G {meal.g} g · L {meal.l} g</Txt>
        <View style={[styles.score, { borderColor: scoreColor }]}><Txt size={14} weight="bold" num lineHeight={14}>{score}</Txt></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Press onPress={onBack} style={[styles.ghost, { borderColor: t.line }]}><Txt size={14} weight="semibold">Retour</Txt></Press>
        <Press haptic="medium" onPress={() => onConfirm(grams)} style={[styles.primary, shadow.btn]}><Txt size={14} weight="bold" color={OBSIDIAN}>Valider la portion</Txt></Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { height: 50, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputText: { flex: 1, minWidth: 0, fontSize: 16, fontFamily: 'DMSans_500Medium' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, padding: 10 },
  thumb: { width: 40, height: 40, borderRadius: 12 },
  big: { width: 56, height: 56, borderRadius: 16 },
  nutri: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  chip: { flex: 1, height: 38, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 18, borderWidth: 1, padding: 6 },
  stepBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  gramInput: { fontSize: 24, fontFamily: 'ArchivoSemiExpanded_800ExtraBold', fontVariant: ['tabular-nums'], minWidth: 60, textAlign: 'right', padding: 0 },
  score: { width: 44, height: 44, borderRadius: 999, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  ghost: { flex: 1, height: 50, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  primary: { flex: 1.5, height: 50, borderRadius: 18, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
});
