/**
 * Couplage faible Économie → Inventaire → AvatarPresentationService → Human Engine (spécification C, point 14).
 *
 * Ce service transforme `equippedCosmetics` (identifiants d'objets portés) en descripteurs de présentation
 * neutres : emplacement, point d'ancrage sur le corps, ordre de rendu, référence de ressource. Il n'importe pas
 * le Human Engine et ne touche à aucun mesh : un adaptateur côté moteur (intégration ultérieure) consommera
 * ces descripteurs pour charger les vêtements.
 */
import type { CosmeticCategory, CosmeticItem, EquippedCosmetics, Rarity } from '../inventory/types';
import { COSMETIC_CATEGORIES } from '../inventory/types';

export type AvatarAnchor = 'feet' | 'legs' | 'torso' | 'full_body' | 'outer_torso' | 'face' | 'head' | 'accessory';

export type CosmeticLayer = {
  slot: CosmeticCategory;
  itemId: string;
  assetReference: string;
  rarity: Rarity;
  anchor: AvatarAnchor;
  /** Croissant = dessiné plus tard (par-dessus). */
  renderOrder: number;
  /** Zones de la tenue de base que cette couche remplace. */
  replacesBase: readonly AvatarAnchor[];
};

export type AvatarPresentation = {
  layers: CosmeticLayer[];
  /** Objets portés absents du catalogue fourni (signalés, jamais inventés). */
  unknownItemIds: string[];
};

export interface AvatarPresentationService {
  present(equipped: EquippedCosmetics): AvatarPresentation;
}

export const SLOT_PRESENTATION: Record<CosmeticCategory, { anchor: AvatarAnchor; renderOrder: number; replacesBase: readonly AvatarAnchor[] }> = {
  SHOES: { anchor: 'feet', renderOrder: 10, replacesBase: ['feet'] },
  BOTTOM: { anchor: 'legs', renderOrder: 20, replacesBase: ['legs'] },
  FULL_OUTFIT: { anchor: 'full_body', renderOrder: 25, replacesBase: ['torso', 'legs'] },
  TOP: { anchor: 'torso', renderOrder: 30, replacesBase: ['torso'] },
  JACKET: { anchor: 'outer_torso', renderOrder: 40, replacesBase: [] },
  GLASSES: { anchor: 'face', renderOrder: 50, replacesBase: [] },
  HEAD: { anchor: 'head', renderOrder: 60, replacesBase: [] },
  ACCESSORY: { anchor: 'accessory', renderOrder: 70, replacesBase: [] },
};

export function createAvatarPresentationService(catalog: readonly CosmeticItem[]): AvatarPresentationService {
  const byId = new Map(catalog.map((i) => [i.id, i]));
  return {
    present(equipped) {
      const layers: CosmeticLayer[] = [];
      const unknownItemIds: string[] = [];
      for (const slot of COSMETIC_CATEGORIES) {
        const itemId = equipped[slot];
        if (!itemId) continue;
        const item = byId.get(itemId);
        if (!item || item.category !== slot) {
          unknownItemIds.push(itemId);
          continue;
        }
        const p = SLOT_PRESENTATION[slot];
        layers.push({ slot, itemId, assetReference: item.assetReference, rarity: item.rarity, anchor: p.anchor, renderOrder: p.renderOrder, replacesBase: p.replacesBase });
      }
      layers.sort((a, b) => a.renderOrder - b.renderOrder);
      return { layers, unknownItemIds };
    },
  };
}
