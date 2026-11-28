/**
 * « Montre connectée » : une case dans Mon perso. Cochée, FITAIA demande l'accès en lecture à Santé (où l'Apple Watch
 * dépose ses mesures) et affiche le résumé du jour sur l'accueil. Lecture seule, rien ne quitte le téléphone.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { healthToday, isHealthAvailable, requestHealthAccess } from '../../modules/fitaia-health';
import { watchTiles, type WatchTile } from '@/coach/watchDay';

export const watchSupported = isHealthAvailable;

type WatchPrefs = { on: boolean; setOn: (v: boolean) => void };
export const useWatch = create<WatchPrefs>()(
  persist((set) => ({ on: false, setOn: (on) => set({ on }) }), { name: 'fitaia-montre', storage: createJSONStorage(() => AsyncStorage) }),
);

/** Coche la case : demande l'accès à Santé. Renvoie false si l'appareil ne le permet pas ou si la demande échoue. */
export async function connectWatch(): Promise<boolean> {
  if (!watchSupported) return false;
  const ok = await requestHealthAccess();
  useWatch.getState().setOn(ok);
  return ok;
}

/** Résumé du jour, relu à chaque retour dans l'app. Liste vide = rien à afficher (case décochée ou aucune mesure). */
export function useWatchTiles(): WatchTile[] {
  const on = useWatch((s) => s.on);
  const [tiles, setTiles] = useState<WatchTile[]>([]);
  useEffect(() => {
    if (!on || !watchSupported) return;
    let alive = true;
    const load = () => healthToday().then((r) => alive && setTiles(watchTiles(r)));
    load();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    const timer = setInterval(load, 60000);
    return () => {
      alive = false;
      sub.remove();
      clearInterval(timer);
    };
  }, [on]);
  return on && watchSupported ? tiles : [];
}
