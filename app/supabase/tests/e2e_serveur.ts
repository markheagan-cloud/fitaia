/**
 * Test de bout en bout CONTRE LE VRAI SERVEUR (projet Supabase en ligne), avec deux vrais comptes anonymes créés
 * pour l'occasion puis supprimés. Mêmes fonctions que l'app (src/community/server/api.ts).
 *
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=... node scripts/e2e-serveur.js
 *
 * Il échoue au premier écart ; il ne se déclare jamais réussi sans avoir parlé au serveur.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as api from '../../src/community/server/api';
import { DEFAULT_PRIVACY } from '../../src/community/models/types';
import type { CommunityProfile } from '../../src/community/models/types';

const URL_ = process.env.SUPABASE_URL ?? '';
const ANON = process.env.SUPABASE_ANON_KEY ?? '';
if (!URL_ || !ANON) {
  console.error('SUPABASE_URL et SUPABASE_ANON_KEY sont nécessaires');
  process.exit(2);
}

let n = 0;
function check(okv: unknown, label: string) {
  if (!okv) throw new Error('ÉCHEC : ' + label);
  n++;
  console.log('ok ' + label);
}
async function refused(p: Promise<unknown>, label: string) {
  try {
    await p;
  } catch (e) {
    n++;
    console.log('ok ' + label + ' (refusé : ' + api.reasonOf(e) + ')');
    return;
  }
  throw new Error('ÉCHEC : ' + label + ' (aurait dû être refusé)');
}
const client = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

function profile(id: string, name: string, gender: 'f' | 'm', extra: Partial<CommunityProfile['privacy']> = {}): CommunityProfile {
  const now = Date.now();
  return {
    userId: id, displayName: name, avatarId: 'moi', language: 'fr', ageRange: '25-30', timezone: 'Europe/Paris', utcOffset: 1,
    goalCategory: 'perdre', points: 820, highestHistoricalPoints: 820, slots: ['soir'], activities: ['course'], support: ['encouragement'],
    helpfulnessScore: 0, joinedAt: now, lastActiveAt: now, gender, privacy: { ...DEFAULT_PRIVACY, allowMessages: 'tous', ...extra },
  };
}

// 1x1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function main() {
  const A: SupabaseClient = client();
  const B: SupabaseClient = client();
  const a = await api.ensureSession(A);
  const b = await api.ensureSession(B);
  check(a && b && a !== b, 'deux comptes réels distincts créés sur le serveur');
  const started = Date.now();
  try {
    await api.saveProfile(A, a, profile(a, 'Test A', 'f'));
    await api.saveProfile(B, b, profile(b, 'Test B', 'm'));

    // confidentialité : la ligne complète d'un autre est illisible, seule la carte publique l'est
    const raw = await A.from('community_profiles').select('*').eq('user_id', b);
    check(!raw.error && (raw.data ?? []).length === 0, 'A ne lit pas la fiche complète de B (règles d’accès)');
    let pa = await api.pull(A, a);
    check(pa.social.profiles[b]?.displayName === 'Test B', 'A voit la carte publique de B');
    check(pa.social.profiles[b] && pa.social.profiles[b].gender === undefined, 'le genre de B n’est pas exposé');
    check(pa.social.profiles[a]?.points === 820, 'mes points déclarés sont enregistrés');
    check(pa.social.suggested?.some((c) => c.userId === b), 'FitMatch serveur propose B à A');

    // filtre « Me proposer » réciproque
    await api.saveProfile(A, a, profile(a, 'Test A', 'f', { matchWith: 'f' }));
    pa = await api.pull(A, a);
    check(!pa.social.suggested?.some((c) => c.userId === b), 'filtre Femmes de A : B (homme) n’est plus proposé');
    let pb = await api.pull(B, b);
    check(!pb.social.suggested?.some((c) => c.userId === a), 'réciproque : A n’est plus proposée à B');
    await api.saveProfile(A, a, profile(a, 'Test A', 'f'));

    // messages privés
    await api.send(A, a, b, 'Salut, on court ensemble ce soir ?');
    pb = await api.pull(B, b);
    const convB = Object.values(pb.social.conversations).find((c) => c.members.includes(a));
    check(convB && pb.social.messages[convB.id]?.some((m) => m.senderId === a && m.content.startsWith('Salut')), 'B reçoit le message de A');
    await api.send(B, b, a, 'Oui, 19 h au parc !');
    pa = await api.pull(A, a);
    const convA = Object.values(pa.social.conversations).find((c) => c.members.includes(b))!;
    check(pa.social.messages[convA.id]?.some((m) => m.senderId === b && m.content.includes('19 h')), 'A reçoit la réponse de B');
    await refused(api.send(A, a, b, 'appelle-moi au 06 12 34 56 78 ou www.promo.com'), 'lien refusé par le serveur (compte de moins de 2 jours)');

    // amis
    await api.requestFriend(A, a, b, 'ami');
    pb = await api.pull(B, b);
    const req = pb.social.friendships.find((f) => f.userA === a && f.status === 'en_attente');
    check(req, 'B reçoit la demande d’ami de A');
    await api.respondFriend(B, req!.id, true);
    pa = await api.pull(A, a);
    check(pa.social.friendships.some((f) => f.status === 'accepte'), 'A et B sont amis');
    await api.encourage(B, b, a);
    pa = await api.pull(A, a);
    check(pa.social.encouragements.some((e) => e.from === b && e.to === a), 'A reçoit l’encouragement de B');

    // forums : règles, photo, réponse, réaction
    await refused(api.post(A, a, 'f_motivation', 'Premier message'), 'publication refusée avant les règles');
    await api.acceptRules(A, a);
    await api.post(A, a, 'f_motivation', 'Test e2e : 5 km ce matin !', PNG, { tag: 'victoire' });
    pb = await api.pull(B, b);
    const postB = pb.forums.posts.find((p) => p.authorId === a && p.text.startsWith('Test e2e'));
    check(postB && postB.tag === 'victoire', 'B lit le message de A dans le forum');
    check(postB?.photoUri, 'B reçoit un lien vers la photo (stockage privé)');
    const img = await fetch(postB!.photoUri!);
    check(img.ok && (await img.arrayBuffer()).byteLength > 20, 'la photo se télécharge vraiment');
    const anon = await fetch(URL_ + '/storage/v1/object/public/forum-photos/' + a + '/x.png');
    check(!anon.ok, 'la photo n’est pas publique');
    await api.toggleReaction(B, b, postB!.id, 'bravo', false);
    await api.acceptRules(B, b);
    await api.post(B, b, 'f_motivation', 'Bravo, bien joué !', undefined, { parentId: postB!.id });
    pa = await api.pull(A, a);
    const mine = pa.forums.posts.find((p) => p.id === postB!.id)!;
    check(mine.reactions?.bravo?.includes(b), 'A voit la réaction « Bravo » de B');
    check(pa.forums.posts.some((p) => p.parentId === postB!.id && p.authorId === b), 'A voit la réponse de B');

    // running club
    await api.proposeRun(A, a, { forumId: 'run_paris', startAt: Date.now() + 3 * 86400000, everyTwoWeeks: true, place: 'Entrée du parc Monceau', distanceKm: 5, pace: 'tranquille' });
    await refused(api.proposeRun(A, a, { forumId: 'run_paris', startAt: Date.now() + 3 * 86400000, everyTwoWeeks: true, place: '12 rue des Lilas', distanceKm: 5, pace: 'tranquille' }), 'adresse privée refusée');
    pb = await api.pull(B, b);
    const run = pb.forums.meetups.find((m) => m.organizerId === a);
    check(run, 'B voit la sortie running de A');
    await api.setGoing(B, b, run!.id, true);
    pa = await api.pull(A, a);
    check(pa.forums.meetups.find((m) => m.id === run!.id)?.going.includes(b), 'A voit que B vient');

    // signalement : le message disparaît pour celui qui signale et entre en revue
    await api.reportPost(B, b, postB!.id, 'spam');
    pb = await api.pull(B, b);
    check(!pb.forums.posts.some((p) => p.id === postB!.id), 'message signalé : disparaît pour B');
    pa = await api.pull(A, a);
    check(pa.forums.posts.find((p) => p.id === postB!.id)?.state === 'en_revue', 'message signalé : en revue');

    // blocage
    await api.block(B, b, a);
    pa = await api.pull(A, a);
    check(!pa.social.profiles[b], 'après blocage : A ne voit plus B');
    check(!pa.social.friendships.length, 'après blocage : amitié supprimée');
    await refused(api.send(A, a, b, 'tu es là ?'), 'après blocage : A ne peut plus écrire à B');
    pb = await api.pull(B, b);
    check(!pb.forums.posts.some((p) => p.authorId === a), 'après blocage : B ne lit plus les messages de A');
    await api.unblock(B, b, a);
  } finally {
    // suppression des deux comptes (exigence Apple) : tout doit disparaître
    await api.deleteAccount(A, a);
    const C = client();
    const c = await api.ensureSession(C);
    await api.saveProfile(C, c, profile(c, 'Test C', 'm'));
    const pc = await api.pull(C, c);
    check(!pc.social.profiles[a] && !pc.forums.posts.some((p) => p.authorId === a), 'compte A supprimé : profil et messages effacés');
    const files = await B.storage.from('forum-photos').list(a);
    check(!(files.data ?? []).length, 'compte A supprimé : photos effacées');
    await api.deleteAccount(B, b);
    await api.deleteAccount(C, c);
    console.log('durée ' + Math.round((Date.now() - started) / 1000) + ' s');
  }
  console.log('TESTS DE BOUT EN BOUT SERVEUR OK (' + n + ' vérifications)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
