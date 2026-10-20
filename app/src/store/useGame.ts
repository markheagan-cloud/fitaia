/**
 * État global FITAIA — port de la logique DCLogic de Main.dc.html, enrichi :
 * journal du jour (calories, défis, repas, poids) + persistance. Les gains (Points FITAIA, Fitcoins) ne sont JAMAIS
 * calculés ici : chaque action est déclarée au backend (useEco), qui décide (règles, plafonds, idempotence).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CUR_NAMES, MEALS, Meal, MealEntry, OTHER_DEFIS, fmtKg } from '@/data/content';
import { DayStats, LedgerEntry, RULES, activeDaysThisWeek, dayKey, streak } from './economy';
import { LegacyEconomy, useEco } from './useEco';
import type { SelfActionType } from '@/progression/types';
import { CharacterSheet, DEFAULT_SHEET } from '@/data/character';
import { coachAnswer } from '@/coach/brain';
import { DEFAULT_PROFILE, Profile, WeightEntry, currentWeight, dailyGoal, logWeight, stats as computeStats, tiers } from './profile';

export type ToastKind = 'ok' | 'bad';
export type FbKind = 'info' | 'good' | 'bad';
export type ChatMsg = { from: 'me' | 'coach'; text: string };

type Persisted = {
  /** Ancienne économie du téléphone en attente de conversion dans le registre (null une fois convertie). */
  legacy: LegacyEconomy | null;
  goal: number;
  burned: number;
  eaten: number;
  p: number;
  g: number;
  l: number;
  pushDone: boolean;
  day: string;
  history: Record<string, DayStats>;
  /** Journal des repas par jour (les totaux du jour en sont la somme). */
  meals: Record<string, MealEntry[]>;
  extraDone: Record<string, string[]>; // jour → ids des défis bonus validés
  avatar: { uri: string; outfit: string; createdAt: number } | null; // perso dessiné depuis le selfie
  character: CharacterSheet; // fiche du créateur (gratuit, illimité)
  characterReady: boolean; // le perso FITAIA Studio (vectoriel) remplace l'image par défaut
  profile: Profile; // sexe, âge, taille, poids de départ, objectif, activité, rythme
  onboarded: boolean; // profil renseigné au premier lancement
  firstWinAt: number; // premier défi réussi
  weights: WeightEntry[]; // journal de poids (jour → kg)
  pushTotal: number; // pompes validées, cumul
  mealsTotal: number; // repas enregistrés, cumul
  selfieUri: string | null; // selfie conservé sur l'appareil uniquement (ressemblance)
  chat: ChatMsg[];
};

type Transient = {
  reps: number;
  attempt: number;
  running: boolean;
  feedback: string;
  fbKind: FbKind;
  phase: 0 | 1;
  scanned: boolean;
  mealIdx: number;
  customMeal: Meal | null;
  selfieStep: 0 | 1;
  toast: string;
  toastKind: ToastKind;
  toastId: number;
  coachOpen: boolean;
  typing: boolean;
  draft: string;
  hydrated: boolean;
};

type Actions = {
  rollover: () => void;
  say: (msg: string, kind?: ToastKind) => void;
  hideToast: () => void;
  openCoach: () => void;
  closeCoach: () => void;
  setDraft: (v: string) => void;
  ask: (q: string) => void;
  startPush: (onDone: () => void) => void;
  /** Mode caméra réel : démarrage, mise à jour, fin. */
  pushBeginReal: () => void;
  pushUpdate: (reps: number, feedback: string, kind: FbKind) => void;
  pushFinish: (rejected: number) => void;
  pushAbort: () => void;
  resetScan: () => void;
  doScan: () => void;
  nextMeal: () => void;
  setCustomMeal: (m: Meal | null) => void;
  addMeal: () => void;
  /** Modifie un repas du jour (nom, calories, macros) ; les totaux suivent. */
  updateMeal: (id: string, patch: Partial<Pick<Meal, 'name' | 'kcal' | 'p' | 'g' | 'l' | 'score'>>) => void;
  /** Retire un repas du jour (les points déjà accordés restent : ils sont plafonnés par jour côté serveur). */
  removeMeal: (id: string) => void;
  doSelfie: (onDone: () => void) => void;
  completeExtra: (id: string) => boolean;
  setAvatar: (a: { uri: string; outfit: string; createdAt: number } | null) => void;
  setCharacter: (c: CharacterSheet) => void;
  setProfile: (p: Partial<Profile>) => void;
  finishOnboarding: (p: Profile, kg: number) => void;
  addWeight: (kg: number) => void;
  setGoal: (kcal: number) => void;
  setSelfieUri: (u: string | null) => void;
  stopTimers: () => void;
};

