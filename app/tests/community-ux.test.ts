/**
 * Communauté — passe UX (phase 1 bis) : explication du score, raisons humaines, besoin du jour et état,
 * fil « Aujourd’hui » fini, aide à la première conversation, repères du profil, tenue, présence de démonstration.
 * Logique pure : esbuild ou `node --experimental-strip-types`.
 */
import { DEFAULT_PRIVACY } from '../src/community/models/types';
import type { CommunityProfile } from '../src/community/models/types';
import {
  compatibility, compatibilityBreakdown, breakdownSummary, humanReasons, humanSentence, WEIGHTS, CRITERIA,
} from '../src/social/fitmatch/matching';
import {
  activeNeed, activeStatus, needAffinity, publicNeed, rankByNeed, DAILY_TTL, NEEDS, STATUSES, needSuggestions,
} from '../src/community/models/intentions';
import { publicCard } from '../src/community/services/privacy';
import { assistLevel, waitingForReply, reactionOf, REACTIONS, reactionText, FIRST_STARTERS, frenchSpacing } from '../src/social/messages/assist';
import { emptyState, SocialEngine } from '../src/community/services/engine';
import { unreadCount } from '../src/community/services/inbox';
import { todayFeed, feedEvents, welcomeBack, greeting, activeNearby, FEED_MAX } from '../src/community/services/feed';
import type { FeedEvent } from '../src/community/services/feed';
import { profileHighlights, stageTrack, journeyLine } from '../src/community/services/highlights';
import { lookForOutfit, originLabel } from '../src/community/models/outfit';
import { demoPresence, slotOfHour, DEMO_SOCIAL } from '../src/community/services/demoSocial';

let n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) throw new Error('FAIL ' + m); console.log('ok', m); };

const NOW = Date.UTC(2026, 9, 4, 12);
const DAY = 86400000;
const P = (id: string, o: Partial<CommunityProfile> = {}): CommunityProfile => ({
  userId: id, displayName: id, avatarId: 'a:' + id, language: 'fr', ageRange: '25-30', countryOptional: 'France',
  timezone: 'Europe/Paris', utcOffset: 2, goalCategory: 'perdre', points: 800, highestHistoricalPoints: 800,
  slots: ['soir'], activities: ['marche'], support: ['encouragement'], helpfulnessScore: 0,
  joinedAt: NOW - 30 * DAY, lastActiveAt: NOW - 60000, privacy: { ...DEFAULT_PRIVACY }, ...o,
});
const me = P('me');

