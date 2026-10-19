/**
 * Accès à la progression pour l'utilisateur connecté. L'implémentation (locale de démonstration ou Supabase)
 * est invisible pour l'interface. L'utilisateur est celui de la session : jamais un paramètre.
 */
import type { AwardOutcome, PeerActionType, PeerAwardOutcome, ProgressionAccount, SelfActionType } from './types';

export interface ProgressionRepository {
  getAccount(): Promise<ProgressionAccount>;
  /** Déclare une action ; le serveur décide des PF (règle, plafond du jour, idempotence). */
  recordAction(action: SelfActionType, sourceId?: string): Promise<AwardOutcome>;
  /** Accorde une action d'entraide à un autre membre (ex. conseil marqué « Ça m'aide »). */
  recordPeerAction(action: PeerActionType, targetUserId: string, sourceId: string): Promise<PeerAwardOutcome>;
}
