/** Étapes du Parcours FITAIA : calculs purs sur la table des seuils (passée en paramètre, jamais codée en dur). */
import type { StageDefinition, StageId } from './types';

function sorted(stages: readonly StageDefinition[]): StageDefinition[] {
  return [...stages].sort((a, b) => a.rank - b.rank);
}

/** Étape atteinte avec ce total de PF (la plus haute dont le seuil est atteint). */
export function stageForPoints(stages: readonly StageDefinition[], points: number): StageDefinition {
  const list = sorted(stages);
  let current = list[0];
  for (const stage of list) if (points >= stage.minPoints) current = stage;
  return current;
}

export function stageById(stages: readonly StageDefinition[], id: StageId): StageDefinition | undefined {
  return stages.find((s) => s.id === id);
}

/** Rang d'une étape ; 0 si l'étape n'existe plus dans la configuration. */
export function stageRank(stages: readonly StageDefinition[], id: StageId): number {
  return stageById(stages, id)?.rank ?? 0;
}

/** La plus haute des deux étapes (le meilleur niveau historique ne redescend jamais). */
export function higherStage(stages: readonly StageDefinition[], a: StageId, b: StageId): StageId {
  return stageRank(stages, b) > stageRank(stages, a) ? b : a;
}

export function nextStage(stages: readonly StageDefinition[], id: StageId): StageDefinition | null {
  const rank = stageRank(stages, id);
  return sorted(stages).find((s) => s.rank > rank) ?? null;
}

/** Table cohérente : rang 1 à 0 PF, rangs et seuils strictement croissants, identifiants uniques. */
export function validateStages(stages: readonly StageDefinition[]): string[] {
  const errors: string[] = [];
  const list = sorted(stages);
  if (list.length === 0) return ['aucune étape'];
  if (list[0].minPoints !== 0) errors.push('la première étape doit commencer à 0 PF');
  if (new Set(list.map((s) => s.id)).size !== list.length) errors.push('identifiants d’étape en double');
  for (let i = 1; i < list.length; i++) {
    if (list[i].rank === list[i - 1].rank) errors.push('rangs en double');
    if (list[i].minPoints <= list[i - 1].minPoints) errors.push('seuils non croissants : ' + list[i].id);
  }
  return errors;
}
