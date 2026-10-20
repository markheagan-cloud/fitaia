import { useEco } from '@/store/useEco';

/**
 * Niveau de progression utilisé par FitMatch : Points FITAIA cumulés (registre Phase 2), jamais achetables
 * et jamais diminués.
 */
export function useMyPoints(): number {
  return useEco((s) => s.account?.lifetimePoints ?? 0);
}