export type GameState = Persisted & Transient & Actions;

let toastT: ReturnType<typeof setTimeout> | undefined;
let typeT: ReturnType<typeof setTimeout> | undefined;
let pushT: ReturnType<typeof setInterval> | undefined;
let selfieT: ReturnType<typeof setTimeout> | undefined;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Totaux nutritionnels du jour = somme du journal. */
function dayTotals(list: MealEntry[]) {
  return list.reduce((a, m) => ({ eaten: a.eaten + m.kcal, p: a.p + m.p, g: a.g + m.g, l: a.l + m.l }), { eaten: 0, p: 0, g: 0, l: 0 });
}

/** Garde 60 jours de journal sur le téléphone. */
function pruneMeals(meals: Record<string, MealEntry[]>): Record<string, MealEntry[]> {
  const keys = Object.keys(meals).sort();
  return keys.length <= 60 ? meals : Object.fromEntries(keys.slice(-60).map((k) => [k, meals[k]]));
}

const DEFAULT_FEEDBACK ='Pose ton iPhone au sol, de profil, à environ 1,5 m.';

function answer(S: GameState, q: string): string {
  const k = dayKey();
  return coachAnswer(
    {
      goal: S.goal + S.burned,
      eaten: S.eaten,
      burned: S.burned,
      p: S.p,
      g: S.g,
      l: S.l,
      earn: useEco.getState().wallet?.balance ?? 0,
      streak: streak(S.history),
      activeDays: activeDaysThisWeek(S.history),
      pushDone: S.pushDone,
      mealsToday: S.history[k]?.meals ?? 0,
      weights: S.weights,
      startKg: S.profile.startKg,
      targetKg: S.profile.targetKg,
      tier: tiers(S.profile, S.weights),
      autoGoal: S.profile.autoGoal,
      hour: new Date().getHours(),
    },
    q,
  );
}

