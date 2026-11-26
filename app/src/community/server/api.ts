/**
 * Communauté — appels au serveur Supabase (supabase/migrations 0001, 0003, 0004, 0005, 0006).
 *
 * Le serveur est seul juge : confidentialité (vue community_cards), blocage, limites de messages, filtre
 * « Me proposer », règles des forums, signalements. Le téléphone garde une copie (SocialState / ForumState) qui est
 * remplacée à chaque `pull`, pour que les écrans existants fonctionnent sans changer.
 *
 * Chaque fonction reçoit le client en paramètre : les mêmes fonctions servent l'app et le test de bout en bout
 * avec deux vrais comptes (tests/e2e-communaute-serveur.ts).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AgeRange, CommunityProfile, Conversation, FitMatchCandidate, Friendship, GoalCategory, Language, Message, MessageType,
  ReasonCode, RelationshipType, ReportReason,
} from '../models/types';
import { DEFAULT_PRIVACY } from '../models/types';
import type { ForumPost, ForumState, Pace, PostTag, ReactionId, RunMeetup } from '../models/forums';
import { emptyState, SocialState } from '../services/engine';

export const PHOTO_BUCKET = 'forum-photos';

type Row = Record<string, any>;
const ms = (v: unknown): number => (v ? new Date(String(v)).getTime() : 0);
const iso = (n?: number | null) => (n ? new Date(n).toISOString() : null);

/** Messages d'erreur du serveur (déclencheurs) → phrases de l'app. */
const REASONS: Record<string, string> = {
  regles_non_acceptees: 'Accepte d’abord les règles des forums.',
  profil_inactif: 'Ton profil Communauté est masqué : réactive-le pour écrire.',
  trop_rapide: 'Doucement : attends une minute avant de republier.',
  trop_de_messages: 'Beaucoup de messages en une heure : réessaie plus tard.',
  lien_interdit: 'Les liens ne sont pas autorisés dans les forums.',
  numero_interdit: 'Pas de numéro de téléphone dans un forum.',
  message_introuvable: 'Ce message n’existe plus.',
  mauvais_forum: 'Ce message n’existe plus.',
  photo_interdite: 'Photo refusée.',
  pas_un_running_club: 'Running club introuvable.',
  date_invalide: 'Choisis une date entre une heure et deux mois à l’avance.',
  lieu_prive_interdit: 'Écris un lieu public (parc, gare, stade), jamais une adresse.',
  trop_de_sorties: 'Deux sorties au maximum par organisateur dans un même club.',
  'message impossible': 'Cette personne n’accepte pas de message de ta part pour l’instant.',
  'attends une minute': 'Attends une minute avant d’envoyer un autre message.',
  'message répété': 'Message déjà envoyé plusieurs fois.',
  'attends sa réponse': 'Attends sa réponse avant d’écrire encore.',
  'liens désactivés les premiers jours': 'Les liens sont désactivés les premiers jours.',
  'pas de numéro de téléphone dans un premier échange': 'Pas de numéro de téléphone dans un premier échange.',
  'trois FitMates au maximum': 'Trois FitMates au maximum.',
  'demande déjà traitée': 'Demande déjà traitée.',
  'limite du jour atteinte': 'Tu as déjà beaucoup encouragé aujourd’hui, merci !',
  'déjà encouragé, réessaie plus tard': 'Encouragement déjà envoyé, réessaie plus tard.',
  'vous ne pouvez plus échanger': 'Vous ne pouvez plus échanger.',
  'action impossible': 'Action impossible.',
  'trop de nouvelles discussions aujourd\'hui': 'Tu as ouvert beaucoup de discussions aujourd’hui : réessaie demain.',
  'non connecté': 'Connexion au serveur impossible pour l’instant.',
};

export class ServerRefusal extends Error {}

export function reasonOf(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  for (const [k, v] of Object.entries(REASONS)) if (m.includes(k)) return v;
  if (/fetch|network|Failed|timeout/i.test(m)) return 'Pas de connexion : réessaie dans un instant.';
  if (/duplicate key/i.test(m)) return 'Déjà fait.';
  return 'Le serveur a refusé : ' + m.slice(0, 120);
}

async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new ServerRefusal(error.message);
  return data;
}

// ---------------------------------------------------------------------------------------------- session

