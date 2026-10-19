/**
 * Calendrier de la progression : jour, semaine et saison sont calculés par le SERVEUR dans un fuseau fixé par la
 * configuration (même calcul que `progression_day()` / `progression_week()` / `progression_season()` en SQL).
 * Les clés sont des chaînes stables : jour « AAAA-MM-JJ », semaine = lundi « AAAA-MM-JJ », saison « S1 », « S2 »…
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function localDayKey(at: Date): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Jour calendaire de `at` dans le fuseau `timeZone`. Si le moteur JavaScript ne connaît pas ce fuseau
 * (Intl incomplet), repli sur la date locale de l'appareil : acceptable en démonstration locale seulement,
 * le serveur réel calcule toujours dans le fuseau configuré.
 */
export function dayKeyIn(timeZone: string, at: Date): string {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      return localDayKey(at);
    }
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcMidnight(dayKey: string): number {
  const m = DAY_KEY.exec(dayKey);
  if (!m) throw new Error('Clé de jour invalide');
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtcMidnight(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isDayKey(value: string): boolean {
  if (!DAY_KEY.test(value)) return false;
  return fromUtcMidnight(toUtcMidnight(value)) === value;
}

export function addDays(dayKey: string, days: number): string {
  return fromUtcMidnight(toUtcMidnight(dayKey) + days * 86_400_000);
}

export function daysBetween(fromDayKey: string, toDayKey: string): number {
  return Math.round((toUtcMidnight(toDayKey) - toUtcMidnight(fromDayKey)) / 86_400_000);
}

/** Lundi de la semaine ISO contenant ce jour. */
export function weekKeyOf(dayKey: string): string {
  const isoDow = ((new Date(toUtcMidnight(dayKey)).getUTCDay() + 6) % 7) + 1; // 1 = lundi … 7 = dimanche
  return addDays(dayKey, 1 - isoDow);
}

/** Saison numérotée depuis l'ancre (« S1 » = premiers `lengthDays` jours) ; « S0 » avant l'ancre. */
export function seasonKeyOf(dayKey: string, anchorDayKey: string, lengthDays: number): string {
  const index = Math.floor(daysBetween(anchorDayKey, dayKey) / lengthDays) + 1;
  return 'S' + Math.max(0, index);
}
