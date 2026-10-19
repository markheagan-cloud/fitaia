import React from 'react';
import { View, Image, StyleProp, ViewStyle } from 'react-native';
import { COACH_IMG } from '@/data/content';

/**
 * Portrait de Fito : équivalent de `object-fit: cover; object-position: 50% 8%`.
 * L'image source est 480x600 (ratio 0.8) ; on la cadre sur le haut.
 */
export function CoachAvatar({ size, radius, style }: { size: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const h = size / 0.8; // hauteur réelle à largeur = size
  const overflow = h - size;
  return (
    <View style={[{ width: size, height: size, borderRadius: radius ?? 999, overflow: 'hidden', backgroundColor: '#DAD7D1' }, style]}>
      <Image source={COACH_IMG} style={{ width: size, height: h, position: 'absolute', top: -overflow * 0.08, left: 0 }} />
    </View>
  );
}
