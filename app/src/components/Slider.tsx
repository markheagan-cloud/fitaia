import React, { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME } from '@/theme/tokens';
import { Txt } from './Txt';

type Props = {
  label: string;
  value: number; // 0 → 1
  onChange: (v: number) => void;
  /** Texte affiché à droite (par défaut : 0,00). */
  display?: (v: number) => string;
  step?: number;
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Curseur 0 → 1 sans dépendance : toucher la piste ou glisser ; réglable au lecteur d'écran (±5 %).
 * Les gestes passent par les props « responder » de React Native (gestionnaires d'événements, aucun accès aux refs
 * pendant le rendu).
 */
export function Slider({ label, value, onChange, display, step = 0.05 }: Props) {
  const t = useTheme();
  const [w, setW] = useState(1);
  const origin = useRef({ x: 0, page: 0 });

  const onLayout = (e: LayoutChangeEvent) => setW(Math.max(1, e.nativeEvent.layout.width));
  const onGrant = (e: GestureResponderEvent) => {
    origin.current = { x: e.nativeEvent.locationX, page: e.nativeEvent.pageX };
    onChange(clamp(e.nativeEvent.locationX / w));
  };
  const onMove = (e: GestureResponderEvent) => {
    onChange(clamp((origin.current.x + e.nativeEvent.pageX - origin.current.page) / w));
  };

  const v = clamp(value);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt size={13} weight="semibold">{label}</Txt>
        <Txt size={13} num color={t.ink2}>{display ? display(v) : v.toFixed(2)}</Txt>
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(clamp(v + (e.nativeEvent.actionName === 'increment' ? step : -step)))}
        onLayout={onLayout}
        hitSlop={{ top: 12, bottom: 12 }}
        style={styles.hit}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
      >
        <View style={[styles.track, { backgroundColor: t.track, pointerEvents: 'none' }]}>
          <View style={[styles.fill, { width: v * w, backgroundColor: LIME }]} />
        </View>
        <View style={[styles.thumb, { left: v * w - 13, backgroundColor: t.ink, borderColor: LIME, pointerEvents: 'none' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 32, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  thumb: { position: 'absolute', width: 26, height: 26, borderRadius: 13, borderWidth: 3, top: 3 },
});
