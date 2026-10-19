/**
 * Communauté — phase 1 : matching, confidentialité, blocage, limites des messages, signalement.
 * Logique pure (aucune dépendance React Native) : exécutable avec esbuild ou `node --experimental-strip-types`.
 */
import { DEFAULT_PRIVACY, stageOf } from '../src/community/models/types';
import type { CommunityProfile } from '../src/community/models/types';
import { compatibility, suggest, WEIGHTS, referencePoints, ageCompatible } from '../src/social/fitmatch/matching';
import { publicCard } from '../src/community/services/privacy';
import { checkMessage, LIMITS } from '../src/social/messages/safety';
import { emptyState, SocialEngine } from '../src/community/services/engine';
import { unreadConversations } from '../src/community/services/inbox';

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

// ---------- pondération
ok(Object.values(WEIGHTS).reduce((a, b) => a + b, 0) === 100, 'pondération totale = 100');
ok(WEIGHTS.progression === 30 && WEIGHTS.goal === 25 && WEIGHTS.language === 20 && WEIGHTS.availability === 10, 'pondération 30/25/20/10');
const me = P('me');
ok(compatibility(me, P('twin')).score === 100, 'profil identique = 100');
ok(compatibility(me, P('x', { goalCategory: 'muscler' })).score === 75, 'objectif différent : −25');
ok(compatibility(me, P('x', { language: 'en' })).score === 80, 'langue différente : −20');
ok(compatibility(me, P('x', { slots: ['matin'] })).score === 90, 'horaires différents : −10');
ok(compatibility(me, P('x', { utcOffset: 9 })).score === 95, 'fuseau éloigné : −5');
ok(compatibility(me, P('x')).reasons.includes('meme_fuseau'), 'raison « même fuseau » présente');

// ---------- âge
ok(ageCompatible(me, P('x', { ageRange: '31-35' })), '25-30 et 31-35 : compatibles');
ok(!ageCompatible(me, P('x', { ageRange: '36-45' })), '25-30 et 36-45 : trop d’écart');
ok(!ageCompatible(P('j', { ageRange: '18-24' }), P('x', { ageRange: '31-35' })), '18-24 et 31-35 : trop d’écart');
ok(!compatibility(me, P('x', { ageRange: '46+' })).eligible, 'écart d’âge : non éligible');

// ---------- progression et protection historique
ok(stageOf(0).name === 'Déclic' && stageOf(1500).name === 'Régulier' && stageOf(12000).name === 'Pilier', 'étapes du parcours');
const smurf = P('smurf', { points: 100, highestHistoricalPoints: 7200 });
ok(referencePoints(smurf) === 7200, 'niveau de référence = meilleur niveau historique');
ok(compatibility(P('debutant', { points: 120, highestHistoricalPoints: 120 }), smurf).score < compatibility(P('debutant', { points: 120, highestHistoricalPoints: 120 }), P('b2', { points: 150, highestHistoricalPoints: 150 })).score,
  'un profil redescendu volontairement ne passe pas pour un débutant');
ok(compatibility(me, P('x', { points: 7000, highestHistoricalPoints: 7000 })).score <= 70, 'étapes éloignées : progression = 0');
const eng0 = new SocialEngine(emptyState());
eng0.upsertProfile(P('h', { points: 900, highestHistoricalPoints: 900 }));
eng0.upsertProfile(P('h', { points: 200, highestHistoricalPoints: 200 }));
ok(eng0.s.profiles.h.highestHistoricalPoints === 900, 'le meilleur niveau historique ne descend jamais');

// ---------- suggestions
const pool = [P('a'), P('b', { goalCategory: 'muscler' }), P('c', { privacy: { ...DEFAULT_PRIVACY, allowFitMatch: false } }), P('d', { privacy: { ...DEFAULT_PRIVACY, profileVisible: false } }), P('e', { ageRange: '46+' }), P('f', { language: 'en', goalCategory: 'garder', slots: ['matin'], activities: ['salle'], support: ['conseil'], utcOffset: -6, points: 9000, highestHistoricalPoints: 9000 })];
const s1 = suggest(me, pool, new Set(['me']), NOW, 10).map((c) => c.userId);
ok(s1[0] === 'a' && s1[1] === 'b', 'tri par compatibilité');
ok(!s1.includes('c') && !s1.includes('d'), 'FitMatch désactivé ou profil masqué : exclu');
ok(!s1.includes('e'), 'hors tranche d’âge : exclu');
ok(!s1.includes('f'), 'score trop faible : exclu');
ok(!s1.includes('me'), 'jamais soi-même');

