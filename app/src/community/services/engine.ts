/**
 * Moteur social (logique pure, sérialisable) : profils, amis, FitMatch, conversations, blocage, signalement.
 * Le même contrat est implémenté par le serveur (supabase/migrations/0001_community.sql + règles d'accès) ;
 * en développement, ce moteur tourne sur le téléphone avec des profils de démonstration signalés comme tels.
 */
import type {
  Block, CommunityProfile, Conversation, Friendship, Message, MessageType, Report, ReportReason, RelationshipType,
} from '../models/types';
import { suggest } from '../../social/fitmatch/matching';
import { checkMessage } from '../../social/messages/safety';
import type { SendCheck } from '../../social/messages/safety';
import { publicCard } from './privacy';
import type { PublicCard, Relation } from './privacy';

export type SocialState = {
  profiles: Record<string, CommunityProfile>;
  friendships: Friendship[];
  conversations: Record<string, Conversation>;
  messages: Record<string, Message[]>;       // par conversation
  blocks: Block[];
  reports: Report[];
  passed: Record<string, string[]>;          // FitMatch : personnes « passées » par utilisateur
  encouragements: { from: string; to: string; createdAt: number }[];
};

export const emptyState = (): SocialState => ({
  profiles: {}, friendships: [], conversations: {}, messages: {}, blocks: [], reports: [], passed: {}, encouragements: [],
});

