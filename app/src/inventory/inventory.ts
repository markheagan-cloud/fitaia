/**
 * Règles pures de l'inventaire : achat possible ou non, acquisition (sans doublon), retrait, équipement.
 * Un objet est possédé au plus une fois ; l'emplacement d'équipement est la catégorie de l'objet.
 */
import type { CosmeticCategory, CosmeticItem, EquippedCosmetics, InventoryEntry } from './types';
import { COSMETIC_CATEGORIES } from './types';

export type PurchaseBlock = 'ITEM_DISABLED' | 'NOT_FOR_SALE';

/** Un objet s'achète s'il est actif et a un prix (jamais une récompense ni un objet de prestige). */
export function purchaseBlock(item: CosmeticItem): PurchaseBlock | null {
  if (!item.enabled) return 'ITEM_DISABLED';
  if (item.priceFitcoins === null || item.source === 'REWARD' || item.source === 'PRESTIGE') return 'NOT_FOR_SALE';
  return null;
}

export function owns(inventory: readonly InventoryEntry[], itemId: string): boolean {
  return inventory.some((e) => e.itemId === itemId);
}

/** Ajoute l'objet s'il n'est pas déjà possédé ; un doublon ne crée jamais une seconde entrée. */
export function acquireItem(
  inventory: readonly InventoryEntry[],
  entry: InventoryEntry,
): { inventory: InventoryEntry[]; acquired: boolean } {
  if (owns(inventory, entry.itemId)) return { inventory: [...inventory], acquired: false };
  return { inventory: [...inventory, entry], acquired: true };
}

/** Retire un objet (remboursement) et le déséquipe s'il était porté. */
export function revokeItem(
  inventory: readonly InventoryEntry[],
  equipped: EquippedCosmetics,
  itemId: string,
): { inventory: InventoryEntry[]; equipped: EquippedCosmetics } {
  const nextEquipped: EquippedCosmetics = {};
  for (const slot of COSMETIC_CATEGORIES) {
    const current = equipped[slot];
    if (current && current !== itemId) nextEquipped[slot] = current;
  }
  return { inventory: inventory.filter((e) => e.itemId !== itemId), equipped: nextEquipped };
}

export type EquipChange = { equipped: EquippedCosmetics; changed: boolean; unequipped: string[] };

/** Équipe un objet possédé dans son emplacement ; libère les emplacements incompatibles. */
export function equipItem(
  equipped: EquippedCosmetics,
  item: CosmeticItem,
  exclusions: Readonly<Partial<Record<CosmeticCategory, readonly CosmeticCategory[]>>>,
): EquipChange {
  if (equipped[item.category] === item.id) return { equipped: { ...equipped }, changed: false, unequipped: [] };
  const next: EquippedCosmetics = { ...equipped };
  const unequipped: string[] = [];
  for (const slot of [item.category, ...(exclusions[item.category] ?? [])]) {
    const current = next[slot];
    if (current) {
      unequipped.push(current);
      delete next[slot];
    }
  }
  next[item.category] = item.id;
  return { equipped: next, changed: true, unequipped };
}

export function unequipSlot(equipped: EquippedCosmetics, slot: CosmeticCategory): EquipChange {
  const current = equipped[slot];
  if (!current) return { equipped: { ...equipped }, changed: false, unequipped: [] };
  const next: EquippedCosmetics = { ...equipped };
  delete next[slot];
  return { equipped: next, changed: true, unequipped: [current] };
}

export function isCategory(value: string): value is CosmeticCategory {
  return (COSMETIC_CATEGORIES as readonly string[]).includes(value);
}
