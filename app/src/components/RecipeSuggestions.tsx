/**
 * Repas → « Qu'est-ce qu'on mange ? » : une idée mise en avant (grande photo, temps, ingrédients, kcal, protéines,
 * raison), deux alternatives, « D'autres idées » sans répétition immédiate, et « Pas pour moi » avec raison facultative.
 * Les idées viennent du moteur (src/coach/recipes.ts) nourri des vraies données du téléphone.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { V2, shadow } from '@/theme/tokens';
import { fmt } from '@/data/content';
import { useKitchenContext, useRecipeSuggestions } from '@/coach/useRecipeSuggestions';
import { contextLine, pickVaried, type Suggestion } from '@/coach/recipes';
import { useRecipes } from '@/store/useRecipes';
import { Press } from './Press';
import { Txt, Display } from './Txt';
import { ClockIcon, FavButton, PhotoPill, RecipePhoto, kitchenStyles } from './kitchen/parts';
import { RefuseSheet } from './kitchen/sheets';

const TIMES = [0, 10, 15, 20];

function Hero({ s, onRefuse }: { s: Suggestion; onRefuse: () => void }) {
  const t = useTheme();
  const router = useRouter();
  const fav = useRecipes((x) => x.favorites.includes(s.recipe.id));
  const toggleFavorite = useRecipes((x) => x.toggleFavorite);
  const r = s.recipe;
  const open = () => router.push({ pathname: '/recette/[id]', params: { id: r.id } });
  return (
    <View style={[styles.hero, { backgroundColor: t.surf }, shadow.md]}>
      <Press accessibilityLabel={'Voir la recette ' + r.name} onPress={open} pressScale={0.98}>
        <View style={styles.heroPhoto}>
          <RecipePhoto id={r.id} style={kitchenStyles.cover} />
          <LinearGradient colors={['rgba(11,13,16,0)', 'rgba(11,13,16,0.78)']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0.35 }} end={{ x: 0, y: 1 }} />
          <View style={styles.heroTop}>
            <PhotoPill>
              <ClockIcon size={13} color={V2.white} />
              <Txt size={12} weight="semibold" color={V2.white} num>{r.minutes} min</Txt>
            </PhotoPill>
          </View>
          <View style={styles.heroBottom}>
            <Display size={23} color={V2.white} style={kitchenStyles.shadowText} numberOfLines={2}>{r.name}</Display>
            <Txt size={13} color="rgba(245,246,248,0.86)" num numberOfLines={1}>
              {r.ingredients.length} ingrédients · {fmt(s.meal.kcal)} kcal · {s.meal.p} g de protéines
            </Txt>
          </View>
        </View>
      </Press>
      <View style={styles.favSlot}>
        <FavButton on={fav} label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'} onPress={() => toggleFavorite(r.id)} />
      </View>
      <View style={styles.heroBody}>
        {s.reasons[0] ? (
          <View style={styles.reason}>
            <View style={styles.reasonDot} />
            <Txt size={13} color={t.ink2} style={{ flex: 1 }} numberOfLines={2}>{s.reasons[0]}</Txt>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Press accessibilityLabel={'Cuisiner ' + r.name} haptic="medium" onPress={open} style={[styles.cta, { flex: 1, backgroundColor: V2.lime }, shadow.btn]}>
            <Txt size={15} weight="bold" color={V2.obsidian}>Voir la recette</Txt>
          </Press>
          <Press accessibilityLabel={'Pas pour moi : ' + r.name} onPress={onRefuse} style={[styles.cta, styles.ctaGhost, { borderColor: t.line }]}>
            <Txt size={14} weight="semibold" color={t.ink2}>Pas pour moi</Txt>
          </Press>
        </View>
      </View>
    </View>
  );
}

function Mini({ s }: { s: Suggestion }) {
  const t = useTheme();
  const router = useRouter();
  const r = s.recipe;
  return (
    <Press
      accessibilityLabel={'Voir la recette ' + r.name}
      onPress={() => router.push({ pathname: '/recette/[id]', params: { id: r.id } })}
      pressScale={0.97}
      style={[styles.mini, { backgroundColor: t.surf }, shadow.card]}
    >
      <RecipePhoto id={r.id} style={styles.miniPhoto} />
      <View style={{ padding: 10, gap: 3 }}>
        <Txt size={14} weight="semibold" numberOfLines={2} lineHeight={18}>{r.name}</Txt>
        <Txt size={12} color={t.ink2} num numberOfLines={1}>{r.minutes} min · {fmt(s.meal.kcal)} kcal</Txt>
      </View>
    </Press>
  );
}

export function RecipeSuggestions() {
  const t = useTheme();
  const router = useRouter();
  const maxMinutes = useRecipes((s) => s.maxMinutes);
  const setMaxMinutes = useRecipes((s) => s.setMaxMinutes);
  const undoRefuse = useRecipes((s) => s.undoRefuse);
  const fridgeCount = useRecipes((s) => s.fridge.length);
  const [shown, setShown] = useState<string[]>([]);
  const [round, setRound] = useState(0);
  const [refusing, setRefusing] = useState<Suggestion | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctx = useKitchenContext();
  const ranked = useRecipeSuggestions({ shown, maxMinutes });
  const list = useMemo(() => pickVaried(ranked, 3), [ranked]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // « D'autres idées » : les idées montrées passent après les autres ; quand tout a été vu, on repart du début
  const more = () => {
    const ids = list.map((s) => s.recipe.id);
    const next = [...shown, ...ids];
    setShown(ranked.length && ranked.every((s) => next.includes(s.recipe.id)) ? [] : next);
    setRound((n) => n + 1);
  };
  const refused = (msg: string) => {
    setRefusing(null);
    setNotice(msg);
    setRound((n) => n + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), 6000);
  };
  const [hero, ...alts] = list;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Display size={24}>Qu’est-ce qu’on mange ?</Display>
        <Txt size={13} color={t.ink2}>{contextLine(ctx.hour, { trainedToday: ctx.trainedToday, remainingKcal: ctx.remainingKcal, heroMinutes: hero?.recipe.minutes })}</Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel="Temps disponible">
        {TIMES.map((m) => {
          const on = maxMinutes === m;
          return (
            <Press
              key={m}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={m ? m + ' minutes maximum' : 'Tout le temps'}
              onPress={() => {
                setMaxMinutes(m);
                setShown([]);
              }}
              pressScale={0.94}
              style={[styles.time, { backgroundColor: on ? V2.lime : t.surf, borderColor: on ? V2.lime : t.line }]}
            >
              <Txt size={13} weight={on ? 'bold' : 'medium'} color={on ? V2.obsidian : t.ink} num>{m ? '≤ ' + m + ' min' : 'Peu importe'}</Txt>
            </Press>
          );
        })}
      </View>
      {notice ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={[styles.notice, { backgroundColor: t.surf, borderColor: t.line }]}>
          <Txt size={13} style={{ flex: 1 }}>{notice}</Txt>
          <Press
            accessibilityLabel="Annuler"
            onPress={() => {
              undoRefuse();
              setNotice(null);
            }}
            style={{ paddingHorizontal: 8, paddingVertical: 4 }}
          >
            <Txt size={13} weight="bold" color={t.dark ? V2.lime : V2.obsidian}>Annuler</Txt>
          </Press>
        </Animated.View>
      ) : null}
      {!hero ? (
        <View style={[styles.empty, { backgroundColor: t.surf }]}>
          <Txt size={14} lineHeight={20} color={t.ink2}>
            {maxMinutes ? 'Rien en ' + maxMinutes + ' minutes avec tes réglages. Essaie « Peu importe ».' : 'Aucune recette ne passe tes réglages actuels (allergies, régime, goûts). Tu peux les revoir dans « Mes goûts ».'}
          </Txt>
        </View>
      ) : (
        <Animated.View key={round + ':' + hero.recipe.id} entering={FadeIn.duration(260)} style={{ gap: 10 }}>
          <Hero s={hero} onRefuse={() => setRefusing(hero)} />
          {alts.length ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {alts.map((s) => (
                <Mini key={s.recipe.id} s={s} />
              ))}
              {alts.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ) : null}
        </Animated.View>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {ranked.length > 3 ? (
          <Press accessibilityLabel="D’autres idées" onPress={more} style={[styles.link, { borderColor: t.line, backgroundColor: t.surf }]}>
            <Txt size={14} weight="semibold">D’autres idées</Txt>
          </Press>
        ) : null}
        <Press accessibilityLabel="Dans mon frigo" onPress={() => router.push('/frigo')} style={[styles.link, { borderColor: t.line, backgroundColor: t.surf }]}>
          <Txt size={14} weight="semibold">Dans mon frigo{fridgeCount ? ' · ' + fridgeCount : ''}</Txt>
        </Press>
      </View>
      <Press accessibilityLabel="Toutes les recettes et mes goûts" onPress={() => router.push('/recettes')} style={{ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 }}>
        <Txt size={13} weight="semibold" color={t.ink2}>Toutes les recettes · mes goûts ›</Txt>
      </Press>
      <RefuseSheet key={refusing?.recipe.id ?? 'none'} recipe={refusing?.recipe ?? null} onClose={() => setRefusing(null)} onDone={refused} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 26, overflow: 'hidden' },
  heroPhoto: { height: 214, justifyContent: 'space-between' },
  heroTop: { flexDirection: 'row', padding: 12 },
  heroBottom: { padding: 14, gap: 4 },
  favSlot: { position: 'absolute', top: 10, right: 10 },
  heroBody: { padding: 12, gap: 10 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  reasonDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: V2.violet },
  cta: { height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaGhost: { paddingHorizontal: 16, borderWidth: 1 },
  mini: { flex: 1, borderRadius: 20, overflow: 'hidden' },
  miniPhoto: { width: '100%', height: 96 },
  time: { flex: 1, height: 38, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, paddingVertical: 10, paddingLeft: 14, paddingRight: 6 },
  empty: { borderRadius: 20, padding: 16 },
  link: { flex: 1, height: 46, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
