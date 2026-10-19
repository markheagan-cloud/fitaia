/**
 * Accès à la Communauté : réservé aux majeurs (messages privés entre inconnus, règle App Store 1.2 et protection des
 * mineurs). L'âge vient du profil de l'app ; aucune tranche « 18-24 » n'est jamais attribuée à un mineur.
 */
export const COMMUNITY_MIN_AGE = 18;

export const canJoinCommunity = (age: number): boolean => Number.isFinite(age) && age >= COMMUNITY_MIN_AGE;

export const COMMUNITY_MINOR_MESSAGE = `La Communauté est réservée aux ${COMMUNITY_MIN_AGE} ans et plus. Défis, scanner et perso restent ouverts.`;
