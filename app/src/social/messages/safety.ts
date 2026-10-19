/**
 * Sécurité des messages : limites de débit, anti-répétition, premier message encadré.
 * Ces règles tournent aussi côté serveur (voir supabase/migrations) : le téléphone n'est jamais seul juge.
 */

export const LIMITS = {
  maxLength: 600,
  perMinute: 8,
  perDayNewConversations: 10,       // premières prises de contact par jour (anti-démarchage)
  firstMessagesBeforeReply: 2,      // tant que l'autre n'a pas répondu, on ne peut envoyer que 2 messages
  newAccountDays: 2,                // comptes de moins de 2 jours : pas de lien dans les messages
};

export type SendCheck = { ok: true } | { ok: false; reason: string };

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|fr|net|org|io|ly|me|app)\b)/i;
const PHONE = /(\+?\d[\d .-]{7,}\d)/;

export function checkMessage(opts: {
  text: string;
  now: number;
  myRecent: { createdAt: number; content: string }[];   // mes messages récents, toutes conversations
  sentInThisConversation: number;
  otherHasReplied: boolean;
  accountAgeDays: number;
  newConversationsToday: number;
  isNewConversation: boolean;
}): SendCheck {
  const text = opts.text.trim();
  if (!text) return { ok: false, reason: 'Le message est vide.' };
  if (text.length > LIMITS.maxLength) return { ok: false, reason: 'Message trop long (600 caractères au maximum).' };
  const lastMinute = opts.myRecent.filter((m) => opts.now - m.createdAt < 60000);
  if (lastMinute.length >= LIMITS.perMinute) return { ok: false, reason: 'Doucement : attends une minute avant d’écrire à nouveau.' };
  const sameText = opts.myRecent.filter((m) => opts.now - m.createdAt < 3600000 && m.content.trim().toLowerCase() === text.toLowerCase());
  if (sameText.length >= 3) return { ok: false, reason: 'Tu as déjà envoyé ce message plusieurs fois.' };
  if (opts.isNewConversation && opts.newConversationsToday >= LIMITS.perDayNewConversations)
    return { ok: false, reason: 'Tu as contacté beaucoup de monde aujourd’hui. Reviens demain.' };
  if (!opts.otherHasReplied && opts.sentInThisConversation >= LIMITS.firstMessagesBeforeReply)
    return { ok: false, reason: 'Attends sa réponse avant d’envoyer d’autres messages.' };
  if (opts.accountAgeDays < LIMITS.newAccountDays && LINK.test(text))
    return { ok: false, reason: 'Les liens sont désactivés les premiers jours.' };
  if (!opts.otherHasReplied && PHONE.test(text))
    return { ok: false, reason: 'Pour ta sécurité, pas de numéro de téléphone dans un premier échange.' };
  return { ok: true };
}

/** Premiers messages proposés : éviter la page blanche. */
export const STARTERS = [
  'Tu en es où dans ton objectif cette semaine ?',
  'C’est quoi ton plus gros défi en ce moment ?',
  'Tu t’entraînes plutôt le matin ou le soir ?',
  'Quel repas t’aide le plus à rester régulier ?',
  'Tu veux qu’on se fixe un petit objectif ensemble aujourd’hui ?',
  'Qu’est-ce qui t’a motivé à commencer FITAIA ?',
  'Tu veux un encouragement ou plutôt un conseil ?',
];

/** Réactions rapides. */
export const QUICK = ['🔥 Courage', '👏 Bien joué', '💪 On lâche rien', '🎯 Objectif du jour ?', '🤝 On le fait ensemble'];
