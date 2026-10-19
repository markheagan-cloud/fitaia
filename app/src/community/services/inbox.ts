/**
 * Boîte de réception : discussions avec une réponse non lue (dernier message de l'autre, postérieur à ma dernière lecture).
 */
import type { SocialEngine } from './engine';

export function unreadConversations(e: SocialEngine, me: string, readAt: Record<string, number>): string[] {
  return e
    .conversationsOf(me)
    .filter((c) => {
      const l = e.s.messages[c.id] ?? [];
      const last = l[l.length - 1];
      return !!last && last.senderId !== me && last.createdAt > (readAt[c.id] ?? 0);
    })
    .map((c) => c.id);
}

/** Nombre de messages de l'autre arrivés depuis ma dernière lecture de cette discussion. */
export function unreadCount(e: SocialEngine, me: string, convId: string, readAt: Record<string, number>): number {
  const conv = e.s.conversations[convId];
  if (!conv || conv.members.some((m) => m !== me && e.isBlocked(me, m))) return 0;
  const since = readAt[convId] ?? 0;
  return (e.s.messages[convId] ?? []).filter((m) => m.senderId !== me && m.createdAt > since).length;
}
