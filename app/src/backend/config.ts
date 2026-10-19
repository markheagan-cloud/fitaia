/**
 * Configuration complète du serveur de la Phase 2 (règles PF, étapes, calendrier, récompenses, catalogue,
 * migration). Par défaut : les fichiers de configuration du domaine ; les tests peuvent en injecter une autre.
 */
import { LEGACY_MIGRATION } from '../economy/migration';
import type { LegacyMigrationConfig } from '../economy/migration';
import { REWARD_DEFINITIONS } from '../economy/rewardCatalog';
import { validateRewardDefinition } from '../economy/rewards';
import type { RewardDefinition } from '../economy/types';
import { COSMETIC_CATALOG, SLOT_EXCLUSIONS } from '../inventory/cosmeticCatalog';
import type { CosmeticCategory, CosmeticItem } from '../inventory/types';
import { isDayKey } from '../platform/calendar';
import { PROGRESSION_CALENDAR, PROGRESSION_RULES, STAGES } from '../progression/progressionRules';
import { validateStages } from '../progression/stages';
import type { ActionType, ProgressionCalendar, ProgressionRules, StageDefinition } from '../progression/types';

export type SlotExclusions = Readonly<Partial<Record<CosmeticCategory, readonly CosmeticCategory[]>>>;

export type EconomyServerConfig = {
  rules: ProgressionRules;
  stages: readonly StageDefinition[];
  calendar: ProgressionCalendar;
  rewards: readonly RewardDefinition[];
  catalog: readonly CosmeticItem[];
  slotExclusions: SlotExclusions;
  legacyMigration: LegacyMigrationConfig;
};

export const DEFAULT_SERVER_CONFIG: EconomyServerConfig = {
  rules: PROGRESSION_RULES,
  stages: STAGES,
  calendar: PROGRESSION_CALENDAR,
  rewards: REWARD_DEFINITIONS,
  catalog: COSMETIC_CATALOG,
  slotExclusions: SLOT_EXCLUSIONS,
  legacyMigration: LEGACY_MIGRATION,
};

const positiveInt = (n: number) => Number.isSafeInteger(n) && n > 0;

/** Liste des incohérences (vide = configuration utilisable). Le serveur local refuse de démarrer sinon. */
export function validateServerConfig(config: EconomyServerConfig): string[] {
  const errors: string[] = [...validateStages(config.stages)];
  for (const [action, rule] of Object.entries(config.rules) as [ActionType, ProgressionRules[ActionType]][]) {
    if (!positiveInt(rule.points)) errors.push(action + ' : points invalides');
    if (!positiveInt(rule.dailyCap) || rule.dailyCap < rule.points) errors.push(action + ' : plafond invalide');
  }
  if (!isDayKey(config.calendar.seasonAnchorDay) || !positiveInt(config.calendar.seasonLengthDays)) errors.push('calendrier invalide');
  const itemIds = new Set(config.catalog.map((i) => i.id));
  if (itemIds.size !== config.catalog.length) errors.push('identifiants d’objet en double');
  for (const item of config.catalog) {
    if (!/^[a-z0-9_]{2,64}$/.test(item.id)) errors.push(item.id + ' : identifiant invalide');
    if (item.priceFitcoins !== null && !positiveInt(item.priceFitcoins)) errors.push(item.id + ' : prix invalide');
    if ((item.source === 'REWARD' || item.source === 'PRESTIGE' || item.source === 'STORE') && item.priceFitcoins !== null) errors.push(item.id + ' : objet non achetable avec un prix');
  }
  if (new Set(config.rewards.map((r) => r.id)).size !== config.rewards.length) errors.push('identifiants de récompense en double');
  for (const reward of config.rewards) errors.push(...validateRewardDefinition(reward, itemIds));
  for (const [slot, excluded] of Object.entries(config.slotExclusions) as [CosmeticCategory, readonly CosmeticCategory[]][]) {
    for (const other of excluded) {
      if (other === slot || !(config.slotExclusions[other] ?? []).includes(slot)) errors.push('exclusion non symétrique : ' + slot + '/' + other);
    }
  }
  const m = config.legacyMigration;
  if (!m.version || !positiveInt(m.creditsPerFitcoin) || !Number.isSafeInteger(m.maxOpeningFitcoins) || m.maxOpeningFitcoins < 0) errors.push('migration invalide');
  return errors;
}
