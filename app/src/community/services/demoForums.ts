/**
 * DONNÉES DE DÉMONSTRATION des forums : messages écrits par les profils fictifs (`demo_*`), signalés « Démo » à l'écran.
 * Uniquement dans les forums thématiques. AUCUNE sortie de running club n'est inventée : une date et un lieu fictifs
 * pourraient faire se déplacer quelqu'un pour rien. Les running clubs commencent donc vides.
 */
import type { ForumPost } from '../models/forums';

const H = 3600 * 1000;

const SEED: { id: string; forumId: string; authorId: string; text: string; hoursAgo: number }[] = [
  { id: 'demo_fp_1', forumId: 'f_perte', authorId: 'demo_sarah', text: 'Quatrième semaine : −2 kg et surtout je marche tous les matins. Le plus dur c’était la première semaine.', hoursAgo: 3 },
  { id: 'demo_fp_2', forumId: 'f_perte', authorId: 'demo_karim', text: 'Je craque toujours le soir devant la télé. Vous faites comment ?', hoursAgo: 7 },
  { id: 'demo_fp_3', forumId: 'f_perte', authorId: 'demo_leila', text: 'Karim : je prépare un bol de fruits coupés avant de m’installer. Ça m’évite le paquet de gâteaux.', hoursAgo: 6 },
  { id: 'demo_fp_4', forumId: 'f_muscle', authorId: 'demo_adam', text: 'Rappel pour les débutants : mieux vaut 3 séances par semaine pendant 3 mois que 6 séances pendant 2 semaines.', hoursAgo: 5 },
  { id: 'demo_fp_5', forumId: 'f_muscle', authorId: 'demo_nassim', text: 'Premier jour à 10 pompes d’affilée. Il y a un mois j’en faisais 3.', hoursAgo: 20 },
  { id: 'demo_fp_6', forumId: 'f_repas', authorId: 'demo_julie', text: 'Mon déjeuner de la semaine : riz, poulet, courgettes, et je change juste la sauce chaque jour.', hoursAgo: 4 },
  { id: 'demo_fp_7', forumId: 'f_repas', authorId: 'demo_ines', text: 'Quelqu’un a une idée de petit-déjeuner rapide qui tient jusqu’à midi ?', hoursAgo: 11 },
  { id: 'demo_fp_8', forumId: 'f_reprise', authorId: 'demo_thomas', text: 'Reprise après 2 ans d’arrêt : j’ai commencé par 15 minutes de vélo. Personne ne vous juge ici, lancez-vous.', hoursAgo: 9 },
  { id: 'demo_fp_9', forumId: 'f_reprise', authorId: 'demo_ines', text: 'Course du midi : 20 minutes sans m’arrêter aujourd’hui !', hoursAgo: 26 },
  { id: 'demo_fp_10', forumId: 'f_motivation', authorId: 'demo_leila', text: 'Pas motivée ce soir. Je fais juste 10 minutes et je vous dis.', hoursAgo: 2 },
  { id: 'demo_fp_11', forumId: 'f_motivation', authorId: 'demo_nassim', text: 'Fais les 10 minutes, Leïla. Le plus dur c’est de commencer 💪', hoursAgo: 1 },
];

export const DEMO_POST_IDS = new Set(SEED.map((p) => p.id));

/** Messages de démonstration datés par rapport à maintenant (renouvelés à chaque ouverture pour rester récents). */
export function demoForumPosts(now = Date.now()): ForumPost[] {
  return SEED.map((p) => ({ id: p.id, forumId: p.forumId, authorId: p.authorId, text: p.text, createdAt: now - p.hoursAgo * H, state: 'ok' }));
}
