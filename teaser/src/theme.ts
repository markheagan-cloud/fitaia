// FITAIA — identité visuelle et grille rythmique du teaser.
export const C = {
  lime: '#C8F03C',
  obsidian: '#1C1D1F',
  ink: '#0E0F10',
  night: '#08080A',
  grey: '#ECEAE5',
  surf: '#F5F4F1',
  mid: '#8D8B86',
  line: '#D9D6CF',
  white: '#FFFFFF',
} as const;

export const FPS = 30;
export const W = 1080;
export const H = 1920;
// 120 BPM : 1 temps = 15 images, 1 mesure = 60 images. Toutes les coupes tombent sur cette grille.
export const BEAT = 15;
export const BAR = 60;
export const TOTAL = 1260;

// Débuts de scènes (images absolues) — même découpage que la musique (music/compose.py).
export const CUT = {
  hook: 0,
  seul: 60,
  turn: 120,
  scan: 180,
  spin: 240,
  evolve: 300,
  trio: 360,
  app: 420,
  pushups: 480,
  meal: 570,
  wall: 600,
  match: 660,
  chat: 720,
  payoff: 780,
  build: 840,
  corps: 900,
  avatar: 960,
  histoire: 1020,
  end: 1080,
} as const;

// Géométrie des rendus 3D plein pied (1080 x 1620, fond transparent) : haut de la tête / bas des pieds.
export const BODY_IMG = {w: 1080, h: 1620, head: 0.105, feet: 0.925};