// ---------- explication du score : la somme des points = le pourcentage affiché
const b100 = compatibilityBreakdown(me, P('twin'));
ok(b100.score === 100 && b100.parts.every((p) => p.points === p.max), 'profil identique : chaque critère au maximum, total 100');
ok(b100.parts.map((p) => p.key).join() === CRITERIA.join() && CRITERIA.length === Object.keys(WEIGHTS).length, 'tous les critères, dans l’ordre des poids');
const bg = compatibilityBreakdown(me, P('x', { goalCategory: 'muscler' }));
ok(bg.parts.find((p) => p.key === 'goal')!.points === 0 && bg.score === 75, 'objectif différent : 0 point d’objectif, total 75');
// propriété : sur des profils variés, somme exacte, bornes respectées, identique au score de FitMatch
const goals = ['perdre', 'reprendre', 'muscler', 'garder', 'energie'] as const;
const slotsSets = [['soir'], ['matin', 'soir'], ['midi'], ['matin', 'midi', 'soir', 'nuit']] as const;
const acts = [['marche'], ['marche', 'salle'], ['course', 'velo', 'natation'], ['maison']] as const;
const sups = [['encouragement'], ['conseil', 'defi'], ['ecoute', 'encouragement', 'defi']] as const;
let checked = 0;
let allExact = true;
let allBounded = true;
let sameAsScore = true;
for (let i = 0; i < 400; i++) {
  const o = P('o' + i, {
    goalCategory: goals[i % 5],
    slots: [...slotsSets[(i * 7) % 4]],
    activities: [...acts[(i * 3) % 4]],
    support: [...sups[(i * 5) % 3]],
    points: [0, 120, 499, 640, 820, 1500, 2900, 7200][i % 8],
    highestHistoricalPoints: [0, 300, 499, 700, 820, 1600, 3100, 7200][(i * 3) % 8],
    utcOffset: [2, 1, -4, 5, 9][i % 5],
    language: i % 11 === 0 ? 'en' : 'fr',
  });
  const br = compatibilityBreakdown(me, o);
  const sum = br.parts.reduce((a, p) => a + p.points, 0);
  if (sum !== br.score) allExact = false;
  if (br.parts.some((p) => p.points < 0 || p.points > p.max || !Number.isInteger(p.points))) allBounded = false;
  if (br.score !== compatibility(me, o, NOW).score) sameAsScore = false;
  checked++;
}
ok(checked === 400 && allExact, 'somme des points = pourcentage affiché (400 profils variés)');
ok(allBounded, 'chaque critère : entier entre 0 et son poids');
ok(sameAsScore, 'l’explication donne exactement le score de FitMatch');
const sum1 = breakdownSummary(compatibilityBreakdown(me, P('x', { slots: ['matin'] })));
ok(sum1.strong.startsWith('Vous') && sum1.strong.endsWith('.') && !/\d/.test(sum1.strong), 'explication simple : une phrase, sans chiffre');
ok(sum1.gap === 'Ce qui vous sépare le plus : vos moments dispo.', 'explication simple : ce qui sépare le plus');
ok(breakdownSummary(b100).gap === null, 'rien ne sépare deux parcours identiques');
const sameStage = breakdownSummary(compatibilityBreakdown(P('d', { points: 0, highestHistoricalPoints: 0 }), P('k', { points: 120, highestHistoricalPoints: 120 })));
ok(!(sameStage.gap ?? '').includes('étapes'), 'même étape : jamais présentée comme ce qui sépare');
ok(!compatibilityBreakdown(me, P('x')).parts.some((p) => /poids|calor|mensur|imc/i.test(p.label)), 'aucun critère de poids ou de calories');

// ---------- raisons humaines
const r = humanReasons(me, P('x'), NOW);
ok(r.length <= 4 && r[0] === 'Même objectif' && r.includes('Même rythme') && r.includes('Niveau proche du tien'), 'raisons humaines : objectif, rythme, niveau');
ok(r.includes('Souvent en ligne le soir'), 'raison horaire tirée du moment commun');
ok(humanReasons(me, P('x', { goalCategory: 'garder', slots: ['matin'], activities: ['velo'], support: ['conseil'], points: 7000, highestHistoricalPoints: 7000, lastActiveAt: NOW - DAY }), NOW).every((x) => x !== 'Même objectif' && x !== 'Même rythme'), 'pas de raison inventée');
ok(humanSentence(me, P('x')) === 'Vous êtes tous les deux dans une phase similaire de votre parcours.', 'phrase humaine : même phase');
ok(humanSentence(me, P('x', { points: 7000, highestHistoricalPoints: 7000 })) === 'Vous visez la même chose, chacun à son étape.', 'phrase humaine : même objectif, étapes différentes');

