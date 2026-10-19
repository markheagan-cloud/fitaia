/**
 * « Pourquoi 94 % ? » : d'abord une explication humaine, le détail du calcul seulement si on le demande.
 * Les points affichés viennent de compatibilityBreakdown() : leur somme est exactement le pourcentage affiché.
 */
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN } from '@/theme/tokens';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { breakdownSummary } from '@/social/fitmatch/matching';
import type { Breakdown } from '@/social/fitmatch/matching';
import { MainButton } from './ui';
import { Sheet } from './kit';
import { Icon } from './icons';

export function CompatSheet({ visible, onClose, breakdown, name }: { visible: boolean; onClose: () => void; breakdown: Breakdown | null; name: string }) {
  const t = useTheme();
  const [detail, setDetail] = useState(false);
  const close = () => {
    setDetail(false);
    onClose();
  };
  if (!breakdown) return <Sheet visible={false} onClose={close} label="Compatibilité">{null}</Sheet>;
  const sum = breakdownSummary(breakdown);
  return (
    <Sheet visible={visible} onClose={close} label={'Pourquoi ' + breakdown.score + ' % ?'}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={[styles.score, { backgroundColor: OBSIDIAN }]}>
          <Display size={22} color={LIME} num>{breakdown.score}</Display>
          <Txt size={10} weight="bold" color="#A2A6AD">%</Txt>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Display size={23}>Pourquoi {breakdown.score} % ?</Display>
          <Txt size={13} color={t.ink2}>Ton parcours et celui de {name}</Txt>
        </View>
      </View>
      <Txt size={16} lineHeight={23}>{sum.strong}</Txt>
      {sum.gap ? <Txt size={14} lineHeight={20} color={t.ink2}>{sum.gap}</Txt> : null}

      <Press onPress={() => setDetail(!detail)} accessibilityRole="button" accessibilityState={{ expanded: detail }} style={[styles.toggle, { borderColor: t.line }]}>
        <Txt size={14} weight="semibold">{detail ? 'Masquer le détail' : 'Voir le détail du calcul'}</Txt>
        <View style={{ transform: [{ rotate: detail ? '180deg' : '0deg' }] }}>
          <Icon name="chevronDown" size={18} color={t.ink2} />
        </View>
      </Press>

      {detail ? (
        <Animated.View entering={FadeIn.duration(220)} style={{ gap: 10 }}>
          {breakdown.parts.map((p) => (
            <View key={p.key} style={{ gap: 5 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt size={13.5} weight="semibold">{p.label}</Txt>
                <Txt size={13.5} weight="bold" num color={p.points ? t.ink : t.ink2}>+{p.points} <Txt size={12} color={t.ink2}>/ {p.max}</Txt></Txt>
              </View>
              <View style={[styles.bar, { backgroundColor: t.track }]}>
                <View style={{ width: `${(p.points / p.max) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: p.points === p.max ? LIME : t.ink }} />
              </View>
            </View>
          ))}
          <View style={[styles.total, { borderTopColor: t.line }]}>
            <Txt size={14} weight="bold">Total</Txt>
            <Txt size={14} weight="bold" num>{breakdown.score} %</Txt>
          </View>
        </Animated.View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <Icon name="lock" size={15} color={t.ink2} />
        <Txt size={12.5} lineHeight={17} color={t.ink2} style={{ flex: 1 }}>
          Ni ton poids, ni tes calories, ni tes photos n’entrent dans le calcul. Le niveau comparé est le meilleur atteint par chacun.
        </Txt>
      </View>
      <MainButton label="Compris" onPress={close} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  score: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, height: 46 },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  total: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
});
