/**
 * Migration de l'ancienne monnaie gagnée (`earn`, affichée « FIT Crédits », stockée sur le téléphone) vers un
 * solde d'ouverture en Fitcoins, écrit UNE fois dans le registre (clé migration:<version>:<user>).
 *
 * PROPOSITION à valider par le fondateur (voir docs/ECONOMIE-AUDIT.md) : 10 anciens crédits = 1 Fitcoin,
 * plafonné à 2 000 Fitcoins, parce que le solde ancien est déclaré par le téléphone (non vérifiable) et que
 * l'échelle des anciens crédits (défi +500, tenues 4 000 à 6 500) est environ dix fois celle des Fitcoins.
 */
export type LegacyMigrationConfig = { version: string; creditsPerFitcoin: number; maxOpeningFitcoins: number };

export const LEGACY_MIGRATION: LegacyMigrationConfig = { version: 'v1', creditsPerFitcoin: 10, maxOpeningFitcoins: 2000 };

/** Solde d'ouverture en Fitcoins ; null si le solde déclaré est invalide. */
export function openingFitcoins(legacyBalance: number, config: LegacyMigrationConfig): number | null {
  if (!Number.isSafeInteger(legacyBalance) || legacyBalance < 0) return null;
  return Math.min(Math.floor(legacyBalance / config.creditsPerFitcoin), config.maxOpeningFitcoins);
}