// ---------- besoin du jour et état
ok(NEEDS.length === 7 && STATUSES.length === 6, '7 besoins, 6 états');
const st = P('st', { status: 'dispo', statusAt: NOW - 3600000 });
ok(activeStatus(st, NOW) === 'dispo' && activeStatus(st, NOW + DAILY_TTL) === null, 'état du jour : s’efface après 12 h');
ok(activeStatus(P('n'), NOW) === null, 'pas d’état par défaut');
const nd = P('nd', { need: 'moral', needAt: NOW - 60000 });
ok(activeNeed(nd, NOW) === 'moral' && publicNeed(nd, NOW) === null, 'besoin du jour : privé par défaut');
ok(publicNeed({ ...nd, needPublic: true }, NOW) === 'moral', 'besoin du jour : visible seulement si partagé');
ok(publicCard(nd, 'inconnu', NOW)!.need === null && publicCard(nd, 'moi', NOW)!.need === 'moral', 'carte publique : besoin masqué aux autres, visible pour moi');
ok(publicCard(st, 'inconnu', NOW)!.status === 'dispo', 'carte publique : état du jour visible');
ok(needAffinity('motivation', { displayName: 'Sarah', need: 'motivation', status: null }).rank === 2, 'affinité : même besoin = rang 2');
ok(needAffinity('motivation', { displayName: 'Sarah', need: 'motivation', status: null }).line === 'Sarah cherche aussi de la motivation aujourd’hui.', 'affinité : phrase humaine');
ok(needAffinity('motivation', { displayName: 'Adam', need: null, status: 'aide' }).rank === 1, 'affinité : « dispo pour aider » répond au besoin');
ok(needAffinity('aider', { displayName: 'Leïla', need: 'ecoute', status: null }).rank === 2, 'aider quelqu’un : vise les personnes qui en ont besoin');
ok(needAffinity('repas', { displayName: 'X', need: null, status: 'nuit' }).rank === 0, 'affinité : rien en commun = rang 0');
const ranked = rankByNeed(['a', 'b', 'c', 'd'], (x) => ({ a: 0, b: 2, c: 0, d: 1 })[x]!);
ok(ranked.join() === 'b,d,a,c', 'tri par besoin : stable à rang égal');
ok(needSuggestions('aider').same.includes('coup de main') && needSuggestions('motivation').fitmate === 'Parler à un FitMate', 'suggestions selon le besoin');

// ---------- fil « Aujourd’hui » : fini, réel d’abord, simulé signalé
const ev = (o: Partial<FeedEvent> & { kind: FeedEvent['kind'] }): FeedEvent => ({ text: o.kind, at: NOW - 3600000, simulated: false, ...o });
const feed = todayFeed([
  ev({ kind: 'actif', userId: 's', simulated: true }),
  ev({ kind: 'objectif', userId: 'n', simulated: true }),
  ev({ kind: 'reponse', userId: 'k', at: NOW - 60000 }),
  ev({ kind: 'arrivee', simulated: true }),
  ev({ kind: 'demande', userId: 'j' }),
], NOW, NOW - 2 * 3600000);
ok(feed.length === FEED_MAX && FEED_MAX === 3, 'fil fini : 3 éléments au maximum');
ok(feed[0].kind === 'reponse' && feed[1].kind === 'demande', 'fil : ce qui me concerne d’abord');
ok(todayFeed([ev({ kind: 'reponse', userId: 'k' }), ev({ kind: 'objectif', userId: 'k' })], NOW, null).length === 1, 'fil : une ligne par personne');
ok(todayFeed([ev({ kind: 'objectif', userId: 'k', at: NOW - 2 * DAY })], NOW, null).length === 0, 'fil : seulement les dernières 24 h');
ok(todayFeed([ev({ kind: 'reponse', userId: 'k', at: NOW - 4 * DAY })], NOW, NOW - 4 * DAY - 1000).length === 1, 'retour après absence : une réponse non lue reste visible');
const seen = todayFeed([ev({ kind: 'objectif', userId: 'k', at: NOW - 3 * 3600000 }), ev({ kind: 'reponse', userId: 'z', at: NOW - 60000 })], NOW, NOW - 3600000);
ok(seen.find((x) => x.userId === 'z')!.isNew && !seen.find((x) => x.userId === 'k')!.isNew, 'fil : « nouveau » depuis ma dernière visite');

