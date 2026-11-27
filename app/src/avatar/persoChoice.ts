/**
 * Jusqu'à trois persos au choix : chaque nouvelle photo donne un nouveau perso, les précédents restent proposés et la
 * personne garde celui qu'elle préfère. Pur, testé (tests/perso-choice.test.ts).
 */
export const MAX_PERSOS = 3;

type WithId = { id: string; at: number };
export type PersoSet<T extends WithId> = { current: T | null; alts: T[]; dropped: T[] };

/** Un nouveau perso vient d'être dessiné : il devient le perso affiché, l'ancien passe dans les choix. Au-delà de trois, le plus ancien des choix part. */
export function addPerso<T extends WithId>(current: T | null, alts: T[], made: T, max = MAX_PERSOS): PersoSet<T> {
  // le perso que la personne avait choisi reste toujours ; parmi les autres, les plus récents
  const others = alts.filter((a) => a.id !== made.id && a.id !== current?.id).sort((a, b) => b.at - a.at);
  const kept = [...(current && current.id !== made.id ? [current] : []), ...others];
  const room = Math.max(0, max - 1);
  return { current: made, alts: kept.slice(0, room), dropped: kept.slice(room) };
}

/** La personne choisit un des persos proposés : il devient le perso affiché, l'autre reste dans les choix. */
export function choosePerso<T extends WithId>(current: T | null, alts: T[], id: string): PersoSet<T> {
  const pick = alts.find((a) => a.id === id);
  if (!pick) return { current, alts, dropped: [] };
  return { current: pick, alts: [...(current ? [current] : []), ...alts.filter((a) => a.id !== id)], dropped: [] };
}

/** Nombre de nouvelles photos encore possibles avant qu'un ancien perso soit remplacé. */
export function photosLeft(current: unknown, alts: unknown[], max = MAX_PERSOS): number {
  return Math.max(0, max - (current ? 1 : 0) - alts.length);
}
