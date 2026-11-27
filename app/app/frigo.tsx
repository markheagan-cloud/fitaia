/**
 * « Dans mon frigo » : on coche ce qu'on a, on voit ce qu'on peut cuisiner tout de suite, ou avec 1 ou 2 ingrédients en
 * plus. Le frigo est gardé sur le téléphone ; il n'est jamais obligatoire. Allergies et régime restent des filtres stricts.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { V2 } from '@/theme/tokens';
import { fmt } from '@/data/content';
import { norm } from '@/coach/recipes';
import { usePrefs } from '@/coach/useRecipeSuggestions';
import { fridgeChoices, fridgeRecipesFor, type FridgeMatch } from '@/kitchen/fridge';
import { perServing, resolve } from '@/kitchen/nutrition';
import { useRecipes } from '@/store/useRecipes';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CloseIcon } from '@/components/Icons';
import { RecipePhoto } from '@/components/kitchen/parts';

const CHOICES = fridgeChoices();

function Row({ m }: { m: FridgeMatch }) {
  const t = useTheme();
  const router = useRouter();
  const r = m.recipe;
  const swaps = resolve(r, 1, m.subs).filter((x) => x.swapped);
  const kcal = Math.round(perServing(r, m.subs).kcal);
  return (
    <Press
      accessibilityLabel={'Voir la recette ' + r.name}
      pressScale={0.98}
      onPress={() => router.push({ pathname: '/recette/[id]', params: { id: r.id, subs: JSON.stringify(m.subs) } })}
      style={[styles.row, { backgroundColor: t.surf }]}
    >
      <RecipePhoto id={r.id} style={styles.thumb} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={15} weight="semibold" numberOfLines={1}>{r.name}</Txt>
        <Txt size={12} color={t.ink2} num>{r.minutes} min · {fmt(kcal)} kcal</Txt>
        {m.missing.length ? <Txt size={12} color={V2.violet} numberOfLines={1}>Il manque : {m.missing.join(', ')}</Txt> : null}
        {swaps.length ? <Txt size={12} color={t.ink2} numberOfLines={1}>Avec {swaps.map((x) => x.name).join(', ')}</Txt> : null}
      </View>
    </Press>
  );
}

export default function Fridge() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const fridge = useRecipes((s) => s.fridge);
  const toggleFridge = useRecipes((s) => s.toggleFridge);
  const clearFridge = useRecipes((s) => s.clearFridge);
  const prefs = usePrefs();
  const [q, setQ] = useState('');
  const res = useMemo(() => fridgeRecipesFor(fridge, prefs), [fridge, prefs]);
  const shown = q ? CHOICES.filter((c) => norm(c.name).includes(norm(q))) : CHOICES;
  const total = res.ready.length + res.one.length + res.two.length;

  return (
    <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + 8 }]}>
      <View style={styles.head}>
        <Display size={26}>Dans mon frigo</Display>
        <Press accessibilityLabel="Fermer" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/scanner'))} style={[styles.close, { backgroundColor: t.surf }]}>
          <CloseIcon size={14} color={t.ink} />
        </Press>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Txt size={14} color={t.ink2}>Coche ce que tu as. Huile, citron et sauce soja sont comptés comme dans ton placard. Gardé sur ton téléphone seulement.</Txt>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Chercher un aliment"
          placeholderTextColor={t.ink2}
          accessibilityLabel="Chercher un aliment"
          style={[styles.search, { backgroundColor: t.surf, color: t.ink, borderColor: t.line }]}
        />
        <View style={styles.wrap}>
          {shown.map((c) => {
            const on = fridge.includes(c.food);
            return (
              <Press
                key={c.food}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={c.name}
                pressScale={0.94}
                onPress={() => toggleFridge(c.food)}
                style={[styles.chip, { backgroundColor: on ? V2.lime : t.surf, borderColor: on ? V2.lime : t.line }]}
              >
                <Txt size={13} weight={on ? 'bold' : 'medium'} color={on ? V2.obsidian : t.ink}>{c.name}</Txt>
              </Press>
            );
          })}
        </View>
        {fridge.length ? (
          <Press accessibilityLabel="Vider mon frigo" onPress={clearFridge} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
            <Txt size={13} weight="semibold" color={t.ink2}>Tout décocher ({fridge.length})</Txt>
          </Press>
        ) : null}

        {!fridge.length ? null : total === 0 ? (
          <View style={[styles.empty, { backgroundColor: t.surf }]}>
            <Txt size={14} color={t.ink2}>Pas encore de recette avec ça. Ajoute un ou deux aliments.</Txt>
          </View>
        ) : (
          <>
            {res.ready.length ? <Section title="Prêtes maintenant" list={res.ready} /> : null}
            {res.one.length ? <Section title="Il manque 1 ingrédient" list={res.one} /> : null}
            {res.two.length ? <Section title="Il manque 2 ingrédients" list={res.two} /> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ title, list }: { title: string; list: FridgeMatch[] }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt size={17} weight="bold">{title} · {list.length}</Txt>
      {list.map((m) => (
        <Row key={m.recipe.id} m={m} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  search: { height: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 13, minHeight: 40, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 8 },
  thumb: { width: 64, height: 64, borderRadius: 14 },
  empty: { borderRadius: 18, padding: 16 },
});
