/**
 * Points FITAIA (Phase 2) : règles, plafonds quotidiens, interdits, étapes, meilleur niveau historique,
 * remises à zéro hebdomadaire / saisonnière, calendrier serveur, vue Parcours.
 *   node --experimental-strip-types --no-warnings --import ../ts-hook.mjs tests/progression.test.ts
 */
import { DEFAULT_SERVER_CONFIG } from '../src/backend/config';
import { LocalEconomyServer } from '../src/backend/local/LocalEconomyServer';
import type { RewardStatus } from '../src/economy/types';
import { REWARD_DEFINITIONS } from '../src/economy/rewardCatalog';
import { COSMETIC_CATALOG } from '../src/inventory/cosmeticCatalog';
import { addDays, dayKeyIn, isDayKey, seasonKeyOf, weekKeyOf } from '../src/platform/calendar';
import { createEventBus } from '../src/platform/events';
import type { DomainEvent } from '../src/platform/events';
import { createMemoryStorage } from '../src/platform/storage';
import { applyAward, newAccount, normalizeAccount } from '../src/progression/account';
import { buildParcours } from '../src/progression/parcours';
import { cappedPoints, planAward, pointsToday } from '../src/progression/points';
import { ALLOWED_ACTION_TYPES, PROGRESSION_CALENDAR, PROGRESSION_RULES, STAGE_LABELS, STAGES } from '../src/progression/progressionRules';
import { higherStage, nextStage, stageForPoints, validateStages } from '../src/progression/stages';
import type { ProgressionAccount, ProgressionEvent, StageDefinition } from '../src/progression/types';
import { runSuite, sequentialIds, testClock } from './helpers/check';

const AT = '2026-10-05T10:00:00.000Z';
const PERIOD = { weekKey: '2026-10-05', seasonKey: 'S1' };

function event(points: number, over: Partial<ProgressionEvent> = {}): ProgressionEvent {
  return {
    id: 'e',
    userId: 'u',
    actionType: 'challenge_completed',
    sourceId: 's',
    actorId: null,
    points,
    dayKey: '2026-10-05',
    weekKey: '2026-10-05',
    seasonKey: 'S1',
    idempotencyKey: 'k',
    createdAt: AT,
    ...over,
  };
}

