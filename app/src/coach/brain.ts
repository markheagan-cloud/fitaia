/**
 * Cerveau de Fito — coach à règles, hors-ligne, gratuit. Il répond à partir des VRAIES données de la personne
 * (journal du jour, poids, paliers, série, budget) et jamais avec des chiffres inventés.
 * Pur et testable : `coachAnswer(ctx, question)`.
 */
import { CUR_NAMES, fmt, fmtKg } from '@/data/content';
import { RULES } from '@/store/economy';
import type { WeightEntry } from '@/store/profile';

export type CoachContext = {
  goal: number; // budget kcal du jour (objectif + brûlé)
  eaten: number;
  burned: number;
  p: number;
  g: number;
  l: number;
  earn: number;
  streak: number;
  activeDays: number;
  pushDone: boolean;
  mealsToday: number;
  weights: WeightEntry[];
  startKg: number;
  targetKg: number;
  tier: { current: number; toNext: number; remaining: number; reached: boolean };
  autoGoal: boolean;
  hour: number; // heure locale 0–23
};

const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Moyenne sur 7 jours des derniers poids (lisse l'eau). */
export function weeklyAverage(weights: WeightEntry[]): { now: number; before: number; delta: number } | null {
  if (weights.length < 2) return null;
  const last = weights.slice(-7);
  const prev = weights.slice(-14, -7);
  const avg = (a: WeightEntry[]) => a.reduce((s, w) => s + w.kg, 0) / a.length;
  const now = avg(last);
  const before = prev.length ? avg(prev) : weights[0].kg;
  return { now, before, delta: +(now - before).toFixed(1) };
}

function soir(c: CoachContext): string {
  const remaining = c.goal - c.eaten;
  const protLeft = Math.max(0, RULES.proteinGoal - c.p);
  if (remaining > 650)
    return `Il te reste ${fmt(remaining)} kcal et ${fmt(protLeft)} g de protéines à aller chercher. Idée : pavé de saumon, légumes rôtis, 80 g de riz complet. Environ 550 kcal, 38 g de protéines.`;
  if (remaining > 350)
    return `Il te reste ${fmt(remaining)} kcal. Vise un repas d'environ ${fmt(Math.min(remaining, 450))} kcal : omelette de 3 œufs aux épinards et une salade, ou 150 g de blanc de poulet avec des haricots verts.${protLeft > 40 ? ' Tes protéines sont en retard, mets-les au centre de l’assiette.' : ''}`;
  if (remaining > 0)
    return `Il te reste ${fmt(remaining)} kcal, c’est serré. Une soupe de légumes et un yaourt grec (≈ 250 kcal, 15 g de protéines) te laissent dans ton budget.`;
  return `Tu as dépassé de ${fmt(-remaining)} kcal aujourd’hui. Ce soir, reste léger : soupe et yaourt nature. Demain repart à zéro, et c’est la moyenne de la semaine qui compte.`;
}

function poids(c: CoachContext): string {
  const avg = weeklyAverage(c.weights);
  if (!c.weights.length) return 'Je n’ai pas encore de pesée. Enregistre ton poids dans Mon perso (idéalement le matin, à jeun) : je te répondrai avec ta vraie courbe.';
  if (!avg) return `Une seule pesée pour l’instant (${fmtKg(c.weights[0].kg)} kg). Pèse-toi 3 ou 4 fois cette semaine : je regarde la moyenne, pas une pesée isolée.`;
  const trend = avg.delta <= -0.2 ? 'ta moyenne baisse de ' + fmtKg(-avg.delta) + ' kg' : avg.delta >= 0.2 ? 'ta moyenne monte de ' + fmtKg(avg.delta) + ' kg' : 'ta moyenne est stable';
  const base = `Sur 7 jours, ${trend} (${fmtKg(avg.now)} kg). L’eau fait varier le poids de 1 à 2 kg d’un jour à l’autre, c’est la moyenne qui compte.`;
  if (c.tier.reached) return base + ' Objectif atteint : on passe en maintien, ton budget suit automatiquement.';
  if (avg.delta >= -0.1 && c.weights.length >= 10) return base + (c.autoGoal ? ' Si elle ne bouge pas sur 3 semaines, passe le rythme en « Rapide » dans Mon profil : je baisse ton budget d’environ 250 kcal.' : ' Ton budget est réglé à la main : rebranche le calcul automatique dans Mon profil pour qu’il s’ajuste.');
  return base + ` Encore ${fmtKg(c.tier.toNext)} kg avant le palier ${Math.min(5, c.tier.current + 1)}.`;
}

function credits(c: CoachContext): string {
  return (
    `Tu as ${fmt(c.earn)} ${CUR_NAMES[0]}.\n\n` +
    `Série : ${c.streak} jour${c.streak > 1 ? 's' : ''}. Cette semaine : ${c.activeDays} jour${c.activeDays > 1 ? 's' : ''} actif${c.activeDays > 1 ? 's' : ''} sur ${RULES.chestActiveDays} pour le coffre (${fmt(RULES.chestReward)} ${CUR_NAMES[0]}).\n\n` +
    `Chaque jour : le défi rapporte ${RULES.challengeReward} (+${RULES.streakBonus3} dès 3 jours de série, +${RULES.streakBonus7} dès 7), et jusqu’à ${RULES.mealsRewardedPerDay} repas rapportent ${RULES.mealRewardGood} ou ${RULES.mealRewardBasic} selon leur score.`
  );
}

export function coachAnswer(c: CoachContext, question: string): string {
  const q = n(question);
  const remaining = c.goal - c.eaten;
  const protLeft = Math.max(0, RULES.proteinGoal - c.p);

  if (/stagn|plateau|bouge pas|descend pas|poids|balance|pes[ée]/.test(q)) return poids(c);
  if (/ce soir|diner|dîner|manger|repas|midi|dejeuner|petit[- ]dej|collation|gouter/.test(q)) return soir(c);
  if (/lipide|glucide|gras|sucre|macro/.test(q))
    return `Aucun n’est « meilleur » : ton corps a besoin des deux.\n\nLipides (9 kcal/g) : hormones, vitamines A, D, E, K, satiété. Vise ≈ 30 % de tes calories, surtout huile d’olive, noix, poissons gras. Aujourd’hui : ${c.l} g sur ${RULES.fatGoal}.\n\nGlucides (4 kcal/g) : carburant des séances, complets et riches en fibres. Aujourd’hui : ${c.g} g sur ${RULES.carbsGoal}.\n\nLa vraie priorité pour ton objectif reste les protéines : ${c.p} g sur ${RULES.proteinGoal} aujourd’hui.`;
  if (/prot[ée]ine/.test(q))
    return protLeft > 0
      ? `Il te manque ${fmt(protLeft)} g de protéines aujourd’hui (${c.p} sur ${RULES.proteinGoal}). Les plus simples : 150 g de blanc de poulet (31 g), un skyr (16 g), 2 œufs (13 g), une boîte de thon (23 g). Répartis-les sur 3 repas, ton corps les utilise mieux.`
      : `Objectif protéines atteint : ${c.p} g sur ${RULES.proteinGoal}. Tu peux garder le reste du budget pour des légumes et des féculents complets.`;
  if (/calorie|budget|combien.*(reste|manger)|kcal/.test(q))
    return remaining >= 0
      ? `Budget du jour : ${fmt(c.goal)} kcal (dont ${fmt(c.burned)} gagnées par tes défis). Mangé : ${fmt(c.eaten)}. Il te reste ${fmt(remaining)} kcal.${c.autoGoal ? ' Ce budget vient de ton profil (métabolisme × activité − déficit), il bouge avec ton poids.' : ' Ce budget est réglé à la main dans Mon profil.'}`
      : `Tu es à ${fmt(c.eaten)} kcal pour un budget de ${fmt(c.goal)} : ${fmt(-remaining)} au-dessus. Un défi en plus ajoute ${RULES.challengeBurn} kcal, et demain repart à zéro.`;
  if (/d[ée]fi|pompe|squat|gainage|entra[iî]n|sport|s[ée]ance/.test(q))
    return c.pushDone
      ? `Défi du jour réussi, ${c.streak} jour${c.streak > 1 ? 's' : ''} de série. Les défis bonus (repas, pas, squats) restent ouverts dans l’onglet Défis. Demain, nouveau défi, nouvelle récompense.`
      : `Le défi du jour t’attend : 5 pompes comptées par la caméra, +${RULES.challengeReward} ${CUR_NAMES[0]}${c.streak >= 2 ? ' + bonus de série' : ''}. Pose le téléphone au sol de profil, 1,5 m de toi, et vas-y.`;
  if (/cr[ée]dit|point|gagn|s[ée]rie|coffre|monnaie/.test(q)) return credits(c);
  if (/eau|boire|hydrat/.test(q)) return 'Repère simple : 30 à 35 ml par kilo et par jour, plus pendant les séances. Un verre à chaque repas et une gourde sur ton bureau suffisent la plupart du temps.';
  if (/sommeil|dormir|fatigu|nuit/.test(q)) return 'Le sommeil pèse autant que l’assiette : en dessous de 7 h, la faim augmente le lendemain et la récupération baisse. Même heure de coucher, écran coupé 30 min avant, chambre fraîche.';
  if (/motiv|envie|abandon|dur|decourag/.test(q))
    return c.streak >= 3
      ? `Tu tiens ${c.streak} jours de série, c’est exactement ce qui construit le résultat. Vise seulement demain : un défi, un repas enregistré. Le reste suit.`
      : 'Une seule règle ce soir : fais le plus petit geste possible. Un défi de 5 pompes ou un repas enregistré. La série démarre là, et la série, c’est ce qui te fait avancer.';
  if (/objectif|palier|progres|avance/.test(q))
    return c.tier.reached
      ? `Objectif atteint (${fmtKg(c.targetKg)} kg). Prochaine étape : le maintien, et tes stats continuent de monter avec les défis.`
      : `Palier ${c.tier.current} sur 5. Encore ${fmtKg(c.tier.toNext)} kg pour le suivant, ${fmtKg(c.tier.remaining)} kg jusqu’à ${fmtKg(c.targetKg)}. À ton rythme, chaque semaine compte.`;
  if (/bonjour|salut|hello|coucou/.test(q)) return c.hour < 12 ? 'Salut. Objectif du matin : un repas enregistré et le défi du jour. Je suis là si tu as une question.' : 'Salut. Dis-moi ce que tu as mangé ou lance le défi du jour, je te suis.';
  return `Je peux t’aider sur : quoi manger ce soir, tes protéines, ton budget calorique, ton poids et tes paliers, les défis et les crédits. Aujourd’hui : ${fmt(remaining)} kcal restantes, ${c.p} g de protéines sur ${RULES.proteinGoal}.`;
}
