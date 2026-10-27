/**
 * Selfie → caricature : lecture de la réponse du serveur (src/avatar/caricature.ts) et protocole envoi + suivi partagé
 * avec l'avatar 3D (runServerJob), avec un faux serveur en mémoire. Le vrai serveur Python est hero3d/caricature/.
 */
import { runServerJob, type JobBody, type JobFetch } from '../src/avatar/avatar3dJob';
import { buildCaricature, caricatureFileName, finishedCaricature } from '../src/avatar/caricature';
import { createCheck } from './helpers/check';

const t = createCheck();
type Reply = { status: number; body: unknown } | 'network-error';

function fakeServer(replies: Reply[]) {
  const calls: { url: string; method: string; body?: string }[] = [];
  const fetch: JobFetch = async function (this: unknown, url, init) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    calls.push({ url, method: init.method, body: init.body });
    const r = replies.shift();
    if (!r) throw new Error('appel inattendu : ' + url);
    if (r === 'network-error') throw new TypeError('Network request failed');
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { fetch, calls };
}
function virtualTime() {
  let now = 0;
  return { now: () => now, sleep: async (ms: number) => void (now += ms) };
}
const ID = 'b'.repeat(32);
const corps = { surpoids: `/v1/caricature/${ID}/surpoids.png`, actuel: `/v1/caricature/${ID}/actuel.png`, athletique: `/v1/caricature/${ID}/athletique.png` };
const report = { limites: ['Illustration, pas une prédiction.'], duree_s: 612.4, modele: 'FLUX.2 klein 4B Q4_K_M', graine: 11 };
const done: JobBody = { ok: true, state: 'done', id: ID, portrait: `/v1/caricature/${ID}/portrait.png`, corps, report };

// lecture de la réponse finale
const r = finishedCaricature(done);
t.ok(!!r, 'réponse complète → résultat');
t.equal(r?.bodies.athletique, corps.athletique, 'les trois bustes sont lus');
t.equal(finishedCaricature({ ...done, corps: { surpoids: corps.surpoids, actuel: corps.actuel } }), null, 'un buste manquant → rien (jamais de perso à moitié)');
t.equal(finishedCaricature({ ...done, portrait: undefined }), null, 'portrait manquant → rien');
t.equal(finishedCaricature({ ...done, ok: false }), null, 'ok faux → rien');

const c = buildCaricature(r!, 'm', { portrait: 'file:///doc/p.png', bodies: { surpoids: 'file:///doc/s.png', actuel: 'file:///doc/a.png', athletique: 'file:///doc/t.png' } }, 1000);
t.equal(c.id, ID, 'identifiant conservé');
t.equal(c.portraitUri, 'file:///doc/p.png', 'portrait = fichier du téléphone, pas l’adresse du serveur');
t.equal(c.seed, 11, 'graine lue');
t.equal(c.durationS, 612, 'durée arrondie');
t.equal(c.model, 'FLUX.2 klein 4B Q4_K_M', 'modèle lu');
t.equal(c.limits.length, 1, 'limites lues');
t.equal(buildCaricature({ ...r!, report: {} }, 'f', { portrait: 'p', bodies: c.bodies }).seed, null, 'sans rapport : champs nuls, pas d’invention');
t.equal(caricatureFileName(ID, 'portrait'), 'caricature-' + ID + '-portrait.png', 'nom de fichier stable');

// protocole : 202 puis suivi jusqu'au résultat, avec coupure réseau tolérée
(async () => {
  const srv = fakeServer([
    { status: 202, body: { ok: true, id: ID, status: '/v1/caricature/' + ID } },
    { status: 200, body: { ok: true, state: 'queued' } },
    'network-error',
    { status: 200, body: { ok: true, state: 'running' } },
    { status: 200, body: done },
  ]);
  const states: string[] = [];
  const vt = virtualTime();
  const res = await runServerJob('http://pc:8791', '/v1/caricature', { photo: 'x', sex: 'm' }, { fetch: srv.fetch, headers: {}, ...vt, pollMs: 5000, onState: (s) => states.push(s) }, finishedCaricature, 'perso');
  t.equal(res.id, ID, 'suivi jusqu’au résultat');
  t.equal(srv.calls[0].url, 'http://pc:8791/v1/caricature', 'envoi sur la route caricature');
  t.equal(srv.calls[0].method, 'POST', '… en POST');
  t.equal(JSON.parse(srv.calls[0].body ?? '{}').sex, 'm', 'base envoyée');
  t.equal(states.join(','), 'queued,running', 'états remontés une fois chacun');
  t.equal(srv.calls.length, 5, 'une coupure réseau n’abandonne pas la tâche');

  const failed = fakeServer([
    { status: 202, body: { ok: true, id: ID, status: '/v1/caricature/' + ID } },
    { status: 200, body: { ok: false, state: 'failed', error: 'ComfyUI arrêté' } },
  ]);
  let msg = '';
  try {
    await runServerJob('http://pc:8791', '/v1/caricature', {}, { fetch: failed.fetch, headers: {}, ...virtualTime() }, finishedCaricature, 'perso');
  } catch (e) {
    msg = (e as Error).message;
  }
  t.equal(msg, 'ComfyUI arrêté', 'échec serveur : son message, lisible');

  const incomplete = fakeServer([
    { status: 202, body: { ok: true, id: ID, status: '/v1/caricature/' + ID } },
    { status: 200, body: { ...done, corps: {} } },
  ]);
  msg = '';
  try {
    await runServerJob('http://pc:8791', '/v1/caricature', {}, { fetch: incomplete.fetch, headers: {}, ...virtualTime() }, finishedCaricature, 'perso');
  } catch (e) {
    msg = (e as Error).message;
  }
  t.ok(msg.startsWith('Réponse incomplète'), 'réponse finale incomplète → erreur, pas de perso');
  console.log(t.count() + ' tests caricature OK');
})();