/** Compte anonyme FITAIA (aucun e-mail demandé) : l'identifiant est créé une fois puis gardé sur le téléphone. */
export async function ensureSession(c: SupabaseClient): Promise<string> {
  const { data } = await c.auth.getSession();
  if (data.session?.user?.id) return data.session.user.id;
  const r = await c.auth.signInAnonymously();
  if (r.error || !r.data.user) throw new ServerRefusal(r.error?.message ?? 'connexion impossible');
  return r.data.user.id;
}

// ---------------------------------------------------------------------------------------------- profils

/** Profil complet → ligne community_profiles (les points passent par sync_my_points). */
function profileRow(p: CommunityProfile) {
  return {
    display_name: p.displayName.trim().slice(0, 24).padEnd(2, '.'),
    avatar_id: 'membre',
    language: p.language,
    age_range: p.ageRange,
    country_optional: p.countryOptional ?? null,
    timezone: p.timezone,
    utc_offset: Math.max(-12, Math.min(14, p.utcOffset)),
    goal_category: p.goalCategory,
    slots: p.slots,
    activities: p.activities,
    support: p.support,
    last_active_at: new Date().toISOString(),
    profile_visible: p.privacy.profileVisible,
    show_age: p.privacy.showAge,
    show_country: p.privacy.showCountry,
    show_goal: p.privacy.showGoal,
    body_progress: p.privacy.bodyProgress,
    allow_messages: p.privacy.allowMessages,
    allow_fitmatch: p.privacy.allowFitMatch,
    status: p.status ?? null,
    status_at: iso(p.status ? p.statusAt ?? Date.now() : null),
    need: p.need ?? null,
    need_at: iso(p.need ? p.needAt ?? Date.now() : null),
    need_public: !!p.needPublic,
    gender: p.gender ?? null,
    match_with: p.privacy.matchWith ?? 'tous',
  };
}

export async function saveProfile(c: SupabaseClient, me: string, p: CommunityProfile) {
  const row = profileRow(p);
  const existing = await ok(c.from('community_profiles').select('user_id').eq('user_id', me).maybeSingle());
  if (!existing) {
    await ok(c.from('community_profiles').insert({ user_id: me, ...row }));
  } else {
    await ok(c.from('community_profiles').update(row).eq('user_id', me));
  }
  if (p.points > 0) await ok(c.rpc('sync_my_points', { p: Math.round(p.points) }));
}

/** Ma propre ligne (lisible en entier par moi seul). */
function ownProfile(r: Row): CommunityProfile {
  return {
    userId: r.user_id,
    displayName: r.display_name,
    avatarId: 'moi',
    language: r.language,
    ageRange: r.age_range,
    countryOptional: r.country_optional ?? undefined,
    timezone: r.timezone,
    utcOffset: Number(r.utc_offset),
    goalCategory: r.goal_category,
    points: r.points,
    highestHistoricalPoints: r.highest_historical_points,
    slots: r.slots ?? [],
    activities: r.activities ?? [],
    support: r.support ?? [],
    helpfulnessScore: r.helpfulness_score,
    joinedAt: ms(r.joined_at),
    lastActiveAt: ms(r.last_active_at),
    gender: r.gender ?? undefined,
    status: r.status ?? null,
    statusAt: r.status_at ? ms(r.status_at) : undefined,
    need: r.need ?? null,
    needAt: r.need_at ? ms(r.need_at) : undefined,
    needPublic: !!r.need_public,
    privacy: {
      profileVisible: r.profile_visible,
      showAge: r.show_age,
      showCountry: r.show_country,
      showGoal: r.show_goal,
      bodyProgress: r.body_progress,
      allowMessages: r.allow_messages,
      allowFitMatch: r.allow_fitmatch,
      matchWith: r.match_with ?? 'tous',
    },
  };
}

