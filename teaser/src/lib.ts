import {Easing, interpolate} from 'remotion';
import {GLYPH_WIDTHS} from './glyphWidths';

export const CL = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export const OUT = Easing.bezier(0.16, 1, 0.3, 1); // expo out : attaques sèches
export const INOUT = Easing.bezier(0.65, 0, 0.35, 1);
export const IN = Easing.bezier(0.7, 0, 0.84, 0);

export const lin = (f: number, a: number[], b: number[], easing?: (t: number) => number) =>
  interpolate(f, a, b, {...CL, easing});

export type FontKey = 'expanded' | 'semi';

export const emWidth = (t: string, font: FontKey, tracking: number) => {
  let w = 0;
  const chars = [...t];
  for (const ch of chars) w += GLYPH_WIDTHS[font][ch] ?? 0.78;
  return w + tracking * Math.max(0, chars.length - 1);
};

/** Taille de police maximale pour que chaque ligne tienne dans maxWidth. */
export const fitSize = (lines: string[], maxWidth: number, maxSize: number, font: FontKey = 'expanded', tracking = -0.02) =>
  Math.floor(Math.min(maxSize, ...lines.map((l) => maxWidth / emWidth(l, font, tracking))));

/** Pseudo-aléatoire déterministe (pour tremblements, grain, glitch). */
export const rand = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export const pad2 = (n: number) => String(n).padStart(2, '0');

/** Index d'image d'une séquence 3D (morph / rotation), borné. */
export const seqIndex = (v: number, n: number) => Math.max(0, Math.min(n - 1, Math.round(v)));
