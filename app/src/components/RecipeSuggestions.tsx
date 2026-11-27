import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { screenAccent } from '@/theme/tokens';
import { fmt } from '@/data/content';
import { useRecipeSuggestions } from '@/coach/useRecipeSuggestions';
import { pickVaried } from '@/coach/recipes';
import { useRecipes } from '@/store/useRecipes';
import { Card } from './Screen';
import { Press } from './Press';
import { Txt } from './Txt';

/** Repas : trois recettes faciles choisies pour la personne, et l'entrée vers toutes les recettes et ses goûts. */
export function RecipeSuggestions() {
  const t = useTheme();
  const router = useRouter();
  const list = pickVaried(useRecipeSuggestions(), 3);
  const told = useRecipes((s) => s.likes.length + s.dislikes.length + s.diet.length > 0);
  return (
    <Card style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 2 }}>
        <Txt size={16} weight="bold" color={screenAccent(t, 'scan')}>Recettes faciles pour toi</Txt>
        <Txt size={12} color={t.ink2}>20 min max</Txt>
      </View>
      {!told ? (
        <Txt size={12} lineHeight={17} color={t.ink2}>Dis-nous ce que tu aimes pour des idées encore plus justes.</Txt>
      ) : null}
      {list.length === 0 ? (
        <Txt size={13} lineHeight={18} color={t.ink2}>Aucune recette ne passe tes goûts actuels. Ouvre « Mes goûts » pour en retirer un.</Txt>
      ) : (
        list.map((s, i) => (
          <Press
            key={s.recipe.id}
            accessibilityLabel={'Recette ' + s.recipe.name}
            onPress={() => router.push({ pathname: '/recettes', params: { id: s.recipe.id } })}
            pressScale={0.98}
            style={[{ paddingVertical: 10, gap: 2 }, i > 0 && { borderTopWidth: 1, borderTopColor: t.line }]}
          >
            <Txt size={14} weight="semibold" numberOfLines={1}>{s.recipe.name}</Txt>
            <Txt size={12} num color={t.ink2} numberOfLines={1}>
              {s.recipe.minutes} min · {fmt(s.meal.kcal)} kcal · P {s.meal.p} g
            </Txt>
            {s.reasons[0] ? <Txt size={12} color={t.ink2} numberOfLines={1}>{s.reasons[0]}</Txt> : null}
          </Press>
        ))
      )}
      <Press
        accessibilityLabel="Toutes les recettes et mes goûts"
        onPress={() => router.push('/recettes')}
        style={{ borderWidth: 1, borderColor: t.line, borderRadius: 16, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}
      >
        <Txt size={14} weight="semibold">Toutes les recettes · mes goûts</Txt>
      </Press>
    </Card>
  );
}
