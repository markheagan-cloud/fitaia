/**
 * Selfie → avatar 3D : protocole envoi + suivi (src/avatar/avatar3dJob.ts), avec un faux serveur en mémoire.
 * Le vrai serveur Python est vérifié par hero3d/human/code/test_serve_avatar.py.
 */
import { runAvatarJob, type JobFetch } from '../src/avatar/avatar3dJob';
import { runSuite } from './helpers/check';

type Reply = { status: number; body: unknown } | 'network-error';

/** Faux serveur : une réponse par appel, dans l'ordre ; garde la trace des appels. */
function fakeServer(replies: Reply[]) {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const fetch: JobFetch = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    const r = replies.shift();
    if (!r) throw new Error('appel inattendu : ' + url);
    if (r === 'network-error') throw new TypeError('Network request failed');
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { fetch, calls };
}

const ID = 'a'.repeat(32);
const REPORT = { ok: true, traits_photo: { cibles_visage: 39 }, non_deductible: [], limites: [] };
const accepted: Reply = { status: 202, body: { ok: true, id: ID, status: '/v1/avatar/' + ID } };
const running: Reply = { status: 200, body: { ok: true, state: 'running' } };
const queued: Reply = { status: 200, body: { ok: true, state: 'queued' } };
const done: Reply = { status: 200, body: { ok: true, state: 'done', id: ID, glb: '/v1/avatar/' + ID + '.glb', report: REPORT } };

/** Horloge virtuelle : sleep avance le temps sans attendre. */
function virtualTime() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

const expectError = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return '';
};

