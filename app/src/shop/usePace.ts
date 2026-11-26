/** Rythme de la personne (ses vrais jours) et position actuelle (solde, PF) pour les estimations de la boutique. */
import { useGame } from '@/store/useGame';
import { useEco } from '@/store/useEco';
import { dayKey } from '@/store/economy';
import { paceFor, type Pace } from './rythme';

export function usePace(): { pace: Pace; start: { coins: number; points: number }; doneToday: boolean } {
  const history = useGame((s) => s.history);
  const coins = useEco((s) => s.wallet?.balance ?? 0);
  const points = useEco((s) => s.account?.lifetimePoints ?? 0);
  const today = dayKey();
  return { pace: paceFor(history, today), start: { coins, points }, doneToday: (history[today]?.challenges ?? 0) > 0 };
}
