/**
 * Client RPC minimal injecté (aucune dépendance npm ajoutée). Forme compatible avec `supabase.rpc(fn, args)`
 * de supabase-js : `{ data, error }`. Le jour du déploiement, l'app passe son client Supabase tel quel.
 */
export type RpcError = { message: string; code?: string };

export type RpcResponse = { data: unknown; error: RpcError | null };

export interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResponse>;
}

/** Erreur technique du serveur (réseau, session absente, contrainte) : distincte d'un refus métier. */
export class BackendError extends Error {
  readonly fn: string;
  readonly code: string | undefined;

  constructor(fn: string, message: string, code?: string) {
    super(fn + ' : ' + message);
    this.fn = fn;
    this.code = code;
  }
}

/**
 * Fonctions SQL appelées par l'adaptateur et leurs paramètres nommés (migration 0002).
 * Vérifié contre le fichier de migration par supabase/tests/seed_sync.test.ts.
 */
export const PHASE2_RPC = {
  getProgression: { fn: 'get_progression', params: [] },
  recordAction: { fn: 'record_progress_action', params: ['p_action', 'p_source_id'] },
  recordPeerAction: { fn: 'record_peer_progress_action', params: ['p_action', 'p_target', 'p_source_id'] },
  getWallet: { fn: 'get_wallet', params: [] },
  getTransactions: { fn: 'get_transactions', params: ['p_limit', 'p_before_sequence'] },
  getRewardStatuses: { fn: 'get_reward_statuses', params: [] },
  claimReward: { fn: 'claim_reward', params: ['p_reward_id'] },
  spendFitcoins: { fn: 'spend_fitcoins_for_item', params: ['p_item_id', 'p_request_id'] },
  getCatalog: { fn: 'get_cosmetic_catalog', params: [] },
  getInventory: { fn: 'get_inventory', params: [] },
  equip: { fn: 'equip_cosmetic', params: ['p_item_id'] },
  unequip: { fn: 'unequip_cosmetic', params: ['p_slot'] },
} as const satisfies Record<string, { fn: string; params: readonly string[] }>;
