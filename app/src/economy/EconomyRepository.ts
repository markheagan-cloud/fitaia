/**
 * Accès au wallet Fitcoins de l'utilisateur connecté. Aucune méthode n'accepte un montant : les gains naissent
 * d'une récompense (rewardId), les dépenses d'un objet (itemId) dont le prix est lu côté serveur.
 */
import type { ClaimOutcome, EconomyTransaction, FitcoinWallet, RewardStatus, SpendOutcome, SpendRequest, TransactionQuery } from './types';

export interface EconomyRepository {
  getBalance(): Promise<FitcoinWallet>;
  /** Registre, du plus récent au plus ancien (pagination par `beforeSequence`). */
  getTransactions(query?: TransactionQuery): Promise<EconomyTransaction[]>;
  getRewardStatuses(): Promise<RewardStatus[]>;
  claimReward(rewardId: string): Promise<ClaimOutcome>;
  spendFitcoins(request: SpendRequest): Promise<SpendOutcome>;
}
