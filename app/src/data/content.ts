/** Contenu statique de la maquette (SKINS, MEALS, RARITY, questions coach). */
import type { ImageSourcePropType } from 'react-native';

export const IMG: Record<string, ImageSourcePropType> = {
  p1: require('../../assets/persos/p1.jpg'),
  p2: require('../../assets/persos/p2.jpg'),
  p3: require('../../assets/persos/p3.jpg'),
  p4: require('../../assets/persos/p4.jpg'),
  p5: require('../../assets/persos/p5.jpg'),
  p6: require('../../assets/persos/p6.jpg'),
};
export const COACH_IMG = IMG.p5;

export const CUR_NAMES: [string, string] = ['FIT Crédits', 'FIT Points'];

export type RarityKey = 'commune' | 'rare' | 'epique' | 'legendaire';
export const RARITY: Record<RarityKey, { label: string; c: string }> = {
  commune: { label: 'Commune', c: '#8A8E96' },
  rare: { label: 'Rare', c: '#2F6BF0' },
  epique: { label: 'Épique', c: '#8247E5' },
  legendaire: { label: 'Légendaire', c: '#E9A10B' },
};

export type Skin = {
  id: string;
  name: string;
  rarity: RarityKey;
  img: ImageSourcePropType;
  cur: 'earn' | 'prem';
  price: number;
};

export const SKINS: Skin[] = [
  { id: 'origine', name: 'Origine', rarity: 'commune', img: IMG.p1, cur: 'earn', price: 0 },
  { id: 'cargo', name: 'Cargo Urbain', rarity: 'rare', img: IMG.p4, cur: 'earn', price: 4000 },
  { id: 'olive', name: 'Olive Tech', rarity: 'rare', img: IMG.p6, cur: 'earn', price: 6500 },
  { id: 'creme', name: 'Crème Studio', rarity: 'epique', img: IMG.p2, cur: 'prem', price: 80 },
  { id: 'titane', name: 'Titane Néon', rarity: 'legendaire', img: IMG.p3, cur: 'prem', price: 150 },
  { id: 'atelier', name: 'Atelier Noir', rarity: 'legendaire', img: IMG.p4, cur: 'prem', price: 180 },
];

export type Meal = { name: string; kcal: number; p: number; g: number; l: number; score: number; items: string[] };
export const MEALS: Meal[] = [
  { name: 'Bowl poulet, riz, brocolis', kcal: 620, p: 48, g: 70, l: 14, score: 86, items: ['Poulet grillé, 150 g', 'Riz basmati, 120 g', 'Brocolis, 80 g'] },
  { name: 'Burger, frites et soda', kcal: 1080, p: 34, g: 128, l: 46, score: 31, items: ['Burger double', 'Frites, 150 g', 'Soda, 33 cl'] },
  { name: 'Salade saumon avocat', kcal: 450, p: 32, g: 18, l: 27, score: 82, items: ['Saumon, 100 g', 'Avocat, ½', 'Quinoa, 60 g'] },
];

export const PACKS = [
  { amount: '100', price: '0,99 €', tag: '', n: 100 },
  { amount: '550', price: '4,99 €', tag: 'Le plus pris', n: 550 },
  { amount: '1 200', price: '9,99 €', tag: '+20 % offerts', n: 1200 },
];

export type ExtraKind = 'camera' | 'meals' | 'steps';
export type ExtraDefi = { id: string; name: string; sub: string; reward: number; kind: ExtraKind; target: number };
export const OTHER_DEFIS: ExtraDefi[] = [
  { id: 'squats', name: '20 squats', sub: 'Caméra, amplitude vérifiée', reward: 400, kind: 'camera', target: 20 },
  { id: 'plank', name: 'Gainage, 1 minute', sub: 'Caméra, position tenue', reward: 600, kind: 'camera', target: 60 },
  { id: 'meals', name: 'Scanner 2 repas', sub: 'Repas ajoutés au journal', reward: 300, kind: 'meals', target: 2 },
  { id: 'steps', name: 'Marcher 6 000 pas', sub: 'Podomètre de l’iPhone', reward: 400, kind: 'steps', target: 6000 },
];

export const Q_LIP = 'Lipides ou glucides, lesquels privilégier ?';
export const Q_SOIR = 'Que manger ce soir ?';
export const Q_STAG = 'Pourquoi mon poids stagne ?';
export const Q_PROT = 'Il me manque combien de protéines ?';
export const SUGGESTIONS = [Q_SOIR, Q_PROT, Q_STAG, Q_LIP];

export const PASS_PRICE = 950;

/** Format FR : espace fine insécable pour les milliers, comme toLocaleString('fr-FR'). */
/** Poids : une décimale, virgule française (92,0). */
export function fmtKg(n: number): string {
  return n.toFixed(1).replace('.', ',');
}

export function fmt(n: number): string {
  const r = Math.round(n);
  const s = Math.abs(r).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (r < 0 ? '-' : '') + s;
}

/** Date du jour en français, ex. « Vendredi 2 octobre ». */
export function todayLabel(d = new Date()): string {
  try {
    const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return '';
  }
}

export const TITLES: Record<string, [string, string]> = {
  home: [new Date().getHours() >= 18 ? 'Bonsoir' : 'Salut', todayLabel()],
  defis: ['Défis du jour', 'Gratuits, chaque jour'],
  scan: ['Scanner', 'Code-barres ou recherche'],
  shop: ['Boutique', 'Tenues et saison'],
  perso: ['Mon perso', 'Niveau 12'],
  selfie: ['Ton selfie', 'Ressemblance (optionnel)'],
  creator: ['Créateur', 'Ta fiche, ton perso'],
};

/** Version affichée dans l'app (synchronisée avec app.json). */
export const APP_VERSION = '1.0.0';
