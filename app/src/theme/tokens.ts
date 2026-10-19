/**
 * Design tokens FITAIA — source unique, extraits 1:1 de Main.dc.html (renderVals → t).
 * Ne pas modifier sans accord : la maquette fait foi.
 */
export const LIME = '#C8F03C';
export const OBSIDIAN = '#1C1D1F';
export const RED = '#E2483D';
export const AMBER = '#E9A10B';

export type Theme = {
  dark: boolean;
  bg: string;
  surf: string;
  ink: string;
  ink2: string;
  track: string;
  line: string;
  strong: string;
  strongInk: string;
  strongInk2: string;
  glass: string;
  glassEdge: string;
};

export const light: Theme = {
  dark: false,
  bg: '#E6E4DF',
  surf: '#F5F4F1',
  ink: '#1C1D1F',
  ink2: '#5A5D63',
  track: '#D6D3CD',
  line: '#CFCBC4',
  strong: '#1C1D1F',
  strongInk: '#F5F4F1',
  strongInk2: '#A2A6AD',
  glass: 'rgba(245,244,241,0.74)',
  glassEdge: 'rgba(255,255,255,0.7)',
};

export const dark: Theme = {
  dark: true,
  bg: '#121315',
  surf: '#1D1F22',
  ink: '#EDEEF0',
  ink2: '#A2A6AD',
  track: '#30333A',
  line: '#30333A',
  strong: '#26282C',
  strongInk: '#EDEEF0',
  strongInk2: '#A2A6AD',
  glass: 'rgba(29,31,34,0.72)',
  glassEdge: 'rgba(255,255,255,0.08)',
};

/** Couleurs d'alerte (sur-budget / proche) selon le thème. */
export const alert = (t: Theme) => ({
  overBg: t.dark ? '#3A1714' : '#F8DEDB',
  overInk: t.dark ? '#FFB8AF' : '#7D1D14',
  nearBg: t.dark ? '#382A0C' : '#F8EBCB',
  nearInk: t.dark ? '#FFD88C' : '#6A4300',
  goodBg: t.dark ? '#22300C' : '#E9F3C8',
  goodInk: t.dark ? '#D6F57A' : '#334600',
  limeInk: t.dark ? LIME : '#3F5600',
});

export const font = {
  /** Archivo SemiExpanded 800 = font-stretch 112 % de la maquette (titres) */
  display: 'ArchivoSemiExpanded_800ExtraBold',
  /** Archivo Expanded 800 = font-stretch 125 % (gros chiffres) */
  displayWide: 'ArchivoExpanded_800ExtraBold',
  body: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
} as const;

/** Easing de la maquette : cubic-bezier(.32,.72,0,1) */
export const motion = {
  bezier: [0.32, 0.72, 0, 1] as const,
  press: 120,
  fast: 180,
  base: 240,
  card: 320,
  toast: 360,
  sheet: 420,
} as const;

/**
 * Ombres composites de la maquette, en `boxShadow` natif (RN ≥ 0.76, New Architecture) :
 * plusieurs couches comme en CSS, identiques sur iOS, Android et web.
 */
export const shadow = {
  sm: { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  card: { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
  md: { boxShadow: '0 6px 16px rgba(0,0,0,0.12)' },
  lg: { boxShadow: '0 12px 32px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)' },
  xl: { boxShadow: '0 16px 40px rgba(0,0,0,0.24)' },
  btn: { boxShadow: '0 8px 24px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)' },
  toast: { boxShadow: '0 14px 40px rgba(0,0,0,0.24), 0 6px 12px rgba(0,0,0,0.12)' },
  nav: { boxShadow: '0 12px 40px rgba(0,0,0,0.18), 0 4px 14px rgba(0,0,0,0.1)' },
} as const;

export const CONTENT_W = 358; // 390 - 2*16 : largeur de référence de la maquette