// ---------- confidentialité
const sec = P('sec');
const unknown = publicCard(sec, 'inconnu', NOW)!;
ok(unknown.ageLabel === undefined && unknown.country === undefined, 'âge et pays masqués par défaut');
ok(unknown.goalLabel === 'Perdre du poids', 'objectif général visible par défaut');
ok(!unknown.showBodyProgress, 'progression physique privée par défaut');
ok(!unknown.canMessage, 'messages : amis seulement par défaut');
const keys = Object.keys(unknown).join(',');
ok(!/poids|weight|kg|calor|mensur|photo|adresse|address|position|lat|lng/i.test(keys), 'aucun champ de poids, calories, photo ou position dans la carte publique');
ok(publicCard(sec, 'moi', NOW)!.showBodyProgress && publicCard(sec, 'moi', NOW)!.ageLabel === '25 à 30 ans', 'je vois tout de mon propre profil');
const amis = P('amis', { privacy: { ...DEFAULT_PRIVACY, bodyProgress: 'amis' } });
ok(publicCard(amis, 'ami', NOW)!.showBodyProgress && !publicCard(amis, 'inconnu', NOW)!.showBodyProgress, 'progression « amis » : visible des amis seulement');
const hidden = P('hid', { privacy: { ...DEFAULT_PRIVACY, profileVisible: false } });
ok(publicCard(hidden, 'inconnu', NOW) === null && publicCard(hidden, 'ami', NOW) !== null, 'profil masqué : visible des amis seulement');

// ---------- moteur : amis, blocage, messages, signalement
const e = new SocialEngine(emptyState());
e.upsertProfile(P('me'));
e.upsertProfile(P('a', { privacy: { ...DEFAULT_PRIVACY, allowMessages: 'tous' } }));
e.upsertProfile(P('b'));
e.upsertProfile(P('c', { privacy: { ...DEFAULT_PRIVACY, allowMessages: 'personne' } }));
for (const id of ['f1', 'f2', 'f3', 'f4']) e.upsertProfile(P(id));

ok(!e.canMessage('me', 'b').ok, 'message refusé : n’accepte que ses amis');
ok(!e.canMessage('me', 'c').ok, 'message refusé : n’accepte personne');
ok(e.requestFriend('me', 'b').ok, 'demande d’ami');
ok(!e.requestFriend('me', 'b').ok, 'pas de double demande');
ok(e.pendingFor('b').length === 1, 'demande reçue');
ok(e.requestFriend('b', 'me').ok && e.relation('me', 'b') === 'ami', 'demande croisée = acceptation');
ok(e.canMessage('me', 'b').ok, 'amis : messages autorisés');
ok(!e.candidates('me', NOW).some((c) => c.userId === 'b'), 'un ami n’est plus proposé dans FitMatch');

for (const id of ['f1', 'f2', 'f3']) {
  e.requestFriend('me', id, 'fitmate');
  e.respondFriend(id, e.friendship('me', id)!.id, true);
}
ok(!e.requestFriend('me', 'f4', 'fitmate').ok, 'trois FitMates au maximum');

const r1 = e.send('me', 'a', 'Salut ! Tu en es où cette semaine ?', 'texte', NOW);
ok(r1.ok, 'premier message envoyé');
const conv = r1.ok ? r1.conversation : null;
ok(e.send('me', 'a', 'Tu es là ?', 'texte', NOW + 1000).ok, 'deuxième message avant réponse');
const r3 = e.send('me', 'a', 'Allô ?', 'texte', NOW + 2000);
ok(!r3.ok, 'troisième message refusé tant que l’autre n’a pas répondu');
e.receive('a', conv!.id, 'Salut, ça avance !', NOW + 3000);
ok(e.send('me', 'a', 'Top !', 'texte', NOW + 4000).ok, 'après sa réponse, la discussion est libre');

