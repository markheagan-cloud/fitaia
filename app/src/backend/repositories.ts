/** Les trois dépôts de la Phase 2, tels que l'interface les reçoit (sans savoir quel serveur est derrière). */
import type { EconomyRepository } from '../economy/EconomyRepository';
import type { InventoryRepository } from '../inventory/InventoryRepository';
import type { ProgressionRepository } from '../progression/ProgressionRepository';

export type Phase2Repositories = {
  progression: ProgressionRepository;
  economy: EconomyRepository;
  inventory: InventoryRepository;
};
