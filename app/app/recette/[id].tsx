/**
 * Fiche recette : photo, infos, « Pourquoi cette recette ? », nutrition par portion (estimation), allergènes, portions
 * qui recalculent tout, ingrédients à cocher, remplacements sûrs, étapes, puis « Cuisiner » ou « Je la mange ».
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { V2 } from '@/theme/tokens';
import { RECIPES, DIFFICULTY_LABEL } from '@/data/recipes';
import { ALLERGENS } from '@/kitchen/allergens';
import { allergensOf, cap, fmtCount, perServing, resolve, round, stepChanges, totalOf, type Subs } from '@/kitchen/nutrition';
import { exclusion, rankRecipes } from '@/coach/recipes';
import { useKitchenContext, usePrefs } from '@/coach/useRecipeSuggestions';
import { useRecipes } from '@/store/useRecipes';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { Action, BackIcon, ClockIcon, FavButton, MacroTiles, RecipePhoto, RoundButton, kitchenStyles, ShareIcon, TickIcon } from '@/components/kitchen/parts';
import { EatSheet, SwapSheet } from '@/components/kitchen/sheets';

const SERVINGS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8];

function parseSubs(raw: unknown): Subs {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const o = JSON.parse(raw) as Record<string, string>;
    const out: Subs = {};
    for (const [k, v] of Object.entries(o)) if (typeof v === 'string') out[Number(k)] = v;
    return out;
  } catch {
    return {};
  }
}

export default function RecipeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; subs?: string }>();
  const recipe = RECIPES.find((r) => r.id === params.id);
  const cooking = useRecipes((s) => (recipe ? s.cooking[recipe.id] : undefined));
  // une recette commencée il y a plus d'un jour n'est plus proposée en reprise
  const [now] = useState(() => Date.now());
  const saved = cooking && now - cooking.updatedAt < 86_400_000 ? cooking : undefined;
  const fav = useRecipes((s) => (recipe ? s.favorites.includes(recipe.id) : false));
  const toggleFavorite = useRecipes((s) => s.toggleFavorite);
  const saveCook = useRecipes((s) => s.saveCook);
  const endCook = useRecipes((s) => s.endCook);
  const prefs = usePrefs();
  const ctx = useKitchenContext();
  const [servings, setServings] = useState(saved?.servings ?? 1);
  const [subs, setSubs] = useState<Subs>(() => ({ ...(saved?.subs ?? {}), ...parseSubs(params.subs) }));
  const [checked, setChecked] = useState<number[]>(saved?.checked ?? []);
  const [swap, setSwap] = useState(false);
  const [eat, setEat] = useState(false);
  const [solid, setSolid] = useState(false);

  const why = useMemo(() => {
    if (!recipe) return [];
    return rankRecipes({ ...ctx, moment: recipe.moment }, [recipe])[0]?.reasons ?? [];
  }, [ctx, recipe]);

  if (!recipe) {
    return (
      <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + 20, padding: 20, gap: 12 }]}>
        <Display size={22}>Recette introuvable</Display>
        <Action label="Retour" onPress={() => router.back()} block />
      </View>
    );
  }
  const per = perServing(recipe, subs);
  const total = round(totalOf(recipe, servings, subs));
  const items = resolve(recipe, servings, subs);
  const al = allergensOf(recipe, subs);
  const alLabels = al.map((a) => ALLERGENS.find((x) => x.id === a)?.label.toLowerCase() ?? a);
  const declared = al.filter((a) => prefs.allergies.includes(a));
  const blocked = exclusion(recipe, { ...prefs, snoozed: {}, hidden: [] });
  const idx = SERVINGS.indexOf(servings);
  const stepServings = (d: number) => setServings(SERVINGS[Math.max(0, Math.min(SERVINGS.length - 1, idx + d))]);
  const swaps = Object.keys(subs).length;

  const cook = () => {
    const resume = saved && saved.servings === servings && JSON.stringify(saved.subs) === JSON.stringify(subs);
    saveCook(recipe.id, resume ? { checked } : { step: 0, servings, subs, checked, timerEnd: null, timerStep: null });
    router.push({ pathname: '/cuisine/[id]', params: { id: recipe.id } });
  };
  const share = () => {
    const lines = [recipe.name + ' (' + recipe.minutes + ' min, ' + fmtCount(servings) + ' portion' + (servings > 1 ? 's' : '') + ')', '', ...items.filter((x) => !x.removed).map((x) => '• ' + cap(x.name) + ' : ' + x.qty), '', ...recipe.steps.map((s, i) => i + 1 + '. ' + s.t), '', 'Recette FITAIA'];
    Share.share({ message: lines.join('\n') }).catch(() => {});
  };

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const past = e.nativeEvent.contentOffset.y > 250;
          if (past !== solid) setSolid(past);
        }}
      >
        <View style={styles.photo}>
          <RecipePhoto id={recipe.id} style={kitchenStyles.cover} label={'Photo : ' + recipe.name} />
        </View>
        <View style={[styles.body, { backgroundColor: t.bg }]}>
          <View style={{ gap: 6 }}>
            <Display size={27} lineHeight={30}>{recipe.name}</Display>
            <Txt size={14} lineHeight={20} color={t.ink2}>{recipe.desc}</Txt>
          </View>
          <View style={styles.infoRow}>
            <Info icon={<ClockIcon size={14} color={t.ink2} />} label={recipe.minutes + ' min'} />
            <Info label={DIFFICULTY_LABEL[recipe.difficulty]} />
            <Info label={recipe.ingredients.length + ' ingrédients'} />
            <Info label={fmtCount(servings) + ' portion' + (servings > 1 ? 's' : '')} />
          </View>

          {saved ? (
            <Press accessibilityLabel="Reprendre la recette" onPress={cook} style={[styles.resume, { borderColor: V2.lime }]}>
              <Txt size={14} weight="semibold" style={{ flex: 1 }}>Tu en étais à l’étape {saved.step + 1} sur {recipe.steps.length}</Txt>
              <Txt size={14} weight="bold" color={t.dark ? V2.lime : V2.obsidian}>Reprendre</Txt>
            </Press>
          ) : null}

          {blocked ? (
            <View style={[styles.warn, { backgroundColor: 'rgba(255,107,94,0.12)' }]}>
              <Txt size={14} weight="bold" color={V2.red}>Pas compatible avec tes réglages</Txt>
              <Txt size={13} color={t.ink}>
                {declared.length ? 'Contient : ' + declared.map((a) => ALLERGENS.find((x) => x.id === a)?.label.toLowerCase()).join(', ') + '.' : 'Elle ne respecte pas ton régime ou un aliment que tu as refusé.'}
              </Txt>
            </View>
          ) : why.length ? (
            <View style={{ gap: 8 }}>
              <Txt size={17} weight="bold">Pourquoi cette recette ?</Txt>
              {why.map((w) => (
                <View key={w} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <View style={styles.dot} />
                  <Txt size={14} color={t.ink2} style={{ flex: 1 }}>{w}</Txt>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <View style={styles.between}>
              <Txt size={17} weight="bold">Nutrition</Txt>
              <Txt size={12} color={t.ink2}>par portion · estimation</Txt>
            </View>
            <MacroTiles kcal={Math.round(per.kcal)} p={Math.round(per.p)} g={Math.round(per.g)} l={Math.round(per.l)} />
            {servings !== 1 ? (
              <Txt size={12} color={t.ink2} num>Pour {fmtCount(servings)} portions : {total.kcal} kcal · {total.p} g de protéines</Txt>
            ) : null}
            <Txt size={12} lineHeight={17} color={t.ink2}>
              {al.length ? 'Allergènes : ' + alLabels.join(', ') + '. ' : 'Aucun des 14 allergènes majeurs dans ces ingrédients. '}
              Vérifie les étiquettes : des traces sont possibles selon les produits.
            </Txt>
          </View>

          <View style={{ gap: 10 }}>
            <View style={styles.between}>
              <Txt size={17} weight="bold">Ingrédients</Txt>
              <View style={styles.stepper}>
                <Press accessibilityLabel="Moins de portions" disabled={idx <= 0} onPress={() => stepServings(-1)} style={[styles.stepBtn, { backgroundColor: t.surf }]}>
                  <Txt size={20} weight="bold">−</Txt>
                </Press>
                <Txt size={14} weight="semibold" num style={{ minWidth: 86, textAlign: 'center' }}>{fmtCount(servings)} portion{servings > 1 ? 's' : ''}</Txt>
                <Press accessibilityLabel="Plus de portions" disabled={idx >= SERVINGS.length - 1} onPress={() => stepServings(1)} style={[styles.stepBtn, { backgroundColor: t.surf }]}>
                  <Txt size={20} weight="bold">+</Txt>
                </Press>
              </View>
            </View>
            <View style={[styles.card, { backgroundColor: t.surf }]}>
              {items.map((x, i) => {
                const on = checked.includes(x.index);
                return (
                  <Press
                    key={x.index}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={cap(x.name) + ', ' + x.qty}
                    haptic="light"
                    pressScale={0.99}
                    onPress={() => setChecked(on ? checked.filter((c) => c !== x.index) : [...checked, x.index])}
                    style={[styles.ing, i > 0 && { borderTopWidth: 1, borderTopColor: t.line }]}
                  >
                    <View style={[styles.box, { borderColor: on ? V2.lime : t.line, backgroundColor: on ? V2.lime : 'transparent' }]}>
                      {on ? <TickIcon size={13} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt size={15} weight="medium" color={x.removed ? t.ink2 : t.ink} style={on ? { textDecorationLine: 'line-through', opacity: 0.6 } : undefined}>{cap(x.name)}</Txt>
                      {x.swapped ? <Txt size={11} color={V2.violet}>remplace {recipe.ingredients[x.index].name}</Txt> : null}
                      {x.pantry && !x.removed ? <Txt size={11} color={t.ink2}>placard</Txt> : null}
                    </View>
                    <Txt size={14} color={t.ink2} num style={{ textAlign: 'right', maxWidth: 150 }}>{x.qty}</Txt>
                  </Press>
                );
              })}
            </View>
            <Press accessibilityLabel="Il me manque un ingrédient" onPress={() => setSwap(true)} style={[styles.ghostRow, { borderColor: t.line }]}>
              <Txt size={14} weight="semibold">Il me manque un ingrédient{swaps ? ' · ' + swaps + ' changement' + (swaps > 1 ? 's' : '') : ''}</Txt>
            </Press>
          </View>

          <View style={{ gap: 10 }}>
            <Txt size={17} weight="bold">Étapes</Txt>
            {recipe.steps.map((s, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={[styles.num, { backgroundColor: t.surf }]}>
                  <Txt size={13} weight="bold" num>{i + 1}</Txt>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt size={15} lineHeight={22}>{s.t}</Txt>
                  {stepChanges(recipe, s.uses, subs).map((c) => (
                    <Txt key={c} size={13} color={V2.violet}>{cap(c)}</Txt>
                  ))}
                  {s.timer ? <Txt size={12} color={t.ink2} num>Minuteur : {Math.round(s.timer / 60)} min</Txt> : null}
                </View>
              </View>
            ))}
          </View>
          <Txt size={11} lineHeight={16} color={t.ink2}>Valeurs calculées à partir de la table Ciqual 2025 (Anses, Licence Ouverte). Photo d’illustration générée pour FITAIA.</Txt>
        </View>
      </ScrollView>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }, solid && { backgroundColor: t.bg, borderBottomWidth: 1, borderBottomColor: t.line }]} pointerEvents="box-none">
        <RoundButton label="Retour" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/scanner'))}>
          <BackIcon />
        </RoundButton>
        {solid ? (
          <Txt size={15} weight="bold" numberOfLines={1} style={{ flex: 1, marginHorizontal: 10, alignSelf: 'center' }}>{recipe.name}</Txt>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <RoundButton label="Partager la recette" onPress={share}>
            <ShareIcon />
          </RoundButton>
          <FavButton on={fav} label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'} onPress={() => toggleFavorite(recipe.id)} />
        </View>
      </View>

      <View style={[styles.bottom, { backgroundColor: t.bg, borderTopColor: t.line, paddingBottom: Math.max(14, insets.bottom + 6) }]}>
        <Action kind="ghost" label="Je la mange" onPress={() => setEat(true)} />
        <Action label={saved ? 'Reprendre' : 'Cuisiner'} onPress={cook} />
      </View>

      <SwapSheet recipe={recipe} subs={subs} prefs={prefs} visible={swap} onClose={() => setSwap(false)} onChange={setSubs} />
      <EatSheet recipe={recipe} subs={subs} prepared={servings} visible={eat} onClose={() => setEat(false)} onLogged={() => endCook(recipe.id)} />
    </View>
  );
}

function Info({ label, icon }: { label: string; icon?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.info, { backgroundColor: t.surf }]}>
      {icon}
      <Txt size={12} weight="semibold" color={t.ink2} num>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  photo: { height: 330, backgroundColor: V2.graphite2 },
  body: { marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 22, gap: 22 },
  infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -8 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  resume: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 18, padding: 14, gap: 10 },
  warn: { borderRadius: 18, padding: 14, gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: V2.violet },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 20, paddingHorizontal: 14 },
  ing: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 8 },
  box: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ghostRow: { height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepRow: { flexDirection: 'row', gap: 12 },
  num: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
});
