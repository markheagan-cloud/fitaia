/**
 * Résumé « Montre connectée » : met en forme ce que Santé renvoie pour aujourd'hui. Logique pure, testée.
 * Une valeur absente n'est jamais inventée : la tuile n'apparaît simplement pas.
 */
export type WatchRaw = { steps?: number; activeKcal?: number; heartRate?: number; heartRateAt?: number; workouts?: number; workoutMinutes?: number };
export type WatchTile = { id: 'steps' | 'kcal' | 'heart' | 'workouts'; label: string; value: string; hint?: string };

const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const space = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function watchTiles(raw: WatchRaw, now: Date = new Date()): WatchTile[] {
  const tiles: WatchTile[] = [];
  if (ok(raw.steps)) tiles.push({ id: 'steps', label: 'Pas', value: space(raw.steps) });
  if (ok(raw.activeKcal)) tiles.push({ id: 'kcal', label: 'Calories actives', value: space(raw.activeKcal) + ' kcal' });
  if (ok(raw.heartRate)) {
    const min = ok(raw.heartRateAt) ? Math.max(0, Math.round((now.getTime() - raw.heartRateAt) / 60000)) : null;
    const hint = min === null ? undefined : min < 1 ? 'à l’instant' : min < 60 ? 'il y a ' + min + ' min' : 'il y a ' + Math.floor(min / 60) + ' h';
    tiles.push({ id: 'heart', label: 'Cœur', value: Math.round(raw.heartRate) + ' bpm', hint });
  }
  if (ok(raw.workouts)) {
    const m = ok(raw.workoutMinutes) ? Math.round(raw.workoutMinutes) : 0;
    tiles.push({ id: 'workouts', label: raw.workouts > 1 ? 'Séances' : 'Séance', value: String(Math.round(raw.workouts)), hint: m ? m + ' min' : undefined });
  }
  return tiles;
}
