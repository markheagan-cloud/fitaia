/**
 * Rythme de déblocage : combien de jours pour avoir un article, calculé avec les VRAIES règles de l'app
 * (gains du jour, Points FITAIA, paliers du Parcours) et le vrai rythme de la personne (ses 14 derniers jours).
 * Pur, sans React. Aucun chiffre ici : tout vient de rewardCatalog, progressionRules et du catalogue.
 *
 * Le même calcul produit le tableau « combien de jours pour quoi » (docs/ECONOMIE.md, tests/shop-rythme.test.ts)
 * et l'estimation « à ton rythme » affichée dans la boutique.
 */
import { REWARD_DEFINITIONS } from '@/economy/rewardCatalog';
import { PROGRESSION_RULES, STAGES, STAGE_LABELS } from '@/progression/progressionRules';

/** Une journée type : défis réussis et repas enregistrés (ce que l'app récompense vraiment). */
export type DayPlan = { challenges: number; meals: number };

/** Profils de référence (hypothèses écrites, pas des mesures) : semaine type, du lundi au dimanche. */
export const PERSONAS: { id: 'fond' | 'regulier' | 'occasionnel'; label: string; line: string; week: DayPlan[] }[] = [
  { id: 'fond', label: 'À fond', line: '3 défis et 3 repas, 7 jours sur 7', week: Array.from({ length: 7 }, () => ({ challenges: 3, meals: 3 })) },
  { id: 'regulier', label: 'Régulier', line: 'Le défi du jour et 2 repas, 6 jours sur 7',
    week: [...Array.from({ length: 6 }, () => ({ challenges: 1, meals: 2 })), { challenges: 0, meals: 0 }] },
  { id: 'occasionnel', label: 'Occasionnel', line: 'Le défi du jour et 1 repas, 3 jours par semaine',
    week: [0, 1, 2, 3, 4, 5, 6].map((d) => (d % 2 === 0 && d < 6 ? { challenges: 1, meals: 1 } : { challenges: 0, meals: 0 })) },
];

const daily = (id: string) => REWARD_DEFINITIONS.find((r) => r.id === id && r.enabled)?.amount ?? 0;
const COINS_CHALLENGE = daily('daily_challenge');
const COINS_MEAL = daily('daily_meal');

/** Fitcoins et PF que l'app accorde pour une journée (plafonds compris). */
export function dayGain(p: DayPlan): { coins: number; points: number } {
  const ch = PROGRESSION_RULES.challenge_completed;
  const me = PROGRESSION_RULES.meal_logged;
  const points = (ch.enabled ? Math.min(ch.dailyCap, p.challenges * ch.points) : 0) + (me.enabled ? Math.min(me.dailyCap, p.meals * me.points) : 0);
  return { coins: (p.challenges > 0 ? COINS_CHALLENGE : 0) + (p.meals > 0 ? COINS_MEAL : 0), points };
}

export type Milestone = { atPoints: number; coins: number; label: string };

/** Paliers qui donnent des Fitcoins, triés par seuil de PF (paliers de points et étapes du Parcours). */
export const COIN_MILESTONES: Milestone[] = REWARD_DEFINITIONS.filter((r) => r.enabled && r.type === 'fitcoins' && !r.repeatable)
  .map((r) => {
    const c = r.unlockCondition;
    if (c.kind === 'lifetime_points') return { atPoints: c.atLeast, coins: r.amount, label: c.atLeast <= 50 ? 'Premier défi réussi' : 'Palier ' + c.atLeast + ' PF' };
    if (c.kind === 'stage_reached') {
      const s = STAGES.find((x) => x.id === c.stageId);
      return s ? { atPoints: s.minPoints, coins: r.amount, label: 'Étape ' + STAGE_LABELS[s.id] } : null;
    }
    return null;
  })
  .filter((m): m is Milestone => m !== null)
  .sort((a, b) => a.atPoints - b.atPoints);

export type Sim = { day: number; coins: number; points: number; earned: number };

/**
 * Simule jour par jour : solde de départ, PF déjà acquis (les paliers déjà passés ne comptent pas deux fois),
 * puis la semaine type répétée. Renvoie l'état à la fin de chaque jour.
 */
export function simulate(week: DayPlan[], days: number, start = { coins: 0, points: 0 }): Sim[] {
  let coins = start.coins;
  let points = start.points;
  let earned = 0;
  const out: Sim[] = [];
  for (let d = 0; d < days; d++) {
    const g = dayGain(week[d % week.length]);
    const before = points;
    points += g.points;
    let add = g.coins;
    for (const m of COIN_MILESTONES) if (before < m.atPoints && m.atPoints <= points) add += m.coins;
    coins += add;
    earned += add;
    out.push({ day: d + 1, coins, points, earned });
  }
  return out;
}

