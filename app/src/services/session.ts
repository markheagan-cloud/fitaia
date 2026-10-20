/**
 * Racine de composition de l'app : UN backend Phase 2 par session (un seul verrou, un seul registre).
 * Mode local tant qu'aucun compte serveur n'existe : le registre vit dans AsyncStorage, avec les mêmes règles
 * (idempotence, plafonds, prix lus côté « serveur ») que l'adaptateur Supabase. Passer en ligne = changer
 * `createSession`, rien dans les écrans.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValueStorage } from '@/platform/storage';
import { uuidV4 } from '@/platform/ids';
import { createEventBus } from '@/platform/events';
import { LocalEconomyServer } from '@/backend/local/LocalEconomyServer';
import { createLocalRepositories } from '@/backend/local/LocalRepository';
import type { Phase2Repositories } from '@/backend/repositories';

const USER_ID_KEY = 'fitaia.phase2.v1.localUserId';
/** Tenue offerte à chaque membre à l'ouverture du compte. */
export const STARTER_OUTFIT = 'outfit_origine';

export type Session = Phase2Repositories & {
  userId: string;
  isDemo: boolean;
  /** Opérations d'amorçage réservées au mode local (côté serveur réel : fonctions d'administration). */
  bootstrap: {
    grantCosmetic(itemId: string): Promise<boolean>;
    migrateLegacyBalance(legacyCredits: number): Promise<void>;
  };
};

const storage: KeyValueStorage = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
};

async function localUserId(): Promise<string> {
  const existing = await storage.getItem(USER_ID_KEY);
  if (existing) return existing;
  const id = uuidV4();
  await storage.setItem(USER_ID_KEY, id);
  return id;
}

let pending: Promise<Session> | null = null;

/** Session unique (créée au premier appel). */
export function getSession(): Promise<Session> {
  if (!pending) pending = createSession();
  return pending;
}

async function createSession(): Promise<Session> {
  const userId = await localUserId();
  const server = new LocalEconomyServer({ storage, events: createEventBus() });
  return {
    ...createLocalRepositories(server, userId),
    userId,
    isDemo: true,
    bootstrap: {
      grantCosmetic: async (itemId) => {
        const r = await server.grantCosmetic(userId, itemId);
        return r.ok;
      },
      migrateLegacyBalance: async (legacyCredits) => {
        await server.migrateLegacyBalance(userId, legacyCredits);
      },
    },
  };
}
