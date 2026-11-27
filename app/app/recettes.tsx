/**
 * Recettes faciles : choisies avec ce que la personne aime (ses goûts déclarés), ce qu'elle mange (son journal),
 * son objectif et les calories qui lui restent. Une recette s'ajoute au journal comme un repas, par l'écran Repas
 * (mêmes règles de points). Calories et macros calculées depuis la base d'aliments : valeurs moyennes, dites comme telles.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { AMBER, LIME, OBSIDIAN, RED, shadow, screenAccent } from '@/theme/tokens';
import { fmt } from '@/data/content';
import { MOMENT_LABEL, type RecipeMoment } from '@/data/recipes';
import { useCalories, useGame } from '@/store/useGame';
import { tasteOf, useRecipes } from '@/store/useRecipes';
import { DIETS, FAMILIES, type Suggestion } from '@/coach/recipes';
import { useRecipeSuggestions } from '@/coach/useRecipeSuggestions';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CloseIcon } from '@/components/Icons';

type Tab = 'pour-toi' | RecipeMoment | 'favoris';
const TABS: [Tab, string][] = [['pour-toi', 'Pour toi'], ['matin', 'Petit-déj'], ['repas', 'Repas'], ['collation', 'Collation'], ['favoris', 'Favoris']];

export default function Recettes() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const say = useGame((s) => s.say);
  const setCustomMeal = useGame((s) => s.setCustomMeal);
  const { remaining } = useCalories();
  const prefs = useRecipes();
  const told = prefs.likes.length + prefs.dislikes.length + prefs.diet.length > 0;
  const [tastesOpen, setTastesOpen] = useState(!told && !params.id);
  const [tab, setTab] = useState<Tab>('pour-toi');
  const [open, setOpen] = useState<string | null>(params.id ?? null);
  const [first] = useState(params.id ?? null);

  const moment = tab === 'matin' || tab === 'repas' || tab === 'collation' ? tab : undefined;
  const ranked = useRecipeSuggestions({ moment, favoritesOnly: tab === 'favoris' });
  // une recette ouverte depuis l'écran Repas passe en tête de « Pour toi »
  const list = useMemo(() => {
    if (tab !== 'pour-toi' || !first) return ranked;
    const i = ranked.findIndex((s) => s.recipe.id === first);
    return i > 0 ? [ranked[i], ...ranked.slice(0, i), ...ranked.slice(i + 1)] : ranked;
  }, [ranked, tab, first]);

  const close = () => (router.canGoBack() ? router.back() : router.navigate('/(tabs)/scanner'));
  const eat = (s: Suggestion) => {
    setCustomMeal(s.meal);
    // revient sur l'écran Repas existant (sans empiler un second écran) où le repas attend d'être validé
    if (router.canDismiss()) router.dismissTo('/(tabs)/scanner');
    else router.replace('/(tabs)/scanner');
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Display size={30} color={screenAccent(t, 'scan')}>Recettes faciles</Display>
          <Press accessibilityLabel="Fermer" onPress={close} style={[styles.close, { backgroundColor: t.surf }, shadow.card]}>
            <CloseIcon size={14} color={t.ink} />
          </Press>
        </View>
        <Txt size={14} lineHeight={20} color={t.ink2}>
          {'Choisies avec ce que tu aimes, ce que tu manges et ton objectif. 20 minutes au plus. '}
          {remaining > 0 ? 'Il te reste ' + fmt(remaining) + ' kcal aujourd’hui.' : 'Ton budget du jour est atteint : vise léger.'}
        </Txt>

        {/* Mes goûts */}
        <View style={[styles.card, { backgroundColor: t.surf }, shadow.card]}>
          <Press accessibilityLabel={tastesOpen ? 'Replier mes goûts' : 'Ouvrir mes goûts'} onPress={() => setTastesOpen((v) => !v)} pressScale={0.99} style={styles.rowBetween}>
            <Txt size={16} weight="bold">Mes goûts</Txt>
            <Txt size={13} weight="semibold" color={t.ink2}>{tastesOpen ? 'Replier' : told ? 'Modifier' : 'Dire ce que j’aime'}</Txt>
          </Press>
          {tastesOpen ? (
            <View style={{ gap: 12, paddingTop: 8 }}>
              <View style={{ gap: 6 }}>
                <Txt size={13} weight="semibold" color={t.ink2}>Je mange</Txt>
                <View style={styles.wrap}>
                  {DIETS.map((d) => {
                    const on = prefs.diet.includes(d.id);
                    return (
                      <Press key={d.id} accessibilityLabel={d.label} accessibilityState={{ selected: on }} onPress={() => prefs.toggleDiet(d.id)} style={[styles.chip, { borderColor: on ? LIME : t.line, backgroundColor: on ? LIME : 'transparent' }]}>
                        <Txt size={13} weight={on ? 'bold' : 'semibold'} color={on ? OBSIDIAN : t.ink}>{d.label}</Txt>
                      </Press>
                    );
                  })}
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <Txt size={13} weight="semibold" color={t.ink2}>Touche une fois : j’aime. Deux fois : pas pour moi.</Txt>
                <View style={styles.wrap}>
                  {FAMILIES.map((f) => {
                    const taste = tasteOf(prefs, f.id);
                    const bg = taste === 'aime' ? LIME : 'transparent';
                    const border = taste === 'aime' ? LIME : taste === 'non' ? RED : t.line;
                    return (
                      <Press
                        key={f.id}
                        accessibilityLabel={f.label + (taste === 'aime' ? ', j’aime' : taste === 'non' ? ', pas pour moi' : '')}
                        onPress={() => prefs.cycleFamily(f.id)}
                        style={[styles.chip, { borderColor: border, backgroundColor: bg }]}
                      >
                        <Txt size={13} weight={taste === 'neutre' ? 'semibold' : 'bold'} color={taste === 'aime' ? OBSIDIAN : taste === 'non' ? RED : t.ink} style={taste === 'non' ? { textDecorationLine: 'line-through' } : undefined}>
                          {(taste === 'aime' ? '♥ ' : '') + f.label}
                        </Txt>
                      </Press>
                    );
                  })}
                </View>
              </View>
              <Txt size={11} lineHeight={15} color={t.ink2}>Tes goûts restent sur ton téléphone. Les aliments de ton journal comptent aussi.</Txt>
            </View>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {TABS.map(([id, label]) => {
            const on = tab === id;
            return (
              <Press key={id} accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={() => setTab(id)} style={[styles.chip, { borderColor: on ? t.ink : t.line, backgroundColor: on ? t.ink : 'transparent' }]}>
                <Txt size={13} weight={on ? 'bold' : 'semibold'} color={on ? t.bg : t.ink}>{label}</Txt>
              </Press>
            );
          })}
        </ScrollView>

        {list.length === 0 ? (
          <View style={[styles.card, { backgroundColor: t.surf }, shadow.card]}>
            <Txt size={14} lineHeight={20} color={t.ink2}>
              {tab === 'favoris' ? 'Pas encore de favori. Ouvre une recette et touche « Favori ».' : 'Aucune recette ne passe tes goûts ici. Retire un « pas pour moi » ou un régime dans Mes goûts.'}
            </Txt>
          </View>
        ) : (
          list.map((s) => (
            <RecipeCard
              key={s.recipe.id}
              s={s}
              remaining={remaining}
              open={open === s.recipe.id}
              onToggle={() => setOpen((o) => (o === s.recipe.id ? null : s.recipe.id))}
              favorite={prefs.favorites.includes(s.recipe.id)}
              onFavorite={() => say(prefs.toggleFavorite(s.recipe.id) ? 'Ajoutée à tes favoris' : 'Retirée de tes favoris', 'ok')}
              onHide={() => {
                prefs.hide(s.recipe.id);
                setOpen(null);
                say('On ne te la proposera plus', 'ok');
              }}
              onEat={() => eat(s)}
            />
          ))
        )}

        {prefs.hidden.length ? (
          <Press onPress={() => { prefs.unhideAll(); say('Recettes écartées remises', 'ok'); }} style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 }}>
            <Txt size={12} color={t.ink2}>{prefs.hidden.length + (prefs.hidden.length > 1 ? ' recettes écartées · les remettre' : ' recette écartée · la remettre')}</Txt>
          </Press>
        ) : null}
      </ScrollView>
    </View>
  );
}

