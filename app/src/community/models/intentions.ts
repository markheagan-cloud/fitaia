/**
 * « Aujourd’hui, de quoi as-tu besoin ? » (coup de pouce) et état du jour affiché à côté de l'avatar.
 * Logique pure : partagée par l'app, les tests et le futur serveur.
 *
 * - Le besoin du jour sert d'abord à adapter FitMatch. Il n'est montré aux autres que si la personne l'a choisi
 *   (`needPublic`) : « petite baisse de moral » ne devient jamais public sans un geste explicite.
 * - L'état (« Dispo pour parler »…) est facultatif, choisi par la personne, et s'efface tout seul après 12 h.
 */

export type NeedId = 'motivation' | 'repas' | 'entrainement' | 'moral' | 'regularite' | 'ecoute' | 'aider';

export const NEEDS: { id: NeedId; label: string }[] = [
  { id: 'motivation', label: 'Motivation' },
  { id: 'repas', label: 'Idée repas' },
  { id: 'entrainement', label: 'Aller s’entraîner' },
  { id: 'moral', label: 'Petite baisse de moral' },
  { id: 'regularite', label: 'Question sur la régularité' },
  { id: 'ecoute', label: 'Parler à quelqu’un qui comprend' },
  { id: 'aider', label: 'Aider quelqu’un' },
];

export const needLabel = (id: NeedId) => NEEDS.find((n) => n.id === id)?.label ?? id;

/** Fin de phrase après le prénom : « Sarah cherche aussi de la motivation aujourd’hui. » */
export const NEED_LINE: Record<NeedId, string> = {
  motivation: 'cherche aussi de la motivation aujourd’hui',
  repas: 'cherche aussi une idée repas',
  entrainement: 'veut aussi aller s’entraîner aujourd’hui',
  moral: 'traverse aussi un petit coup de mou',
  regularite: 'se pose aussi la question de la régularité',
  ecoute: 'cherche aussi quelqu’un qui comprend',
  aider: 'a envie d’aider aujourd’hui',
};

export type StatusId = 'dispo' | 'motive' | 'entrainement' | 'repas' | 'nuit' | 'aide';

export const STATUSES: { id: StatusId; label: string }[] = [
  { id: 'dispo', label: 'Dispo pour parler' },
  { id: 'motive', label: 'Motivé aujourd’hui' },
  { id: 'entrainement', label: 'Va s’entraîner' },
  { id: 'repas', label: 'Cherche une idée repas' },
  { id: 'nuit', label: 'Travaille de nuit' },
  { id: 'aide', label: 'Dispo pour aider' },
];

export const statusLabel = (id: StatusId) => STATUSES.find((s) => s.id === id)?.label ?? id;

/** Durée de vie d'un état ou d'un besoin du jour. */
export const DAILY_TTL = 12 * 3600 * 1000;

type WithDaily = { status?: StatusId | null; statusAt?: number; need?: NeedId | null; needAt?: number; needPublic?: boolean };

export function activeStatus(p: WithDaily, now: number): StatusId | null {
  return p.status && p.statusAt !== undefined && now - p.statusAt < DAILY_TTL && now >= p.statusAt - 60000 ? p.status : null;
}

export function activeNeed(p: WithDaily, now: number): NeedId | null {
  return p.need && p.needAt !== undefined && now - p.needAt < DAILY_TTL && now >= p.needAt - 60000 ? p.need : null;
}

/** Besoin visible par les autres : seulement s'il est actif ET partagé volontairement. */
export function publicNeed(p: WithDaily, now: number): NeedId | null {
  return p.needPublic ? activeNeed(p, now) : null;
}

export type Affinity = { rank: 0 | 1 | 2; line: string | null };

const HELPABLE: NeedId[] = ['motivation', 'moral', 'ecoute', 'regularite', 'repas'];

/** États qui répondent à un besoin (rang 1 : « quelqu'un qui peut t'aider »). */
const STATUS_FOR: Record<NeedId, StatusId[]> = {
  motivation: ['motive', 'aide'],
  repas: ['repas', 'aide'],
  entrainement: ['entrainement', 'motive'],
  moral: ['aide', 'dispo'],
  regularite: ['aide', 'motive'],
  ecoute: ['dispo', 'aide'],
  aider: ['dispo'],
};

/**
 * Affinité entre MON besoin du jour et l'état / le besoin visibles d'une autre personne.
 * Rang 2 : elle traverse la même chose (ou, si je veux aider, elle a besoin d'un coup de main).
 * Rang 1 : son état répond à mon besoin. Rang 0 : rien de particulier aujourd'hui.
 */
export function needAffinity(mine: NeedId, other: { displayName: string; need: NeedId | null; status: StatusId | null }): Affinity {
  if (mine === 'aider') {
    if (other.need && HELPABLE.includes(other.need)) return { rank: 2, line: other.displayName + ' ' + NEED_LINE[other.need].replace(' aussi', '') + '.' };
    if (other.status && STATUS_FOR.aider.includes(other.status)) return { rank: 1, line: other.displayName + ' est dispo pour parler.' };
    return { rank: 0, line: null };
  }
  if (other.need === mine) return { rank: 2, line: other.displayName + ' ' + NEED_LINE[mine] + '.' };
  if (other.status && STATUS_FOR[mine].includes(other.status)) return { rank: 1, line: other.displayName + ' : ' + statusLabel(other.status).toLowerCase() + '.' };
  return { rank: 0, line: null };
}

/** Réordonne des suggestions selon le besoin du jour (tri stable : à rang égal, l'ordre de compatibilité est gardé). */
export function rankByNeed<T>(list: T[], rankOf: (x: T) => number): T[] {
  return list
    .map((x, i) => ({ x, i, r: rankOf(x) }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map((o) => o.x);
}

/** Ce que FITAIA propose une fois le besoin choisi. */
export function needSuggestions(need: NeedId): { same: string; sameSub: string; fitmate: string } {
  if (need === 'aider')
    return { same: 'Trouver quelqu’un qui a besoin d’un coup de main', sameSub: 'Des personnes proches de ton parcours qui traversent un moment plus dur.', fitmate: 'Prendre des nouvelles d’un FitMate' };
  return { same: 'Trouver quelqu’un qui traverse la même chose', sameSub: 'Des personnes proches de ton parcours, avec le même besoin aujourd’hui.', fitmate: 'Parler à un FitMate' };
}
