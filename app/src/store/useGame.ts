/**
 * État global FITAIA — port de la logique DCLogic de Main.dc.html, enrichi :
 * économie intelligente (journée réelle, plafonds, série, coffre hebdo, grand livre) + persistance.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CUR_NAMES, MEALS, Meal, OTHER_DEFIS, RARITY, SKINS, Skin, fmt, fmtKg } from '@/data/content';
import { DayStats, LedgerEntry, RULES, activeDaysThisWeek, dayKey, mealReward, streak, streakBonus, weekKey } from './economy';
import { CharacterSheet, DEFAULT_SHEET } from '@/data/character';
import { coachAnswer } from '@/coach/brain';
import { DEFAULT_PROFILE, Profile, WeightEntry, currentWeight, dailyGoal, logWeight, stats as computeStats, tiers } from './profile';

export type ToastKind = 'ok' | 'bad';
export type FbKind = 'info' | 'good' | 'bad';
export type ChatMsg = { from: 'me' | 'coach'; text: string };

type Persisted = {
  earn: number;
  owned: string[];
  equipped: string;
  goal: number;
  burned: number;
  eaten: number;
  p: number;
  g: number;
  l: number;
  pushDone: boolean;
  mealsRewardedToday: number;
  day: string;
  history: Record<string, DayStats>;
  ledger: LedgerEntry[];
  chestWeek: string; // semaine du dernier coffre récupéré
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
  burst: { id: number; amount: number; cur: 'earn' }; // pluie de crédits (FX) à chaque gain
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
  skinAct: (sk: Skin) => void;
  resetScan: () => void;
  doScan: () => void;
  nextMeal: () => void;
  setCustomMeal: (m: Meal | null) => void;
  addMeal: () => void;
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
      earn: S.earn,
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
      /** Enregistre une transaction et met à jour les soldes + le jour. */
      const credit = (amount: number, cur: 'earn', reason: string, dayStats?: Partial<DayStats>) => {
        const S = get();
        const k = dayKey();
        const prev = S.history[k] ?? { challenges: 0, meals: 0, earned: 0 };
        const next: DayStats = {
          challenges: prev.challenges + (dayStats?.challenges ?? 0),
          meals: prev.meals + (dayStats?.meals ?? 0),
          earned: prev.earned + (amount > 0 ? amount : 0),
        };
        const entry: LedgerEntry = { id: uid(), ts: Date.now(), amount, cur, reason };
        set({
          earn: S.earn + amount,
          history: { ...S.history, [k]: next },
          ledger: amount !== 0 ? [entry, ...S.ledger].slice(0, 200) : S.ledger,
          burst: amount > 0 ? { id: S.burst.id + 1, amount, cur } : S.burst,
        });
      };

      /** Coffre hebdo : 5 jours actifs → 500 crédits + tenue rare mystère, une fois par semaine. */
      const checkChest = () => {
        const S = get();
        const wk = weekKey();
        if (S.chestWeek === wk) return;
        if (activeDaysThisWeek(S.history) < RULES.chestActiveDays) return;
        const rare = SKINS.filter((s) => s.rarity === 'rare' && S.owned.indexOf(s.id) < 0);
        const gift = rare.length ? rare[Math.floor(Math.random() * rare.length)] : null;
        set({ chestWeek: wk, owned: gift ? S.owned.concat([gift.id]) : S.owned });
        credit(RULES.chestReward, 'earn', 'Coffre de la semaine');
        setTimeout(() => get().say('Coffre de la semaine : +' + fmt(RULES.chestReward) + ' ' + CUR_NAMES[0] + (gift ? ', tenue rare « ' + gift.name + ' » débloquée' : ''), 'ok'), 3000);
      };

      return {
        // --- persistant ---
        earn: 0,
        owned: ['origine'],
        equipped: 'origine',
        goal: 2100,
        burned: 0,
        eaten: 0,
        p: 0,
        g: 0,
        l: 0,
        pushDone: false,
        mealsRewardedToday: 0,
        day: dayKey(),
        history: {},
        ledger: [],
        chestWeek: '',
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
        burst: { id: 0, amount: 0, cur: 'earn' },
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
            mealsRewardedToday: 0,
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
        pushAbort: () => set({ running: false, reps: 0, phase: 0, feedback: DEFAULT_FEEDBACK, fbKind: 'info' }),
        pushFinish: (rejected) => {
          const s = get();
          if (!s.running) return;
          set({ phase: 0, reps: 5, running: false, pushDone: true, burned: s.burned + RULES.challengeBurn, feedback: 'Défi réussi. 5 pompes complètes' + (rejected ? ', ' + rejected + ' refusée' + (rejected > 1 ? 's' : '') : '') + '.', fbKind: 'good' });
          const bonus = streakBonus(streak(get().history) + 1);
          credit(RULES.challengeReward + bonus, 'earn', 'Défi du jour : 5 pompes' + (bonus ? ' (série +' + bonus + ')' : ''), { challenges: 1 });
          set({ pushTotal: get().pushTotal + 5, firstWinAt: get().firstWinAt || Date.now() });
          get().say('+' + (RULES.challengeReward + bonus) + ' ' + CUR_NAMES[0] + ', défi du jour réussi' + (bonus ? ' · bonus de série' : ''), 'ok');
          checkChest();
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

        skinAct: (sk) => {
          const S = get();
          const names = CUR_NAMES;
          if (S.equipped === sk.id) {
            S.say(sk.name + ' est déjà sur ton perso', 'ok');
            return;
          }
          if (S.owned.indexOf(sk.id) >= 0) {
            set({ equipped: sk.id });
            S.say(sk.name + ' équipée', 'ok');
            return;
          }
          if (sk.cur === 'store') {
            // cosmétique vendu par achat intégré Apple : jamais débloqué sans paiement vérifié
            S.say(sk.name + ' arrive avec les achats App Store', 'bad');
            return;
          }
          if (S.earn < sk.price) {
            S.say('Il te manque ' + fmt(sk.price - S.earn) + ' ' + names[0] + '. Fais tes défis du jour.', 'bad');
            return;
          }
          set({ owned: S.owned.concat([sk.id]), equipped: sk.id });
          credit(-sk.price, 'earn', 'Tenue ' + sk.name + ' (' + RARITY[sk.rarity].label + ')');
          S.say(sk.name + ' débloquée et équipée', 'ok');
        },

        resetScan: () => set({ scanned: false, customMeal: null }),
        doScan: () => set({ scanned: true, customMeal: null }),
        nextMeal: () => set((s) => ({ mealIdx: (s.mealIdx + 1) % MEALS.length, customMeal: null })),
        setCustomMeal: (m) => set({ customMeal: m, scanned: !!m }),
        addMeal: () => {
          const S = get();
          const meal = S.customMeal ?? MEALS[S.mealIdx];
          const rewarded = S.mealsRewardedToday < RULES.mealsRewardedPerDay;
          const reward = rewarded ? mealReward(meal.score) : 0;
          set({
            eaten: S.eaten + meal.kcal,
            p: S.p + meal.p,
            g: S.g + meal.g,
            l: S.l + meal.l,
            mealsRewardedToday: S.mealsRewardedToday + (rewarded ? 1 : 0),
            mealsTotal: S.mealsTotal + 1,
            scanned: false,
            customMeal: null,
            mealIdx: S.customMeal ? S.mealIdx : (S.mealIdx + 1) % MEALS.length,
          });
          credit(reward, 'earn', 'Repas : ' + meal.name + ' (score ' + meal.score + ')', { meals: 1 });
          S.say(
            meal.name + ' ajouté' + (reward ? ', +' + reward + ' ' + CUR_NAMES[0] : ' (limite de ' + RULES.mealsRewardedPerDay + ' repas récompensés par jour atteinte)'),
            'ok',
          );
          // Défi bonus « Scanner 2 repas » : validé automatiquement avec les vrais repas du jour
          const mealsToday = get().history[dayKey()]?.meals ?? 0;
          const mealsDefi = OTHER_DEFIS.find((x) => x.kind === 'meals');
          if (mealsDefi && mealsToday >= mealsDefi.target) setTimeout(() => get().completeExtra(mealsDefi.id), 3000);
          checkChest();
        },

        /** Valide un défi bonus (une fois par jour) et crédite sa récompense. Renvoie true si crédité. */
        completeExtra: (id) => {
          const S = get();
          const d = OTHER_DEFIS.find((x) => x.id === id);
          if (!d) return false;
          const k = dayKey();
          const done = S.extraDone[k] ?? [];
          if (done.indexOf(id) >= 0) return false;
          set({ extraDone: { ...S.extraDone, [k]: done.concat([id]) } });
          credit(d.reward, 'earn', 'Défi bonus : ' + d.name, { challenges: 1 });
          get().say('+' + d.reward + ' ' + CUR_NAMES[0] + ' · ' + d.name, 'ok');
          checkChest();
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
      version: 9,
      // v2 : FIT Crédits à l'échelle des centaines (×10) (ancienne échelle).
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<Persisted>;
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
        return s as Persisted;
      },
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        earn: s.earn,
        owned: s.owned,
        equipped: s.equipped,
        goal: s.goal,
        burned: s.burned,
        eaten: s.eaten,
        p: s.p,
        g: s.g,
        l: s.l,
        pushDone: s.pushDone,
        mealsRewardedToday: s.mealsRewardedToday,
        day: s.day,
        history: s.history,
        ledger: s.ledger,
        chestWeek: s.chestWeek,
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

export function useEquippedSkin(): Skin {
  const equipped = useGame((s) => s.equipped);
  return SKINS.find((x) => x.id === equipped) ?? SKINS[0];
}

/** Image du perso : avatar dessiné depuis le selfie s'il existe pour la tenue équipée, sinon la tenue de démo. */
export function useHeroImage(): { source: { uri: string } | Skin['img']; isAvatar: boolean } {
  const skin = useEquippedSkin();
  const avatar = useGame((s) => s.avatar);
  if (avatar && avatar.outfit === skin.id) return { source: { uri: avatar.uri }, isAvatar: true };
  return { source: skin.img, isAvatar: false };
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

/** Série, jours actifs de la semaine, coffre. */
export function useEconomy() {
  const history = useGame((s) => s.history);
  const chestWeek = useGame((s) => s.chestWeek);
  const st = streak(history);
  const active = activeDaysThisWeek(history);
  const extraDone = useGame((s) => s.extraDone);
  const chestClaimed = chestWeek === weekKey();
  const today = history[dayKey()] ?? { challenges: 0, meals: 0, earned: 0 };
  const doneToday = extraDone[dayKey()] ?? [];
  return { streak: st, activeDays: active, chestClaimed, history, today, doneToday };
}