e.block('me', 'a', NOW + 5000);
ok(!e.canMessage('me', 'a').ok && !e.canMessage('a', 'me').ok, 'blocage : plus de messages, dans les deux sens');
ok(!e.candidates('a', NOW).some((c) => c.userId === 'me') && !e.candidates('me', NOW).some((c) => c.userId === 'a'), 'blocage : plus de suggestion, dans les deux sens');
ok(e.card('me', 'a') === null && e.card('a', 'me') === null, 'blocage : profil invisible');
ok(e.conversationsOf('me').every((c) => !c.members.includes('a')), 'blocage : discussion masquée');
const before = (e.s.messages[conv!.id] ?? []).length;
e.receive('a', conv!.id, 'Message après blocage', NOW + 6000);
ok((e.s.messages[conv!.id] ?? []).length === before, 'blocage : les messages entrants sont refusés');
e.block('me', 'b');
ok(e.relation('me', 'b') === 'inconnu', 'blocage : l’amitié disparaît');
e.unblock('me', 'a');
ok(e.card('me', 'a') !== null, 'déblocage');

const m = e.s.messages[conv!.id].find((x) => x.senderId === 'a')!;
const rep = e.report('me', 'a', 'harcelement', m.id);
ok(rep.status === 'recu' && e.s.reports.length === 1, 'signalement enregistré');
ok(m.moderationState === 'en_revue', 'message signalé : masqué en attendant la vérification');

ok(e.encourage('me', 'f1', NOW).ok && !e.encourage('me', 'f1', NOW + 60000).ok, 'encouragement : 1 par heure et par personne');

// ---------- non lus
const ib = new SocialEngine(emptyState());
ib.upsertProfile(P('me')); ib.upsertProfile(P('z', { privacy: { ...DEFAULT_PRIVACY, allowMessages: 'tous' } }));
const sent = ib.send('me', 'z', 'Salut', 'texte', NOW);
const cid = sent.ok ? sent.conversation.id : '';
ok(unreadConversations(ib, 'me', {}).length === 0, 'non lu : mon propre message ne compte pas');
ib.receive('z', cid, 'Hello', NOW + 1000);
ok(unreadConversations(ib, 'me', {}).length === 1, 'non lu : réponse reçue');
ok(unreadConversations(ib, 'me', { [cid]: NOW + 2000 }).length === 0, 'non lu : discussion ouverte après la réponse');
ib.block('me', 'z');
ok(unreadConversations(ib, 'me', {}).length === 0, 'non lu : personne bloquée ignorée');

// ---------- limites des messages
const base = { now: NOW, myRecent: [], sentInThisConversation: 0, otherHasReplied: true, accountAgeDays: 10, newConversationsToday: 0, isNewConversation: false };
ok(!checkMessage({ ...base, text: '   ' }).ok, 'message vide refusé');
ok(!checkMessage({ ...base, text: 'x'.repeat(LIMITS.maxLength + 1) }).ok, 'message trop long refusé');
ok(!checkMessage({ ...base, text: 'hey', myRecent: Array.from({ length: 8 }, (_, i) => ({ createdAt: NOW - i * 1000, content: 'm' + i })) }).ok, '8 messages par minute au maximum');
ok(!checkMessage({ ...base, text: 'Coucou', myRecent: Array.from({ length: 3 }, (_, i) => ({ createdAt: NOW - (i + 2) * 120000, content: 'coucou' })) }).ok, 'répétition du même message refusée');
ok(!checkMessage({ ...base, text: 'Salut', isNewConversation: true, newConversationsToday: 10, otherHasReplied: false }).ok, '10 nouvelles discussions par jour au maximum');
ok(!checkMessage({ ...base, text: 'va sur www.promo.com', accountAgeDays: 1 }).ok, 'pas de lien pour un compte de moins de 2 jours');
ok(checkMessage({ ...base, text: 'va sur www.promo.com', accountAgeDays: 5 }).ok, 'liens autorisés ensuite');
ok(!checkMessage({ ...base, text: 'appelle moi 06 12 34 56 78', otherHasReplied: false }).ok, 'pas de numéro de téléphone au premier échange');

console.log(n + ' tests communauté OK');
