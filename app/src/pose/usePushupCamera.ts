import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { isPoseAvailable, PoseEvent } from '../../modules/fitaia-pose';
import { useGame } from '@/store/useGame';
import { PushupCounter } from './repCounter';

/** Détection de posture réelle disponible ? (module natif iOS, version compilée uniquement) */
export const poseReady = isPoseAvailable && Platform.OS === 'ios';

/**
 * Pilote le défi « 5 pompes » avec la caméra : branche les événements de pose sur le compteur
 * et le compteur sur le store (reps, retours, validation, crédits).
 */
export function usePushupCamera(target = 5) {
  const running = useGame((s) => s.running);
  const pushDone = useGame((s) => s.pushDone);
  const begin = useGame((s) => s.pushBeginReal);
  const update = useGame((s) => s.pushUpdate);
  const finish = useGame((s) => s.pushFinish);
  const abort = useGame((s) => s.pushAbort);
  const counter = useRef(new PushupCounter());
  const rejected = useRef(0);
  const [lastPose, setLastPose] = useState<PoseEvent | null>(null);

  useEffect(() => {
    if (!running) {
      counter.current.reset();
      rejected.current = 0;
    }
  }, [running]);

  const onPose = useCallback(
    (e: { nativeEvent: PoseEvent }) => {
      const ev = e.nativeEvent;
      setLastPose(ev);
      if (!running || !ev.found || !ev.points) return;
      const p = ev.points;
      const events = counter.current.update({ shoulder: p.shoulder, elbow: p.elbow, wrist: p.wrist, hip: p.hip, knee: p.knee, ankle: p.ankle });
      for (const x of events) {
        if (x.type === 'rep') {
          if (x.count >= target) finish(rejected.current);
          else update(x.count, 'Pompe ' + x.count + ' validée, amplitude complète.', 'good');
        } else if (x.type === 'rejected') {
          rejected.current++;
          update(counter.current.count, x.reason, 'bad');
        } else if (x.type === 'tracking') {
          update(counter.current.count, x.ok ? 'Corps détecté, 19 points suivis. Vas-y.' : (x.reason ?? 'Corps non détecté.'), x.ok ? 'info' : 'bad');
        }
      }
    },
    [running, target, update, finish],
  );

  const onError = useCallback((e: { nativeEvent: { message: string } }) => {
    update(0, e.nativeEvent.message, 'bad');
    abort();
  }, [update, abort]);

  return { ready: poseReady, running, pushDone, begin, abort, onPose, onError, lastPose };
}