/** Carte publique d'un autre membre (champs déjà masqués par le serveur selon SES réglages). */
function cardProfile(r: Row, now: number): CommunityProfile {
  return {
    userId: r.user_id,
    displayName: r.display_name,
    avatarId: 'membre:' + r.user_id,
    language: r.language as Language,
    ageRange: (r.age_range ?? '25-30') as AgeRange,
    countryOptional: r.country ?? undefined,
    timezone: 'UTC',
    utcOffset: Number(r.utc_offset ?? 0),
    goalCategory: (r.goal_category ?? 'garder') as GoalCategory,
    points: r.level_points ?? 0,
    highestHistoricalPoints: r.level_points ?? 0,
    slots: r.slots ?? [],
    activities: r.activities ?? [],
    support: r.support ?? [],
    helpfulnessScore: r.helpfulness_score ?? 0,
    joinedAt: ms(r.joined_at),
    lastActiveAt: ms(r.last_active_at),
    status: r.status ?? null,
    statusAt: r.status ? now : undefined,
    need: r.need ?? null,
    needAt: r.need ? now : undefined,
    needPublic: !!r.need,
    privacy: {
      ...DEFAULT_PRIVACY,
      profileVisible: true,
      showAge: r.age_range != null,
      showCountry: r.country != null,
      showGoal: r.goal_category != null,
      bodyProgress: r.show_body_progress ? 'public' : 'moi',
      allowMessages: r.allow_messages ?? (r.can_message ? 'tous' : 'amis'),
    },
  };
}

// ---------------------------------------------------------------------------------------------- lecture

export type Pulled = {
  social: SocialState;
  forums: Pick<ForumState, 'rulesAcceptedAt' | 'joined' | 'posts' | 'meetups'>;
};