/** Jours pour réunir `price` (1 = dès aujourd'hui en jouant) ; null au-delà de l'horizon. */
export function daysToAfford(price: number, week: DayPlan[], start = { coins: 0, points: 0 }, horizon = 730): number | null {
  if (start.coins >= price) return 0;
  const hit = simulate(week, horizon, start).find((s) => s.coins >= price);
  return hit ? hit.day : null;
}

/** Ordre de déblocage si on prend chaque fois l'article le moins cher pas encore à soi (la « chronologie »). */
export function unlockTimeline(items: { id: string; price: number }[], week: DayPlan[], horizon = 365, start = { coins: 0, points: 0 }) {
  const todo = [...items].sort((a, b) => a.price - b.price);
  const sim = simulate(week, horizon, start);
  const out: { id: string; day: number }[] = [];
  let spent = 0;
  for (const s of sim) {
    while (todo.length && s.coins - spent >= todo[0].price) {
      spent += todo[0].price;
      out.push({ id: todo.shift()!.id, day: s.day });
    }
  }
  return out;
}

/**
 * Le rythme de la personne d'après ses 14 derniers jours (défis et repas réellement enregistrés). Les jours avant
 * sa première activité ne comptent pas. Moins de 3 jours de données : on ne devine pas, on renvoie null.
 */
export function myWeek(history: Record<string, { challenges: number; meals: number }>, today: string): { week: DayPlan[]; days: number } | null {
  const keys = Object.keys(history).filter((k) => k <= today && (history[k].challenges > 0 || history[k].meals > 0)).sort();
  if (!keys.length) return null;
  const end = new Date(today + 'T12:00:00Z');
  const first = new Date(keys[0] + 'T12:00:00Z');
  const span = Math.min(14, Math.round((end.getTime() - first.getTime()) / 86_400_000) + 1);
  if (span < 3) return null;
  const week: DayPlan[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const h = history[d];
    week.push({ challenges: h?.challenges ?? 0, meals: h?.meals ?? 0 });
  }
  return { week, days: span };
}

/** Fitcoins gagnés par jour en moyenne sur une semaine type (hors paliers). */
export const coinsPerDay = (week: DayPlan[]) => week.reduce((s, p) => s + dayGain(p).coins, 0) / week.length;

export type Pace = { week: DayPlan[]; mine: boolean };

/** Rythme utilisé pour les estimations : le sien s'il y a assez de données, sinon le profil « Régulier » (dit à l'écran). */
export function paceFor(history: Record<string, { challenges: number; meals: number }>, today: string): Pace {
  const m = myWeek(history, today);
  if (m && coinsPerDay(m.week) > 0) return { week: m.week, mine: true };
  return { week: PERSONAS[1].week, mine: false };
}

/** Phrase courte pour un délai en jours : « aujourd'hui », « demain », « dans 5 jours », « dans 3 semaines », « dans 4 mois ». */
export function inDays(d: number | null): string {
  if (d === null) return 'dans plus d’un an';
  if (d <= 0) return 'aujourd’hui';
  if (d === 1) return 'demain';
  if (d < 15) return 'dans ' + d + ' jours';
  if (d < 60) return 'dans ' + Math.round(d / 7) + ' semaines';
  return 'dans ' + Math.round(d / 30) + ' mois';
}

/** Prochains événements de la personne : paliers de Fitcoins à venir et articles qu'elle pourra prendre. */
export function nextEvents(
  items: { id: string; name: string; price: number }[],
  pace: Pace,
  start: { coins: number; points: number },
  limit = 5,
): { day: number; label: string; kind: 'palier' | 'article' }[] {
  const sim = simulate(pace.week, 365, start);
  const events: { day: number; label: string; kind: 'palier' | 'article' }[] = [];
  for (const m of COIN_MILESTONES) {
    if (m.atPoints <= start.points) continue;
    const s = sim.find((x) => x.points >= m.atPoints);
    if (s) events.push({ day: s.day, label: m.label + ' · +' + m.coins + ' Fitcoins', kind: 'palier' });
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const u of unlockTimeline(items, pace.week, 365, start)) events.push({ day: u.day, label: byId.get(u.id)!.name, kind: 'article' });
  return events.sort((a, b) => a.day - b.day || (a.kind === 'palier' ? -1 : 1)).slice(0, limit);
}

/**
 * Jour simulé → délai réel. Le jour 1 de la simulation, c'est aujourd'hui avec le défi du jour ; s'il est déjà fait,
 * le jour 1 tombe demain. 0 = déjà possible.
 */
export const delayOf = (simDay: number | null, doneToday: boolean): number | null => (simDay === null ? null : simDay === 0 ? 0 : simDay - 1 + (doneToday ? 1 : 0));
