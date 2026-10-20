/**
 * Présentation des tenues : objet du catalogue (Phase 2) → rendu affiché. L'économie ne connaît que des identifiants ;
 * seule cette couche sait quelle image correspond à quelle tenue. Une tenue sans rendu n'apparaît pas en boutique.
 */
import { SKINS, Skin } from '@/data/content';
import { useEco } from '@/store/useEco';
import type { CosmeticItem } from '@/inventory/types';

const SKIN_BY_ITEM = new Map(SKINS.map((s) => [`outfit_${s.id}`, s]));

export const skinOf = (itemId: string | undefined): Skin | undefined => (itemId ? SKIN_BY_ITEM.get(itemId) : undefined);

/** Tenues affichables en boutique : celles qui ont un rendu, dans l'ordre du catalogue. */
export const displayableOutfits = (catalog: readonly CosmeticItem[]) => catalog.filter((i) => i.category === 'FULL_OUTFIT' && SKIN_BY_ITEM.has(i.id));

/** Tenue portée par le perso (tenue de départ tant que l'inventaire n'est pas chargé). */
export function useEquippedSkin(): Skin {
  const id = useEco((s) => s.inventory?.equipped.FULL_OUTFIT);
  return skinOf(id) ?? SKINS[0];
}