/** Tout ce que je peux lire, en une fois (le serveur filtre selon les règles d'accès). */
export async function pull(c: SupabaseClient, me: string, now = Date.now()): Promise<Pulled> {
  const [own, cards, friendships, blocks, convs, members, messages, encs, passes, cands, rules, fmembers, posts, reacts, meetups, rsvps] =
    await Promise.all([
      ok(c.from('community_profiles').select('*').eq('user_id', me).maybeSingle()),
      ok(c.from('community_cards').select('*').limit(500)),
      ok(c.from('friendships').select('*')),
      ok(c.from('blocks').select('*')),
      ok(c.from('conversations').select('*')),
      ok(c.from('conversation_members').select('*')),
      ok(c.from('messages').select('*').order('created_at', { ascending: true }).limit(1000)),
      ok(c.from('encouragements').select('*').gte('created_at', new Date(now - 7 * 86400000).toISOString())),
      ok(c.from('fitmatch_passes').select('passed_id')),
      ok(c.rpc('fitmatch_candidates', { lim: 10 })),
      ok(c.from('forum_rules_acceptances').select('accepted_at').eq('user_id', me).maybeSingle()),
      ok(c.from('forum_members').select('forum_id, joined_at').order('joined_at', { ascending: true })),
      ok(c.from('forum_posts').select('*').order('created_at', { ascending: false }).limit(400)),
      ok(c.from('forum_reactions').select('post_id, user_id, reaction')),
      ok(c.from('run_meetups').select('*').gte('start_at', new Date(now - 30 * 86400000).toISOString())),
      ok(c.from('run_rsvps').select('meetup_id, user_id')),
    ]);

  const s = emptyState();
  for (const r of (cards as Row[]) ?? []) if (r.user_id !== me) s.profiles[r.user_id] = cardProfile(r, now);
  if (own) s.profiles[me] = ownProfile(own as Row);

  s.friendships = ((friendships as Row[]) ?? []).map((f): Friendship => ({
    id: f.id, userA: f.user_a, userB: f.user_b, status: f.status, relationshipType: f.relationship_type as RelationshipType, createdAt: ms(f.created_at),
  }));
  s.blocks = ((blocks as Row[]) ?? []).map((b) => ({ blockerId: b.blocker_id, blockedId: b.blocked_id, createdAt: ms(b.created_at) }));

  const byConv: Record<string, string[]> = {};
  for (const m of (members as Row[]) ?? []) (byConv[m.conversation_id] ??= []).push(m.user_id);
  for (const cv of (convs as Row[]) ?? []) {
    const conv: Conversation = { id: cv.id, type: cv.type, members: byConv[cv.id] ?? [], createdAt: ms(cv.created_at), updatedAt: ms(cv.updated_at) };
    s.conversations[cv.id] = conv;
    s.messages[cv.id] = [];
  }
  for (const m of (messages as Row[]) ?? []) {
    const msg: Message = {
      id: m.id, conversationId: m.conversation_id, senderId: m.sender_id, type: m.type as MessageType, content: m.content, createdAt: ms(m.created_at), moderationState: m.moderation_state,
    };
    (s.messages[m.conversation_id] ??= []).push(msg);
  }
  s.encouragements = ((encs as Row[]) ?? []).map((e) => ({ from: e.from_id, to: e.to_id, createdAt: ms(e.created_at) }));
  s.passed[me] = ((passes as Row[]) ?? []).map((p) => p.passed_id);
  s.suggested = ((cands as Row[]) ?? []).map((x): FitMatchCandidate => ({
    userId: x.candidate_id, compatibilityScore: x.compatibility_score, reasonCodes: (x.reason_codes ?? []) as ReasonCode[], generatedAt: now,
  }));

  // forums
  const postRows = (posts as Row[]) ?? [];
  const paths = postRows.map((p) => p.photo_path).filter(Boolean) as string[];
  const urls: Record<string, string> = {};
  if (paths.length) {
    const { data } = await c.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 6 * 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
  }
  const reactions: Record<string, Partial<Record<ReactionId, string[]>>> = {};
  for (const r of (reacts as Row[]) ?? []) ((reactions[r.post_id] ??= {})[r.reaction as ReactionId] ??= []).push(r.user_id);
  const going: Record<string, string[]> = {};
  for (const r of (rsvps as Row[]) ?? []) (going[r.meetup_id] ??= []).push(r.user_id);

  const forumPosts: ForumPost[] = postRows
    .map((p): ForumPost => ({
      id: p.id,
      forumId: p.forum_id,
      authorId: p.author_id,
      text: p.content ?? '',
      photoUri: p.photo_path ? urls[p.photo_path] : undefined,
      createdAt: ms(p.created_at),
      state: p.state,
      tag: (p.tag ?? undefined) as PostTag | undefined,
      parentId: p.parent_id ?? undefined,
      reactions: reactions[p.id],
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
  const runs: RunMeetup[] = ((meetups as Row[]) ?? []).map((m) => ({
    id: m.id, forumId: m.forum_id, organizerId: m.organizer_id, startAt: ms(m.start_at), everyTwoWeeks: m.every_two_weeks, place: m.place,
    distanceKm: Number(m.distance_km), pace: m.pace as Pace, going: going[m.id] ?? [], createdAt: ms(m.created_at), cancelled: m.cancelled || undefined,
  }));

  return {
    social: s,
    forums: {
      rulesAcceptedAt: rules ? ms((rules as Row).accepted_at) : null,
      joined: ((fmembers as Row[]) ?? []).map((f) => f.forum_id),
      posts: forumPosts,
      meetups: runs,
    },
  };
}

// ---------------------------------------------------------------------------------------------- actions sociales

export const pass = (c: SupabaseClient, me: string, other: string) =>
  ok(c.from('fitmatch_passes').upsert({ user_id: me, passed_id: other }, { ignoreDuplicates: true }));

export async function requestFriend(c: SupabaseClient, me: string, other: string, type: RelationshipType) {
  const mine = (await ok(c.from('friendships').select('*'))) as Row[];
  const pending = mine.find((f) => f.user_a === other && f.user_b === me && f.status === 'en_attente');
  if (pending) return respondFriend(c, pending.id, true);
  await ok(c.from('friendships').insert({ user_a: me, user_b: other, relationship_type: type, status: 'en_attente' }));
}

export const respondFriend = (c: SupabaseClient, id: string, accept: boolean) =>
  ok(c.from('friendships').update({ status: accept ? 'accepte' : 'refuse' }).eq('id', id));

export const encourage = (c: SupabaseClient, me: string, other: string) => ok(c.from('encouragements').insert({ from_id: me, to_id: other }));

export async function send(c: SupabaseClient, me: string, other: string, content: string, type: MessageType = 'texte') {
  const conv = (await ok(c.rpc('start_conversation', { other }))) as string;
  await ok(c.from('messages').insert({ conversation_id: conv, sender_id: me, type, content: content.trim() }));
  return conv;
}

export const block = (c: SupabaseClient, me: string, other: string) =>
  ok(c.from('blocks').upsert({ blocker_id: me, blocked_id: other }, { ignoreDuplicates: true }));

export const unblock = (c: SupabaseClient, me: string, other: string) => ok(c.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', other));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const report = (c: SupabaseClient, me: string, target: string, reason: ReportReason, messageId?: string) =>
  ok(c.from('reports').insert({ reporter_id: me, target_user_id: target, reason, message_id_optional: messageId && UUID.test(messageId) ? messageId : null }));

// ---------------------------------------------------------------------------------------------- forums

export const acceptRules = (c: SupabaseClient, me: string) =>
  ok(c.from('forum_rules_acceptances').upsert({ user_id: me }, { ignoreDuplicates: true }));

export const joinForum = (c: SupabaseClient, me: string, forumId: string) =>
  ok(c.from('forum_members').upsert({ forum_id: forumId, user_id: me }, { ignoreDuplicates: true }));

export const leaveForum = (c: SupabaseClient, me: string, forumId: string) => ok(c.from('forum_members').delete().eq('forum_id', forumId).eq('user_id', me));

/** Photo du téléphone → stockage privé (<mon id>/<nom>.jpg). */
async function uploadPhoto(c: SupabaseClient, me: string, uri: string): Promise<string> {
  const res = await fetch(uri);
  const buf = await res.arrayBuffer();
  const type = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const path = me + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + ext;
  const { error } = await c.storage.from(PHOTO_BUCKET).upload(path, buf, { contentType: type, upsert: false });
  if (error) throw new ServerRefusal(error.message);
  return path;
}

export async function post(c: SupabaseClient, me: string, forumId: string, text: string, photoUri?: string, opts?: { tag?: PostTag; parentId?: string }) {
  const photo_path = photoUri && !opts?.parentId ? await uploadPhoto(c, me, photoUri) : null;
  await ok(
    c.from('forum_posts').insert({
      forum_id: forumId, author_id: me, content: text.trim(), photo_path, tag: opts?.parentId ? null : opts?.tag ?? null, parent_id: opts?.parentId ?? null,
    }),
  );
}

export async function toggleReaction(c: SupabaseClient, me: string, postId: string, r: ReactionId, had: boolean) {
  if (had) await ok(c.from('forum_reactions').delete().eq('post_id', postId).eq('user_id', me).eq('reaction', r));
  else await ok(c.from('forum_reactions').upsert({ post_id: postId, user_id: me, reaction: r }, { ignoreDuplicates: true }));
}

const FORUM_REASONS = new Set(['harcelement', 'spam', 'contenu_inapproprie', 'conseil_dangereux', 'faux_profil', 'autre']);

export const reportPost = (c: SupabaseClient, me: string, postId: string, reason: string) =>
  ok(c.from('forum_reports').upsert({ post_id: postId, reporter_id: me, reason: FORUM_REASONS.has(reason) ? reason : 'autre' }, { ignoreDuplicates: true }));

export async function proposeRun(c: SupabaseClient, me: string, r: { forumId: string; startAt: number; everyTwoWeeks: boolean; place: string; distanceKm: number; pace: Pace }) {
  const row = (await ok(
    c.from('run_meetups').insert({
      forum_id: r.forumId, organizer_id: me, start_at: new Date(r.startAt).toISOString(), every_two_weeks: r.everyTwoWeeks, place: r.place.trim(), distance_km: r.distanceKm, pace: r.pace,
    }).select('id').single(),
  )) as Row;
  await ok(c.from('run_rsvps').insert({ meetup_id: row.id, user_id: me }));
  await joinForum(c, me, r.forumId);
}

export async function setGoing(c: SupabaseClient, me: string, meetupId: string, going: boolean) {
  if (going) await ok(c.from('run_rsvps').upsert({ meetup_id: meetupId, user_id: me }, { ignoreDuplicates: true }));
  else await ok(c.from('run_rsvps').delete().eq('meetup_id', meetupId).eq('user_id', me));
}

export const cancelRun = (c: SupabaseClient, me: string, id: string) => ok(c.from('run_meetups').update({ cancelled: true }).eq('id', id).eq('organizer_id', me));

// ---------------------------------------------------------------------------------------------- compte

/** Supprime le compte Communauté et TOUT ce qui s'y rattache (photos comprises), puis se déconnecte. */
export async function deleteAccount(c: SupabaseClient, me: string) {
  const { data } = await c.storage.from(PHOTO_BUCKET).list(me, { limit: 1000 });
  const files = (data ?? []).map((f) => me + '/' + f.name);
  if (files.length) await c.storage.from(PHOTO_BUCKET).remove(files);
  await ok(c.rpc('delete_my_account'));
  await c.auth.signOut();
}
