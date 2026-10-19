/**
 * Inventaire cosmétique — structure préparée dès la Phase 2 (la boutique complète arrive plus tard).
 * Les vêtements sont des DONNÉES (catalogue), jamais codés en dur dans un écran.
 */
export type CosmeticCategory = 'TOP' | 'BOTTOM' | 'SHOES' | 'JACKET' | 'HEAD' | 'GLASSES' | 'ACCESSORY' | 'FULL_OUTFIT';

export type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

/**
 * Origine d'un objet (l'habit raconte quelque chose) : seuls SHOP, EVENT et LIMITED peuvent avoir un prix en Fitcoins.
 * STORE = cosmétique vendu par achat intégré Apple, jamais payable en Fitcoins (attribué par le serveur après reçu vérifié).
 */
export type CosmeticSource = 'SHOP' | 'REWARD' | 'EVENT' | 'LIMITED' | 'PRESTIGE' | 'STORE';

export type CosmeticItem = {
  id: string;
  name: string;
  category: CosmeticCategory;
  rarity: Rarity;
  /** Référence opaque de ressource, résolue par la couche de présentation de l'avatar (jamais par l'économie). */
  assetReference: string;
  source: CosmeticSource;
  /** Prix en Fitcoins ; null = non achetable. */
  priceFitcoins: number | null;
  /** false = plus obtenable (achat, récompense) ; un objet déjà possédé reste portable. */
  enabled: boolean;
  createdAt: string;
};

/** Canal d'acquisition d'un objet possédé. `grant` : attribution par le serveur (support, cadeau futur). */
export type AcquisitionChannel = 'purchase' | 'reward' | 'grant';

export type InventoryEntry = {
  itemId: string;
  acquiredVia: AcquisitionChannel;
  acquiredAt: string;
  /** Transaction d'achat ou réclamation de récompense à l'origine de l'objet. */
  sourceTransactionId: string | null;
  sourceClaimId: string | null;
};

/** Objet porté par emplacement (l'emplacement est la catégorie de l'objet). */
export type EquippedCosmetics = Partial<Record<CosmeticCategory, string>>;

export type UserInventory = { userId: string; items: InventoryEntry[]; equipped: EquippedCosmetics };

export type EquipRejectionCode = 'ITEM_NOT_FOUND' | 'NOT_OWNED' | 'INVALID_SLOT';

export type EquipOutcome =
  | { ok: true; changed: boolean; equipped: EquippedCosmetics; unequipped: string[] }
  | { ok: false; code: EquipRejectionCode };

export type GrantOutcome = { ok: true; acquired: boolean } | { ok: false; code: 'ITEM_NOT_FOUND' | 'ITEM_DISABLED' };

export const COSMETIC_CATEGORIES: readonly CosmeticCategory[] = ['TOP', 'BOTTOM', 'SHOES', 'JACKET', 'HEAD', 'GLASSES', 'ACCESSORY', 'FULL_OUTFIT'];

export const RARITIES: readonly Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
