import { useMemo } from 'react';
import { useGame } from '@/store/useGame';

/**
 * Niveau de progression utilisé par FitMatch, en attendant les Points FITAIA de la phase 2.
 * Provisoire : dérivé des crédits réellement gagnés par des actions (journal des transactions), jamais achetables.
 */
export function useMyPoints(): number {
  const ledger = useGame((s) => s.ledger);
  return useMemo(() => Math.round(ledger.filter((e) => e.cur === 'earn' && e.amount > 0).reduce((a, e) => a + e.amount, 0) / 2), [ledger]);
}
