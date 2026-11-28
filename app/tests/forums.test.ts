/**
 * Communauté — forums ouverts, running clubs, filtre « Me proposer » (femmes / hommes).
 * Logique pure : filtre avant publication (App Store 1.2), visibilité (masqué, bloqué), sorties toutes les deux semaines.
 */
import { DEFAULT_PRIVACY } from '../src/community/models/types';
import type { CommunityProfile } from '../src/community/models/types';
import { genderAllows, suggest } from '../src/social/fitmatch/matching';
import {
  TWO_WEEKS, THEME_FORUMS, RUN_CITIES, checkPlace, checkPost, cityKey, defaultRunStart, emptyForumState, forumById, nextOccurrence,
  runDateLabel, runningForum, upcomingRuns, visiblePosts, repliesOf, forumFeed, toggleReaction, reactionCount, isFirstPost, dailyPrompt,
} from '../src/community/models/forums';
import type { RunMeetup } from '../src/community/models/forums';
import { demoForumPosts } from '../src/community/services/demoForums';
import { demoProfiles } from '../src/community/services/devData';

let n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) throw new Error('FAIL ' + m); console.log('ok', m); };

const NOW = new Date(2026, 10, 26, 10, 0).getTime(); // jeudi 26 novembre 2026, 10 h (heure locale)
const DAY = 86400000;
const P = (id: string, o: Partial<CommunityProfile> = {}): CommunityProfile => ({
  userId: id, displayName: id, avatarId: 'a:' + id, language: 'fr', ageRange: '25-30', countryOptional: 'France',
  timezone: 'Europe/Paris', utcOffset: 2, goalCategory: 'perdre', points: 800, highestHistoricalPoints: 800,
  slots: ['soir'], activities: ['marche'], support: ['encouragement'], helpfulnessScore: 0,
  joinedAt: NOW - 30 * DAY, lastActiveAt: NOW - 60000, privacy: { ...DEFAULT_PRIVACY }, ...o,
});

// ---------- filtre « Me proposer »
const ana = P('ana', { gender: 'f', privacy: { ...DEFAULT_PRIVACY, matchWith: 'f' } });
const bea = P('bea', { gender: 'f' });
const carl = P('carl', { gender: 'm' });
const dom = P('dom');
ok(genderAllows(bea, carl) && genderAllows(carl, bea), 'sans filtre : tout le monde se voit');
ok(genderAllows(ana, bea), 'Femmes : une femme est proposée');
ok(!genderAllows(ana, carl), 'Femmes : un homme n’est pas proposé');
ok(!genderAllows(ana, dom), 'Femmes : genre non indiqué non proposé');
ok(!genderAllows(carl, ana), 'réciproque : Ana (Femmes) n’est pas proposée à un homme');
ok(genderAllows(bea, ana), 'réciproque : Ana est proposée à une femme');
const hom = P('hom', { gender: 'm', privacy: { ...DEFAULT_PRIVACY, matchWith: 'm' } });
ok(genderAllows(hom, carl) && !genderAllows(hom, bea), 'Hommes : seulement des hommes');
const ids = suggest(ana, [bea, carl, dom, hom], new Set(['ana']), NOW, 10).map((x) => x.userId);
ok(ids.length === 1 && ids[0] === 'bea', 'FitMatch applique le filtre (seule Bea reste)');
const demo = demoProfiles(NOW);
ok(demo.every((d) => d.gender === 'f' || d.gender === 'm'), 'profils de démonstration : genre renseigné');
ok(demo.filter((d) => d.gender === 'f').length === 4 && demo.filter((d) => d.gender === 'm').length === 4, 'démo : 4 femmes, 4 hommes');

