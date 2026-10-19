import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { font } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Weight = 'regular' | 'medium' | 'semibold' | 'bold';
type Props = TextProps & {
  size?: number;
  weight?: Weight;
  color?: string;
  /** Chiffres tabulaires (.num) */
  num?: boolean;
  lineHeight?: number;
};

const FAMILY: Record<Weight, string> = {
  regular: font.body,
  medium: font.medium,
  semibold: font.semibold,
  bold: font.bold,
};

/** Texte DM Sans — équivalent des spans de la maquette. */
export function Txt({ size = 14, weight = 'regular', color, num, lineHeight, style, ...rest }: Props) {
  const t = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={1.35}
      {...rest}
      style={[
        { fontFamily: FAMILY[weight], fontSize: size, color: color ?? t.ink, lineHeight: lineHeight ?? Math.round(size * 1.3) },
        num && styles.num,
        style,
      ]}
    />
  );
}

/** Titre Archivo 800 — équivalent des titres "font-family: Archivo; font-weight: 800". */
export function Display({ size = 20, color, num, lineHeight, style, letterSpacing, wide, ...rest }: Omit<Props, 'weight'> & { letterSpacing?: number; wide?: boolean }) {
  const t = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={1.25}
      {...rest}
      style={[
        {
          fontFamily: wide ? font.displayWide : font.display,
          fontSize: size,
          color: color ?? t.ink,
          letterSpacing: letterSpacing ?? -size * (wide ? 0.05 : 0.035),
          lineHeight: lineHeight ?? Math.round(size * 1.1),
        },
        num && styles.num,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  num: { fontVariant: ['tabular-nums'] },
});
