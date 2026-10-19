/**
 * Aide à la première conversation : amorces, réactions rapides, puis retrait progressif de l'aide.
 *  - « full »  : aucun message → « Vous avez plusieurs choses en commun », 3 amorces, réactions ;
 *  - « light » : la discussion démarre → plus d'amorces, réactions gardées, rappel discret des points communs ;
 *  - « none »  : vous vous êtes répondu plusieurs fois → discussion normale, plus aucune aide.
 * Logique pure (sans React Native).
 */
import { LIMITS } from './safety';

export type AssistLevel = 'full' | 'light' | 'none';

/** Les trois amorces de la première prise de contact. */
export const FIRST_STARTERS = [
  'Tu en es où cette semaine ?',
  'C’est quoi le truc le plus difficile pour toi en ce moment ?',
  'Tu veux qu’on se fixe un petit objectif aujourd’hui ?',
];

/** Réactions rapides : envoyées comme message d'encouragement (« 🔥 Courage »). */
export const REACTIONS: { emoji: string; label: string }[] = [
  { emoji: '🔥', label: 'Courage' },
  { emoji: '👏', label: 'Bien joué' },
  { emoji: '💪', label: 'On lâche rien' },
];

export const reactionText = (r: { emoji: string; label: string }) => r.emoji + ' ' + r.label;

/** Un message est-il une réaction rapide ? (pour l'afficher comme un autocollant, pas comme une bulle) */
export function reactionOf(content: string): { emoji: string; label: string } | null {
  const c = content.trim();
  return REACTIONS.find((r) => c === reactionText(r)) ?? null;
}

/** Seuil à partir duquel la discussion est « établie » (messages au total, chacun ayant écrit au moins deux fois). */
export const ESTABLISHED_AFTER = 4;

export function assistLevel(msgs: { senderId: string }[], me: string): AssistLevel {
  if (msgs.length === 0) return 'full';
  const mine = msgs.filter((m) => m.senderId === me).length;
  const theirs = msgs.length - mine;
  if (msgs.length >= ESTABLISHED_AFTER && mine >= 2 && theirs >= 2) return 'none';
  return 'light';
}

/** J'ai déjà envoyé le maximum autorisé avant une réponse (anti-harcèlement) : on le dit gentiment, avant l'envoi. */
export function waitingForReply(msgs: { senderId: string }[], me: string): boolean {
  const replied = msgs.some((m) => m.senderId !== me);
  return !replied && msgs.filter((m) => m.senderId === me).length >= LIMITS.firstMessagesBeforeReply;
}

/** Typographie française à l'affichage : espace insécable avant ? ! : ; » et après « (le message stocké ne change pas). */
export function frenchSpacing(text: string): string {
  return text.replace(/ ([?!:;»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');
}
