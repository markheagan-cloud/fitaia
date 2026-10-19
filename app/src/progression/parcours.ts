/**
 * Vue « Parcours FITAIA » (données prêtes pour l'écran, aucun composant) : où j'en suis → ce qui arrive
 * ensuite → combien il manque. Exemple de la spécification : Élan, 860 / 1 500 PF, puis 900 PF +50 Fitcoins,
 * 1 000 PF Capsule, 1 150 PF Accessoire, 1 300 PF +100 Fitcoins, 1 500 PF Régulier.
 */
import type { RewardState, RewardStatus, RewardType } from '../economy/types';
import { CATEGORY_LABELS } from '../inventory/cosmeticCatalog';
import type { CosmeticItem } from '../inventory/types';
import { STAGE_LABELS } from './progressionRules';
import { nextStage, stageById } from './stages';
import type { ProgressionAccount, StageDefinition, StageId } from './types';

export type ParcoursStage = { id: StageId; label: string; minPoints: number };

export type ParcoursMilestone =
  | { kind: 'reward'; atPoints: number; rewardId: string; rewardType: RewardType; amount: number; label: string; state: RewardState }
  | { kind: 'stage'; atPoints: number; stageId: StageId; label: string };

export type ParcoursView = {
  lifetimePoints: number;
  stage: ParcoursStage;
  nextStage: ParcoursStage | null;
  /** PF manquants avant l'étape suivante (null à la dernière étape). */
  pointsToNextStage: number | null;
  /** Avancement dans l'étape courante, de 0 à 1. */
  stageProgress: number;
  /** Paliers à venir jusqu'à l'étape suivante incluse, triés par seuil. */
  upcoming: ParcoursMilestone[];
  /** Récompenses de palier déjà débloquées mais pas encore récupérées. */
  claimable: ParcoursMilestone[];
};

const groupThousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function rewardLabel(status: RewardStatus, itemsById: ReadonlyMap<string, CosmeticItem>): string {
  const r = status.reward;
  switch (r.type) {
    case 'fitcoins':
      return '+' + groupThousands(r.amount) + ' Fitcoins';
    case 'capsule':
      return r.amount > 1 ? groupThousands(r.amount) + ' Capsules' : 'Capsule';
    case 'badge':
      return 'Badge';
    case 'cosmetic': {
      const item = r.cosmeticItemId ? itemsById.get(r.cosmeticItemId) : undefined;
      return item ? CATEGORY_LABELS[item.category] : 'Objet';
    }
  }
}

const stageView = (s: StageDefinition): ParcoursStage => ({ id: s.id, label: STAGE_LABELS[s.id], minPoints: s.minPoints });

export function buildParcours(
  account: ProgressionAccount,
  statuses: readonly RewardStatus[],
  stages: readonly StageDefinition[],
  catalog: readonly CosmeticItem[],
): ParcoursView {
  const itemsById = new Map(catalog.map((i) => [i.id, i]));
  const current = stageById(stages, account.currentStage);
  if (!current) throw new Error('Étape inconnue de la configuration');
  const next = nextStage(stages, current.id);
  const horizon = next ? next.minPoints : Number.POSITIVE_INFINITY;

  const milestones: ParcoursMilestone[] = [];
  for (const status of statuses) {
    const c = status.reward.unlockCondition;
    if (c.kind !== 'lifetime_points' || status.reward.repeatable) continue;
    milestones.push({
      kind: 'reward',
      atPoints: c.atLeast,
      rewardId: status.reward.id,
      rewardType: status.reward.type,
      amount: status.reward.amount,
      label: rewardLabel(status, itemsById),
      state: status.state,
    });
  }
  const upcoming = milestones.filter((m) => m.atPoints > account.lifetimePoints && m.atPoints <= horizon);
  if (next) upcoming.push({ kind: 'stage', atPoints: next.minPoints, stageId: next.id, label: STAGE_LABELS[next.id] });
  // À seuil égal, la récompense passe avant l'étape (elle se récupère en atteignant l'étape).
  upcoming.sort((a, b) => a.atPoints - b.atPoints || (a.kind === 'stage' ? 1 : 0) - (b.kind === 'stage' ? 1 : 0));

  const span = next ? next.minPoints - current.minPoints : 0;
  return {
    lifetimePoints: account.lifetimePoints,
    stage: stageView(current),
    nextStage: next ? stageView(next) : null,
    pointsToNextStage: next ? Math.max(0, next.minPoints - account.lifetimePoints) : null,
    stageProgress: next ? Math.min(1, Math.max(0, (account.lifetimePoints - current.minPoints) / span)) : 1,
    upcoming,
    claimable: milestones.filter((m) => m.kind === 'reward' && m.state === 'claimable').sort((a, b) => a.atPoints - b.atPoints),
  };
}
