/**
 * Design tokens FITAIA — source unique.
 * V2 « Athletic Gaming » (cahier des charges de Mark, 27/11/2026) : obsidienne, graphite, lime = action et effort,
 * violet = identité et personnage, or = uniquement les accomplissements prestigieux, bleu = rareté.
 */
export const V2 = {
  obsidian: '#0B0D10',
  graphite: '#171A20',
  graphite2: '#20242C',
  lime: '#C8F53D',
  violet: '#A993FF',
  white: '#F5F6F8',
  grey: '#959CA8',
  blue: '#4D9BFF',
  gold: '#FFCA65',
  red: '#FF6B5E',
} as const;
export const LIME = V2.lime;
export const OBSIDIAN = V2.obsidian;
export const VIOLET = V2.violet;
export const GOLD = V2.gold;
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
  bg: '#ECEEF2',
  surf: '#FFFFFF',
  ink: '#0B0D10',
  ink2: '#5B626E',
  track: '#DDE1E7',
  line: '#D8DCE3',
  strong: '#0B0D10',
  strongInk: '#F5F6F8',
  strongInk2: '#959CA8',
  glass: 'rgba(255,255,255,0.88)',
  glassEdge: 'rgba(11,13,16,0.06)',
};

export const dark: Theme = {
  dark: true,
  bg: V2.obsidian,
  surf: V2.graphite,
  ink: V2.white,
  ink2: V2.grey,
  track: '#262A33',
  line: '#232730',
  strong: V2.graphite2,
  strongInk: V2.white,
  strongInk2: V2.grey,
  glass: 'rgba(23,26,32,0.9)',
  glassEdge: 'rgba(255,255,255,0.07)',
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

/** Couleurs vives (demande du 27/11/2026) : lisibles en clair comme en sombre, pour les titres, pastilles et actions. */
export function vivid(t: { dark: boolean }) {
  return t.dark
    ? { rose: '#FF7AB8', turquoise: '#3DDCCB', orange: '#FF9A5C', violet: V2.violet, vert: V2.lime, jaune: V2.gold }
    : { rose: '#C81C72', turquoise: '#00877E', orange: '#C9500E', violet: '#6A4FE0', vert: '#4F6B00', jaune: '#9A6500' };
}
/** Chaque écran a sa couleur (en-tête, onglet, titres de section). */
export function screenAccent(t: { dark: boolean }, screen: string): string {
  const v = vivid(t);
  const map: Record<string, string> = { home: v.vert, index: v.vert, defis: v.orange, scan: v.turquoise, scanner: v.turquoise, shop: v.violet, boutique: v.violet, perso: v.violet, selfie: v.violet, creator: v.violet };
  return map[screen] ?? v.vert;
}

/** Signature de chaque rareté (cahier des charges V2, §4.5) : couleur, fond de scène et intensité de la révélation. */
export const RARITY_STYLE = {
  COMMON: { c: V2.grey, deep: '#1B1E24', glow: 0, label: 'Commune', symbol: '●' },
  RARE: { c: V2.blue, deep: '#0E1C33', glow: 0.18, label: 'Rare', symbol: '◆' },
  EPIC: { c: V2.violet, deep: '#1E1638', glow: 0.28, label: 'Épique', symbol: '✦' },
  LEGENDARY: { c: V2.gold, deep: '#2B1F0A', glow: 0.4, label: 'Légendaire', symbol: '★' },
} as const;

/** Espacements et rayons communs (multiples de 4). */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;
