/** Appel d'un Space Hugging Face (src/avatar/gradioCall.ts) et lecture de sa réponse (src/avatar/caricature.ts), faux serveur en mémoire. */
import { base64ToBytes, callGradio, finalEvent, type GradioFetch } from '../src/avatar/gradioCall';
import { finishedSpaceCaricature } from '../src/avatar/caricature';
import { createCheck } from './helpers/check';

const t = createCheck();

// flux SSE tel que Gradio 6.30 le rend (vérifié avec hero3d/caricature/space/test_space.py)
const sse = 'event: heartbeat\ndata: null\n\nevent: heartbeat\ndata: null\n\nevent: complete\ndata: ["{\\"ok\\": true}"]\n\n';
t.equal(finalEvent(sse)?.event, 'complete', 'dernier événement final lu');
t.equal(finalEvent(sse)?.data, '["{\\"ok\\": true}"]', 'données de l’événement');
t.equal(finalEvent('event: heartbeat\ndata: null\n\n'), null, 'sans événement final : null');
t.equal(finalEvent('event: error\ndata: "GPU quota exceeded"\n')?.event, 'error', 'erreur Gradio reconnue');

t.equal(Array.from(base64ToBytes('aGVsbG8=')).join(','), '104,101,108,108,111', 'base64 → octets (padding 1)');
t.equal(Array.from(base64ToBytes('aGk=')).join(','), '104,105', 'base64 → octets (hi)');
t.equal(Array.from(base64ToBytes('YQ==')).join(','), '97', 'base64 → octets (padding 2)');
t.equal(base64ToBytes('iVBORw0KGgo=\n')[0], 137, 'retour à la ligne toléré, en-tête PNG');

const OK = JSON.stringify({ ok: true, portrait: 'AAAA', corps: { surpoids: 'BBBB', actuel: 'CCCC', athletique: 'DDDD' }, report: { limites: [], duree_s: 31.6, modele: 'FLUX.2 klein 4B', graine: 11 } });
const r = finishedSpaceCaricature(OK, 'id1');
t.equal(r?.id, 'id1', 'réponse du Space lue');
t.equal(r?.bodies.actuel, 'CCCC', 'bustes en base64');
t.equal(finishedSpaceCaricature(JSON.stringify({ ok: true, portrait: 'A', corps: { surpoids: 'B' } }), 'x'), null, 'buste manquant → null');
let msg = '';
try {
  finishedSpaceCaricature(JSON.stringify({ ok: false, error: 'photo absente ou trop lourde' }), 'x');
} catch (e) {
  msg = (e as Error).message;
}
t.equal(msg, 'photo absente ou trop lourde', 'erreur fonctionnelle du Space : son message');
t.equal(finishedSpaceCaricature('pas du json', 'x'), null, 'JSON illisible → null');

function fakeSpace(replies: { status: number; text: string }[]) {
  const calls: { url: string; method: string; body?: string }[] = [];
  const fetch: GradioFetch = async function (this: unknown, url, init) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    calls.push({ url, method: init.method, body: init.body });
    const r = replies.shift();
    if (!r) throw new TypeError('Network request failed');
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.text };
  };
  return { fetch, calls };
}

(async () => {
  const s = fakeSpace([{ status: 200, text: '{"event_id":"ev1"}' }, { status: 200, text: 'event: heartbeat\ndata: null\n\nevent: complete\ndata: ' + JSON.stringify([OK]) + '\n\n' }]);
  const out = await callGradio('https://x.hf.space/', 'caricature', ['photo', 'm', '{}'], { fetch: s.fetch });
  t.equal(out, OK, 'première sortie rendue telle quelle');
  t.equal(s.calls[0].url, 'https://x.hf.space/gradio_api/call/caricature', 'POST sur l’API');
  t.equal(JSON.parse(s.calls[0].body ?? '{}').data[1], 'm', 'données envoyées dans "data"');
  t.equal(s.calls[1].url, 'https://x.hf.space/gradio_api/call/caricature/ev1', 'GET du résultat avec l’event_id');
  t.equal(s.calls[1].method, 'GET', '… en GET');

  const expectErr = async (p: Promise<unknown>) => {
    try {
      await p;
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  };
  t.ok((await expectErr(callGradio('https://x.hf.space', 'caricature', [], { fetch: fakeSpace([]).fetch }))).startsWith('Serveur de dessin injoignable'), 'réseau coupé : message lisible');
  t.ok((await expectErr(callGradio('https://x.hf.space', 'caricature', [], { fetch: fakeSpace([{ status: 200, text: '{"event_id":"e"}' }, { status: 200, text: 'event: error\ndata: "GPU quota exceeded"\n' }]).fetch }))).includes('quota'), 'quota ZeroGPU épuisé : message dédié');
  t.ok((await expectErr(callGradio('https://x.hf.space', 'caricature', [], { fetch: fakeSpace([{ status: 503, text: 'Space is sleeping' }]).fetch }))).includes('503'), 'Space endormi : code rendu');
  t.ok((await expectErr(callGradio('https://x.hf.space', 'caricature', [], { fetch: fakeSpace([{ status: 200, text: '{"event_id":"e"}' }, { status: 200, text: 'event: heartbeat\ndata: null\n' }]).fetch }))).includes('pas fini'), 'flux sans fin : erreur, pas de perso');
  console.log(t.count() + ' tests appel du Space OK');
})();
