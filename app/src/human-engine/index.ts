/**
 * FITAIA Human Engine — point d'entrée. Les écrans importent d'ici, jamais des sous-dossiers.
 * Documentation : docs/HUMAN-ENGINE.md
 */
import { useEffect, useRef, useState } from 'react';
import { fitaiaHumanEngine, type FitaiaHumanEngine } from './core/FitaiaHumanEngine';
import type { EngineSnapshot } from './core/types';

export { FitaiaHumanEngine, fitaiaHumanEngine, DEFAULT_ANIMATION_MS } from './core/FitaiaHumanEngine';
export * from './core/types';
export { bodyFromProfile, currentAndTarget, bmiOf, NEUTRAL_BODY, evaluateDrivers, PROTOTYPE_DRIVERS } from './body/BodyParameterMapper';
export { AVATARS, DEFAULT_AVATAR, PREMIUM_MALE_DRIVERS, avatarForBase, avatarForProfile, personalAvatar } from './avatars';
export { shapeFromBody, withOverrides, BODY_SHAPE_KEYS, type BodyShape } from './body/BodyShape';
export { HumanAvatarView } from './renderer/HumanAvatarView';
export type { ExpoThreeRenderer, RenderMode } from './renderer/ExpoThreeRenderer';
export type { AvatarSource } from './renderer/AvatarLoader';

/** État du moteur pour l'UI, limité à `hz` mises à jour par seconde (le rendu 3D, lui, reste à pleine vitesse). */
export function useHumanEngine(engine: FitaiaHumanEngine = fitaiaHumanEngine, hz = 12): EngineSnapshot {
  const [snap, setSnap] = useState<EngineSnapshot>(() => engine.snapshot());
  const lastAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const gap = 1000 / hz;
    const unsub = engine.subscribe((s) => {
      const t = Date.now();
      if (t - lastAt.current >= gap) {
        lastAt.current = t;
        setSnap(s);
        return;
      }
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        lastAt.current = Date.now();
        setSnap(engine.snapshot());
      }, gap);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [engine, hz]);
  return snap;
}
