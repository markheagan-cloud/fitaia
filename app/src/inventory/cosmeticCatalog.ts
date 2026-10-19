/**
 * Catalogue cosmétique de départ (DONNÉES de démonstration : noms, prix et raretés à équilibrer).
 * Même contenu que l'insertion de `cosmetic_items` dans la migration 0002 (vérifié par seed_sync.test.ts).
 * Les références de ressources sont opaques : la couche AvatarPresentationService les transmet au moteur
 * d'avatar, l'économie ne les interprète jamais.
 */
import type { CosmeticCategory, CosmeticItem, Rarity } from './types';

const SEEDED_AT = '2026-10-04T00:00:00.000Z';

const item = (
  id: string,
  name: string,
  category: CosmeticCategory,
  rarity: Rarity,
  source: CosmeticItem['source'],
  priceFitcoins: number | null,
  enabled = true,
): CosmeticItem => ({
  id,
  name,
  category,
  rarity,
  assetReference: `cosmetic/${category.toLowerCase()}/${id}`,
  source,
  priceFitcoins,
  enabled,
  createdAt: SEEDED_AT,
});

export const COSMETIC_CATALOG: readonly CosmeticItem[] = [
  item('outfit_urban_001', 'Tenue Urbaine', 'FULL_OUTFIT', 'COMMON', 'SHOP', 250),
  item('top_tee_graphite', 'Tee Essentiel Graphite', 'TOP', 'COMMON', 'SHOP', 120),
  item('top_hoodie_nuit', 'Hoodie Nuit', 'TOP', 'RARE', 'SHOP', 300),
  item('jacket_coupe_vent_citron', 'Coupe-vent Citron', 'JACKET', 'RARE', 'SHOP', 300),
  item('bottom_jogger_graphite', 'Jogger Graphite', 'BOTTOM', 'COMMON', 'SHOP', 150),
  item('shoes_runner_craie', 'Runner Craie', 'SHOES', 'COMMON', 'SHOP', 180),
  item('shoes_runner_lime', 'Runner Lime', 'SHOES', 'EPIC', 'SHOP', 600),
  item('head_casquette_noire', 'Casquette Noire', 'HEAD', 'COMMON', 'SHOP', 100),
  item('glasses_sport_fume', 'Lunettes Sport Fumé', 'GLASSES', 'RARE', 'SHOP', 220),
  item('accessory_montre_parcours', 'Montre du Parcours', 'ACCESSORY', 'RARE', 'REWARD', null),
  item('jacket_october_crew', 'Veste October Crew', 'JACKET', 'LEGENDARY', 'PRESTIGE', null),
  item('head_bonnet_hiver', 'Bonnet Hiver', 'HEAD', 'COMMON', 'EVENT', 150, false),
];

/**
 * Emplacements incompatibles : une tenue complète remplace le haut, le bas et la veste (et inversement).
 * Proposition à valider avec le moteur d'avatar ; symétrique par construction.
 */
export const SLOT_EXCLUSIONS: Readonly<Partial<Record<CosmeticCategory, readonly CosmeticCategory[]>>> = {
  FULL_OUTFIT: ['TOP', 'BOTTOM', 'JACKET'],
  TOP: ['FULL_OUTFIT'],
  BOTTOM: ['FULL_OUTFIT'],
  JACKET: ['FULL_OUTFIT'],
};

export const CATEGORY_LABELS: Record<CosmeticCategory, string> = {
  TOP: 'Haut',
  BOTTOM: 'Bas',
  SHOES: 'Chaussures',
  JACKET: 'Veste',
  HEAD: 'Couvre-chef',
  GLASSES: 'Lunettes',
  ACCESSORY: 'Accessoire',
  FULL_OUTFIT: 'Tenue complète',
};
