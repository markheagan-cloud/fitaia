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

export const COMMUNITY_MODE: 'local-demo' | 'serveur' = 'local-demo';

export type Onboarding = {
  displayName: string;
  ageRange: AgeRange;
  goalCategory: GoalCategory;
  language: Language;
  countryOptional?: string;
  slots: Slot[];
  activities: Activity[];
  support: SupportStyle[];
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
};

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

      /** Profils de démonstration : réponse simulée quelques secondes après un message. */
      const scheduleDemoReply = (other: string, convId: string) => {
        if (!DEMO_IDS.has(other)) return;
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

        activate: (o, points) =>
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
              joinedAt: prev?.joinedAt ?? now,
              lastActiveAt: now,
              // retour après « Quitter » : on redevient visible (le reste des réglages est conservé)
              privacy: prev
                ? { ...prev.privacy, profileVisible: true, allowFitMatch: true, allowMessages: prev.privacy.allowMessages === 'personne' ? 'amis' : prev.privacy.allowMessages }
                : DEFAULT_PRIVACY,
            });
            for (const p of demoProfiles(now)) if (!e.s.profiles[p.userId]) e.upsertProfile(p);
            set({ status: 'active' });
          }),

        decline: () => set({ status: 'refuse' }),
        reopen: () => set({ status: 'inconnu' }),

        updatePrivacy: (p) =>
          run((e, me) => {
            const cur = e.s.profiles[me];
            if (cur) e.upsertProfile({ ...cur, privacy: { ...cur.privacy, ...p } });
          }),

        updateMe: (p) =>
          run((e, me) => {
            const cur = e.s.profiles[me];
            if (cur) e.upsertProfile({ ...cur, ...p, userId: me });
          }),

        syncPoints: (points) =>
          run((e, me) => {
            const cur = e.s.profiles[me];
            if (cur) e.upsertProfile({ ...cur, points, lastActiveAt: Date.now() });
          }),

        pass: (id) => run((e, me) => e.pass(me, id)),

        addFriend: (id, fitmate) =>
          run((e, me) => {
            const r = e.requestFriend(me, id, fitmate ? 'fitmate' : 'ami');
            // démonstration : les profils fictifs acceptent automatiquement (simulé)
            if (r.ok && DEMO_IDS.has(id)) {
              const f = e.friendship(me, id);
              if (f) f.status = 'accepte';
            }
            return r;
          }),

        respond: (fid, accept) => run((e, me) => e.respondFriend(me, fid, accept)),

        encourage: (id) => run((e, me) => e.encourage(me, id)),

        send: (id, text, type = 'texte') => {
          const r = run((e, me) => e.send(me, id, text, type));
          if (!r.ok) return r;
          scheduleDemoReply(id, r.conversation.id);
          return { ok: true, conversationId: r.conversation.id };
        },

        block: (id) => run((e, me) => e.block(me, id)),
        unblock: (id) => run((e, me) => e.unblock(me, id)),
        report: (id, reason, messageId) => {
          run((e, me) => e.report(me, id, reason, messageId));
        },

        /** Quitter la Communauté : profil masqué et social désactivé (rien n'est publié). */
        leave: () => {
          run((e, me) => {
            const cur = e.s.profiles[me];
            if (cur) e.upsertProfile({ ...cur, privacy: { ...cur.privacy, profileVisible: false, allowFitMatch: false, allowMessages: 'personne' } });
          });
          set({ status: 'refuse' });
        },

        markRead: (cid) => set({ readAt: { ...get().readAt, [cid]: Date.now() } }),

        visit: () => set({ lastVisitAt: Date.now() }),

        setStatus: (status) =>
          run((e, me) => {
            const cur = e.s.profiles[me];
            if (cur) e.upsertProfile({ ...cur, status, statusAt: status ? Date.now() : undefined });
          }),

        setNeed: (need, shared = false) =>
          run((e, me) => {
            const cur = e.s.profiles[me];
            if (cur) e.upsertProfile({ ...cur, need, needAt: need ? Date.now() : undefined, needPublic: !!need && shared });
          }),

        refreshDemo: () => {
          if (get().status !== 'active') return;
          const now = Date.now();
          const patch = demoRefresh(now, new Date(now).getHours());
          run((e) => {
            for (const [id, p] of Object.entries(patch)) {
              const cur = e.s.profiles[id];
              if (cur?.demo) e.s.profiles[id] = { ...cur, ...p };
            }
          });
        },
      };
    },
    {
      name: 'fitaia-community-v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ status: s.status, myId: s.myId, social: s.social, demoReplyIdx: s.demoReplyIdx, readAt: s.readAt, lastVisitAt: s.lastVisitAt }),
      onRehydrateStorage: () => () => {
        useCommunity.setState({ hydrated: true });
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
