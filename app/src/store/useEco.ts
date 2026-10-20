/**
 * Économie et progression vues par l'interface : un miroir en lecture des dépôts Phase 2 (registre Fitcoins,
 * Points FITAIA, inventaire). L'écran ne calcule jamais un montant : il déclare une action, achète un objet ou
 * l'équipe, puis relit l'état renvoyé par le serveur (local aujourd'hui, Supabase demain).
 */
import { create } from 'zustand';
import type { EconomyTransaction, FitcoinWallet, RewardStatus } from '@/economy/types';
import type { CosmeticItem, UserInventory } from '@/inventory/types';
import type { ProgressionAccount, SelfActionType } from '@/progression/types';
import { rejectionMessage } from '@/economy/messages';
import { uuidV4 } from '@/platform/ids';
import { STARTER_OUTFIT, getSession } from '@/services/session';

/** Ancienne économie du téléphone, convertie une seule fois (solde 10:1 plafonné, tenues possédées, tenue portée). */
export type LegacyEconomy = { credits: number; owned: string[]; equipped: string };

export type AwardResult = { points: number; coins: number; message: string | null };
export type ShopResult = { ok: boolean; message: string };

type EcoState = {
  ready: boolean;
  error: string | null;
  isDemo: boolean;
  wallet: FitcoinWallet | null;
  account: ProgressionAccount | null;
  inventory: UserInventory | null;
  catalog: CosmeticItem[];
  transactions: EconomyTransaction[];
  statuses: RewardStatus[];
  /** Pluie de pièces (FX) : incrémentée à chaque gain de Fitcoins. */
  burst: { id: number; amount: number };
  init(legacy: LegacyEconomy | null): Promise<void>;
  refresh(): Promise<void>;
  award(action: SelfActionType, sourceId: string): Promise<AwardResult>;
  buy(itemId: string): Promise<ShopResult>;
  equip(itemId: string): Promise<ShopResult>;
};

let initOnce: Promise<void> | null = null;

export const useEco = create<EcoState>()((set, get) => ({
  ready: false,
  error: null,
  isDemo: true,
  wallet: null,
  account: null,
  inventory: null,
  catalog: [],
  transactions: [],
  statuses: [],
  burst: { id: 0, amount: 0 },

  init: (legacy) => {
    if (!initOnce) {
      initOnce = (async () => {
        try {
          const s = await getSession();
          if (legacy) {
            // idempotent côté serveur : clé migration:v1:<membre>, rejouer ne crédite jamais deux fois
            await s.bootstrap.migrateLegacyBalance(Math.max(0, Math.floor(legacy.credits)));
            for (const id of legacy.owned) await s.bootstrap.grantCosmetic('outfit_' + id);
          }
          await s.bootstrap.grantCosmetic(STARTER_OUTFIT);
          const inv = await s.inventory.getInventory();
          if (legacy && inv.items.some((i) => i.itemId === 'outfit_' + legacy.equipped)) await s.inventory.equip('outfit_' + legacy.equipped);
          else if (!inv.equipped.FULL_OUTFIT) await s.inventory.equip(STARTER_OUTFIT);
          set({ isDemo: s.isDemo });
          await get().refresh();
          set({ ready: true, error: null });
        } catch (e) {
          initOnce = null;
          set({ error: e instanceof Error ? e.message : String(e) });
        }
      })();
    }
    return initOnce;
  },

  refresh: async () => {
    const s = await getSession();
    const [wallet, account, inventory, catalog, transactions, statuses] = await Promise.all([
      s.economy.getBalance(),
      s.progression.getAccount(),
      s.inventory.getInventory(),
      s.inventory.getCatalog(),
      s.economy.getTransactions({ limit: 30 }),
      s.economy.getRewardStatuses(),
    ]);
    set({ wallet, account, inventory, catalog, transactions, statuses });
  },

  award: async (action, sourceId) => {
    const s = await getSession();
    const outcome = await s.progression.recordAction(action, sourceId);
    let points = 0;
    let message: string | null = null;
    if (outcome.ok) points = outcome.replayed ? 0 : outcome.award.points;
    else if (outcome.code !== 'DAILY_CAP_REACHED') message = rejectionMessage(outcome.code);
    // toutes les récompenses débloquées (quotidiennes, paliers du Parcours) sont réclamées tout de suite
    let coins = 0;
    for (const st of await s.economy.getRewardStatuses()) {
      if (st.state !== 'claimable' || st.reward.type === 'capsule') continue;
      const claim = await s.economy.claimReward(st.reward.id);
      if (claim.ok && !claim.replayed && claim.transaction) coins += claim.transaction.amount;
    }
    await get().refresh();
    if (coins > 0) set((st) => ({ burst: { id: st.burst.id + 1, amount: coins } }));
    return { points, coins, message };
  },

  buy: async (itemId) => {
    const s = await getSession();
    const out = await s.economy.spendFitcoins({ itemId, requestId: uuidV4() });
    if (!out.ok) {
      await get().refresh();
      return { ok: false, message: rejectionMessage(out.code) };
    }
    await s.inventory.equip(itemId);
    await get().refresh();
    return { ok: true, message: '' };
  },

  equip: async (itemId) => {
    const s = await getSession();
    const out = await s.inventory.equip(itemId);
    await get().refresh();
    return out.ok ? { ok: true, message: '' } : { ok: false, message: rejectionMessage(out.code) };
  },
}));

const DAILY_LABELS: Record<string, string> = { daily_challenge: 'Défi du jour', daily_meal: 'Repas du jour', daily_goal: 'Objectif du jour' };

/** Libellé lisible d'une ligne du registre (« pourquoi j'avais 800 et j'en ai 300 »). */
export function transactionLabel(tx: EconomyTransaction, catalog: readonly CosmeticItem[]): string {
  switch (tx.reason) {
    case 'daily_reward':
      return DAILY_LABELS[tx.sourceId] ?? 'Récompense du jour';
    case 'progression_milestone':
    case 'stage_reward':
      return 'Palier du Parcours';
    case 'cosmetic_purchase':
      return 'Tenue ' + (catalog.find((i) => i.id === tx.sourceId)?.name ?? '');
    case 'purchase_refund':
      return 'Remboursement';
    case 'legacy_migration':
      return 'Solde de l’ancienne version';
  }
}

/** Solde affiché (0 tant que le registre n'est pas chargé). */
export const useBalance = () => useEco((s) => s.wallet?.balance ?? 0);

/** Fitcoins d'une récompense quotidienne si elle est encore à gagner aujourd'hui, sinon 0. */
export function useDailyCoins(rewardId: string): number {
  const st = useEco((s) => s.statuses.find((x) => x.reward.id === rewardId));
  return st && st.state !== 'claimed' ? st.reward.amount : 0;
}
