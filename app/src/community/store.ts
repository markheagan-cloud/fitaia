/**
 * Communauté — état local (séparé du store de jeu `fitaia-v1`, pour ne rien casser).
 *
 * MODE ACTUEL : « local + démonstration ». Le moteur social tourne sur le téléphone ; les autres membres sont des
 * profils de démonstration (signalés à l'écran) et leurs réponses sont simulées. Le contrat réseau (tables, règles
 * d'accès, limites) est prêt côté serveur (supabase/migrations/0001_community.sql) mais n'est PAS encore branché :
 * aucune fonction réseau n'est présentée comme opérationnelle.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AgeRange, Activity, CommunityProfile, DEFAULT_PRIVACY, GoalCategory, Language, PrivacySettings, ReportReason, Slot, SupportStyle,
} from './models/types';
import { emptyState, newId, SocialEngine, SocialState } from './services/engine';
import { demoProfiles, demoRefresh, demoReply, DEMO_IDS } from './services/devData';
import type { NeedId, StatusId } from './models/intentions';
import { checkPlace, checkPost, emptyForumState, forumById, toggleReaction } from './models/forums';
import type { ForumState, Pace, PostTag, ReactionId } from './models/forums';
import { DEMO_POST_IDS, demoForumPosts } from './services/demoForums';
import type { MatchWith } from './models/types';

import { SERVER_ENABLED, sb } from './server/client';
import * as api from './server/api';
import { AppState } from 'react-native';

/**
 * « serveur » dès que l'adresse du projet Supabase est fournie (EXPO_PUBLIC_SUPABASE_URL + clé publique) :
 * les autres membres sont de vraies personnes, rien n'est simulé et aucun profil de démonstration n'est ajouté.
 * Sinon « local + démonstration », annoncé à l'écran.
 */
export const COMMUNITY_MODE: 'local-demo' | 'serveur' = SERVER_ENABLED ? 'serveur' : 'local-demo';
const SERVER = COMMUNITY_MODE === 'serveur';

export type Onboarding = {
  displayName: string;
  ageRange: AgeRange;
  goalCategory: GoalCategory;
  language: Language;
  countryOptional?: string;
  slots: Slot[];
  activities: Activity[];
  support: SupportStyle[];
  /** Genre du profil FITAIA (f/m) : sert uniquement au filtre « Me proposer ». */
  gender?: 'f' | 'm';
};

type Result = { ok: boolean; reason?: string };

type State = {
  status: 'inconnu' | 'active' | 'refuse';
  myId: string;
  social: SocialState;
  demoReplyIdx: Record<string, number>;
  /** Dernière lecture de chaque discussion (sur ce téléphone). */
  readAt: Record<string, number>;
  /** Démonstration : réponse simulée en préparation (« écrit… ») jusqu'à cette date, par membre. Non persistant. */
  typingUntil: Record<string, number>;
  /** Dernière visite de l'accueil Communauté (fil « depuis ta dernière visite », retour après absence). */
  lastVisitAt: number | null;
  rev: number;
  hydrated: boolean;
  activate: (o: Onboarding, points: number) => void;
  decline: () => void;
  reopen: () => void;
  updatePrivacy: (p: Partial<PrivacySettings>) => void;
  updateMe: (p: Partial<CommunityProfile>) => void;
  syncPoints: (points: number) => void;
  pass: (id: string) => void;
  addFriend: (id: string, fitmate?: boolean) => Result;
  respond: (friendshipId: string, accept: boolean) => Result;
  encourage: (id: string) => Result;
  send: (id: string, text: string, type?: 'texte' | 'encouragement') => Result & { conversationId?: string };
  block: (id: string) => void;
  unblock: (id: string) => void;
  report: (id: string, reason: ReportReason, messageId?: string) => void;
  leave: () => void;
  markRead: (conversationId: string) => void;
  visit: () => void;
  /** État du jour à côté de mon avatar (null = rien d'affiché). */
  setStatus: (status: StatusId | null) => void;
  /** Besoin du jour (coup de pouce) ; `shared` = visible des personnes proches de mon parcours. */
  setNeed: (need: NeedId | null, shared?: boolean) => void;
  /** Démonstration : présence et état du jour des profils fictifs, recalculés à l'ouverture. */
  refreshDemo: () => void;
  /** Filtre « Me proposer » : tout le monde, seulement des femmes ou seulement des hommes (réciproque). */
  setMatchWith: (w: MatchWith, myGender?: 'f' | 'm') => void;
  /** Serveur réel : dernier refus ou problème réseau à montrer (null = rien). */
  serverError: string | null;
  clearServerError: () => void;
  /** Serveur réel : recharge tout ce que je peux lire (sans effet en mode démonstration). */
  pull: () => Promise<void>;
  /** Supprime le compte Communauté et toutes ses données (serveur compris). */
  deleteAccount: () => Promise<Result>;

  // ---------- forums ouverts et running clubs (mode local + démonstration)
  forums: ForumState;
  acceptForumRules: () => void;
  joinForum: (forumId: string) => void;
  leaveForum: (forumId: string) => void;
  setRunCity: (city: string | null) => void;
  postInForum: (forumId: string, text: string, photoUri?: string, opts?: { tag?: PostTag; parentId?: string }) => Result;
  reactForumPost: (postId: string, r: ReactionId) => void;
  hideForumPost: (postId: string) => void;
  reportForumPost: (postId: string, reason: string) => void;
  proposeRun: (r: { forumId: string; startAt: number; everyTwoWeeks: boolean; place: string; distanceKm: number; pace: Pace }) => Result;
  toggleGoing: (meetupId: string) => void;
  cancelRun: (meetupId: string) => void;
};