const fe = new SocialEngine(emptyState());
fe.upsertProfile(me);
fe.upsertProfile(P('demo1', { displayName: 'Nassim', demo: true, privacy: { ...DEFAULT_PRIVACY, allowMessages: 'tous' } }));
fe.upsertProfile(P('demo2', { displayName: 'Karim', demo: true, joinedAt: NOW - 3 * DAY, lastActiveAt: NOW - 2 * 60000 }));
fe.upsertProfile(P('real', { displayName: 'Lou', lastActiveAt: NOW - DAY }));
const sent = fe.send('me', 'demo1', 'Salut', 'texte', NOW - 600000);
fe.receive('demo1', sent.ok ? sent.conversation.id : '', 'Yo', NOW - 300000);
const items = todayFeed(feedEvents(fe, 'me', {}, NOW), NOW, null);
ok(items[0].kind === 'reponse' && items[0].text === 'Nassim t’a répondu' && items[0].simulated, 'fil : réponse d’un profil démo = simulée');
ok(items.every((x) => x.simulated), 'fil : tout événement de démonstration est marqué simulé');
ok(items.some((x) => x.kind === 'arrivee' && x.text === 'Une nouvelle personne correspond à ton parcours'), 'fil : nouvelle personne proche de ton parcours');
ok(items.length <= 3, 'fil réel + démo : toujours 3 au maximum');
ok(!feedEvents(fe, 'me', {}, NOW).some((x) => x.userId === 'real' && x.simulated), 'aucune activité simulée pour un vrai membre');
fe.block('me', 'demo2');
ok(!todayFeed(feedEvents(fe, 'me', {}, NOW), NOW, null).some((x) => x.userId === 'demo2'), 'fil : personne bloquée absente');
ok(activeNearby(fe, 'me', NOW).join() === 'demo1', 'en ligne : personne bloquée ou absente exclue');
fe.unblock('me', 'demo2');
ok(activeNearby(fe, 'me', NOW).join() === 'demo1,demo2', 'en ligne maintenant et proche de ton parcours');

ok(welcomeBack(null, NOW) === null && welcomeBack(NOW - DAY, NOW) === null, 'pas de message d’absence avant 3 jours');
ok(welcomeBack(NOW - 4 * DAY, NOW)!.days === 4, '« Content de te revoir » après 4 jours');
ok(greeting(9) === 'Bonjour' && greeting(21) === 'Bonsoir' && greeting(2) === 'Bonsoir', 'salutation selon l’heure');

// ---------- non-lus par discussion
const ib = new SocialEngine(emptyState());
ib.upsertProfile(me); ib.upsertProfile(P('z', { privacy: { ...DEFAULT_PRIVACY, allowMessages: 'tous' } }));
const s0 = ib.send('me', 'z', 'Salut', 'texte', NOW);
const cid = s0.ok ? s0.conversation.id : '';
ib.receive('z', cid, 'Hello', NOW + 1000);
ib.receive('z', cid, 'Ça va ?', NOW + 2000);
ok(unreadCount(ib, 'me', cid, {}) === 2, 'non-lus : 2 messages de l’autre');
ok(unreadCount(ib, 'me', cid, { [cid]: NOW + 1500 }) === 1, 'non-lus : depuis ma dernière lecture');
ib.block('me', 'z');
ok(unreadCount(ib, 'me', cid, {}) === 0, 'non-lus : 0 avec une personne bloquée');

// ---------- première conversation : l’aide se retire progressivement
const M = (who: string) => ({ senderId: who });
ok(assistLevel([], 'me') === 'full', 'aucun message : aide complète');
ok(assistLevel([M('me')], 'me') === 'light', 'premier message envoyé : aide allégée');
ok(assistLevel([M('me'), M('z'), M('me')], 'me') === 'light', '3 messages : encore un peu d’aide');
ok(assistLevel([M('me'), M('z'), M('me'), M('z')], 'me') === 'none', 'discussion établie : plus d’aide');
ok(assistLevel([M('me'), M('me'), M('me'), M('z')], 'me') === 'light', 'un seul message reçu : pas encore établie');
ok(waitingForReply([M('me'), M('me')], 'me') && !waitingForReply([M('me')], 'me') && !waitingForReply([M('me'), M('me'), M('z')], 'me'), 'attente de réponse après 2 messages (limite anti-harcèlement)');
ok(FIRST_STARTERS.length === 3 && FIRST_STARTERS[0] === 'Tu en es où cette semaine ?', 'trois amorces');
ok(frenchSpacing('On vise 8 000 pas ? Oui !') === 'On vise 8 000 pas\u00a0? Oui\u00a0!' && frenchSpacing('« top »') === '«\u00a0top\u00a0»', 'typographie française à l’affichage');
ok(REACTIONS.length === 3 && reactionOf(reactionText(REACTIONS[1]))!.label === 'Bien joué' && reactionOf('Bien joué') === null, 'réactions rapides reconnues');

