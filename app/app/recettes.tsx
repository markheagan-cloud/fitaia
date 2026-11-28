/**
 * Recettes : le catalogue (collections, catégories, toutes les recettes permises), les favoris, et « Mes goûts » où
 * tout ce que FITAIA sait se consulte, se modifie et se remet à zéro (régime, allergies, goûts, ce qui a été appris des
 * refus). Gardé sur le téléphone seulement. Les allergies ne sont jamais devinées : seulement celles déclarées ici.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme/ThemeProvider';
import { V2, shadow } from '@/theme/tokens';
import { fmt } from '@/data/content';
import { RECIPES, type Recipe } from '@/data/recipes';
import { ALLERGENS } from '@/kitchen/allergens';
import { CATEGORIES, inCollection, visibleCollections, type Collection } from '@/kitchen/collections';
import { perServing } from '@/kitchen/nutrition';
import { DIETS, FAMILIES, familyLabel, rankRecipes } from '@/coach/recipes';
import { useKitchenContext, usePrefs } from '@/coach/useRecipeSuggestions';
import { tasteOf, useRecipes } from '@/store/useRecipes';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CloseIcon } from '@/components/Icons';
import { FavButton, RecipePhoto, kitchenStyles } from '@/components/kitchen/parts';

type Tab = 'toutes' | 'favoris' | 'gouts';
const TABS: [Tab, string][] = [['toutes', 'Recettes'], ['favoris', 'Favoris'], ['gouts', 'Mes goûts']];

function Chip({ label, on, onPress, tone }: { label: string; on: boolean; onPress: () => void; tone?: 'no' }) {
  const t = useTheme();
  const bg = on ? (tone === 'no' ? V2.red : V2.lime) : t.surf;
  return (
    <Press
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      pressScale={0.94}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: bg, borderColor: on ? bg : t.line }]}
    >
      <Txt size={13} weight={on ? 'bold' : 'medium'} color={on ? V2.obsidian : t.ink}>{label}</Txt>
    </Press>
  );
}

function Card({ r }: { r: Recipe }) {
  const t = useTheme();
  const router = useRouter();
  const fav = useRecipes((s) => s.favorites.includes(r.id));
  const toggleFavorite = useRecipes((s) => s.toggleFavorite);
  const kcal = Math.round(perServing(r).kcal);
  return (
    <View style={[styles.card, { backgroundColor: t.surf }, shadow.card]}>
      <Press accessibilityLabel={'Voir la recette ' + r.name} pressScale={0.97} onPress={() => router.push({ pathname: '/recette/[id]', params: { id: r.id } })}>
        <RecipePhoto id={r.id} style={styles.cardPhoto} />
        <View style={{ padding: 10, gap: 3 }}>
          <Txt size={14} weight="semibold" numberOfLines={2} lineHeight={18} style={{ minHeight: 36 }}>{r.name}</Txt>
          <Txt size={12} color={t.ink2} num>{r.minutes} min · {fmt(kcal)} kcal</Txt>
        </View>
      </Press>
      <View style={styles.cardFav}>
        <FavButton size={34} on={fav} label={(fav ? 'Retirer des favoris : ' : 'Ajouter aux favoris : ') + r.name} onPress={() => toggleFavorite(r.id)} />
      </View>
    </View>
  );
}

function Grid({ list }: { list: Recipe[] }) {
  return (
    <View style={styles.grid}>
      {list.map((r) => (
        <View key={r.id} style={styles.cell}>
          <Card r={r} />
        </View>
      ))}
    </View>
  );
}

function CollectionCard({ c, on, onPress }: { c: Collection; on: boolean; onPress: () => void }) {
  return (
    <Press accessibilityLabel={'Collection ' + c.title} accessibilityState={{ selected: on }} pressScale={0.97} onPress={onPress} style={[styles.coll, on && { borderColor: V2.lime, borderWidth: 2 }]}>
      <RecipePhoto id={c.cover} style={kitchenStyles.cover} />
      <LinearGradient colors={['rgba(11,13,16,0)', 'rgba(11,13,16,0.85)']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0.2 }} end={{ x: 0, y: 1 }} />
      <View style={{ padding: 12, gap: 2 }}>
        <Txt size={15} weight="bold" color={V2.white} style={kitchenStyles.shadowText} numberOfLines={1}>{c.title}</Txt>
        <Txt size={11} color="rgba(245,246,248,0.85)" numberOfLines={1}>{c.line} · {inCollection(c).length}</Txt>
      </View>
    </Press>
  );
}

export default function Recettes() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'gouts' || params.tab === 'favoris' ? params.tab : 'toutes');
  const [coll, setColl] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const prefs = usePrefs();
  const ctx = useKitchenContext();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/scanner'));

  // ordre « pour toi » du moteur ; les recettes non permises (allergies, régime, refusées, mises de côté) n'apparaissent pas
  const ranked = useMemo(() => rankRecipes({ ...ctx, moment: undefined }).map((s) => s.recipe), [ctx]);
  const hiddenCount = RECIPES.length - ranked.length;
  const collections = visibleCollections(ranked);
  const c = collections.find((x) => x.id === coll);
  const k = CATEGORIES.find((x) => x.id === cat);
  const list = ranked.filter((r) => (!c || c.test(r)) && (!k || k.test(r)));
  const favs = RECIPES.filter((r) => prefs.favorites.includes(r.id));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[styles.head, { paddingTop: insets.top + 10 }]}>
        <Display size={28}>Recettes</Display>
        <Press accessibilityLabel="Fermer" onPress={close} style={[styles.close, { backgroundColor: t.surf }]}>
          <CloseIcon size={14} color={t.ink} />
        </Press>
      </View>
      <View style={[styles.tabs, { backgroundColor: t.surf }]} accessibilityRole="tablist">
        {TABS.map(([id, label]) => (
          <Press key={id} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} accessibilityLabel={label} pressScale={0.96} onPress={() => setTab(id)} style={[styles.tab, tab === id && { backgroundColor: V2.lime }]}>
            <Txt size={13} weight={tab === id ? 'bold' : 'medium'} color={tab === id ? V2.obsidian : t.ink}>{label}</Txt>
          </Press>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}>
        {tab === 'toutes' ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {collections.map((x) => (
                <CollectionCard key={x.id} c={x} on={coll === x.id} onPress={() => setColl(coll === x.id ? null : x.id)} />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              <Chip label="Toutes" on={!cat} onPress={() => setCat(null)} />
              {CATEGORIES.filter((x) => ranked.some(x.test)).map((x) => (
                <Chip key={x.id} label={x.label} on={cat === x.id} onPress={() => setCat(cat === x.id ? null : x.id)} />
              ))}
            </ScrollView>
            <Txt size={13} color={t.ink2} num>
              {list.length} recette{list.length > 1 ? 's' : ''}{c ? ' · ' + c.title : ''}
              {hiddenCount ? ' · ' + hiddenCount + ' masquée' + (hiddenCount > 1 ? 's' : '') + ' par tes réglages' : ''}
            </Txt>
            {list.length ? <Grid list={list} /> : <Txt size={14} color={t.ink2}>Aucune recette dans ce choix avec tes réglages.</Txt>}
          </>
        ) : tab === 'favoris' ? (
          favs.length ? (
            <Grid list={favs} />
          ) : (
            <View style={[styles.box, { backgroundColor: t.surf }]}>
              <Txt size={14} color={t.ink2}>Touche le cœur d’une recette pour la retrouver ici. Tes favoris font aussi remonter des recettes proches.</Txt>
            </View>
          )
        ) : (
          <Tastes />
        )}
      </ScrollView>
    </View>
  );
}

/** « Mes goûts » : tout se voit, se change et s'efface. */
function Tastes() {
  const t = useTheme();
  const s = useRecipes();
  const [confirm, setConfirm] = useState(false);
  const [now] = useState(() => Date.now());
  const snoozed = Object.values(s.snoozed).filter((until) => until > now).length;
  const learned = Object.entries(s.negatives).filter(([, n]) => n > 0);
  return (
    <View style={{ gap: 18 }}>
      <Txt size={13} lineHeight={19} color={t.ink2}>Tout ce qui suit reste sur ton téléphone. Rien n’est envoyé.</Txt>

      <Block title="Allergies et intolérances" note="Filtre strict : aucune recette qui en contient ne te sera proposée. Vérifie quand même les étiquettes, des traces sont possibles.">
        {ALLERGENS.map((a) => (
          <Chip key={a.id} label={a.label} on={s.allergies.includes(a.id)} tone="no" onPress={() => s.toggleAllergy(a.id)} />
        ))}
      </Block>

      <Block title="Régime">
        {DIETS.map((d) => (
          <Chip key={d.id} label={d.label} on={s.diet.includes(d.id)} onPress={() => s.toggleDiet(d.id)} />
        ))}
      </Block>

      <Block title="Ce que j’aime" note="Un appui : j’aime. Deux : pas pour moi. Trois : neutre.">
        {FAMILIES.map((f) => {
          const v = tasteOf(s, f.id);
          return <Chip key={f.id} label={(v === 'aime' ? '♥ ' : v === 'non' ? '✕ ' : '') + f.label} on={v !== 'neutre'} tone={v === 'non' ? 'no' : undefined} onPress={() => s.cycleFamily(f.id)} />;
        })}
      </Block>

      <View style={[styles.box, { backgroundColor: t.surf, gap: 8 }]}>
        <Txt size={16} weight="bold">Ce que FITAIA a appris</Txt>
        <Txt size={13} color={t.ink2}>
          {s.tooHard ? '« Trop compliqué » ' + s.tooHard + ' fois : les recettes les plus simples passent d’abord.\n' : ''}
          {learned.length ? 'Tu préfères varier : ' + learned.map(([f]) => familyLabel(f).toLowerCase()).join(', ') + ' un peu moins souvent.\n' : ''}
          {snoozed ? snoozed + ' recette' + (snoozed > 1 ? 's' : '') + ' mise' + (snoozed > 1 ? 's' : '') + ' de côté pour l’instant.\n' : ''}
          {s.hidden.length ? s.hidden.length + ' recette' + (s.hidden.length > 1 ? 's' : '') + ' écartée' + (s.hidden.length > 1 ? 's' : '') + '.\n' : ''}
          {!s.tooHard && !learned.length && !snoozed && !s.hidden.length ? 'Rien pour l’instant. Quand tu dis « Pas pour moi », la raison (facultative) s’affiche ici.' : ''}
        </Txt>
        {snoozed || s.hidden.length ? (
          <Press accessibilityLabel="Réafficher les recettes mises de côté" onPress={s.unhideAll} style={[styles.btn, { borderColor: t.line }]}>
            <Txt size={14} weight="semibold">Réafficher les recettes mises de côté</Txt>
          </Press>
        ) : null}
      </View>

      <Press
        accessibilityLabel={confirm ? 'Confirmer la remise à zéro' : 'Tout remettre à zéro'}
        onPress={() => {
          if (!confirm) return setConfirm(true);
          s.resetPrefs();
          setConfirm(false);
        }}
        style={[styles.btn, { borderColor: confirm ? V2.red : t.line }]}
      >
        <Txt size={14} weight="semibold" color={confirm ? V2.red : t.ink2}>{confirm ? 'Touche encore pour tout effacer' : 'Tout remettre à zéro'}</Txt>
      </Press>
      <Txt size={12} color={t.ink2}>Remet à zéro goûts, régime, allergies, favoris et apprentissages. Ton journal n’est pas touché.</Txt>
    </View>
  );
}

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Txt size={16} weight="bold">{title}</Txt>
      {note ? <Txt size={12} lineHeight={17} color={t.ink2}>{note}</Txt> : null}
      <View style={styles.wrap}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 999, padding: 4 },
  tab: { flex: 1, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: 999, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 13, minHeight: 40, justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  cell: { width: '50%', padding: 5 },
  card: { borderRadius: 20, overflow: 'hidden' },
  cardPhoto: { width: '100%', height: 120 },
  cardFav: { position: 'absolute', top: 8, right: 8 },
  coll: { width: 196, height: 116, borderRadius: 20, overflow: 'hidden', justifyContent: 'flex-end' },
  box: { borderRadius: 20, padding: 16 },
  btn: { height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