function RecipeCard({ s, remaining, open, onToggle, favorite, onFavorite, onHide, onEat }: {
  s: Suggestion; remaining: number; open: boolean; onToggle: () => void; favorite: boolean; onFavorite: () => void; onHide: () => void; onEat: () => void;
}) {
  const t = useTheme();
  const { recipe: r, meal: m } = s;
  return (
    <View style={[styles.card, { backgroundColor: t.surf, gap: 10 }, open ? shadow.md : shadow.card]}>
      <Press accessibilityLabel={(open ? 'Replier la recette ' : 'Voir la recette ') + r.name} onPress={onToggle} pressScale={0.99} style={{ gap: 3 }}>
        <View style={styles.rowBetween}>
          <Txt size={16} weight="bold" style={{ flex: 1 }} numberOfLines={2}>{r.name}</Txt>
          {favorite ? <Txt size={14} weight="bold" color={screenAccent(t, 'scan')}>♥</Txt> : null}
        </View>
        <Txt size={12} num color={t.ink2}>
          {MOMENT_LABEL[r.moment]} · {r.minutes} min · {fmt(m.kcal)} kcal · P {m.p} g
        </Txt>
        {s.reasons.map((x) => (
          <Txt key={x} size={12} lineHeight={17} color={t.ink}>{'· ' + x}</Txt>
        ))}
        {!s.fits ? (
          <Txt size={12} lineHeight={17} color={AMBER}>
            {remaining > 0 ? 'Plus que tes ' + fmt(remaining) + ' kcal restantes aujourd’hui' : 'Ton budget du jour est déjà atteint'}
          </Txt>
        ) : null}
      </Press>
      {open ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[['Protéines', m.p], ['Glucides', m.g], ['Lipides', m.l]].map(([k, v]) => (
              <View key={String(k)} style={[styles.macro, { backgroundColor: t.bg }]}>
                <Txt size={12} color={t.ink2}>{k}</Txt>
                <Txt size={16} weight="bold" num>{v} g</Txt>
              </View>
            ))}
          </View>
          <View style={{ gap: 4 }}>
            <Txt size={14} weight="bold">Ingrédients · 1 portion</Txt>
            {m.items.map((it) => (
              <Txt key={it} size={13} lineHeight={19}>{'· ' + it}</Txt>
            ))}
          </View>
          <View style={{ gap: 6 }}>
            <Txt size={14} weight="bold">Comment faire</Txt>
            {r.steps.map((st, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                <Txt size={13} weight="bold" num color={screenAccent(t, 'scan')}>{i + 1}.</Txt>
                <Txt size={13} lineHeight={19} style={{ flex: 1 }}>{st}</Txt>
              </View>
            ))}
          </View>
          <Txt size={11} lineHeight={15} color={t.ink2}>Estimation : valeurs moyennes des aliments. Sel, poivre et épices non comptés.</Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Press accessibilityLabel={favorite ? 'Retirer des favoris' : 'Mettre en favori'} onPress={onFavorite} style={[styles.ghost, { borderColor: favorite ? LIME : t.line, backgroundColor: favorite ? LIME : 'transparent' }]}>
              <Txt size={13} weight="semibold" color={favorite ? OBSIDIAN : t.ink}>{favorite ? '♥ Favori' : 'Favori'}</Txt>
            </Press>
            <Press accessibilityLabel={'Pas pour moi : ' + r.name} onPress={onHide} style={[styles.ghost, { borderColor: t.line }]}>
              <Txt size={13} weight="semibold">Pas pour moi</Txt>
            </Press>
          </View>
          <Press haptic="medium" accessibilityLabel={'Je la mange : ' + r.name} onPress={onEat} style={[styles.primary, shadow.btn]}>
            <Txt size={15} weight="bold" color={OBSIDIAN}>Je la mange : l’ajouter au journal</Txt>
          </Press>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 24, padding: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12 },
  macro: { flex: 1, borderRadius: 16, paddingVertical: 9, paddingHorizontal: 12, gap: 2 },
  ghost: { flex: 1, height: 44, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  primary: { height: 52, borderRadius: 20, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
});