// ---------- filtre avant publication
const post = (text: string, recent: { createdAt: number; text: string }[] = [], hasPhoto = false) => checkPost({ text, hasPhoto, now: NOW, myRecent: recent });
ok(post('Quatrième semaine, je tiens bon !').ok, 'message normal accepté');
ok(!post('   ').ok, 'message vide refusé');
ok(post('', [], true).ok, 'photo seule acceptée');
ok(!post('x'.repeat(501)).ok, 'plus de 500 caractères refusé');
ok(!post('va voir www.promo-minceur.com').ok, 'lien refusé');
ok(!post('mon insta: @moi').ok, 'compte d’un autre réseau refusé');
ok(!post('appelle moi 06 12 34 56 78').ok, 'numéro refusé');
ok(!post('rdv au 12 rue des Lilas').ok, 'adresse refusée');
ok(!post('t’es qu’une grosse vache').ok, 'insulte sur le corps refusée');
ok(!post('espèce de CONNARD').ok, 'insulte refusée (majuscules)');
ok(!post('Bâtard').ok, 'insulte refusée (accents)');
ok(post('Je pédale tous les matins').ok, 'pas de faux positif sur un mot qui contient « pd »');
const four = [1, 2, 3, 4].map((i) => ({ createdAt: NOW - i * 1000, text: 'm' + i }));
ok(!post('encore', four).ok, '4 messages par minute au maximum');
ok(!post('Salut', [{ createdAt: NOW - 600000, text: 'salut' }]).ok, 'même message dans l’heure refusé');

// ---------- forums
ok(THEME_FORUMS.length === 5 && THEME_FORUMS.every((f) => forumById(f.id)?.title === f.title), '5 forums thématiques retrouvés par id');
ok(cityKey('Genève') === 'geneve' && runningForum('Genève').id === 'run_geneve', 'id de running club sans accent');
ok(RUN_CITIES.every((c) => forumById(runningForum(c).id)?.city === c), 'chaque ville a son running club');
ok(forumById('run_atlantide') === null && forumById('nimporte') === null, 'forum inconnu refusé');
const s = { ...emptyForumState(), posts: [
  ...demoForumPosts(NOW),
  { id: 'p1', forumId: 'f_perte', authorId: 'me', text: 'moi', createdAt: NOW, state: 'ok' as const },
  { id: 'p2', forumId: 'f_perte', authorId: 'demo_karim', text: 'masqué serveur', createdAt: NOW, state: 'masque' as const },
], hidden: ['demo_fp_1'] };
const vis = visiblePosts(s, 'f_perte', new Set(['demo_leila']));
ok(vis[0].id === 'p1', 'messages du plus récent au plus ancien');
ok(!vis.some((p) => p.id === 'demo_fp_1'), 'message signalé/masqué invisible pour moi');
ok(!vis.some((p) => p.authorId === 'demo_leila'), 'auteur bloqué invisible');
ok(!vis.some((p) => p.id === 'p2'), 'message masqué par la modération invisible');
ok(demoForumPosts(NOW).every((p) => p.authorId.startsWith('demo_') && !p.forumId.startsWith('run_')), 'démo : seulement des profils fictifs, jamais dans un running club');

// ---------- running club
ok(checkPlace('Entrée principale du parc').ok, 'lieu public accepté');
ok(!checkPlace('12 rue des Lilas').ok, 'adresse privée refusée');
ok(!checkPlace('ici').ok, 'lieu trop court refusé');
const sat = defaultRunStart(NOW);
ok(new Date(sat).getDay() === 6 && new Date(sat).getHours() === 9 && sat > NOW && sat - NOW < 7 * DAY, 'proposition par défaut : samedi prochain 9 h');
const m: RunMeetup = { id: 'r1', forumId: 'run_paris', organizerId: 'me', startAt: sat, everyTwoWeeks: true, place: 'Parc', distanceKm: 5, pace: 'tranquille', going: ['me'], createdAt: NOW };
ok(nextOccurrence(m, NOW) === sat, 'avant la sortie : première date');
ok(nextOccurrence(m, sat + 3 * 3600000) === sat + TWO_WEEKS, 'après la sortie : deux semaines plus tard');
ok(nextOccurrence(m, sat + 20 * DAY) === sat + 2 * TWO_WEEKS, 'plus tard encore : occurrence suivante');
ok(nextOccurrence({ ...m, everyTwoWeeks: false }, sat + 3 * 3600000) === null, 'sortie unique passée : plus affichée');
ok(nextOccurrence({ ...m, cancelled: true }, NOW) === null, 'sortie annulée : plus affichée');
const st = { ...emptyForumState(), meetups: [m, { ...m, id: 'r2', organizerId: 'bloque', startAt: sat - DAY }] };
const up = upcomingRuns(st, 'run_paris', NOW, new Set(['bloque']));
ok(up.length === 1 && up[0].m.id === 'r1', 'sortie d’une personne bloquée invisible');
ok(/^Samedi \d+ (novembre|décembre) · 9 h 00$/.test(runDateLabel(sat)), 'date lisible : ' + runDateLabel(sat));

