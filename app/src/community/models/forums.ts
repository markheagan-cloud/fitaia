/**
 * FITAIA Communauté — forums ouverts et running clubs (logique pure, partagée par l'app, les tests et le futur serveur).
 *
 * Forum = groupe OUVERT : tout le monde peut entrer, lire et écrire (≠ « Tes Cercles », petits groupes fermés, plus tard).
 * Running club = forum d'une VILLE choisie à la main (jamais de GPS) + sorties proposées par les membres
 * (toutes les deux semaines par défaut), avec un lieu public écrit par l'organisateur.
 *
 * Règles App Store 1.2 (contenu publié par les utilisateurs) couvertes ici :
 *  - filtre AVANT publication (checkPost : insultes, liens, numéros, adresses, répétitions, débit) ;
 *  - signalement d'un message, masquage immédiat chez soi, blocage de l'auteur ;
 *  - acceptation des règles avant la première publication.
 * Côté serveur (supabase/migrations/0004_forums.sql), un signalement met le message « en revue ».
 *
 * Confidentialité : un message de forum ne porte JAMAIS de poids, de mensurations, de position GPS ni d'adresse.
 */

export type ForumKind = 'theme' | 'running';

export type Forum = {
  id: string;
  kind: ForumKind;
  title: string;
  description: string;
  /** running club : ville choisie par la personne. */
  city?: string;
};

export type ForumPostState = 'ok' | 'en_revue' | 'masque';

export type ForumPost = {
  id: string;
  forumId: string;
  authorId: string;
  text: string;
  /** Photo jointe (chemin local sur le téléphone tant que les forums ne sont pas en ligne). */
  photoUri?: string;
  createdAt: number;
  state: ForumPostState;
};

export type Pace = 'tranquille' | 'moyen' | 'rapide';

export const PACES: { id: Pace; label: string; hint: string }[] = [
  { id: 'tranquille', label: 'Tranquille', hint: 'On peut parler en courant' },
  { id: 'moyen', label: 'Moyen', hint: 'Phrases courtes' },
  { id: 'rapide', label: 'Rapide', hint: 'Pour les habitués' },
];

export type RunMeetup = {
  id: string;
  forumId: string;
  organizerId: string;
  /** Première sortie (ms). */
  startAt: number;
  /** Répétée toutes les deux semaines, même jour, même heure. */
  everyTwoWeeks: boolean;
  /** Lieu public écrit par l'organisateur (« Parvis de la gare », « Entrée du parc »…). Jamais une adresse privée. */
  place: string;
  distanceKm: number;
  pace: Pace;
  going: string[];
  createdAt: number;
  cancelled?: boolean;
};

export type ForumReport = { id: string; postId: string; reporterId: string; reason: string; createdAt: number };

export type ForumState = {
  /** Règles acceptées (obligatoire avant d'écrire). */
  rulesAcceptedAt: number | null;
  /** Forums rejoints (ordre d'arrivée). */
  joined: string[];
  /** Ville du running club (choisie à la main). */
  city: string | null;
  posts: ForumPost[];
  meetups: RunMeetup[];
  reports: ForumReport[];
  /** Messages masqués par moi (après signalement ou « masquer »). */
  hidden: string[];
};

export const emptyForumState = (): ForumState => ({ rulesAcceptedAt: null, joined: [], city: null, posts: [], meetups: [], reports: [], hidden: [] });

/** Forums thématiques ouverts. */
export const THEME_FORUMS: Forum[] = [
  { id: 'f_perte', kind: 'theme', title: 'Perdre du poids', description: 'Astuces, rechutes, petites victoires. Sans jugement.' },
  { id: 'f_muscle', kind: 'theme', title: 'Prendre du muscle', description: 'Programmes, progrès, questions de débutant.' },
  { id: 'f_repas', kind: 'theme', title: 'Repas et recettes', description: 'Ce que tu manges cette semaine, en photo si tu veux.' },
  { id: 'f_reprise', kind: 'theme', title: 'Reprendre le sport', description: 'Pour ceux qui recommencent, à leur rythme.' },
  { id: 'f_motivation', kind: 'theme', title: 'Motivation du jour', description: 'Un coup de mou ? Un coup de boost ? C’est ici.' },
];