/** Ajoute/rafraîchit les messages de démonstration des forums (les miens sont conservés tels quels). */
function withDemoPosts(f: ForumState, now: number): ForumState {
  const mine = f.posts.filter((p) => !DEMO_POST_IDS.has(p.id));
  // mes réactions sur les messages de démonstration sont conservées (seules celles des profils fictifs sont recréées)
  const demo = demoForumPosts(now).map((d) => {
    const old = f.posts.find((p) => p.id === d.id);
    if (!old?.reactions) return d;
    const reactions = { ...d.reactions };
    for (const [r, ids] of Object.entries(old.reactions) as [ReactionId, string[]][]) {
      const extra = (ids ?? []).filter((x) => !x.startsWith('demo_'));
      if (extra.length) reactions[r] = [...(reactions[r] ?? []), ...extra];
    }
    return { ...d, reactions };
  });
  return { ...f, posts: [...demo, ...mine] };
}

const engineOf = (s: SocialState) => new SocialEngine(s);

export const useCommunity = create<State>()(
  persist(
    (set, get) => {
      /** Applique une action du moteur puis publie le nouvel état. */
      const run = <T,>(fn: (e: SocialEngine, me: string) => T): T => {
        const social: SocialState = JSON.parse(JSON.stringify(get().social));
        const e = engineOf(social);
        const out = fn(e, get().myId);
        set({ social: e.s, rev: get().rev + 1 });
        return out;
      };

      // ---------- serveur réel : chaque action est validée ici (réponse immédiate), puis par le serveur, seul juge,
      // dont l'état remplace ensuite la copie du téléphone.
      let queue: Promise<unknown> = Promise.resolve();
      let pulling: Promise<void> | null = null;

      /** Mon identifiant de compte serveur ; la première fois, ma copie locale est renommée avec cet identifiant. */
      const ensureMe = async (): Promise<string> => {
        const uid = await api.ensureSession(sb());
        const cur = get().myId;
        if (cur !== uid) {
          const social: SocialState = JSON.parse(JSON.stringify(get().social));
          const mine = social.profiles[cur];
          if (mine) {
            delete social.profiles[cur];
            social.profiles[uid] = { ...mine, userId: uid };
          }
          set({ myId: uid, social, rev: get().rev + 1 });
        }
        return uid;
      };

      const pullNow = async () => {
        if (!SERVER || get().status !== 'active') return;
        if (pulling) return pulling;
        pulling = (async () => {
          try {
            const me = await ensureMe();
            const r = await api.pull(sb(), me);
            const local = get().social.profiles[me];
            // mon profil pas encore arrivé sur le serveur : on garde la copie locale
            if (!r.social.profiles[me] && local) r.social.profiles[me] = local;
            set({ social: r.social, forums: { ...get().forums, ...r.forums }, rev: get().rev + 1 });
          } catch (e) {
            set({ serverError: api.reasonOf(e) });
          } finally {
            pulling = null;
          }
        })();
        return pulling;
      };

      const remote = (fn: (c: ReturnType<typeof sb>, me: string) => Promise<unknown>) => {
        // rien ne part tant que la personne n'a pas rejoint la Communauté
        if (!SERVER || get().status !== 'active') return;
        queue = queue.then(async () => {
          try {
            const me = await ensureMe();
            await fn(sb(), me);
            if (get().serverError) set({ serverError: null });
          } catch (e) {
            set({ serverError: api.reasonOf(e) });
          }
          await pullNow();
        });
      };

      const pushProfile = () =>
        remote(async (c, me) => {
          const p = get().social.profiles[me];
          if (p) await api.saveProfile(c, me, p);
        });

      /** Profils de démonstration : réponse simulée quelques secondes après un message. */
      const scheduleDemoReply = (other: string, convId: string) => {
        if (SERVER || !DEMO_IDS.has(other)) return;
        const i = get().demoReplyIdx[other] ?? 0;
        const text = demoReply(other, i);
        if (!text) return;
        const delay = 1800 + Math.random() * 1400;
        set({ demoReplyIdx: { ...get().demoReplyIdx, [other]: i + 1 }, typingUntil: { ...get().typingUntil, [other]: Date.now() + delay } });
        setTimeout(() => {
          run((e) => e.receive(other, convId, text));
        }, delay);
      };

      return {
        status: 'inconnu',
        myId: newId('u'),
        social: emptyState(),
        demoReplyIdx: {},
        readAt: {},
        lastVisitAt: null,
        typingUntil: {},
        rev: 0,
        hydrated: false,
        forums: emptyForumState(),
        serverError: null,
        clearServerError: () => set({ serverError: null }),
        pull: pullNow,
        deleteAccount: async () => {
          if (SERVER) {
            try {
              const me = await ensureMe();
              await api.deleteAccount(sb(), me);
            } catch (e) {
              return { ok: false, reason: api.reasonOf(e) };
            }
          }
          set({ status: 'inconnu', myId: newId('u'), social: emptyState(), readAt: {}, forums: emptyForumState(), demoReplyIdx: {}, rev: get().rev + 1 });
          return { ok: true };
        },

        activate: (o, points) => {
          run((e, me) => {
            const now = Date.now();
            const prev = e.s.profiles[me];
            const tzOffset = -new Date().getTimezoneOffset() / 60;
            let tz = 'local';
            try {
              tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'local';
            } catch {}
            e.upsertProfile({
              userId: me,
              displayName: o.displayName.trim().slice(0, 24) || 'Moi',
              avatarId: 'moi',
              language: o.language,
              ageRange: o.ageRange,
              countryOptional: o.countryOptional,
              timezone: tz,
              utcOffset: tzOffset,
              goalCategory: o.goalCategory,
              points,
              highestHistoricalPoints: Math.max(points, prev?.highestHistoricalPoints ?? 0),
              slots: o.slots,
              activities: o.activities,
              support: o.support,
              helpfulnessScore: prev?.helpfulnessScore ?? 0,
              gender: o.gender ?? prev?.gender,
              joinedAt: prev?.joinedAt ?? now,
              lastActiveAt: now,
              // retour après « Quitter » : on redevient visible (le reste des réglages est conservé)
              privacy: prev
                ? { ...prev.privacy, profileVisible: true, allowFitMatch: true, allowMessages: prev.privacy.allowMessages === 'personne' ? 'amis' : prev.privacy.allowMessages }
                : DEFAULT_PRIVACY,
            });
            if (SERVER) {
              set({ status: 'active' });
              return;
            }
            for (const p of demoProfiles(now)) if (!e.s.profiles[p.userId]) e.upsertProfile(p);
            set({ status: 'active', forums: withDemoPosts(get().forums ?? emptyForumState(), now) });
          });
          if (SERVER) pushProfile();
        },

        decline: () => set({ status: 'refuse' }),
        reopen: () => set({ status: 'inconnu' }),

        updatePrivacy: (p) => {
          run((e, me) => {
            const cur = e.s.profiles[me];
            if (cur) e.upsertProfile({ ...cur, privacy: { ...cur.privacy, ...p } });
          });
          pushProfile();
        },

        updateMe: (p) => {
          run((e, me) => {
            const cur = e.s.profiles[me];
            if (cur) e.upsertProfile({ ...cur, ...p, userId: me });
          });
          pushProfile();
        },

        syncPoints: (points) => {
          const before = get().social.profiles[get().myId]?.points;
          run((e, me) => {
            const cur = e.s.profiles[me];
            if (cur) e.upsertProfile({ ...cur, points, lastActiveAt: Date.now() });
          });
          if (before !== points) remote(async (c) => { await c.rpc('sync_my_points', { p: Math.round(points) }); });
        },

        pass: (id) => {
          run((e, me) => e.pass(me, id));
          remote((c, me) => api.pass(c, me, id));
        },

        addFriend: (id, fitmate) =>
          run((e, me) => {
            const r = e.requestFriend(me, id, fitmate ? 'fitmate' : 'ami');
            // démonstration : les profils fictifs acceptent automatiquement (simulé)
            if (r.ok && !SERVER && DEMO_IDS.has(id)) {
              const f = e.friendship(me, id);
              if (f) f.status = 'accepte';
            }
            if (r.ok) remote((c, me2) => api.requestFriend(c, me2, id, fitmate ? 'fitmate' : 'ami'));
            return r;
          }),

        respond: (fid, accept) => {
          const r = run((e, me) => e.respondFriend(me, fid, accept));
          if (r.ok) remote((c) => api.respondFriend(c, fid, accept));
          return r;
        },

        encourage: (id) => {
          const r = run((e, me) => e.encourage(me, id));
          if (r.ok) remote((c, me) => api.encourage(c, me, id));
          return r;
        },

        send: (id, text, type = 'texte') => {
          const r = run((e, me) => e.send(me, id, text, type));
          if (!r.ok) return r;
          remote((c, me) => api.send(c, me, id, text, type));
          scheduleDemoReply(id, r.conversation.id);
          return { ok: true, conversationId: r.conversation.id };
        },

        block: (id) => {
          run((e, me) => e.block(me, id));
          remote((c, me) => api.block(c, me, id));
        },
        unblock: (id) => {
          run((e, me) => e.unblock(me, id));
          remote((c, me) => api.unblock(c, me, id));
        },
        report: (id, reason, messageId) => {
          run((e, me) => e.report(me, id, reason, messageId));
          remote((c, me) => api.report(c, me, id, reason, messageId));
        },

        /** Quitter la Communauté : profil masqué et social désactivé (rien n'est publié). */
        leave: () => {
          run((e, me) => {
            const cur = e.s.profiles[me];
            if (cur) e.upsertProfile({ ...cur, privacy: { ...cur.privacy, profileVisible: false, allowFitMatch: false, allowMessages: 'personne' } });
          });
          pushProfile();
          set({ status: 'refuse' });
        },

        markRead: (cid) => set({ readAt: { ...get().readAt, [cid]: Date.now() } }),

        visit: () => set({ lastVisitAt: Date.now() }),

        setStatus: (status) => {
          run((e, me) => {
            const cur = e.s.profiles[me];
            if (cur) e.upsertProfile({ ...cur, status, statusAt: status ? Date.now() : undefined });
          });
          pushProfile();
        },

        setNeed: (need, shared = false) => {
          run((e, me) => {
            const cur = e.s.profiles[me];
            if (cur) e.upsertProfile({ ...cur, need, needAt: need ? Date.now() : undefined, needPublic: !!need && shared });
          });
          pushProfile();
        },

        refreshDemo: () => {
          if (get().status !== 'active') return;
          if (SERVER) {
            void pullNow();
            return;
          }
          const now = Date.now();
          const patch = demoRefresh(now, new Date(now).getHours());
          run((e) => {
            for (const [id, p] of Object.entries(patch)) {
              const cur = e.s.profiles[id];
              if (cur?.demo) {
                // v2 : les profils fictifs portent un genre (filtre « Me proposer »)
                const fresh = cur.gender ? null : demoProfiles(now).find((d) => d.userId === id);
                e.s.profiles[id] = { ...cur, ...p, ...(fresh ? { gender: fresh.gender } : {}) };
              }
            }
          });
          set({ forums: withDemoPosts(get().forums ?? emptyForumState(), now) });
        },

        setMatchWith: (w, myGender) => {
          run((e, me) => {
            const cur = e.s.profiles[me];
            if (cur) e.upsertProfile({ ...cur, gender: myGender ?? cur.gender, privacy: { ...cur.privacy, matchWith: w } });
          });
          pushProfile();
        },

        acceptForumRules: () => {
          set({ forums: { ...get().forums, rulesAcceptedAt: Date.now() } });
          remote((c, me) => api.acceptRules(c, me));
        },

        joinForum: (id) => {
          const f = get().forums;
          if (!forumById(id) || f.joined.includes(id)) return;
          set({ forums: { ...f, joined: [...f.joined, id] } });
          remote((c, me) => api.joinForum(c, me, id));
        },

        leaveForum: (id) => {
          const f = get().forums;
          set({ forums: { ...f, joined: f.joined.filter((x) => x !== id) } });
          remote((c, me) => api.leaveForum(c, me, id));
        },

        setRunCity: (city) => {
          const f = get().forums;
          set({ forums: { ...f, city } });
        },

        postInForum: (forumId, text, photoUri, opts) => {
          const f = get().forums;
          const me = get().myId;
          if (get().status !== 'active') return { ok: false, reason: 'Rejoins d’abord la Communauté.' };
          if (!forumById(forumId)) return { ok: false, reason: 'Forum introuvable.' };
          if (!f.rulesAcceptedAt) return { ok: false, reason: 'Accepte d’abord les règles des forums.' };
          const now = Date.now();
          const mine = f.posts.filter((p) => p.authorId === me).map((p) => ({ createdAt: p.createdAt, text: p.text }));
          const c = checkPost({ text, hasPhoto: !!photoUri, now, myRecent: mine });
          if (!c.ok) return c;
          let parentId: string | undefined;
          if (opts?.parentId) {
            const parent = f.posts.find((p) => p.id === opts.parentId);
            if (!parent || parent.forumId !== forumId || parent.state === 'masque') return { ok: false, reason: 'Ce message n’existe plus.' };
            parentId = parent.parentId ?? parent.id; // un seul niveau de réponses
          }
          const post = { id: newId('fp', now), forumId, authorId: me, text: text.trim(), photoUri, createdAt: now, state: 'ok' as const, tag: parentId ? undefined : opts?.tag, parentId };
          set({ forums: { ...f, posts: [...f.posts, post], joined: f.joined.includes(forumId) ? f.joined : [...f.joined, forumId] } });
          remote((c, me2) => api.post(c, me2, forumId, text, photoUri, { tag: post.tag, parentId }));
          return { ok: true };
        },

        reactForumPost: (postId, r) => {
          const f = get().forums;
          const me = get().myId;
          const had = !!f.posts.find((p) => p.id === postId)?.reactions?.[r]?.includes(me);
          set({ forums: { ...f, posts: f.posts.map((p) => (p.id === postId ? toggleReaction(p, r, me) : p)) } });
          remote((c, me2) => api.toggleReaction(c, me2, postId, r, had));
        },

        hideForumPost: (postId) => {
          const f = get().forums;
          if (!f.hidden.includes(postId)) set({ forums: { ...f, hidden: [...f.hidden, postId] } });
        },

        reportForumPost: (postId, reason) => {
          const f = get().forums;
          const now = Date.now();
          set({
            forums: {
              ...f,
              reports: [...f.reports, { id: newId('fr', now), postId, reporterId: get().myId, reason, createdAt: now }],
              hidden: f.hidden.includes(postId) ? f.hidden : [...f.hidden, postId],
            },
          });
          remote((c, me) => api.reportPost(c, me, postId, reason));
        },

        proposeRun: (r) => {
          const f = get().forums;
          const me = get().myId;
          const now = Date.now();
          const fo = forumById(r.forumId);
          if (!fo || fo.kind !== 'running') return { ok: false, reason: 'Running club introuvable.' };
          if (!f.rulesAcceptedAt) return { ok: false, reason: 'Accepte d’abord les règles des forums.' };
          if (r.startAt < now + 3600 * 1000) return { ok: false, reason: 'Choisis une date au moins une heure à l’avance.' };
          if (r.startAt > now + 60 * 86400 * 1000) return { ok: false, reason: 'Choisis une date dans les deux prochains mois.' };
          if (!(r.distanceKm >= 1 && r.distanceKm <= 42)) return { ok: false, reason: 'Distance entre 1 et 42 km.' };
          const c = checkPlace(r.place);
          if (!c.ok) return c;
          const mineActive = f.meetups.filter((m) => m.organizerId === me && !m.cancelled && m.forumId === r.forumId);
          if (mineActive.length >= 2) return { ok: false, reason: 'Deux sorties au maximum par organisateur dans un même club.' };
          const meetup = { id: newId('run', now), organizerId: me, going: [me], createdAt: now, ...r, place: r.place.trim() };
          set({ forums: { ...f, meetups: [...f.meetups, meetup], joined: f.joined.includes(r.forumId) ? f.joined : [...f.joined, r.forumId] } });
          remote((c, me2) => api.proposeRun(c, me2, r));
          return { ok: true };
        },

        toggleGoing: (id) => {
          const f = get().forums;
          const me = get().myId;
          const wasGoing = !!f.meetups.find((m) => m.id === id)?.going.includes(me);
          remote((c, me2) => api.setGoing(c, me2, id, !wasGoing));
          set({
            forums: {
              ...f,
              meetups: f.meetups.map((m) => (m.id !== id ? m : { ...m, going: m.going.includes(me) ? m.going.filter((x) => x !== me) : [...m.going, me] })),
            },
          });
        },

        cancelRun: (id) => {
          const f = get().forums;
          const me = get().myId;
          set({ forums: { ...f, meetups: f.meetups.map((m) => (m.id === id && m.organizerId === me ? { ...m, cancelled: true } : m)) } });
          remote((c, me2) => api.cancelRun(c, me2, id));
        },
      };
    },
    {
      name: 'fitaia-community-v1',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      // v2 : forums ouverts et running clubs (absents avant : état vide)
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2 || !p.forums) p.forums = emptyForumState();
        return p as never;
      },
      partialize: (s) => ({ status: s.status, myId: s.myId, social: s.social, demoReplyIdx: s.demoReplyIdx, readAt: s.readAt, lastVisitAt: s.lastVisitAt, forums: s.forums }),
      onRehydrateStorage: () => () => {
        useCommunity.setState({ hydrated: true });
        if (SERVER) void useCommunity.getState().pull();
      },
    },
  ),
);

/** Accès en lecture au moteur pour les écrans (recalculé à chaque changement d'état). */
export function useSocial() {
  const social = useCommunity((s) => s.social);
  const myId = useCommunity((s) => s.myId);
  useCommunity((s) => s.rev);
  const engine = new SocialEngine(social);
  return { engine, myId, me: social.profiles[myId] as CommunityProfile | undefined };
}

/**
 * Serveur réel : rafraîchit la Communauté régulièrement tant que l'app est au premier plan (12 s ; 4 s dans une
 * discussion ouverte). Sans effet en mode démonstration.
 */
export function startCommunitySync(fast = () => false): () => void {
  if (!SERVER) return () => {};
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = async () => {
    if (stopped) return;
    if (AppState.currentState === 'active') await useCommunity.getState().pull();
    timer = setTimeout(tick, fast() ? 4000 : 12000);
  };
  const sub = AppState.addEventListener('change', (st) => {
    if (st === 'active') void useCommunity.getState().pull();
  });
  timer = setTimeout(tick, 1500);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    sub.remove();
  };
}