runSuite('progression', async (t) => {
  // ---------------------------------------------------------------- règles de la spécification (point 6)
  const r = PROGRESSION_RULES;
  t.ok(r.daily_goal_completed.points === 20 && r.activity_logged.points === 15 && r.meal_logged.points === 5 && r.challenge_completed.points === 50, 'valeurs : objectif +20, activité +15, repas +5, défi +50');
  t.ok(r.encouragement_sent.points === 2 && r.tip_marked_helpful.points === 5, 'valeurs : encouragement +2, conseil « Ça m’aide » +5');
  t.ok(r.meal_logged.dailyCap === 15 && r.encouragement_sent.dailyCap === 10 && r.tip_marked_helpful.dailyCap === 20, 'plafonds : repas 15/j, encouragements 10/j, conseils 20/j');
  t.ok(Object.values(r).every((rule) => rule.dailyCap >= rule.points && Number.isSafeInteger(rule.dailyCap)), 'chaque règle a un plafond quotidien ≥ son gain (aucune action illimitée)');
  t.ok(r.tip_marked_helpful.grantMode === 'peer' && Object.entries(r).filter(([, x]) => x.grantMode === 'peer').length === 1, 'seule l’entraide reçue est accordée par un autre membre');

  // ---------------------------------------------------------------- comportements interdits (point 7)
  t.equal(Object.keys(r).sort(), [...ALLOWED_ACTION_TYPES].sort(), 'les règles ne contiennent que les actions autorisées (liste blanche)');
  const forbidden = /moins|less|skip|saut|fast|jeun|deficit|déficit|weight|poids|kilo|kg|calor|kcal|loss|perte|lose|minceur|extreme|extrême|excess|excès|compar/i;
  t.ok(ALLOWED_ACTION_TYPES.every((a) => !forbidden.test(a)), 'aucune action liée à manger moins, sauter un repas, perte de poids, déficit, excès ou comparaison de kilos');
  t.ok(
    Object.values(r).every((rule) => Object.keys(rule).sort().join(',') === 'dailyCap,dedupe,enabled,grantMode,points,proof'),
    'aucune règle ne dépend d’une quantité (calories, kilos, durée) : montant fixe par action',
  );
  t.ok(r.activity_logged.dailyCap <= 2 * r.activity_logged.points, 'activité plafonnée (pas de prime à l’entraînement excessif)');

  // ---------------------------------------------------------------- étapes du Parcours (point 8)
  t.equal(STAGES.map((s) => [s.id, s.minPoints]), [['declic', 0], ['elan', 500], ['regulier', 1500], ['engage', 3500], ['confirme', 7000], ['pilier', 12000]], 'seuils : Déclic 0, Élan 500, Régulier 1 500, Engagé 3 500, Confirmé 7 000, Pilier 12 000');
  t.equal(STAGES.map((s) => STAGE_LABELS[s.id]), ['Déclic', 'Élan', 'Régulier', 'Engagé', 'Confirmé', 'Pilier'], 'libellés affichés séparés des identifiants internes');
  t.ok(STAGES.every((s) => /^[a-z]+$/.test(s.id)), 'identifiants internes ASCII stables (le texte peut changer sans migration)');
  t.ok(stageForPoints(STAGES, 0).id === 'declic' && stageForPoints(STAGES, 499).id === 'declic' && stageForPoints(STAGES, 500).id === 'elan', 'progression d’étape : 499 → Déclic, 500 → Élan');
  t.ok(stageForPoints(STAGES, 1499).id === 'elan' && stageForPoints(STAGES, 11999).id === 'confirme' && stageForPoints(STAGES, 12000).id === 'pilier' && stageForPoints(STAGES, 10 ** 9).id === 'pilier', 'progression d’étape : bornes 1 499, 11 999, 12 000, très grand');
  t.ok(nextStage(STAGES, 'elan')?.id === 'regulier' && nextStage(STAGES, 'pilier') === null, 'étape suivante');
  t.ok(validateStages(STAGES).length === 0, 'table des étapes cohérente');
  const badStages: StageDefinition[] = [
    { id: 'declic', rank: 1, minPoints: 10 },
    { id: 'elan', rank: 2, minPoints: 5 },
  ];
  t.ok(validateStages(badStages).length === 2, 'table incohérente détectée (premier seuil ≠ 0, seuils décroissants)');

  // ---------------------------------------------------------------- calcul d'une attribution
  const base = { beneficiaryId: 'u', actorId: null, grantMode: 'self' as const, dayKey: '2026-10-05' };
  const plan = planAward(r, { ...base, actionType: 'meal_logged', sourceId: 'meal-1' });
  t.ok(plan.ok && plan.idempotencyKey === 'pf:u:meal_logged:meal-1' && plan.rule.points === 5, 'clé pf:<user>:<action>:<source>');
  const dayPlan = planAward(r, { ...base, actionType: 'daily_goal_completed', sourceId: 'n-importe' });
  t.ok(dayPlan.ok && dayPlan.sourceId === '2026-10-05' && dayPlan.idempotencyKey === 'pf:u:daily_goal_completed:2026-10-05', 'objectif quotidien : source = jour serveur');
  const peerPlan = planAward(r, { beneficiaryId: 'auteur', actorId: 'lecteur', grantMode: 'peer', dayKey: '2026-10-05', actionType: 'tip_marked_helpful', sourceId: 'tip-1' });
  t.ok(peerPlan.ok && peerPlan.idempotencyKey === 'pf:auteur:tip_marked_helpful:tip-1:lecteur', 'entraide : clé incluant le membre qui accorde');
  const selfPeer = planAward(r, { beneficiaryId: 'u', actorId: 'u', grantMode: 'peer', dayKey: '2026-10-05', actionType: 'tip_marked_helpful', sourceId: 'tip-1' });
  t.ok(!selfPeer.ok && selfPeer.code === 'SELF_PEER_FORBIDDEN', 'entraide envers soi-même refusée');
  const proto = planAward(r, { ...base, actionType: '__proto__', sourceId: 'x-1' });
  t.ok(!proto.ok && proto.code === 'UNKNOWN_ACTION', 'nom d’action piégé (__proto__) : inconnu');
  const tooLong = planAward(r, { ...base, actionType: 'meal_logged', sourceId: 'x'.repeat(129) });
  t.ok(!tooLong.ok && tooLong.code === 'INVALID_SOURCE', 'source de plus de 128 caractères : refusée');

  const today = [event(5, { actionType: 'meal_logged' }), event(5, { actionType: 'meal_logged' }), event(5, { actionType: 'meal_logged', dayKey: '2026-10-04' })];
  t.ok(pointsToday(today, 'meal_logged', '2026-10-05') === 10, 'cumul du jour par action (les jours précédents ne comptent pas)');
  t.ok(cappedPoints(r.meal_logged, 10) === 5 && cappedPoints(r.meal_logged, 15) === 0, 'plafond : dernier repas compté puis 0');
  t.ok(cappedPoints({ ...r.meal_logged, dailyCap: 12 }, 10) === 2, 'plafond rééquilibré non multiple : attribution partielle jusqu’au plafond');

  // ---------------------------------------------------------------- compte : permanent, hebdomadaire, saisonnier
  let account: ProgressionAccount = newAccount('u', STAGES, PERIOD, AT);
  const step1 = applyAward(account, event(450), STAGES);
  t.ok(step1.account.lifetimePoints === 450 && step1.stageChange === null, '450 PF : toujours Déclic');
  const step2 = applyAward(step1.account, event(50), STAGES);
  t.ok(step2.account.currentStage === 'elan' && step2.stageChange?.from === 'declic' && step2.stageChange.to === 'elan' && step2.account.highestHistoricalStage === 'elan', '500 PF : passage Déclic → Élan');
  account = step2.account;
  const nextWeek = applyAward(account, event(20, { weekKey: '2026-10-12', dayKey: '2026-10-12' }), STAGES);
  t.ok(nextWeek.account.weeklyPoints === 20 && nextWeek.account.seasonPoints === 520 && nextWeek.account.lifetimePoints === 520, 'nouvelle semaine : hebdomadaire remis à zéro, saison et total conservés');
  const nextSeason = applyAward(nextWeek.account, event(10, { weekKey: '2026-11-30', seasonKey: 'S2', dayKey: '2026-11-30' }), STAGES);
  t.ok(nextSeason.account.seasonPoints === 10 && nextSeason.account.weeklyPoints === 10 && nextSeason.account.lifetimePoints === 530, 'nouvelle saison : saison remise à zéro, total jamais');
  const viewLater = normalizeAccount(nextWeek.account, STAGES, { weekKey: '2026-10-19', seasonKey: 'S1' });
  t.ok(viewLater.weeklyPoints === 0 && viewLater.lifetimePoints === 520 && viewLater.weekKey === '2026-10-19', 'lecture une semaine plus tard : 0 cette semaine, total intact');
  let threw = false;
  try {
    applyAward(account, event(-50), STAGES);
  } catch {
    threw = true;
  }
  t.ok(threw, 'une attribution négative est impossible (la progression permanente ne baisse jamais)');

  // ---------------------------------------------------------------- meilleur niveau historique (point 9)
  const harder: StageDefinition[] = STAGES.map((s) => (s.id === 'elan' ? { ...s, minPoints: 1000 } : s));
  const rebalanced = normalizeAccount(account, harder, PERIOD);
  t.ok(rebalanced.currentStage === 'declic' && rebalanced.highestHistoricalStage === 'elan', 'seuils rééquilibrés : étape courante recalculée, meilleur niveau historique conservé');
  const afterRebalance = applyAward(account, event(10), harder);
  t.ok(afterRebalance.account.highestHistoricalStage === 'elan' && afterRebalance.stageChange?.to === 'declic', 'même après une nouvelle attribution, le niveau historique ne redescend pas');
  t.ok(higherStage(STAGES, 'regulier', 'elan') === 'regulier' && higherStage(STAGES, 'elan', 'regulier') === 'regulier', 'comparaison d’étapes par rang');

  // ---------------------------------------------------------------- calendrier serveur
  t.ok(dayKeyIn('Europe/Paris', new Date('2026-10-04T21:59:00Z')) === '2026-10-04' && dayKeyIn('Europe/Paris', new Date('2026-10-04T22:00:00Z')) === '2026-10-05', 'jour à Paris (UTC+2 avant le 25 octobre)');
  t.ok(dayKeyIn('Europe/Paris', new Date('2026-10-25T22:59:00Z')) === '2026-10-25' && dayKeyIn('Europe/Paris', new Date('2026-10-25T23:00:00Z')) === '2026-10-26', 'jour à Paris après le passage à l’heure d’hiver (UTC+1)');
  t.ok(isDayKey(dayKeyIn('Fuseau/Inexistant', new Date('2026-10-04T12:00:00Z'))), 'fuseau inconnu du moteur JavaScript : repli sur la date locale (démonstration)');
  t.ok(weekKeyOf('2026-10-04') === '2026-09-28' && weekKeyOf('2026-10-05') === '2026-10-05' && weekKeyOf('2026-10-11') === '2026-10-05', 'semaine = lundi (dimanche 4 octobre → lundi 28 septembre)');
  const { seasonAnchorDay: anchor, seasonLengthDays: len } = PROGRESSION_CALENDAR;
  t.ok(seasonKeyOf('2026-09-30', anchor, len) === 'S0' && seasonKeyOf('2026-10-01', anchor, len) === 'S1' && seasonKeyOf(addDays(anchor, 55), anchor, len) === 'S1' && seasonKeyOf(addDays(anchor, 56), anchor, len) === 'S2', 'saisons de 56 jours depuis le 1er octobre 2026');
  t.ok(isDayKey('2026-02-28') && !isDayKey('2026-02-30') && !isDayKey('04/10/2026'), 'validation des clés de jour');

  // ---------------------------------------------------------------- vue Parcours (point 10)
  const statuses: RewardStatus[] = REWARD_DEFINITIONS.map((reward) => ({ reward, state: 'locked', periodKey: null, progress: { current: 860, required: 0 } }));
  const at860: ProgressionAccount = { ...newAccount('u', STAGES, PERIOD, AT), lifetimePoints: 860, currentStage: 'elan', highestHistoricalStage: 'elan' };
  const parcours = buildParcours(at860, statuses, STAGES, COSMETIC_CATALOG);
  t.ok(parcours.stage.label === 'Élan' && parcours.lifetimePoints === 860 && parcours.nextStage?.minPoints === 1500, 'Parcours : Élan, 860 / 1 500 PF');
  t.equal(
    parcours.upcoming.map((m) => [m.atPoints, m.label]),
    [[900, '+50 Fitcoins'], [1000, 'Capsule'], [1150, 'Accessoire'], [1300, '+100 Fitcoins'], [1500, 'Régulier']],
    'Parcours : prochaines récompenses exactement comme la spécification',
  );
  t.ok(parcours.pointsToNextStage === 640 && Math.abs(parcours.stageProgress - 0.36) < 1e-9, 'Parcours : il manque 640 PF, 36 % de l’étape');
  const atTop = buildParcours({ ...at860, lifetimePoints: 15000, currentStage: 'pilier', highestHistoricalStage: 'pilier' }, statuses, STAGES, COSMETIC_CATALOG);
  t.ok(atTop.nextStage === null && atTop.pointsToNextStage === null && atTop.stageProgress === 1 && atTop.upcoming.length === 0, 'Parcours : dernière étape atteinte');
  const claimable = buildParcours(at860, statuses.map((s) => (s.reward.id === 'milestone_900' ? { ...s, state: 'claimable' as const } : s)), STAGES, COSMETIC_CATALOG);
  t.ok(claimable.claimable.length === 1 && claimable.claimable[0].kind === 'reward' && claimable.claimable[0].rewardId === 'milestone_900', 'Parcours : récompense débloquée à récupérer');

  // ---------------------------------------------------------------- serveur local : de Déclic à Élan, en vrai
  const clock = testClock('2026-10-05T07:00:00.000Z');
  const events = createEventBus({ now: () => clock.now() });
  const seen: DomainEvent[] = [];
  events.subscribeAll((ev) => seen.push(ev));
  const storage = createMemoryStorage();
  const server = new LocalEconomyServer({ storage, clock, events, ids: sequentialIds() });
  let days = 0;
  while ((await server.getProgression('marie')).currentStage === 'declic') {
    const day = days++;
    await server.recordAction('marie', 'daily_goal_completed', null);
    await server.recordAction('marie', 'challenge_completed', 'defi-' + day);
    await server.recordAction('marie', 'meal_logged', 'repas-' + day);
    clock.advanceDays(1);
  }
  const lastStageEvent = seen.find((ev) => ev.type === 'progression.stage_changed');
  const marie = await server.getProgression('marie');
  t.ok(days === 7 && marie.lifetimePoints === 525 && marie.currentStage === 'elan', 'membre régulier : Élan en 7 jours (75 PF/jour)');
  t.ok(lastStageEvent?.type === 'progression.stage_changed' && lastStageEvent.payload.fromStage === 'declic' && lastStageEvent.payload.toStage === 'elan', 'événement progression.stage_changed Déclic → Élan');
  t.ok(seen.filter((ev) => ev.type === 'progression.points_awarded').length === 21, 'événement progression.points_awarded à chaque attribution (21)');
  t.ok(marie.weeklyPoints === 0 && marie.seasonPoints === 525 && marie.weekKey === '2026-10-12', 'lundi suivant : PF de la semaine remis à zéro, saison et total conservés');

  const rebalancedServer = new LocalEconomyServer({ storage, clock, config: { ...DEFAULT_SERVER_CONFIG, stages: harder } });
  const marieAfter = await rebalancedServer.getProgression('marie');
  t.ok(marieAfter.currentStage === 'declic' && marieAfter.highestHistoricalStage === 'elan' && marieAfter.lifetimePoints === 525, 'serveur rééquilibré : étape courante Déclic, meilleur niveau historique Élan conservé');
  const pauseStorage = createMemoryStorage();
  await new LocalEconomyServer({ storage: pauseStorage, clock }).recordAction('paul', 'meal_logged', 'repas-1');
  const paused = new LocalEconomyServer({
    storage: pauseStorage,
    clock,
    config: { ...DEFAULT_SERVER_CONFIG, rules: { ...PROGRESSION_RULES, meal_logged: { ...PROGRESSION_RULES.meal_logged, enabled: false } } },
  });
  const replayAfterPause = await paused.recordAction('paul', 'meal_logged', 'repas-1');
  const newAfterPause = await paused.recordAction('paul', 'meal_logged', 'repas-2');
  t.ok(replayAfterPause.ok && replayAfterPause.replayed && !newAfterPause.ok && newAfterPause.code === 'ACTION_DISABLED', 'règle désactivée : demande déjà traitée rejouée, nouvelle demande refusée');
  const empty = await server.getProgression('nouveau');
  t.ok(empty.lifetimePoints === 0 && empty.weekKey === marie.weekKey, 'nouveau membre : compte vierge sur la période courante');
});
