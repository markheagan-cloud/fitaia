/**
 * Module natif FITAIA Santé (iOS, HealthKit, lecture seule). L'Apple Watch dépose ses mesures dans Santé : c'est là qu'on les lit.
 * Disponible uniquement dans la version compilée (TestFlight) ; ailleurs `isHealthAvailable` vaut false et rien n'est affiché.
 */
import { requireOptionalNativeModule } from 'expo';

export type HealthToday = { steps?: number; activeKcal?: number; heartRate?: number; heartRateAt?: number; workouts?: number; workoutMinutes?: number };

const native = requireOptionalNativeModule<{ isAvailable: boolean; requestAccess: () => Promise<boolean>; today: () => Promise<HealthToday> }>('FitaiaHealth');
export const isHealthAvailable: boolean = Boolean(native?.isAvailable);

export async function requestHealthAccess(): Promise<boolean> {
  if (!native?.isAvailable) return false;
  try {
    return await native.requestAccess();
  } catch {
    return false;
  }
}

export async function healthToday(): Promise<HealthToday> {
  if (!native?.isAvailable) return {};
  try {
    return (await native.today()) ?? {};
  } catch {
    return {};
  }
}
