/**
 * FITAIA Communauté — modèles de données (phase 1 : fondation sociale).
 * Logique pure, sans React Native : partagée par l'app, les tests et le futur serveur.
 *
 * Règle de confidentialité : poids, mensurations, calories, photos originales, adresse, position et données de santé
 * ne font JAMAIS partie d'un profil social. Ils n'existent pas dans ces types.
 */

import type { NeedId, StatusId } from './intentions';

export type Language = 'fr' | 'en' | 'es' | 'ar' | 'de' | 'it' | 'pt';

export type AgeRange = '18-24' | '25-30' | '31-35' | '36-45' | '46+';

export const AGE_RANGES: { id: AgeRange; label: string; mid: number }[] = [
  { id: '18-24', label: '18 à 24 ans', mid: 21 },
  { id: '25-30', label: '25 à 30 ans', mid: 27.5 },
  { id: '31-35', label: '31 à 35 ans', mid: 33 },
  { id: '36-45', label: '36 à 45 ans', mid: 40.5 },
  { id: '46+', label: '46 ans et plus', mid: 52 },
];

/** Objectif général (jamais un chiffre de poids). */
export type GoalCategory = 'perdre' | 'reprendre' | 'muscler' | 'garder' | 'energie';

export const GOALS: { id: GoalCategory; label: string }[] = [
  { id: 'perdre', label: 'Perdre du poids' },
  { id: 'reprendre', label: 'Reprendre le sport' },
  { id: 'muscler', label: 'Prendre du muscle' },
  { id: 'garder', label: 'Garder la forme' },
  { id: 'energie', label: 'Avoir plus d’énergie' },
];

export type Slot = 'matin' | 'midi' | 'soir' | 'nuit';
export type Activity = 'marche' | 'course' | 'salle' | 'maison' | 'velo' | 'natation' | 'collectif';
export type SupportStyle = 'encouragement' | 'conseil' | 'defi' | 'ecoute';

export const SLOTS: { id: Slot; label: string }[] = [
  { id: 'matin', label: 'Le matin' },
  { id: 'midi', label: 'Le midi' },
  { id: 'soir', label: 'Le soir' },
  { id: 'nuit', label: 'La nuit' },
];
export const ACTIVITIES: { id: Activity; label: string }[] = [
  { id: 'marche', label: 'Marche' },
  { id: 'course', label: 'Course' },
  { id: 'salle', label: 'Salle' },
  { id: 'maison', label: 'À la maison' },
  { id: 'velo', label: 'Vélo' },
  { id: 'natation', label: 'Natation' },
  { id: 'collectif', label: 'Sport collectif' },
];
export const SUPPORT: { id: SupportStyle; label: string }[] = [
  { id: 'encouragement', label: 'Des encouragements' },
  { id: 'conseil', label: 'Des conseils' },
  { id: 'defi', label: 'Des petits défis' },
  { id: 'ecoute', label: 'Quelqu’un qui écoute' },
];

/** Étapes du Parcours FITAIA (seuils de Points FITAIA). */
export const STAGES = [
  { id: 1, name: 'Déclic', min: 0 },
  { id: 2, name: 'Élan', min: 500 },
  { id: 3, name: 'Régulier', min: 1500 },
  { id: 4, name: 'Engagé', min: 3500 },
  { id: 5, name: 'Confirmé', min: 7000 },
  { id: 6, name: 'Pilier', min: 12000 },
] as const;

export function stageOf(points: number) {
  let s: (typeof STAGES)[number] = STAGES[0];
  for (const st of STAGES) if (points >= st.min) s = st;
  return s;
}

export type Visibility = 'moi' | 'amis' | 'public';

/** Réglages de confidentialité : tout est minimal par défaut. */
export type PrivacySettings = {
  profileVisible: boolean;        // visible dans FitMatch et les recherches
  showAge: boolean;
  showCountry: boolean;
  showGoal: boolean;
  bodyProgress: Visibility;       // progression physique de l'avatar : privée par défaut
  allowMessages: 'tous' | 'amis' | 'personne';
  allowFitMatch: boolean;
};

export const DEFAULT_PRIVACY: PrivacySettings = {
  profileVisible: true,
  showAge: false,
  showCountry: false,
  showGoal: true,
  bodyProgress: 'moi',
  allowMessages: 'amis',
  allowFitMatch: true,
};

export type CommunityProfile = {
  userId: string;
  displayName: string;
  avatarId: string;               // référence de l'avatar (identité figée) : jamais la photo d'origine
  language: Language;
  ageRange: AgeRange;
  countryOptional?: string;
  timezone: string;               // ex. « Europe/Paris »
  utcOffset: number;              // heures, pour la compatibilité de fuseau
  goalCategory: GoalCategory;
  points: number;
  highestHistoricalPoints: number;
  slots: Slot[];
  activities: Activity[];
  support: SupportStyle[];
  helpfulnessScore: number;
  joinedAt: number;
  lastActiveAt: number;
  privacy: PrivacySettings;
  /** État du jour choisi par la personne (facultatif, s'efface après 12 h). */
  status?: StatusId | null;
  statusAt?: number;
  /** Besoin du jour (coup de pouce) : adapte FitMatch ; visible des autres seulement si `needPublic`. */
  need?: NeedId | null;
  needAt?: number;
  needPublic?: boolean;
  /** Profil fictif servant aux essais : toujours signalé comme tel à l'écran. */
  demo?: boolean;
};

export type FriendStatus = 'en_attente' | 'accepte' | 'refuse';
export type RelationshipType = 'contact' | 'fitmate' | 'ami';

export type Friendship = {
  id: string;
  userA: string;                  // demandeur
  userB: string;
  status: FriendStatus;
  relationshipType: RelationshipType;
  createdAt: number;
};

export type ReasonCode = 'meme_niveau' | 'meme_objectif' | 'meme_langue' | 'memes_horaires' | 'meme_activite' | 'meme_soutien' | 'meme_fuseau' | 'actif_maintenant';

export type FitMatchCandidate = {
  userId: string;
  compatibilityScore: number;     // 0-100
  reasonCodes: ReasonCode[];
  generatedAt: number;
};

export type ConversationType = 'prive' | 'cercle';

export type Conversation = {
  id: string;
  type: ConversationType;
  members: string[];
  createdAt: number;
  updatedAt: number;
};

export type MessageType = 'texte' | 'encouragement' | 'reaction' | 'systeme';
export type ModerationState = 'ok' | 'en_revue' | 'masque';

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string;
  createdAt: number;
  moderationState: ModerationState;
};

export type ReportReason = 'harcelement' | 'spam' | 'contenu_inapproprie' | 'conseil_dangereux' | 'faux_profil' | 'autre';

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'harcelement', label: 'Harcèlement ou insultes' },
  { id: 'spam', label: 'Publicité ou spam' },
  { id: 'contenu_inapproprie', label: 'Contenu inapproprié' },
  { id: 'conseil_dangereux', label: 'Conseil dangereux pour la santé' },
  { id: 'faux_profil', label: 'Faux profil' },
  { id: 'autre', label: 'Autre chose' },
];

export type Report = {
  id: string;
  reporterId: string;
  targetUserId: string;
  messageIdOptional?: string;
  reason: ReportReason;
  createdAt: number;
  status: 'recu' | 'traite';
};

export type Block = { blockerId: string; blockedId: string; createdAt: number };