runSuite('suivi avatar 3D', async (t) => {
  // 1. parcours normal : 202 tout de suite, puis états, puis GLB
  {
    const s = fakeServer([accepted, queued, running, running, done]);
    const v = virtualTime();
    const states: string[] = [];
    const r = await runAvatarJob('http://pc:8790', { photo: 'xx', sex: 'm' }, { fetch: s.fetch, headers: { Authorization: 'Bearer k' }, ...v, onState: (x) => states.push(x) });
    t.equal(r, { id: ID, glb: '/v1/avatar/' + ID + '.glb', report: REPORT }, 'résultat = GLB et rapport du serveur');
    t.equal(s.calls.map((c) => c.method + ' ' + c.url), [
      'POST http://pc:8790/v1/avatar',
      'GET http://pc:8790/v1/avatar/' + ID,
      'GET http://pc:8790/v1/avatar/' + ID,
      'GET http://pc:8790/v1/avatar/' + ID,
      'GET http://pc:8790/v1/avatar/' + ID,
    ], 'une requête d’envoi puis des requêtes courtes de suivi');
    t.equal(JSON.parse(s.calls[0].body ?? '{}'), { photo: 'xx', sex: 'm' }, 'la photo part dans l’envoi');
    t.ok(s.calls.every((c) => c.headers.Authorization === 'Bearer k'), 'jeton sur chaque requête');
    t.equal(s.calls[0].headers['Content-Type'], 'application/json', 'envoi en JSON');
    t.equal(states, ['queued', 'running'], 'états signalés une fois chacun');
    t.equal(v.now(), 4 * 3000, 'une demande d’état toutes les 3 s');
  }

  // 2. une minute et plus de calcul : aucune requête ne reste ouverte, le suivi continue
  {
    const s = fakeServer([accepted, ...Array.from({ length: 30 }, () => running), done]);
    const v = virtualTime();
    const r = await runAvatarJob('http://pc', {}, { fetch: s.fetch, headers: {}, ...v });
    t.equal(r.id, ID, 'tâche de 93 s menée au bout');
    t.ok(v.now() >= 90_000, 'durée simulée au-delà des 60 s d’inactivité iOS');
  }

  // 3. coupures réseau brèves pendant le suivi (écran verrouillé, Wi-Fi) : on reprend
  {
    const s = fakeServer([accepted, running, 'network-error', 'network-error', running, done]);
    const r = await runAvatarJob('http://pc', {}, { fetch: s.fetch, headers: {}, ...virtualTime() });
    t.equal(r.id, ID, 'deux coupures pendant le suivi : création récupérée');
  }

  // 4. trop de coupures d'affilée : erreur claire
  {
    const s = fakeServer([accepted, ...Array.from({ length: 4 }, () => 'network-error' as const)]);
    const msg = await expectError(runAvatarJob('http://pc', {}, { fetch: s.fetch, headers: {}, ...virtualTime(), maxNetworkErrors: 3 }));
    t.equal(msg, 'Serveur d’avatar injoignable. Vérifie ta connexion.', 'serveur perdu : message de connexion');
  }

  // 5. serveur injoignable dès l'envoi
  {
    const s = fakeServer(['network-error']);
    const msg = await expectError(runAvatarJob('http://pc', {}, { fetch: s.fetch, headers: {}, ...virtualTime() }));
    t.equal(msg, 'Serveur d’avatar injoignable. Vérifie ta connexion.', 'envoi impossible : message de connexion');
  }

  // 6. échec réel du calcul (aucun visage) : le message du serveur est montré tel quel
  {
    const s = fakeServer([accepted, running, { status: 422, body: { ok: false, state: 'failed', error: 'aucun visage détecté' } }]);
    const msg = await expectError(runAvatarJob('http://pc', {}, { fetch: s.fetch, headers: {}, ...virtualTime() }));
    t.equal(msg, 'aucun visage détecté', 'échec du serveur transmis sans maquillage');
  }

  // 7. photo refusée à l'envoi (400 / 401)
  {
    const s = fakeServer([{ status: 401, body: { ok: false, error: 'jeton invalide' } }]);
    const msg = await expectError(runAvatarJob('http://pc', {}, { fetch: s.fetch, headers: {}, ...virtualTime() }));
    t.equal(msg, 'jeton invalide', 'refus à l’envoi transmis');
  }

  // 8. serveur redémarré : tâche inconnue
  {
    const s = fakeServer([accepted, { status: 404, body: { ok: false, error: 'tâche introuvable' } }]);
    const msg = await expectError(runAvatarJob('http://pc', {}, { fetch: s.fetch, headers: {}, ...virtualTime() }));
    t.ok(msg.includes('Relance'), 'tâche perdue : invitation à relancer');
  }

  // 9. délai maximum dépassé
  {
    const s = fakeServer([accepted, ...Array.from({ length: 200 }, () => running)]);
    const msg = await expectError(runAvatarJob('http://pc', {}, { fetch: s.fetch, headers: {}, ...virtualTime(), timeoutMs: 60_000 }));
    t.ok(msg.startsWith('La création prend trop de temps'), 'suivi borné dans le temps');
  }

  // 10. « terminé » sans GLB : jamais présenté comme un avatar prêt
  {
    const s = fakeServer([accepted, { status: 200, body: { ok: true, state: 'done', id: ID } }]);
    const msg = await expectError(runAvatarJob('http://pc', {}, { fetch: s.fetch, headers: {}, ...virtualTime() }));
    t.equal(msg, 'Réponse incomplète du serveur d’avatar.', 'réponse incomplète refusée');
  }

  // 11. annulation : on s'arrête sans autre requête
  {
    const ctrl = new AbortController();
    const s = fakeServer([accepted, running, running]);
    const v = virtualTime();
    const sleep = async (ms: number) => {
      await v.sleep(ms);
      if (v.now() >= 6000) ctrl.abort();
    };
    const msg = await expectError(runAvatarJob('http://pc', {}, { fetch: s.fetch, headers: {}, now: v.now, sleep, signal: ctrl.signal }));
    t.equal(msg, 'Création annulée.', 'annulation respectée');
    t.equal(s.calls.length, 2, 'aucune requête après l’annulation');
  }

  // 12. ancien serveur (réponse synchrone 200 avec le GLB) : toujours accepté
  {
    const s = fakeServer([{ status: 200, body: { ok: true, id: ID, glb: '/v1/avatar/' + ID + '.glb', report: REPORT } }]);
    const r = await runAvatarJob('http://pc', {}, { fetch: s.fetch, headers: {}, ...virtualTime() });
    t.equal(r.glb, '/v1/avatar/' + ID + '.glb', 'compatibilité avec l’ancien serveur');
    t.equal(s.calls.length, 1, 'pas de suivi inutile');
  }
});