let seq = 0;
export const newId = (p: string, now = Date.now()) => `${p}_${now.toString(36)}_${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export class SocialEngine {
  s: SocialState;
  constructor(s: SocialState) {
    this.s = s;
  }

  // ---------- profils
  upsertProfile(p: CommunityProfile) {
    const prev = this.s.profiles[p.userId];
    // le meilleur niveau historique ne descend jamais
    const highest = Math.max(p.highestHistoricalPoints, p.points, prev?.highestHistoricalPoints ?? 0);
    this.s.profiles[p.userId] = { ...p, highestHistoricalPoints: highest };
  }

  isBlocked(a: string, b: string): boolean {
    return this.s.blocks.some((x) => (x.blockerId === a && x.blockedId === b) || (x.blockerId === b && x.blockedId === a));
  }

  friendship(a: string, b: string): Friendship | undefined {
    return this.s.friendships.find((f) => (f.userA === a && f.userB === b) || (f.userA === b && f.userB === a));
  }

  relation(viewer: string, target: string): Relation {
    if (viewer === target) return 'moi';
    return this.friendship(viewer, target)?.status === 'accepte' ? 'ami' : 'inconnu';
  }

  card(viewer: string, target: string, now = Date.now()): PublicCard | null {
    const p = this.s.profiles[target];
    if (!p || this.isBlocked(viewer, target)) return null;
    return publicCard(p, this.relation(viewer, target), now);
  }

  // ---------- FitMatch
  candidates(me: string, now = Date.now(), limit = 10) {
    const meP = this.s.profiles[me];
    if (!meP) return [];
    const exclude = new Set<string>([me, ...(this.s.passed[me] ?? [])]);
    for (const b of this.s.blocks) {
      if (b.blockerId === me) exclude.add(b.blockedId);
      if (b.blockedId === me) exclude.add(b.blockerId);
    }
    for (const f of this.s.friendships) {
      if (f.userA === me && f.status !== 'refuse') exclude.add(f.userB);
      if (f.userB === me && f.status === 'accepte') exclude.add(f.userA);
    }
    return suggest(meP, Object.values(this.s.profiles), exclude, now, limit);
  }

  pass(me: string, other: string) {
    (this.s.passed[me] ??= []).push(other);
  }

  // ---------- amis
  requestFriend(me: string, other: string, type: RelationshipType = 'ami', now = Date.now()): { ok: boolean; reason?: string } {
    if (me === other) return { ok: false, reason: 'Impossible de s’ajouter soi-même.' };
    if (this.isBlocked(me, other)) return { ok: false, reason: 'Action impossible.' };
    const f = this.friendship(me, other);
    if (f?.status === 'accepte') return { ok: false, reason: 'Vous êtes déjà amis.' };
    if (f?.status === 'en_attente') {
      if (f.userB === me) return this.respondFriend(me, f.id, true);   // il m'avait déjà demandé : on accepte
      return { ok: false, reason: 'Demande déjà envoyée.' };
    }
    const fitmates = this.s.friendships.filter((x) => x.status === 'accepte' && x.relationshipType === 'fitmate' && (x.userA === me || x.userB === me));
    if (type === 'fitmate' && fitmates.length >= 3) return { ok: false, reason: 'Trois FitMates au maximum.' };
    this.s.friendships.push({ id: newId('f', now), userA: me, userB: other, status: 'en_attente', relationshipType: type, createdAt: now });
    return { ok: true };
  }

  respondFriend(me: string, id: string, accept: boolean): { ok: boolean; reason?: string } {
    const f = this.s.friendships.find((x) => x.id === id);
    if (!f || f.userB !== me || f.status !== 'en_attente') return { ok: false, reason: 'Demande introuvable.' };
    f.status = accept ? 'accepte' : 'refuse';
    return { ok: true };
  }

  friends(me: string): string[] {
    return this.s.friendships
      .filter((f) => f.status === 'accepte' && (f.userA === me || f.userB === me))
      .map((f) => (f.userA === me ? f.userB : f.userA))
      .filter((id) => !this.isBlocked(me, id));
  }

  pendingFor(me: string): Friendship[] {
    return this.s.friendships.filter((f) => f.userB === me && f.status === 'en_attente' && !this.isBlocked(me, f.userA));
  }

  // ---------- encouragements (sans conversation)
  encourage(me: string, other: string, now = Date.now()): { ok: boolean; reason?: string } {
    if (this.isBlocked(me, other)) return { ok: false, reason: 'Action impossible.' };
    const today = this.s.encouragements.filter((e) => e.from === me && now - e.createdAt < 86400000);
    if (today.length >= 20) return { ok: false, reason: 'Tu as déjà beaucoup encouragé aujourd’hui, merci !' };
    if (today.some((e) => e.to === other && now - e.createdAt < 3600000)) return { ok: false, reason: 'Encouragement déjà envoyé, réessaie plus tard.' };
    this.s.encouragements.push({ from: me, to: other, createdAt: now });
    return { ok: true };
  }

  // ---------- conversations
  conversationWith(me: string, other: string): Conversation | undefined {
    return Object.values(this.s.conversations).find((c) => c.type === 'prive' && c.members.includes(me) && c.members.includes(other));
  }

  conversationsOf(me: string): Conversation[] {
    return Object.values(this.s.conversations)
      .filter((c) => c.members.includes(me) && !c.members.some((m) => m !== me && this.isBlocked(me, m)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  canMessage(me: string, other: string): SendCheck {
    if (this.isBlocked(me, other)) return { ok: false, reason: 'Vous ne pouvez plus échanger.' };
    const p = this.s.profiles[other];
    if (!p) return { ok: false, reason: 'Profil introuvable.' };
    const existing = this.conversationWith(me, other);
    if (existing && (this.s.messages[existing.id] ?? []).some((m) => m.senderId === other)) return { ok: true }; // il a déjà répondu
    const rel = this.relation(me, other);
    if (p.privacy.allowMessages === 'personne') return { ok: false, reason: 'Cette personne ne reçoit pas de messages.' };
    if (p.privacy.allowMessages === 'amis' && rel !== 'ami') return { ok: false, reason: 'Ajoute d’abord cette personne : elle n’accepte que les messages de ses amis.' };
    return { ok: true };
  }

  send(me: string, other: string, content: string, type: MessageType = 'texte', now = Date.now()): { ok: true; message: Message; conversation: Conversation } | { ok: false; reason: string } {
    const allowed = this.canMessage(me, other);
    if (!allowed.ok) return allowed;
    let conv = this.conversationWith(me, other);
    const isNew = !conv;
    const mine = Object.values(this.s.messages).flat().filter((m) => m.senderId === me);
    const msgs = conv ? this.s.messages[conv.id] ?? [] : [];
    const meP = this.s.profiles[me];
    const newConvToday = Object.values(this.s.conversations).filter(
      (c) => c.members.includes(me) && now - c.createdAt < 86400000 && (this.s.messages[c.id]?.[0]?.senderId === me),
    ).length;
    const chk = checkMessage({
      text: content,
      now,
      myRecent: mine.filter((m) => now - m.createdAt < 3600000),
      sentInThisConversation: msgs.filter((m) => m.senderId === me).length,
      otherHasReplied: msgs.some((m) => m.senderId === other),
      accountAgeDays: meP ? (now - meP.joinedAt) / 86400000 : 0,
      newConversationsToday: newConvToday,
      isNewConversation: isNew,
    });
    if (!chk.ok) return chk;
    if (!conv) {
      conv = { id: newId('c', now), type: 'prive', members: [me, other], createdAt: now, updatedAt: now };
      this.s.conversations[conv.id] = conv;
      this.s.messages[conv.id] = [];
    }
    const message: Message = { id: newId('m', now), conversationId: conv.id, senderId: me, type, content: content.trim(), createdAt: now, moderationState: 'ok' };
    this.s.messages[conv.id].push(message);
    conv.updatedAt = now;
    return { ok: true, message, conversation: conv };
  }

  /** Message entrant d'un autre membre (réseau, ou profil de démonstration). */
  receive(from: string, convId: string, content: string, now = Date.now()) {
    const conv = this.s.conversations[convId];
    if (!conv || !conv.members.includes(from)) return;
    const other = conv.members.find((m) => m !== from)!;
    if (this.isBlocked(other, from)) return;
    this.s.messages[convId].push({ id: newId('m', now), conversationId: convId, senderId: from, type: 'texte', content, createdAt: now, moderationState: 'ok' });
    conv.updatedAt = now;
  }

  // ---------- sécurité
  block(me: string, other: string, now = Date.now()) {
    if (!this.s.blocks.some((b) => b.blockerId === me && b.blockedId === other))
      this.s.blocks.push({ blockerId: me, blockedId: other, createdAt: now });
    // une amitié avec une personne bloquée disparaît
    this.s.friendships = this.s.friendships.filter((f) => !((f.userA === me && f.userB === other) || (f.userA === other && f.userB === me)));
  }

  unblock(me: string, other: string) {
    this.s.blocks = this.s.blocks.filter((b) => !(b.blockerId === me && b.blockedId === other));
  }

  report(me: string, target: string, reason: ReportReason, messageId?: string, now = Date.now()): Report {
    const r: Report = { id: newId('r', now), reporterId: me, targetUserId: target, messageIdOptional: messageId, reason, createdAt: now, status: 'recu' };
    this.s.reports.push(r);
    if (messageId) {
      for (const list of Object.values(this.s.messages)) {
        const m = list.find((x) => x.id === messageId);
        if (m) m.moderationState = 'en_revue';
      }
    }
    return r;
  }
}
