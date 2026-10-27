/** Appel direct du service Modal (src/avatar/directCall.ts), faux serveur en mémoire. */
import { callDirect, directError } from '../src/avatar/directCall';
import type { GradioFetch } from '../src/avatar/gradioCall';
import { createCheck } from './helpers/check';

const t = createCheck();

t.ok(/jeton/.test(directError(401)) && /jeton/.test(directError(403)), '401/403 : jeton');
t.ok(/saturé/.test(directError(429)), '429 : saturé');
t.ok(/introuvable/.test(directError(404)), '404 : introuvable');
t.ok(/502/.test(directError(502)) && /418/.test(directError(418)), 'autres codes : le code est cité');

type Init = Parameters<GradioFetch>[1];
const okFetch = (body: string, status = 200, cap?: { url?: string; init?: Init }): GradioFetch =>
  async (url, init) => {
    if (cap) {
      cap.url = url;
      cap.init = init;
    }
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
const slow: GradioFetch = (_u, init) =>
  new Promise((_r, rej) => {
    init.signal?.addEventListener('abort', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      rej(e);
    });
  });
const expectErr = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return '';
};

(async () => {
  const cap: { url?: string; init?: Init } = {};
  const out = await callDirect('https://x.modal.run', { photo: 'abc', sex: 'm', sheet: { skin: 's5' } }, { fetch: okFetch('{"ok":true}', 200, cap), headers: { Authorization: 'Bearer t' } });
  t.equal(out, '{"ok":true}', 'texte de la réponse rendu tel quel');
  t.equal(cap.url, 'https://x.modal.run', 'adresse appelée');
  t.equal(cap.init?.method, 'POST', 'méthode POST');
  t.equal(cap.init?.headers.Authorization, 'Bearer t', 'jeton transmis');
  t.equal(cap.init?.headers['Content-Type'], 'application/json', 'corps déclaré JSON');
  t.equal(JSON.parse(cap.init?.body ?? '{}'), { photo: 'abc', sex: 'm', sheet: { skin: 's5' } }, 'charge utile {photo, sex, sheet}');

  t.ok(/jeton/.test(await expectErr(callDirect('u', {}, { fetch: okFetch('', 401) }))), '401 : message jeton');
  t.ok(/503/.test(await expectErr(callDirect('u', {}, { fetch: okFetch('', 503) }))), '503 : message avec le code');
  t.ok(/vide/.test(await expectErr(callDirect('u', {}, { fetch: okFetch('   ') }))), 'réponse vide refusée');
  t.ok(/trop de temps/.test(await expectErr(callDirect('u', {}, { fetch: slow, timeoutMs: 20 }))), 'délai dépassé : message lisible');

  const ctl = new AbortController();
  const p = expectErr(callDirect('u', {}, { fetch: slow, signal: ctl.signal }));
  ctl.abort();
  t.ok(/annulée/.test(await p), 'annulation par l’app : message « annulée »');
  console.log(t.count() + ' vérifications OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
