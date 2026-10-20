import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { useGame } from '@/store/useGame';
import { dayKey } from '@/store/economy';
import { ORIGIN_LABEL, fmt } from '@/data/content';
import type { MealEntry } from '@/data/content';
import { Card } from './Screen';
import { Press } from './Press';
import { Txt } from './Txt';

const EMPTY: MealEntry[] = [];

/** Journal du jour : chaque repas, d'où viennent ses valeurs, et de quoi le corriger ou le retirer. */
export function MealJournal({ onEdit }: { onEdit: (m: MealEntry) => void }) {
  const t = useTheme();
  const today = useGame((s) => s.meals[dayKey()] ?? EMPTY);
  const removeMeal = useGame((s) => s.removeMeal);
  const say = useGame((s) => s.say);
  const [confirm, setConfirm] = useState<string | null>(null);

  return (
    <Card style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 4 }}>
        <Txt size={14} weight="bold">Journal du jour</Txt>
        <Txt size={12} num color={t.ink2}>{today.length ? fmt(today.reduce((a, m) => a + m.kcal, 0)) + ' kcal' : ''}</Txt>
      </View>
      {today.length === 0 ? (
        <Txt size={13} color={t.ink2}>Aucun repas pour l’instant. Scanne un code-barres, cherche un aliment ou écris ton repas.</Txt>
      ) : (
        today.map((m, i) => {
          const time = new Date(m.at);
          const hh = String(time.getHours()).padStart(2, '0') + ':' + String(time.getMinutes()).padStart(2, '0');
          const asking = confirm === m.id;
          return (
            <View key={m.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: t.line }]}>
              <View style={{ gap: 2 }}>
                <Txt size={14} weight="semibold" numberOfLines={1}>{m.name}</Txt>
                <Txt size={12} num color={t.ink2} numberOfLines={1}>
                  {hh} · {fmt(m.kcal)} kcal · P {m.p} g · G {m.g} g · L {m.l} g
                </Txt>
                {m.origin ? <Txt size={11} color={t.ink2} numberOfLines={1}>{ORIGIN_LABEL[m.origin]}</Txt> : null}
              </View>
              <View style={styles.actions}>
              {asking ? (
                <>
                  <Press accessibilityLabel={'Garder ' + m.name} onPress={() => setConfirm(null)} style={[styles.small, { borderColor: t.line }]}>
                    <Txt size={12} weight="semibold">Garder</Txt>
                  </Press>
                  <Press
                    haptic="medium"
                    accessibilityLabel={'Confirmer le retrait de ' + m.name}
                    onPress={() => {
                      removeMeal(m.id);
                      setConfirm(null);
                      say(m.name + ' retiré du journal', 'ok');
                    }}
                    style={[styles.small, { borderColor: t.ink, backgroundColor: t.ink }]}
                  >
                    <Txt size={12} weight="semibold" color={t.bg}>Retirer</Txt>
                  </Press>
                </>
              ) : (
                <>
                  <Press accessibilityLabel={'Corriger ' + m.name} onPress={() => onEdit(m)} style={[styles.small, { borderColor: t.line }]}>
                    <Txt size={12} weight="semibold">Corriger</Txt>
                  </Press>
                  <Press accessibilityLabel={'Retirer ' + m.name} onPress={() => setConfirm(m.id)} style={[styles.small, { borderColor: t.line }]}>
                    <Txt size={12} weight="semibold" color={t.ink2}>Retirer</Txt>
                  </Press>
                </>
              )}
              </View>
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  small: { height: 34, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
