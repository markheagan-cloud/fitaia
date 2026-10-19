/**
 * Adaptateurs LOCAUX (démonstration) des trois dépôts : ils délèguent tout au serveur local, lié à
 * l'utilisateur de la session. L'interface ne voit que ProgressionRepository / EconomyRepository / InventoryRepository.
 */
import type { Phase2Repositories } from '../repositories';
import type { LocalEconomyServer } from './LocalEconomyServer';

export function createLocalRepositories(server: LocalEconomyServer, userId: string): Phase2Repositories {
  return {
    progression: {
      getAccount: () => server.getProgression(userId),
      recordAction: (action, sourceId) => server.recordAction(userId, action, sourceId ?? null),
      recordPeerAction: (action, targetUserId, sourceId) => server.recordPeerAction(userId, action, targetUserId, sourceId),
    },
    economy: {
      getBalance: () => server.getBalance(userId),
      getTransactions: (query) => server.getTransactions(userId, query),
      getRewardStatuses: () => server.getRewardStatuses(userId),
      claimReward: (rewardId) => server.claimReward(userId, rewardId),
      spendFitcoins: (request) => server.spendFitcoins(userId, request),
    },
    inventory: {
      getCatalog: async () => server.getCatalog(),
      getInventory: () => server.getInventory(userId),
      equip: (itemId) => server.equip(userId, itemId),
      unequip: (slot) => server.unequip(userId, slot),
    },
  };
}
