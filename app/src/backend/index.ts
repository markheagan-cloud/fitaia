/**
 * Point d'entrée unique de la Phase 2 pour l'interface : un sélecteur d'adaptateur.
 * L'écran reçoit `progression`, `economy`, `inventory` et `events`, jamais l'adaptateur lui-même.
 * Le jour où le backend réel arrive, seul l'appel à `createPhase2Backend` change (mode « supabase »).
 *
 * À créer UNE fois par session d'app (racine de composition) : deux serveurs locaux sur le même stockage
 * auraient deux verrous distincts.
 */
import type { Clock } from '../platform/clock';
import { type DomainEventBus, createEventBus } from '../platform/events';
import type { KeyValueStorage } from '../platform/storage';
import { LocalEconomyServer } from './local/LocalEconomyServer';
import { createLocalRepositories } from './local/LocalRepository';
import type { Phase2Repositories } from './repositories';
import { createSupabaseRepositories } from './supabase/SupabaseRepository';
import type { RpcClient } from './supabase/rpc';

export type Phase2Backend = Phase2Repositories & {
  events: DomainEventBus;
  /** true = données de démonstration locales : l'interface doit l'annoncer, jamais le présenter comme réel. */
  isDemo: boolean;
};

export type Phase2BackendOptions =
  | { mode: 'local-demo'; userId: string; storage: KeyValueStorage; clock?: Clock; events?: DomainEventBus }
  | { mode: 'supabase'; userId: string; rpc: RpcClient; events?: DomainEventBus };

export function createPhase2Backend(options: Phase2BackendOptions): Phase2Backend {
  const events = options.events ?? createEventBus();
  switch (options.mode) {
    case 'local-demo': {
      const server = new LocalEconomyServer({ storage: options.storage, clock: options.clock, events });
      return { ...createLocalRepositories(server, options.userId), events, isDemo: true };
    }
    case 'supabase':
      return { ...createSupabaseRepositories({ rpc: options.rpc, userId: options.userId, events }), events, isDemo: false };
  }
}

export type { Phase2Repositories } from './repositories';
