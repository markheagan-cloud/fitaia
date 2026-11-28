/**
 * Prix en euros des tenues (achat intégré Apple, un prix fixe par article, décision de Mark du 26/11/2026).
 * Grille calée sur le marché (docs/ECONOMIE.md, « Prix en euros ») : Clash Royale vend ses apparences de tour
 * 10 à 15 € en lot, Brawl Stars une apparence 2,49 à 5,99 €, Fortnite une tenue 8 à 20 €.
 *
 * Règles :
 *  - les tenues communes restent en Fitcoins seulement (on les a en 1 à 4 jours de défis) ;
 *  - toute tenue payable en euros reste payable en Fitcoins : payer va plus vite, ne donne rien de plus ;
 *  - une édition limitée terminée ne se vend plus, ni en Fitcoins ni en euros.
 * Pur, sans module natif (tests/shop-prix.test.ts).
 */
import type { CosmeticItem } from '@/inventory/types';

export type Palier = { id: 'rare' | 'epique' | 'legendaire' | 'prestige'; euros: number };

export const PALIERS: Record<Palier['id'], Palier> = {
  rare: { id: 'rare', euros: 2.99 },
  epique: { id: 'epique', euros: 5.99 },
  legendaire: { id: 'legendaire', euros: 9.99 },
  prestige: { id: 'prestige', euros: 14.99 },
};

/** La tenue la plus chère de la boutique, à part. */
const PRESTIGE = new Set(['outfit_royal']);

export const PRODUCT_PREFIX = 'com.fitaia.app.tenue.';

/** Identifiant du produit App Store d'une tenue (non consommable : achetée une fois, à soi pour toujours). */
export const productIdOf = (itemId: string) => PRODUCT_PREFIX + itemId.replace(/^outfit_/, '');
export const itemIdOfProduct = (productId: string) => (productId.startsWith(PRODUCT_PREFIX) ? 'outfit_' + productId.slice(PRODUCT_PREFIX.length) : null);

/** Palier en euros d'une tenue, ou null si elle ne se paie pas en euros. */
export function palierOf(item: Pick<CosmeticItem, 'id' | 'category' | 'rarity' | 'source' | 'priceFitcoins'>): Palier | null {
  if (item.category !== 'FULL_OUTFIT' || item.priceFitcoins === null) return null;
  if (item.source !== 'SHOP' && item.source !== 'LIMITED') return null;
  if (PRESTIGE.has(item.id)) return PALIERS.prestige;
  if (item.rarity === 'LEGENDARY') return PALIERS.legendaire;
  if (item.rarity === 'EPIC') return PALIERS.epique;
  if (item.rarity === 'RARE') return PALIERS.rare;
  return null;
}

/** « 9,99 € » (prix de référence France ; à l'écran on montre le prix renvoyé par Apple quand il est là). */
export const eurosLabel = (e: number) => e.toFixed(2).replace('.', ',') + ' €';
