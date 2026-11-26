/**
 * DONNÉES DE DÉMONSTRATION des forums : messages écrits par les profils fictifs (`demo_*`), signalés « Démo » à l'écran.
 * Uniquement dans les forums thématiques. AUCUNE sortie de running club n'est inventée : une date et un lieu fictifs
 * pourraient faire se déplacer quelqu'un pour rien. Les running clubs commencent donc vides.
 */
import type { ForumPost, PostTag, ReactionId } from '../models/forums';

const H = 3600 * 1000;

type Seed = { id: string; forumId: string; authorId: string; text: string; hoursAgo: number; tag?: PostTag; parentId?: string; reactions?: Partial<Record<ReactionId, string[]>> };

const SEED: Seed[] = [
  { id: 'demo_fp_1', forumId: 'f_perte', authorId: 'demo_sarah', tag: 'victoire', text: 'Quatrième semaine : −2 kg et surtout je marche tous les matins. Ce qui a marché : poser mes baskets devant la porte la veille.', hoursAgo: 3, reactions: { bravo: ['demo_leila', 'demo_nassim', 'demo_julie'], force: ['demo_karim'] } },
  { id: 'demo_fp_2', forumId: 'f_perte', authorId: 'demo_karim', tag: 'question', text: 'Je craque toujours le soir devant la télé. Vous faites comment ?', hoursAgo: 7, reactions: { force: ['demo_sarah'] } },
  { id: 'demo_fp_3', forumId: 'f_perte', authorId: 'demo_leila', parentId: 'demo_fp_2', text: 'Je prépare un bol de fruits coupés avant de m’installer. Ça m’évite le paquet de gâteaux.', hoursAgo: 6, reactions: { merci: ['demo_karim'] } },
  { id: 'demo_fp_3b', forumId: 'f_perte', authorId: 'demo_sarah', parentId: 'demo_fp_2', text: 'Pareil pour moi, et je me brosse les dents après le dîner : ça coupe l’envie.', hoursAgo: 5 },
  { id: 'demo_fp_4', forumId: 'f_muscle', authorId: 'demo_adam', tag: 'astuce', text: 'Pour les débutants : mieux vaut 3 séances par semaine pendant 3 mois que 6 séances pendant 2 semaines.', hoursAgo: 5, reactions: { merci: ['demo_nassim', 'demo_thomas'] } },
  { id: 'demo_fp_5', forumId: 'f_muscle', authorId: 'demo_nassim', tag: 'progres', text: 'Premier jour à 10 pompes d’affilée. Il y a un mois j’en faisais 3. J’ai suivi le défi du jour sans en rater un.', hoursAgo: 20, reactions: { bravo: ['demo_adam', 'demo_sarah'] } },
  { id: 'demo_fp_5b', forumId: 'f_muscle', authorId: 'demo_adam', parentId: 'demo_fp_5', text: 'Énorme, c’est exactement comme ça qu’on progresse 💪', hoursAgo: 19 },
  { id: 'demo_fp_6', forumId: 'f_repas', authorId: 'demo_julie', tag: 'astuce', text: 'Mon déjeuner de la semaine : riz, poulet, courgettes, et je change juste la sauce chaque jour.', hoursAgo: 4, reactions: { merci: ['demo_ines'] } },
  { id: 'demo_fp_7', forumId: 'f_repas', authorId: 'demo_ines', tag: 'question', text: 'Quelqu’un a une idée de petit-déjeuner rapide qui tient jusqu’à midi ?', hoursAgo: 11 },
  { id: 'demo_fp_8', forumId: 'f_reprise', authorId: 'demo_thomas', tag: 'astuce', text: 'Reprise après 2 ans d’arrêt : j’ai commencé par 15 minutes de vélo. Personne ne vous juge ici, lancez-vous.', hoursAgo: 9, reactions: { force: ['demo_ines', 'demo_karim'] } },
  { id: 'demo_fp_9', forumId: 'f_reprise', authorId: 'demo_ines', tag: 'victoire', text: 'Course du midi : 20 minutes sans m’arrêter aujourd’hui ! J’alterne 2 minutes de course et 1 de marche depuis trois semaines.', hoursAgo: 26, reactions: { bravo: ['demo_thomas'] } },
  { id: 'demo_fp_10', forumId: 'f_motivation', authorId: 'demo_leila', text: 'Pas motivée ce soir. Je fais juste 10 minutes et je vous dis.', hoursAgo: 2, reactions: { force: ['demo_nassim', 'demo_sarah'] } },
  { id: 'demo_fp_11', forumId: 'f_motivation', authorId: 'demo_nassim', parentId: 'demo_fp_10', text: 'Fais les 10 minutes, Leïla. Le plus dur c’est de commencer 💪', hoursAgo: 1 },
];

export const DEMO_POST_IDS = new Set(SEED.map((p) => p.id));

/** Messages de démonstration datés par rapport à maintenant (renouvelés à chaque ouverture pour rester récents). */
export function demoForumPosts(now = Date.now()): ForumPost[] {
  return SEED.map((p) => ({ id: p.id, forumId: p.forumId, authorId: p.authorId, text: p.text, createdAt: now - p.hoursAgo * H, state: 'ok', tag: p.tag, parentId: p.parentId, reactions: p.reactions }));
}
