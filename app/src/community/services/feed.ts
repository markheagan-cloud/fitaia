/**
 * « Aujourd’hui dans ta communauté » : un fil FINI (3 éléments au maximum), utile, sans défilement infini.
 * Ordre : ce qui te concerne directement (réponses, demandes, encouragements reçus), puis ce qui se passe
 * chez les personnes proches de toi. Les événements des profils de démonstration sont marqués `simulated`.
 * Logique pure.
 */
import { ACTIVE_MS, compatibility } from '../../social/fitmatch/matching';
import type { SocialEngine } from './engine';
import { unreadConversations } from './inbox';

export const FEED_MAX = 3;
const DAY = 86400000;

export type FeedKind = 'reponse' | 'demande' | 'encouragement' | 'arrivee' | 'objectif' | 'actif';

export type FeedItem = {
  id: string;
  kind: FeedKind;
  userId?: string;
  text: string;
  at: number;
  /** Événement d'un profil de démonstration (ou réponse simulée) : affiché comme tel. */
  simulated: boolean;
  /** Arrivé depuis ma dernière visite. */
  isNew: boolean;
};

export type FeedEvent = Omit<FeedItem, 'isNew' | 'id'> & { id?: string };

const PRIORITY: Record<FeedKind, number> = { reponse: 0, demande: 1, encouragement: 2, arrivee: 3, objectif: 4, actif: 5 };

/** Ce qui attend une action de ma part reste visible tant que ce n'est pas lu (même après plusieurs jours d'absence). */
const PENDING: FeedKind[] = ['reponse', 'demande'];

/** Trie, dédoublonne (une ligne par personne), garde les dernières 24 h (sauf ce qui attend une réponse) et coupe à 3. */
export function todayFeed(events: FeedEvent[], now: number, lastVisitAt: number | null, max = FEED_MAX): FeedItem[] {
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  const sorted = events
    .filter((e) => e.at <= now + 60000 && (PENDING.includes(e.kind) || now - e.at < DAY))
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || b.at - a.at);
  for (const e of sorted) {
    if (e.userId) {
      if (seen.has(e.userId)) continue;
      seen.add(e.userId);
    }
    out.push({ ...e, id: e.id ?? e.kind + ':' + (e.userId ?? '') + ':' + e.at, isNew: lastVisitAt === null || e.at > lastVisitAt });
    if (out.length >= max) break;
  }
  return out;
}

/** Événements bruts à partir de l'état social (réel) et, pour les profils de démonstration, d'une activité simulée. */
export function feedEvents(e: SocialEngine, me: string, readAt: Record<string, number>, now: number): FeedEvent[] {
  const out: FeedEvent[] = [];
  const meP = e.s.profiles[me];
  if (!meP) return out;
  const name = (id: string) => e.s.profiles[id]?.displayName ?? 'Quelqu’un';
  const isDemo = (id: string) => !!e.s.profiles[id]?.demo;

  // 1) réponses non lues
  for (const cid of unreadConversations(e, me, readAt)) {
    const list = e.s.messages[cid] ?? [];
    const last = list[list.length - 1];
    if (!last) continue;
    out.push({ kind: 'reponse', userId: last.senderId, text: name(last.senderId) + ' t’a répondu', at: last.createdAt, simulated: isDemo(last.senderId) });
  }
  // 2) demandes d'amis reçues
  for (const f of e.pendingFor(me)) out.push({ kind: 'demande', userId: f.userA, text: name(f.userA) + ' veut t’ajouter', at: f.createdAt, simulated: isDemo(f.userA) });
  // 3) encouragements reçus
  for (const enc of e.s.encouragements.filter((x) => x.to === me && !e.isBlocked(me, x.from)))
    out.push({ kind: 'encouragement', userId: enc.from, text: name(enc.from) + ' t’a envoyé un encouragement', at: enc.createdAt, simulated: isDemo(enc.from) });

  // 4) démonstration : activité simulée des personnes proches de ton parcours
  const near = Object.values(e.s.profiles)
    .filter((p) => p.demo && p.userId !== me && !e.isBlocked(me, p.userId))
    .map((p) => ({ p, r: compatibility(meP, p, now) }))
    .filter(({ r }) => r.eligible && r.score >= 35)
    .sort((a, b) => b.r.score - a.r.score);
  const friends = new Set(e.friends(me));
  const day = Math.floor(now / DAY);
  // a) quelqu'un a tenu son objectif du jour (de préférence un ami)
  const goalPerson = near.find(({ p }) => friends.has(p.userId)) ?? near[day % Math.max(1, Math.min(3, near.length))];
  if (goalPerson) {
    // heure stable pendant une heure (pas de « nouvel » événement à chaque minute)
    const hourStart = Math.floor(now / 3600000) * 3600000;
    const minutes = 20 + ((day * 37) % 90);
    out.push({ kind: 'objectif', userId: goalPerson.p.userId, text: goalPerson.p.displayName + ' a tenu son objectif du jour', at: hourStart - minutes * 60000, simulated: true });
  }
  // b) quelqu'un est en ligne maintenant
  const online = near.find(({ p }) => now - p.lastActiveAt < ACTIVE_MS && p.userId !== goalPerson?.p.userId);
  if (online) out.push({ kind: 'actif', userId: online.p.userId, text: online.p.displayName + ' est en ligne maintenant', at: online.p.lastActiveAt, simulated: true });
  // c) arrivées récentes proches de ton parcours (pas encore amies)
  const newcomers = near.filter(({ p }) => now - p.joinedAt < 7 * DAY && !friends.has(p.userId));
  if (newcomers.length) {
    const last = Math.max(...newcomers.map(({ p }) => p.joinedAt));
    out.push({
      kind: 'arrivee',
      text: newcomers.length === 1 ? 'Une nouvelle personne correspond à ton parcours' : newcomers.length + ' personnes proches de ton parcours viennent d’arriver',
      at: Math.max(last, now - 20 * 3600000),
      simulated: true,
    });
  }
  return out;
}

/** Retour après une absence : on accueille, sans culpabiliser. */
export const WELCOME_BACK_AFTER = 3 * DAY;

export function welcomeBack(lastVisitAt: number | null, now: number): { days: number } | null {
  if (lastVisitAt === null || now - lastVisitAt < WELCOME_BACK_AFTER) return null;
  return { days: Math.floor((now - lastVisitAt) / DAY) };
}

export function greeting(hour: number): string {
  return hour >= 5 && hour < 18 ? 'Bonjour' : 'Bonsoir';
}

/** Personnes proches de ton parcours, en ligne maintenant (éligibles FitMatch, non bloquées). */
export function activeNearby(e: SocialEngine, me: string, now: number): string[] {
  const meP = e.s.profiles[me];
  if (!meP) return [];
  return Object.values(e.s.profiles)
    .filter((p) => p.userId !== me && now - p.lastActiveAt < ACTIVE_MS && !e.isBlocked(me, p.userId))
    .map((p) => ({ p, r: compatibility(meP, p, now) }))
    .filter(({ r }) => r.eligible && r.score >= 35)
    .sort((a, b) => b.r.score - a.r.score)
    .map(({ p }) => p.userId);
}
