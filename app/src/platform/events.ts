/**
 * Bus d'événements métier typé (observabilité de la Phase 2).
 *
 * Exactement les huit événements de la spécification (section C, point 20). Les charges utiles ne contiennent
 * jamais de secret ni de donnée de santé brute : des identifiants, des catégories d'action et des montants
 * de Points FITAIA / Fitcoins, rien d'autre (pas de poids, de calories, de repas détaillé, de texte libre).
 */
import type { ActionType, StageId } from '../progression/types';
import type { LedgerReason, RejectionCode, RewardType, TransactionType } from '../economy/types';
import type { AcquisitionChannel, CosmeticCategory } from '../inventory/types';

/** Sujet d'un refus : identifiant connu, ou « unknown » / « invalid » (jamais le texte brut reçu du téléphone). */
export type RejectionSubject = { kind: 'reward'; rewardId: string } | { kind: 'action'; actionType: ActionType | 'unknown' };

export type DomainEventMap = {
  'progression.points_awarded': {
    userId: string;
    actionType: ActionType;
    points: number;
    lifetimePoints: number;
    dayKey: string;
  };
  'progression.stage_changed': {
    userId: string;
    fromStage: StageId;
    toStage: StageId;
    highestHistoricalStage: StageId;
    lifetimePoints: number;
  };
  'economy.fitcoins_earned': {
    userId: string;
    transactionId: string;
    transactionType: Exclude<TransactionType, 'spend'>;
    amount: number;
    balanceAfter: number;
    reason: LedgerReason;
    sourceId: string;
  };
  'economy.fitcoins_spent': {
    userId: string;
    transactionId: string;
    amount: number;
    balanceAfter: number;
    reason: LedgerReason;
    sourceId: string;
  };
  'reward.claimed': { userId: string; rewardId: string; rewardType: RewardType; claimId: string };
  'reward.rejected': { userId: string; subject: RejectionSubject; code: RejectionCode };
  'inventory.item_acquired': { userId: string; itemId: string; category: CosmeticCategory; via: AcquisitionChannel };
  'inventory.item_equipped': { userId: string; itemId: string; slot: CosmeticCategory; unequipped: string[] };
};

export type DomainEventType = keyof DomainEventMap;

export const DOMAIN_EVENT_TYPES: readonly DomainEventType[] = [
  'progression.points_awarded',
  'progression.stage_changed',
  'economy.fitcoins_earned',
  'economy.fitcoins_spent',
  'reward.claimed',
  'reward.rejected',
  'inventory.item_acquired',
  'inventory.item_equipped',
];

export type DomainEvent<K extends DomainEventType = DomainEventType> = {
  [T in K]: { type: T; occurredAt: string; payload: DomainEventMap[T] };
}[K];

/** Événement prêt à publier (la date est ajoutée par le bus). */
export type PendingEvent = { [T in DomainEventType]: { type: T; payload: DomainEventMap[T] } }[DomainEventType];

export interface DomainEventBus {
  publish(event: PendingEvent): void;
  subscribe<K extends DomainEventType>(type: K, handler: (event: DomainEvent<K>) => void): () => void;
  subscribeAll(handler: (event: DomainEvent) => void): () => void;
}

export type EventBusOptions = {
  now?: () => Date;
  /** Une erreur d'abonné ne doit jamais casser une opération économique déjà validée. */
  onHandlerError?: (error: unknown, type: DomainEventType) => void;
};

export function createEventBus(options: EventBusOptions = {}): DomainEventBus {
  const now = options.now ?? (() => new Date());
  const onHandlerError =
    options.onHandlerError ?? ((_error: unknown, type: DomainEventType) => console.error('Abonné en erreur pour ' + type));
  const handlers = new Set<(event: DomainEvent) => void>();

  return {
    publish(pending) {
      const event = { ...pending, occurredAt: now().toISOString() } as DomainEvent;
      for (const handler of [...handlers]) {
        try {
          handler(event);
        } catch (error) {
          onHandlerError(error, event.type);
        }
      }
    },
    subscribe(type, handler) {
      const filtered = (event: DomainEvent) => {
        if (event.type === type) handler(event as DomainEvent<typeof type>);
      };
      handlers.add(filtered);
      return () => {
        handlers.delete(filtered);
      };
    },
    subscribeAll(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}