/** Villes proposées pour les running clubs (liste fermée : pas de position, pas de quartier). */
export const RUN_CITIES = [
  'Paris', 'Marseille', 'Lyon', 'Toulouse', 'Lille', 'Bordeaux', 'Nantes', 'Strasbourg', 'Nice', 'Montpellier', 'Rennes',
  'Grenoble', 'Bruxelles', 'Genève', 'Lausanne', 'Montréal', 'Casablanca', 'Alger', 'Tunis', 'Dakar', 'Abidjan',
] as const;

export const cityKey = (city: string) =>
  city
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function runningForum(city: string): Forum {
  return {
    id: 'run_' + cityKey(city),
    kind: 'running',
    city,
    title: 'Running club ' + city,
    description: 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.',
  };
}

export function forumById(id: string): Forum | null {
  const th = THEME_FORUMS.find((f) => f.id === id);
  if (th) return th;
  if (id.startsWith('run_')) {
    const city = RUN_CITIES.find((c) => 'run_' + cityKey(c) === id);
    return city ? runningForum(city) : null;
  }
  return null;
}

export const FORUM_RULES = [
  'Respect avant tout : pas d’insulte, pas de moquerie sur le corps de quelqu’un.',
  'Pas de pub, pas de lien, pas de numéro de téléphone ni d’adresse.',
  'Pas de conseil dangereux (jeûne extrême, produits, médicaments).',
  'Photos : seulement les tiennes, habillé, et personne d’autre sans son accord.',
  'Un message qui pose problème ? Signale-le : il disparaît tout de suite de ton écran et part en vérification.',
];

export const POST_LIMITS = { maxLength: 500, perMinute: 4, perHour: 20 };

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|fr|net|org|io|ly|me|app|shop|store)\b)/i;
const PHONE = /(\+?\d[\d .-]{7,}\d)/;
const ADDRESS = /\b\d{1,4}\s*(bis|ter)?,?\s*(rue|avenue|av\.?|boulevard|bd|allée|impasse|chemin|place|quai)\b/i;
const HANDLE = /(snap|insta|instagram|telegram|whatsapp|onlyfans)\s*[:@]/i;
/** Filtre minimal (insultes, haine, contenu sexuel) : le serveur garde le dernier mot. Comparaison sans accents. */
const BLOCKED_WORDS = [
  'connard', 'connasse', 'salope', 'pute', 'encule', 'batard', 'fdp', 'ntm', 'nique', 'pd', 'tapette', 'negro', 'bougnoule',
  'youpin', 'grosse vache', 'gros porc', 'baleine', 'cassos', 'suicide toi', 'creve', 'nude', 'nudes', 'porn', 'porno',
];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export type PostCheck = { ok: true } | { ok: false; reason: string };

/** Filtre AVANT publication (App Store 1.2). */
export function checkPost(opts: { text: string; hasPhoto: boolean; now: number; myRecent: { createdAt: number; text: string }[] }): PostCheck {
  const text = opts.text.trim();
  if (!text && !opts.hasPhoto) return { ok: false, reason: 'Le message est vide.' };
  if (text.length > POST_LIMITS.maxLength) return { ok: false, reason: 'Message trop long (' + POST_LIMITS.maxLength + ' caractères au maximum).' };
  if (opts.myRecent.filter((m) => opts.now - m.createdAt < 60000).length >= POST_LIMITS.perMinute)
    return { ok: false, reason: 'Doucement : attends une minute avant de publier à nouveau.' };
  if (opts.myRecent.filter((m) => opts.now - m.createdAt < 3600000).length >= POST_LIMITS.perHour)
    return { ok: false, reason: 'Tu as beaucoup publié cette heure-ci. Reviens un peu plus tard.' };
  if (text && opts.myRecent.some((m) => opts.now - m.createdAt < 3600000 && m.text.trim().toLowerCase() === text.toLowerCase()))
    return { ok: false, reason: 'Tu as déjà publié ce message.' };
  if (LINK.test(text)) return { ok: false, reason: 'Les liens ne sont pas autorisés dans les forums.' };
  if (PHONE.test(text)) return { ok: false, reason: 'Pour ta sécurité, pas de numéro de téléphone dans un forum ouvert.' };
  if (ADDRESS.test(text)) return { ok: false, reason: 'Pour ta sécurité, pas d’adresse précise dans un forum ouvert.' };
  if (HANDLE.test(text)) return { ok: false, reason: 'Pas de compte d’un autre réseau dans un forum ouvert.' };
  const n = ' ' + norm(text).replace(/[^a-z0-9 ]+/g, ' ') + ' ';
  if (BLOCKED_WORDS.some((w) => n.includes(' ' + w + ' ')))
    return { ok: false, reason: 'Ce message contient un mot interdit dans les forums. Reformule-le avec respect.' };
  return { ok: true };
}