export const useGame = create<GameState>()(
  persist(
    (set, get) => {
      /** Compte l'activité du jour (série, jours actifs, niveau) : aucune monnaie ici. */
      const logDay = (d: Partial<DayStats>) => {
        const S = get();
        const k = dayKey();
        const prev = S.history[k] ?? { challenges: 0, meals: 0, earned: 0 };
        set({ history: { ...S.history, [k]: { challenges: prev.challenges + (d.challenges ?? 0), meals: prev.meals + (d.meals ?? 0), earned: prev.earned } } });
      };

      /** Déclare l'action au backend puis annonce ce qu'il a réellement accordé (PF, Fitcoins). */
      const reward = (action: SelfActionType, sourceId: string, label: string) => {
        void useEco
          .getState()
          .award(action, sourceId)
          .then((r) => {
            const gains = [r.points ? '+' + r.points + ' PF' : '', r.coins ? '+' + r.coins + ' ' + CUR_NAMES[0] : ''].filter(Boolean).join(', ');
            get().say(r.message ? label + ' · ' + r.message : label + (gains ? ' · ' + gains : ''), r.message ? 'bad' : 'ok');
          })
          .catch(() => get().say(label + ' · récompense non enregistrée, réessaie plus tard', 'bad'));
      };

      return {
        // --- persistant ---
        legacy: null,
        goal: 2100,
        burned: 0,
        eaten: 0,
        p: 0,
        g: 0,
        l: 0,
        pushDone: false,
        day: dayKey(),
        history: {},
        meals: {},
        extraDone: {},
        avatar: null,
        character: DEFAULT_SHEET,
        characterReady: false,
        profile: DEFAULT_PROFILE,
        onboarded: false,
        firstWinAt: 0,
        weights: [],
        pushTotal: 0,
        mealsTotal: 0,
        selfieUri: null,
        chat: [{ from: 'coach', text: 'Salut, moi c’est Fito. Pose-moi n’importe quelle question sur ta nutrition, tes entraînements ou ta progression.' }],
        // --- transitoire ---
        reps: 0,
        attempt: 0,
        running: false,
        feedback: DEFAULT_FEEDBACK,
        fbKind: 'info',
        phase: 0,
        scanned: false,
        mealIdx: 0,
        customMeal: null,
        selfieStep: 0,
        toast: '',
        toastKind: 'ok',
        toastId: 0,
        coachOpen: false,
        typing: false,
        draft: '',
        hydrated: false,

        rollover: () => {
          const S = get();
          const k = dayKey();
          if (S.day === k) return;
          set({
            day: k,
            eaten: 0,
            burned: 0,
            p: 0,
            g: 0,
            l: 0,
            pushDone: false,
            reps: 0,
            attempt: 0,
            running: false,
            feedback: DEFAULT_FEEDBACK,
            fbKind: 'info',
            phase: 0,
            scanned: false,
          });
        },

        say: (msg, kind = 'ok') => {
          if (toastT) clearTimeout(toastT);
          set((s) => ({ toast: msg, toastKind: kind, toastId: s.toastId + 1 }));
          toastT = setTimeout(() => set({ toast: '' }), 2800);
        },
        hideToast: () => set({ toast: '' }),

        openCoach: () => set({ coachOpen: true }),
        closeCoach: () => set({ coachOpen: false }),
        setDraft: (v) => set({ draft: v }),
        ask: (q) => {
          const S = get();
          const text = (q || '').trim();
          if (!text || S.typing) return;
          set({ chat: S.chat.concat([{ from: 'me', text }]).slice(-60), typing: true, draft: '' });
          if (typeT) clearTimeout(typeT);
          typeT = setTimeout(() => {
            const s = get();
            set({ typing: false, chat: s.chat.concat([{ from: 'coach', text: answer(s, text) }]).slice(-60) });
          }, 1100);
        },

        pushBeginReal: () => {
          const S = get();
          if (S.running || S.pushDone) return;
          set({ running: true, reps: 0, attempt: 0, phase: 0, feedback: 'Place-toi de profil, corps entier visible.', fbKind: 'info' });
        },
        pushUpdate: (reps, feedback, kind) => set({ reps, feedback, fbKind: kind, phase: reps % 2 === 1 ? 1 : 0 }),
        pushAbort: () => {
          if (pushT) clearInterval(pushT);
          set({ running: false, reps: 0, attempt: 0, phase: 0, feedback: 'Défi arrêté. Rien n’est compté, tu peux recommencer quand tu veux.', fbKind: 'info' });
        },
        pushFinish: (rejected) => {
          const s = get();
          if (!s.running) return;
          set({ phase: 0, reps: 5, running: false, pushDone: true, burned: s.burned + RULES.challengeBurn, feedback: 'Défi réussi. 5 pompes complètes' + (rejected ? ', ' + rejected + ' refusée' + (rejected > 1 ? 's' : '') : '') + '.', fbKind: 'good' });
          logDay({ challenges: 1 });
          set({ pushTotal: get().pushTotal + 5, firstWinAt: get().firstWinAt || Date.now() });
          reward('challenge_completed', 'pushups:' + dayKey(), 'Défi du jour réussi');
        },

        startPush: (onDone) => {
          const S = get();
          if (S.running) return;
          if (S.pushDone) {
            onDone();
            return;
          }
          set({ running: true, reps: 0, attempt: 0, phase: 0, feedback: 'Corps détecté, 19 points suivis. Vas-y.', fbKind: 'info' });
          if (pushT) clearInterval(pushT);
          pushT = setInterval(() => {
            const s = get();
            if (s.phase === 0) {
              set({ phase: 1 });
              return;
            }
            const attempt = s.attempt + 1;
            if (attempt === 3) {
              set({ phase: 0, attempt, feedback: 'Pas comptée : descends jusqu’à 90° aux coudes.', fbKind: 'bad' });
              return;
            }
            const reps = s.reps + 1;
            if (reps >= 5) {
              if (pushT) clearInterval(pushT);
              // démonstration (pas de caméra) : rien n'est crédité ni compté, le vrai défi reste à faire
              set({ phase: 0, attempt, reps: 0, running: false, feedback: 'Démo terminée. Avec la caméra, tes vraies pompes sont comptées et récompensées.', fbKind: 'info' });
              get().say('Démo : aucune récompense sans la caméra', 'bad');
              return;
            }
            set({ phase: 0, attempt, reps, feedback: 'Pompe ' + reps + ' validée, amplitude complète.', fbKind: 'good' });
          }, 650);
        },

        resetScan: () => set({ scanned: false, customMeal: null }),
        doScan: () => set({ scanned: true, customMeal: null }),
        nextMeal: () => set((s) => ({ mealIdx: (s.mealIdx + 1) % MEALS.length, customMeal: null })),
        setCustomMeal: (m) => set({ customMeal: m, scanned: !!m }),
        addMeal: () => {
          const S = get();
          // seul un vrai repas (recherche, code-barres, saisie) entre au journal : les exemples ne comptent jamais
          if (!S.customMeal) {
            S.say('Exemple : rien n’est ajouté au journal', 'bad');
            return;
          }
          const meal = S.customMeal;
          const k = dayKey();
          const entry: MealEntry = { ...meal, id: uid(), at: Date.now() };
          const today = [...(S.meals[k] ?? []), entry];
          set({
            ...dayTotals(today),
            meals: pruneMeals({ ...S.meals, [k]: today }),
            mealsTotal: S.mealsTotal + 1,
            scanned: false,
            customMeal: null,
          });
          logDay({ meals: 1 });
          reward('meal_logged', 'meal:' + entry.id, meal.name + ' ajouté');
          // Défi bonus « Scanner 2 repas » : validé automatiquement avec les vrais repas du jour
          const mealsToday = get().history[dayKey()]?.meals ?? 0;
          const mealsDefi = OTHER_DEFIS.find((x) => x.kind === 'meals');
          if (mealsDefi && mealsToday >= mealsDefi.target) setTimeout(() => get().completeExtra(mealsDefi.id), 3000);
        },

        updateMeal: (id, patch) => {
          const S = get();
          const k = dayKey();
          const today = (S.meals[k] ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m));
          set({ ...dayTotals(today), meals: { ...S.meals, [k]: today } });
        },
        removeMeal: (id) => {
          const S = get();
          const k = dayKey();
          const list = S.meals[k] ?? [];
          if (!list.some((m) => m.id === id)) return;
          const today = list.filter((m) => m.id !== id);
          const prev = S.history[k];
          set({
            ...dayTotals(today),
            meals: { ...S.meals, [k]: today },
            mealsTotal: Math.max(0, S.mealsTotal - 1),
            history: prev ? { ...S.history, [k]: { ...prev, meals: Math.max(0, prev.meals - 1) } } : S.history,
          });
        },

        /** Valide un défi bonus (une fois par jour) et le déclare au backend. Renvoie true à la première validation du jour. */
        completeExtra: (id) => {
          const S = get();
          const d = OTHER_DEFIS.find((x) => x.id === id);
          if (!d) return false;
          const k = dayKey();
          const done = S.extraDone[k] ?? [];
          if (done.indexOf(id) >= 0) return false;
          set({ extraDone: { ...S.extraDone, [k]: done.concat([id]) } });
          logDay({ challenges: 1 });
          reward('challenge_completed', 'extra:' + id + ':' + k, d.name);
          return true;
        },

        setAvatar: (a) => set({ avatar: a }),
        setCharacter: (c) => set({ character: c, characterReady: true }),
        setProfile: (patch) => {
          const S = get();
          const profile = { ...S.profile, ...patch };
          const goal = profile.autoGoal ? dailyGoal(profile, currentWeight(profile, S.weights)) : S.goal;
          set({ profile, goal });
        },
        finishOnboarding: (p, kg) => {
          const weights = logWeight([], dayKey(), kg);
          const profile = { ...p, startKg: weights[0].kg, autoGoal: true };
          set({ profile, weights, onboarded: true, goal: dailyGoal(profile, weights[0].kg) });
        },
        addWeight: (kg) => {
          const S = get();
          const weights = logWeight(S.weights, dayKey(), kg);
          const profile = S.weights.length === 0 && S.profile.startKg === DEFAULT_PROFILE.startKg ? { ...S.profile, startKg: weights[0].kg } : S.profile;
          const goal = profile.autoGoal ? dailyGoal(profile, currentWeight(profile, weights)) : S.goal;
          set({ weights, profile, goal });
          const t = tiers(profile, weights);
          get().say(t.reached ? 'Objectif atteint : ' + fmtKg(profile.targetKg) + ' kg' : 'Poids enregistré · palier ' + t.current + ', encore ' + fmtKg(t.toNext) + ' kg', 'ok');
        },
        setGoal: (kcal) => set((s) => ({ goal: Math.max(800, Math.round(kcal)), profile: { ...s.profile, autoGoal: false } })),
        setSelfieUri: (u) => set({ selfieUri: u }),

        doSelfie: (onDone) => {
          const S = get();
          if (S.selfieStep === 1) return;
          set({ selfieStep: 1 });
          if (selfieT) clearTimeout(selfieT);
          selfieT = setTimeout(() => {
            set({ selfieStep: 0 });
            onDone();
            get().say('Ton perso est prêt', 'ok');
          }, 1800);
        },

        stopTimers: () => {
          if (toastT) clearTimeout(toastT);
          if (typeT) clearTimeout(typeT);
          if (pushT) clearInterval(pushT);
          if (selfieT) clearTimeout(selfieT);
        },
      };
    },
    {
      name: 'fitaia-v1',
      version: 11,
      // v2 : FIT Crédits à l'échelle des centaines (×10) (ancienne échelle).
      migrate: (persisted, version) => {
        // champs des anciennes versions, lus seulement pour les convertir
        const s = (persisted ?? {}) as Partial<Persisted> & { earn?: number; owned?: string[]; equipped?: string; ledger?: LedgerEntry[] };
        if (version < 2) {
          const x10 = (n: number | undefined) => Math.round((n ?? 0) * 10);
          const history: Record<string, DayStats> = {};
          for (const [k, v] of Object.entries(s.history ?? {})) history[k] = { ...v, earned: x10(v.earned) };
          return {
            ...s,
            earn: x10(s.earn),
            history,
            ledger: (s.ledger ?? []).map((e) => (e.cur === 'earn' ? { ...e, amount: x10(e.amount) } : e)),
          } as Persisted;
        }
        if (version < 3) s.character = s.character ?? DEFAULT_SHEET;
        if (version < 4) s.characterReady = s.characterReady ?? false;
        if (version < 5) {
          s.profile = s.profile ?? DEFAULT_PROFILE;
          s.weights = s.weights ?? [];
          s.pushTotal = s.pushTotal ?? 0;
          s.mealsTotal = s.mealsTotal ?? 0;
        }
        if (version < 6) s.onboarded = s.onboarded ?? true; // les installations existantes gardent leurs données
        if (version < 7) s.firstWinAt = s.firstWinAt ?? 0;
        if (version < 6 && s.profile && s.profile.autoGoal) s.goal = dailyGoal(s.profile, currentWeight(s.profile, s.weights ?? []));
        if (version < 9) {
          // v9 : retrait de l'offre payante, du pass et de la monnaie premium (gameplay gratuit, cosmétiques App Store seuls). [ancien-modèle]
          // Les tenues déjà débloquées restent acquises ; les anciennes lignes de monnaie premium sortent du journal.
          const legacy = s as Partial<Persisted> & Record<string, unknown>;
          for (const k of ['prem', 'pass', 'plus', 'plusMonth', 'paywallShownAt']) delete legacy[k]; // [ancien-modèle]
          s.ledger = (s.ledger ?? []).filter((e) => e.cur === 'earn');
        }
        if (version < 10) {
          // v10 : l'économie quitte le téléphone pour le registre Phase 2. Solde, tenues et tenue portée sont mis de côté
          // puis convertis UNE fois par useEco.init (clé d'idempotence migration:v1:<membre>).
          const old = s as Partial<Persisted> & Record<string, unknown>;
          s.legacy = {
            credits: typeof old.earn === 'number' ? old.earn : 0,
            owned: Array.isArray(old.owned) ? (old.owned as string[]) : ['origine'],
            equipped: typeof old.equipped === 'string' ? old.equipped : 'origine',
          };
          for (const k of ['earn', 'owned', 'equipped', 'ledger', 'chestWeek', 'mealsRewardedToday']) delete old[k];
        }
        if (version < 11) {
          // v11 : journal des repas. Les repas d'aujourd'hui enregistrés avant le journal deviennent une entrée de reprise.
          s.meals = {};
          if (s.day && (s.eaten ?? 0) > 0) {
            s.meals[s.day] = [{ id: 'reprise-' + s.day, at: Date.now(), name: 'Repas enregistrés avant le journal', kcal: s.eaten ?? 0, p: s.p ?? 0, g: s.g ?? 0, l: s.l ?? 0, score: 0, items: [], origin: 'manual' }];
          }
        }
        return s as Persisted;
      },
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        legacy: s.legacy,
        goal: s.goal,
        burned: s.burned,
        eaten: s.eaten,
        p: s.p,
        g: s.g,
        l: s.l,
        pushDone: s.pushDone,
        day: s.day,
        history: s.history,
        meals: s.meals,
        extraDone: s.extraDone,
        avatar: s.avatar,
        character: s.character,
        characterReady: s.characterReady,
        profile: s.profile,
        onboarded: s.onboarded,
        firstWinAt: s.firstWinAt,
        weights: s.weights,
        pushTotal: s.pushTotal,
        mealsTotal: s.mealsTotal,
        selfieUri: s.selfieUri,
        chat: s.chat,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.rollover();
        useGame.setState({ hydrated: true });
        // registre Phase 2 : amorçage (tenue de départ) et conversion unique de l'ancienne économie
        void useEco
          .getState()
          .init(state.legacy)
          .then(() => {
            if (useEco.getState().ready) useGame.setState({ legacy: null });
          });
      },
    },
  ),
);

