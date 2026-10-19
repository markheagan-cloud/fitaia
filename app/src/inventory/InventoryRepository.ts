/** Accès au catalogue et à l'inventaire de l'utilisateur connecté (acquisition : achat ou récompense, côté serveur). */
import type { CosmeticCategory, CosmeticItem, EquipOutcome, UserInventory } from './types';

export interface InventoryRepository {
  getCatalog(): Promise<CosmeticItem[]>;
  getInventory(): Promise<UserInventory>;
  equip(itemId: string): Promise<EquipOutcome>;
  unequip(slot: CosmeticCategory): Promise<EquipOutcome>;
}