// ---------- profil : repères seulement s’ils existent
ok(profileHighlights({ helpfulness: 0, stats: null }).length === 0, 'aucune donnée : aucun repère');
const hl = profileHighlights({ helpfulness: 14, stats: { regular: true, challengesDone: 3, demo: true } });
ok(hl.map((h) => h.label).join('|') === 'Régulier|14 encouragements|3 défis terminés', 'repères : Régulier, 14 encouragements, 3 défis terminés');
ok(hl.find((h) => h.id === 'regulier')!.demo && !hl.find((h) => h.id === 'encouragements')!.demo, 'repères de démonstration signalés');
ok(profileHighlights({ helpfulness: 1, stats: null })[0].label === '1 encouragement', 'repère au singulier');
const track = stageTrack(640, 700);
ok(track.length === 6 && track[1].state === 'actuel' && track[0].state === 'passe' && track[2].state === 'futur', 'parcours en 6 étapes, étape actuelle');
ok(stageTrack(100, 7200).find((s) => s.state === 'actuel')!.name === 'Confirmé', 'parcours : meilleur niveau historique');
ok(journeyLine('Élan', 21) === 'Étape Élan · 21 jours', '« Étape Élan · 21 jours »');

// ---------- tenue
const look = lookForOutfit('creme', true)!;
const veste = look.items.find((g) => g.slot === 'veste')!;
ok(veste.name === 'Veste FITAIA' && originLabel(veste) === 'Obtenue : Saison 1', '« Veste FITAIA · Obtenue : Saison 1 »');
ok(originLabel(look.items.find((g) => g.slot === 'haut')!) === 'Obtenu : tenue de départ', 'accord : Obtenu');
ok(lookForOutfit('inconnu', false) === null && look.demo, 'tenue inconnue : rien ; tenue démo signalée');
ok(['origine', 'creme', 'olive', 'titane', 'cargo', 'atelier'].every((id) => lookForOutfit(id, true)!.items.length >= 2), 'chaque tenue connue décrit ses vêtements');
ok(!JSON.stringify(look).match(/prix|price|coin|€|fitcoin/i), 'aucun prix ni monnaie dans la tenue');

// ---------- présence de démonstration
ok(slotOfHour(7) === 'matin' && slotOfHour(12) === 'midi' && slotOfHour(20) === 'soir' && slotOfHour(2) === 'nuit', 'moments de la journée');
const people = Object.keys(DEMO_SOCIAL).map((id, i) => ({ userId: id, slots: ([['matin', 'soir'], ['soir'], ['midi'], ['matin'], ['soir', 'nuit'], ['soir'], ['matin', 'midi'], ['midi', 'soir']] as const)[i].slice() }));
let minActive = 99;
let maxActive = 0;
for (let h = 0; h < 24; h++) {
  const pres = demoPresence(people, h, NOW);
  const c = Object.values(pres).filter((t) => NOW - t < 15 * 60000).length;
  minActive = Math.min(minActive, c);
  maxActive = Math.max(maxActive, c);
}
ok(minActive >= 2 && maxActive <= 5, 'présence démo : entre 2 et 5 personnes en ligne à toute heure');
ok(Object.keys(DEMO_SOCIAL).length === 8, 'données sociales pour les 8 profils de démonstration (mêmes identifiants)');

console.log(n + ' tests communauté (UX) OK');
