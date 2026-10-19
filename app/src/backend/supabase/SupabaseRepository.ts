/**
 * Adaptateurs SUPABASE des trois dépôts : appels aux fonctions SQL de la migration 0002 via un client RPC injecté.
 *
 * ÉTAT : écrit et testé contre un PostgreSQL 16 local (supabase/tests/repository_contract.test.ts, client RPC
 * de test passant par psql). JAMAIS exécuté contre un vrai projet Supabase : aucun projet n'existe à ce jour.
 * Le serveur calcule tout ; ces adaptateurs ne font que transmettre la demande, décoder la réponse et publier
 * les mêmes événements métier que l'adaptateur local.
 */
import { claimEvents, awardEvents, equipEvents, peerAwardEvents, spendEvents } from '../eventMapping';
import type { DomainEventBus, PendingEvent } from '../../platform/events';
import type { Phase2Repositories } from '../repositories';
import {
  decodeAccount,
  decodeAwardOutcome,
  decodeCatalog,
  decodeClaimOutcome,
  decodeEquipOutcome,
  decodeInventory,
  decodePeerOutcome,
  decodeRewardStatuses,
  decodeSpendOutcome,
  decodeTransactions,
  decodeWallet,
} from './decode';
import { BackendError, PHASE2_RPC } from './rpc';
import type { RpcClient } from './rpc';

export type SupabaseRepositoriesOptions = {
  rpc: RpcClient;
  /** Utilisateur de la session Supabase (sert seulement à étiqueter les événements ; le serveur utilise auth.uid()). */
  userId: string;
  events: DomainEventBus;
};

type RpcName = keyof typeof PHASE2_RPC;

export function createSupabaseRepositories({ rpc, userId, events }: SupabaseRepositoriesOptions): Phase2Repositories {
  async function call<T>(name: RpcName, args: Record<string, unknown>, decode: (data: unknown) => T): Promise<T> {
    const { fn } = PHASE2_RPC[name];
    const { data, error } = await rpc.rpc(fn, args);
    if (error) throw new BackendError(fn, error.message, error.code);
    return decode(data);
  }
  const publish = (list: readonly PendingEvent[]) => {
    for (const e of list) events.publish(e);
  };

  return {
    progression: {
      getAccount: () => call('getProgression', {}, decodeAccount),
      async recordAction(action, sourceId) {
        const outcome = await call('recordAction', { p_action: action, p_source_id: sourceId ?? null }, decodeAwardOutcome);
        publish(awardEvents(userId, action, outcome));
        return outcome;
      },
      async recordPeerAction(action, targetUserId, sourceId) {
        const outcome = await call('recordPeerAction', { p_action: action, p_target: targetUserId, p_source_id: sourceId }, decodePeerOutcome);
        publish(peerAwardEvents(userId, action, outcome));
        return outcome;
      },
    },
    economy: {
      getBalance: () => call('getWallet', {}, decodeWallet),
      getTransactions: (query = {}) =>
        call('getTransactions', { p_limit: query.limit ?? 50, p_before_sequence: query.beforeSequence ?? null }, decodeTransactions),
      getRewardStatuses: () => call('getRewardStatuses', {}, decodeRewardStatuses),
      async claimReward(rewardId) {
        const outcome = await call('claimReward', { p_reward_id: rewardId }, decodeClaimOutcome);
        publish(claimEvents(userId, rewardId, outcome));
        return outcome;
      },
      async spendFitcoins(request) {
        const outcome = await call('spendFitcoins', { p_item_id: request.itemId, p_request_id: request.requestId }, decodeSpendOutcome);
        publish(spendEvents(outcome));
        return outcome;
      },
    },
    inventory: {
      getCatalog: () => call('getCatalog', {}, decodeCatalog),
      getInventory: () => call('getInventory', {}, decodeInventory),
      async equip(itemId) {
        const outcome = await call('equip', { p_item_id: itemId }, decodeEquipOutcome);
        publish(equipEvents(userId, itemId, outcome));
        return outcome;
      },
      unequip: (slot) => call('unequip', { p_slot: slot }, decodeEquipOutcome),
    },
  };
}
