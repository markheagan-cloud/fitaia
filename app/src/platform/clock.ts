/** Horloge injectable : le serveur décide de l'heure, jamais le client ; les tests la contrôlent. */
export type Clock = { now(): Date };

export const systemClock: Clock = { now: () => new Date() };
