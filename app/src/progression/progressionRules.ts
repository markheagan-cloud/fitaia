/**
 * Règles des Points FITAIA — SOURCE UNIQUE de l'équilibrage côté app (spécification C, points 6 à 9).
 * Toute valeur se change ici, jamais dans un écran. Le serveur SQL porte les mêmes valeurs dans
 * `progression_rules` / `progression_stages` / `progression_settings` (migration 0002) ;
 * le test `supabase/tests/seed_sync.test.ts` vérifie que les deux restent identiques.
 */
import type { ActionType, ProgressionCalendar, ProgressionRules, StageDefinition, StageId } from './types';

/**
 * Valeurs de la spécification : objectif quotidien +20, activité +15, repas +5 (max 15/j), défi +50,
 * encouragement +2 (max 10/j), conseil « Ça m'aide » +5 (max 20/j).
 *
 * Plafonds NON fixés par la spécification, proposés pour respecter la règle 7 (« ne jamais récompenser
 * l'entraînement excessif ») et borner les actions déclaratives — à valider par le fondateur :
 *  - objectif quotidien : une fois par jour (20/j) ;
 *  - activité : 2 par jour (30/j) ;
 *  - défi : 3 par jour (150/j).
 */
export const PROGRESSION_RULES: ProgressionRules = {
  daily_goal_completed: { points: 20, dailyCap: 20, grantMode: 'self', dedupe: 'day', proof: 'declarative', enabled: true },
  activity_logged: { points: 15, dailyCap: 30, grantMode: 'self', dedupe: 'source', proof: 'declarative', enabled: true },
  meal_logged: { points: 5, dailyCap: 15, grantMode: 'self', dedupe: 'source', proof: 'declarative', enabled: true },
  challenge_completed: { points: 50, dailyCap: 150, grantMode: 'self', dedupe: 'source', proof: 'declarative', enabled: true },
  encouragement_sent: { points: 2, dailyCap: 10, grantMode: 'self', dedupe: 'source', proof: 'server_record', enabled: true },
  tip_marked_helpful: { points: 5, dailyCap: 20, grantMode: 'peer', dedupe: 'source', proof: 'declarative', enabled: true },
};

/**
 * Liste blanche des actions récompensables : régularité, actions, entraide. Aucune action ne porte de quantité
 * (calories, kilos, durée, nombre de séances) : une attribution vaut un montant fixe, borné par jour.
 */
export const ALLOWED_ACTION_TYPES: readonly ActionType[] = [
  'daily_goal_completed',
  'activity_logged',
  'meal_logged',
  'challenge_completed',
  'encouragement_sent',
  'tip_marked_helpful',
];

/** Parcours FITAIA : seuils en PF par identifiant interne d'étape (rang croissant = seuil croissant). */
export const STAGES: readonly StageDefinition[] = [
  { id: 'declic', rank: 1, minPoints: 0 },
  { id: 'elan', rank: 2, minPoints: 500 },
  { id: 'regulier', rank: 3, minPoints: 1500 },
  { id: 'engage', rank: 4, minPoints: 3500 },
  { id: 'confirme', rank: 5, minPoints: 7000 },
  { id: 'pilier', rank: 6, minPoints: 12000 },
];

/** Textes affichés : modifiables sans migration (les données ne stockent que l'identifiant). */
export const STAGE_LABELS: Record<StageId, string> = {
  declic: 'Déclic',
  elan: 'Élan',
  regulier: 'Régulier',
  engage: 'Engagé',
  confirme: 'Confirmé',
  pilier: 'Pilier',
};

/**
 * Découpage du temps. Fuseau unique Europe/Paris pour le MVP (question ouverte : fuseau par membre).
 * Saison : reprise de la définition existante de l'app (8 semaines à partir du 1er octobre 2026), provisoire
 * tant que les Saisons ne sont pas construites ; seule la remise à zéro de `seasonPoints` en dépend.
 */
export const PROGRESSION_CALENDAR: ProgressionCalendar = {
  timeZone: 'Europe/Paris',
  seasonAnchorDay: '2026-10-01',
  seasonLengthDays: 56,
};