/** Lieu de rendez-vous : un endroit public, sans numéro de rue. */
export function checkPlace(place: string): PostCheck {
  const p = place.trim();
  if (p.length < 4) return { ok: false, reason: 'Indique un point de rendez-vous (ex. « Entrée principale du parc »).' };
  if (p.length > 80) return { ok: false, reason: 'Lieu trop long (80 caractères au maximum).' };
  if (ADDRESS.test(p) || PHONE.test(p) || LINK.test(p)) return { ok: false, reason: 'Choisis un lieu public (parc, gare, stade), sans adresse ni numéro.' };
  return checkPost({ text: p, hasPhoto: false, now: 0, myRecent: [] });
}

export const TWO_WEEKS = 14 * 24 * 3600 * 1000;

/** Prochaine occurrence d'une sortie (null si passée et non répétée, ou annulée). Tolérance : 2 h après le départ. */
export function nextOccurrence(m: RunMeetup, now: number): number | null {
  if (m.cancelled) return null;
  const grace = 2 * 3600 * 1000;
  if (m.startAt + grace >= now) return m.startAt;
  if (!m.everyTwoWeeks) return null;
  const k = Math.ceil((now - grace - m.startAt) / TWO_WEEKS);
  return m.startAt + k * TWO_WEEKS;
}

/** Samedi prochain à 9 h (proposition par défaut d'une première sortie). */
export function defaultRunStart(now: number): number {
  const d = new Date(now);
  const add = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

export const RUN_SAFETY = [
  'Rendez-vous dans un lieu public, en journée de préférence.',
  'Ne donne jamais ton adresse. Viens et repars par tes propres moyens.',
  'Préviens un proche de l’heure et du lieu.',
];

/** Messages visibles pour moi : hors masqués, hors auteurs bloqués, hors messages retirés. */
export function visiblePosts(s: ForumState, forumId: string, blocked: Set<string>): ForumPost[] {
  const hidden = new Set(s.hidden);
  return s.posts
    .filter((p) => p.forumId === forumId && p.state !== 'masque' && !hidden.has(p.id) && !blocked.has(p.authorId))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Sorties à venir d'un running club, triées par date. */
export function upcomingRuns(s: ForumState, forumId: string, now: number, blocked: Set<string>): { m: RunMeetup; at: number }[] {
  return s.meetups
    .filter((m) => m.forumId === forumId && !blocked.has(m.organizerId))
    .map((m) => ({ m, at: nextOccurrence(m, now) }))
    .filter((x): x is { m: RunMeetup; at: number } => x.at !== null)
    .sort((a, b) => a.at - b.at);
}

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « Samedi 6 décembre · 9 h 00 » (heure locale du téléphone). */
export function runDateLabel(at: number): string {
  const d = new Date(at);
  const day = DAYS[d.getDay()];
  return day.charAt(0).toUpperCase() + day.slice(1) + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' · ' + d.getHours() + ' h ' + String(d.getMinutes()).padStart(2, '0');
}

/** « Sam. 6 » pour les puces de choix de date. */
export function shortDay(at: number): string {
  const d = new Date(at);
  return DAYS[d.getDay()].slice(0, 3) + '. ' + d.getDate();
}
