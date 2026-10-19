import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { fmt } from '@/data/content';

/**
 * Nombre qui « compte » vers sa nouvelle valeur (≈ 600 ms, easing out). Pur JS : quelques nombres par écran,
 * aucune charge mesurable ; respecte un changement brutal au premier rendu (pas d'animation).
 */
export function useCountUp(value: number, duration = 600): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    if (reduced) {
      from.current = value;
      return;
    }
    const t0 = Date.now();
    const tick = () => {
      const k = Math.min(1, (Date.now() - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(start + (value - start) * e);
      setShown(v);
      if (k < 1) raf.current = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      from.current = value;
    };
  }, [value, duration, reduced]);
  return reduced ? value : shown;
}

export function AnimatedNumber({ value, render }: { value: number; render: (text: string) => React.ReactElement }) {
  const v = useCountUp(value);
  return render(fmt(v));
}