// ---------- inspiré des meilleurs : réponses, réactions, étiquettes, tri, accueil des nouveaux, question du jour
{
  const base = demoForumPosts(NOW);
  const st = { ...emptyForumState(), posts: base };
  ok(visiblePosts(st, 'f_perte', new Set()).every((p) => !p.parentId), 'le fil ne montre que les messages principaux');
  const rep = repliesOf(st, 'demo_fp_2', new Set());
  ok(rep.length === 2 && rep[0].createdAt < rep[1].createdAt, 'réponses dans l’ordre de la conversation');
  ok(repliesOf(st, 'demo_fp_2', new Set(['demo_leila'])).length === 1, 'réponse d’une personne bloquée invisible');
  const q = forumFeed(st, 'f_perte', new Set(), 'question', 'recent', NOW);
  ok(q.length === 1 && q[0].id === 'demo_fp_2', 'filtre Questions');
  const v = forumFeed(st, 'f_perte', new Set(), 'victoire', 'recent', NOW);
  ok(v.length === 1 && v[0].tag === 'victoire', 'filtre Victoires');
  const nr = forumFeed(st, 'f_repas', new Set(), 'sans_reponse', 'recent', NOW);
  ok(nr.length === 2 && nr.every((p) => !repliesOf(st, p.id, new Set()).length), 'filtre Sans réponse');
  const mine = { id: 'm1', forumId: 'f_perte', authorId: 'me', text: 'nouveau', createdAt: NOW - 1000, state: 'ok' as const };
  const st2 = { ...st, posts: [...st.posts, mine] };
  ok(forumFeed(st2, 'f_perte', new Set(), 'tout', 'recent', NOW)[0].id === 'm1', 'tri Récents : le plus récent en premier');
  ok(forumFeed(st2, 'f_perte', new Set(), 'tout', 'populaire', NOW)[0].id === 'demo_fp_2', 'tri Populaires : réactions + réponses');
  const r1 = toggleReaction(mine, 'bravo', 'x');
  ok(reactionCount(r1) === 1 && reactionCount(toggleReaction(r1, 'bravo', 'x')) === 0, 'réaction : un geste pour mettre, un pour retirer');
  ok(reactionCount(toggleReaction(r1, 'merci', 'x')) === 2, 'plusieurs réactions différentes possibles');
  ok(isFirstPost(st2, mine), 'premier message d’une personne repéré');
  ok(!isFirstPost(st2, { ...mine, id: 'm2', createdAt: NOW }), 'deuxième message : plus « premier »');
  ok(!isFirstPost(st, rep[0]), 'une réponse n’est jamais un « premier message »');
  const pr = dailyPrompt(forumById('f_perte')!, NOW);
  ok(pr.text.length > 5 && dailyPrompt(forumById('f_perte')!, NOW + 3600000).text === pr.text, 'question du jour stable dans la journée');
  ok(dailyPrompt(forumById('f_perte')!, NOW + 86400000).text !== pr.text, 'question du jour qui change chaque jour');
  ok(base.filter((p) => p.reactions).every((p) => Object.values(p.reactions!).every((ids) => ids!.every((x) => x.startsWith('demo_')))), 'démo : réactions seulement de profils fictifs');
}

console.log(`\nFORUMS OK (${n} vérifications)`);