/** Sélecteurs dérivés (équivalent de renderVals). */
export function useCalories() {
  const goal = useGame((s) => s.goal);
  const burned = useGame((s) => s.burned);
  const eaten = useGame((s) => s.eaten);
  const p = useGame((s) => s.p);
  const g = useGame((s) => s.g);
  const l = useGame((s) => s.l);
  const budget = goal + burned;
  const remaining = budget - eaten;
  const ratio = eaten / budget;
  const over = ratio > 1;
  const near = !over && ratio >= 0.85;
  return { budget, remaining, ratio, over, near, eaten, burned, p, g, l };
}

/** Corps : poids actuel, paliers, niveau et stats dérivés de l'historique réel. */
export function useBody() {
  const profile = useGame((s) => s.profile);
  const weights = useGame((s) => s.weights);
  const history = useGame((s) => s.history);
  const pushTotal = useGame((s) => s.pushTotal);
  const mealsTotal = useGame((s) => s.mealsTotal);
  const extraDone = useGame((s) => s.extraDone);
  const now = currentWeight(profile, weights);
  const tier = tiers(profile, weights);
  const st = streak(history);
  const extras = Object.values(extraDone).reduce((a, d) => a + d.length, 0);
  const sts = computeStats(history, st, mealsTotal, pushTotal, extras);
  return { profile, weights, now, tier, stats: sts, level: sts.level };
}

/** Série, jours actifs de la semaine, défis du jour. */
export function useEconomy() {
  const history = useGame((s) => s.history);
  const st = streak(history);
  const active = activeDaysThisWeek(history);
  const extraDone = useGame((s) => s.extraDone);
  const today = history[dayKey()] ?? { challenges: 0, meals: 0, earned: 0 };
  const doneToday = extraDone[dayKey()] ?? [];
  return { streak: st, activeDays: active, history, today, doneToday };
}
