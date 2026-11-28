import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { isPoseAvailable, PoseEvent } from '../../modules/fitaia-pose';
import { useGame } from '@/store/useGame';
import { PushupCounter, unsquash } from './repCounter';
import { PlacementGuide, type GuideStatus } from './placementGuide';
import { poseForSide } from './sideLock';
import { playSfx, prepareVoice, setFocus, speak } from '@/services/sound';
import { posturePhrase, rejectWhyPhrase, repPhrase, startPhrase } from '@/coach/repVoice';

/** Détection de posture réelle disponible ? (module natif iOS, version compilée uniquement) */
export const poseReady = isPoseAvailable && Platform.OS === 'ios';

const KEEP_AWAKE_TAG = 'fitaia-defi-pompes';

/**
 * Pilote le défi « pompes » avec la caméra avant : la personne voit l'écran, la voix la guide pour se placer
 * (« je ne vois pas tes jambes », bip + « c'est bon »), puis compte les pompes et dit précisément pourquoi une pompe
 * n'est pas comptée. Les pompes ne comptent qu'une fois la personne bien placée et en position de pompe.
 * L'écran reste allumé pendant le défi ; quitter l'onglet arrête le défi (et la caméra).
 */
export function usePushupCamera(target = 5) {
  const running = useGame((s) => s.running);
  const pushDone = useGame((s) => s.pushDone);
  const begin = useGame((s) => s.pushBeginReal);
  const update = useGame((s) => s.pushUpdate);
  const finish = useGame((s) => s.pushFinish);
  const abort = useGame((s) => s.pushAbort);
  const counter = useRef(new PushupCounter());
  const guide = useRef(new PlacementGuide());
  const side = useRef<'left' | 'right' | null>(null);
  const rejected = useRef(0);
  const lastDraw = useRef(0);
  const [lastPose, setLastPose] = useState<PoseEvent | null>(null);
  const [placement, setPlacement] = useState<GuideStatus>('searching');

  useEffect(() => {
    if (poseReady) prepareVoice();
  }, []);

  useEffect(() => {
    setFocus(running);
    if (running) {
      speak(startPhrase);
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } else {
      counter.current.reset();
      guide.current.reset();
      side.current = null;
      rejected.current = 0;
    }
    return () => {
      // on laisse finir la dernière phrase (« 5 ! Défi réussi ») avant que le mode silencieux reprenne la main
      setTimeout(() => {
        if (!useGame.getState().running) setFocus(false);
      }, 3500);
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        // rien à relâcher
      }
    };
  }, [running]);

  // Quitter l'onglet Défis pendant un défi caméra l'arrête : sinon la caméra continuerait à tourner hors de l'écran.
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (poseReady && useGame.getState().running) abort();
      };
    }, [abort]),
  );

  /** Départ du défi : on repart d'un placement vierge (squelette et statut effacés). */
  const start = useCallback(() => {
    counter.current.reset();
    guide.current.reset();
    side.current = null;
    rejected.current = 0;
    setPlacement('searching');
    setLastPose(null);
    begin();
  }, [begin]);

  const onPose = useCallback(
    (e: { nativeEvent: PoseEvent }) => {
      const ev = e.nativeEvent;
      if (!running) return;
      const ts = typeof ev.ts === 'number' ? ev.ts : Date.now();
      // squelette à l'écran ~10 fois par seconde (assez pour se voir, sans redessiner tout l'écran 15 fois par seconde)
      if (ts - lastDraw.current >= 100 || !ev.found) {
        lastDraw.current = ts;
        setLastPose(ev);
      }
      const raw = poseForSide(ev, side.current);

      const wasReady = guide.current.ready;
      const g = guide.current.update({ found: ev.found, ts, pose: raw });
      setPlacement(g.status);
      if (g.beep) playSfx('rep');
      if (g.say) speak(g.say, 'queue');
      if (g.text) update(counter.current.count, g.text, g.kind ?? 'info');
      if (!guide.current.ready) {
        if (wasReady) side.current = null; // perdu : on reprendra le côté le mieux vu
        return;
      }
      if (!raw) return;
      if (!side.current && ev.side) side.current = ev.side;

      const lockedSide = side.current ?? ev.side;
      const p3 = ev.world && lockedSide ? ev.world[lockedSide] : undefined;
      const events = counter.current.update(unsquash(raw, ev.aspect && ev.aspect > 0 ? ev.aspect : 0.5625), p3);
      for (const x of events) {
        if (x.type === 'rep') {
          playSfx('rep');
          speak(repPhrase(x.count, target));
          if (x.count >= target) finish(rejected.current, target);
          else update(x.count, 'Pompe ' + x.count + ' validée, amplitude complète.', 'good');
        } else if (x.type === 'rejected') {
          rejected.current++;
          speak(rejectWhyPhrase(x.why, rejected.current));
          update(counter.current.count, x.reason, 'bad');
        } else if (x.type === 'posture') {
          speak(posturePhrase, 'queue');
          update(counter.current.count, posturePhrase, 'info');
        }
        // les pertes de suivi sont annoncées par le guide de placement
      }
    },
    [running, target, update, finish],
  );

  const onError = useCallback((e: { nativeEvent: { message: string } }) => {
    abort();
    update(0, e.nativeEvent.message, 'bad');
    speak(e.nativeEvent.message);
  }, [update, abort]);

  return { ready: poseReady, running, pushDone, begin: start, abort, onPose, onError, lastPose, placement };
}
