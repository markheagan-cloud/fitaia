import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';

export type StepsState = { available: boolean | null; steps: number; error?: string };

/**
 * Pas du jour (depuis minuit local) via le podomètre du téléphone.
 * iOS : Core Motion (fonctionne dans Expo Go). Android : capteur de pas (compte depuis l'ouverture, pas d'historique).
 * Web/ordinateur : indisponible.
 */
export function useSteps(refreshMs = 15000): StepsState {
  const [state, setState] = useState<StepsState>({ available: null, steps: 0 });

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    let sub: { remove: () => void } | undefined;

    const update = (s: StepsState) => {
      if (alive) setState(s);
    };

    (async () => {
      if (Platform.OS === 'web') {
        update({ available: false, steps: 0, error: 'Indisponible sur ordinateur' });
        return;
      }
      try {
        const ok = await Pedometer.isAvailableAsync();
        if (!ok) {
          update({ available: false, steps: 0, error: 'Podomètre indisponible' });
          return;
        }
        const perm = await Pedometer.requestPermissionsAsync();
        if (!perm.granted) {
          update({ available: false, steps: 0, error: 'Autorise « Mouvement et forme » dans Réglages' });
          return;
        }
        if (Platform.OS === 'ios') {
          const read = async () => {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            const r = await Pedometer.getStepCountAsync(start, new Date());
            update({ available: true, steps: r.steps });
          };
          await read();
          timer = setInterval(() => read().catch(() => {}), refreshMs);
        } else {
          let base = 0;
          sub = Pedometer.watchStepCount((r) => {
            base += r.steps;
            update({ available: true, steps: base });
          });
          update({ available: true, steps: 0 });
        }
      } catch {
        update({ available: false, steps: 0, error: 'Podomètre indisponible' });
      }
    })();

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      sub?.remove();
    };
  }, [refreshMs]);

  return state;
}
