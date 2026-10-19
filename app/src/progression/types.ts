/**
 * Progression FITAIA — types du domaine « Points FITAIA » (PF).
 *
 * Les PF mesurent la progression : jamais achetables, jamais dépensés, jamais mélangés aux Fitcoins.
 * Ils récompensent la régularité, les actions et l'entraide, jamais un comportement potentiellement malsain
 * (manger moins, sauter un repas, perte de poids rapide, déficit extrême, entraînement excessif, kilos comparés).
 */

/** Identifiants internes stables des étapes du Parcours FITAIA (le texte affiché vit à part, voir STAGE_LABELS). */
export type StageId = 'declic' | 'elan' | 'regulier' | 'engage' | 'confirme' | 'pilier';

/** Actions déclarées par l'utilisateur lui-même. */
export type SelfActionType =
  | 'daily_goal_completed'
  | 'activity_logged'
  | 'meal_logged'
  | 'challenge_completed'
  | 'encouragement_sent';

/** Actions accordées par un autre membre (le bénéficiaire ne peut pas se les attribuer). */
export type PeerActionType = 'tip_marked_helpful';

export type ActionType = SelfActionType | PeerActionType;

/**
 * `day` : une seule attribution par jour (la source est le jour serveur, le client ne la choisit pas).
 * `source` : une attribution par identifiant de source (repas, activité, défi, encouragement, conseil).
 */
export type DedupeScope = 'day' | 'source';

/**
 * `declarative` : l'action vit encore sur l'appareil (repas, activité…), le serveur ne peut que borner l'abus
 * (idempotence + plafond quotidien). `server_record` : le serveur vérifie la preuve dans ses propres tables.
 */
export type ProofKind = 'declarative' | 'server_record';

export type ActionRule = {
  points: number;
  dailyCap: number;
  dedupe: DedupeScope;
  proof: ProofKind;
  enabled: boolean;
};

export type ProgressionRules = { [K in SelfActionType]: ActionRule & { grantMode: 'self' } } & {
  [K in PeerActionType]: ActionRule & { grantMode: 'peer' };
};

export type StageDefinition = { id: StageId; rank: number; minPoints: number };

export type ProgressionCalendar = {
  /** Fuseau du découpage en jours (plafonds quotidiens, semaines, saisons). */
  timeZone: string;
  seasonAnchorDay: string;
  seasonLengthDays: number;
};

export type ProgressionAccount = {
  userId: string;
  /** Total permanent : ne diminue jamais. */
  lifetimePoints: number;
  /** Remis à zéro chaque lundi (fuseau du calendrier). */
  weeklyPoints: number;
  /** Remis à zéro à chaque nouvelle saison. */
  seasonPoints: number;
  weekKey: string;
  seasonKey: string;
  currentStage: StageId;
  /** Ne redescend jamais, même si les seuils sont rééquilibrés (protège le matchmaking futur). */
  highestHistoricalStage: StageId;
  createdAt: string;
  updatedAt: string;
};

/** Attribution de PF enregistrée (registre de progression, en ajout seul). */
export type ProgressionEvent = {
  id: string;
  userId: string;
  actionType: ActionType;
  sourceId: string;
  /** Membre à l'origine d'une action « peer » ; null pour une action personnelle. */
  actorId: string | null;
  points: number;
  dayKey: string;
  weekKey: string;
  seasonKey: string;
  idempotencyKey: string;
  createdAt: string;
};

export type StageChange = { from: StageId; to: StageId };

export type AwardRejectionCode =
  | 'UNKNOWN_ACTION'
  | 'ACTION_DISABLED'
  | 'WRONG_GRANT_MODE'
  | 'INVALID_SOURCE'
  | 'NOT_VERIFIED'
  | 'DAILY_CAP_REACHED'
  | 'SELF_PEER_FORBIDDEN'
  | 'UNKNOWN_TARGET'
  | 'BLOCKED';

export type AwardOutcome =
  | { ok: true; replayed: boolean; award: ProgressionEvent; account: ProgressionAccount; stageChange: StageChange | null }
  | { ok: false; code: AwardRejectionCode; account: ProgressionAccount };

/** Résultat vu par le membre qui accorde une action « peer » : jamais le compte de l'autre. */
export type PeerAwardOutcome = { ok: true; replayed: boolean; points: number } | { ok: false; code: AwardRejectionCode };

/** Vérification de preuve côté serveur (mode local : branchée sur les données locales disponibles). */
export type ProofVerdict = { ok: true } | { ok: false; code: 'NOT_VERIFIED' | 'BLOCKED' | 'UNKNOWN_TARGET' };

export interface ActionVerifier {
  verify(request: {
    beneficiaryId: string;
    actorId: string | null;
    actionType: ActionType;
    sourceId: string;
    dayKey: string;
  }): Promise<ProofVerdict>;
}
