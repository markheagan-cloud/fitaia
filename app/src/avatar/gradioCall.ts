/**
 * Appel de l'API d'un Space Hugging Face (Gradio) depuis l'app, sans bibliothèque : pur, testé (tests/gradio-call.test.ts).
 *
 * Protocole Gradio (vérifié en local avec Gradio 6.30, hero3d/caricature/space/test_space.py) :
 *   POST <space>/gradio_api/call/<api>  {"data": [...]}  → {"event_id": "..."}
 *   GET  <space>/gradio_api/call/<api>/<event_id>         → flux texte « event: … / data: … » jusqu'à `complete` ou `error`.
 * Le GET reste ouvert pendant le calcul (quelques dizaines de secondes sur ZeroGPU) ; Gradio envoie des battements, la
 * connexion n'est donc jamais inactive (délai iOS de 60 s), et fetch rend le texte entier à la fin.
 */
export type GradioFetch = (url: string, init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type GradioEvent = { event: string; data: string };

/** Dernier événement final (`complete` ou `error`) d'un flux SSE Gradio ; null s'il n'y en a pas. */
export function finalEvent(sse: string): GradioEvent | null {
  let last: GradioEvent | null = null;
  const lines = sse.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^event:\s*(\w+)\s*$/.exec(lines[i]);
    if (!m) continue;
    // la ligne `data:` suit l'événement (une seule ligne : Gradio sérialise en JSON compact)
    const d = lines[i + 1] ?? '';
    const data = d.startsWith('data:') ? d.slice(5).trim() : '';
    if (m[1] === 'complete' || m[1] === 'error') last = { event: m[1], data };
  }
  return last;
}

/** Base64 → octets, sans atob (absent de certains moteurs) ; tolère les retours à la ligne. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4) - pad);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (table.indexOf(clean[i]) << 18) | (table.indexOf(clean[i + 1]) << 12) | ((table.indexOf(clean[i + 2]) & 63) << 6) | (table.indexOf(clean[i + 3]) & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/**
 * Appelle `api` avec `data` et rend la première sortie (chaîne). Erreur lisible si le Space est injoignable, en file
 * trop longue, ou s'il répond par une erreur.
 */
export async function callGradio(space: string, api: string, data: unknown[], o: { fetch: GradioFetch; headers?: Record<string, string>; signal?: AbortSignal }): Promise<string> {
  const base = space.replace(/\/+$/, '') + '/gradio_api/call/' + api;
  const headers = { 'Content-Type': 'application/json', ...(o.headers ?? {}) };
  const request = o.fetch;
  let res: Awaited<ReturnType<GradioFetch>>;
  try {
    res = await request(base, { method: 'POST', headers, body: JSON.stringify({ data }), signal: o.signal });
  } catch {
    if (o.signal?.aborted) throw new Error('Création annulée.');
    throw new Error('Serveur de dessin injoignable. Vérifie ta connexion.');
  }
  const first = await res.text();
  let eventId = '';
  try {
    eventId = String((JSON.parse(first) as { event_id?: string }).event_id ?? '');
  } catch {
    // réponse non JSON : traitée juste après
  }
  if (!res.ok || !eventId) {
    if (res.status === 429 || /quota/i.test(first)) throw new Error('Le serveur de dessin a atteint son quota gratuit du jour. Réessaie plus tard.');
    throw new Error('Serveur de dessin : réponse inattendue (' + res.status + ').');
  }
  let r: Awaited<ReturnType<GradioFetch>>;
  try {
    r = await request(base + '/' + eventId, { method: 'GET', headers: o.headers ?? {}, signal: o.signal });
  } catch {
    if (o.signal?.aborted) throw new Error('Création annulée.');
    throw new Error('Connexion coupée pendant le dessin. Réessaie.');
  }
  const fin = finalEvent(await r.text());
  if (!fin) throw new Error('Le serveur de dessin n’a pas fini (' + r.status + '). Réessaie.');
  if (fin.event === 'error') {
    const msg = fin.data.replace(/^"|"$/g, '');
    throw new Error(/quota|GPU/i.test(msg) ? 'Le serveur de dessin a atteint son quota gratuit du jour. Réessaie plus tard.' : 'Serveur de dessin : ' + (msg || 'erreur') + '.');
  }
  let outputs: unknown;
  try {
    outputs = JSON.parse(fin.data);
  } catch {
    throw new Error('Réponse illisible du serveur de dessin.');
  }
  const out = Array.isArray(outputs) ? outputs[0] : null;
  if (typeof out !== 'string') throw new Error('Réponse incomplète du serveur de dessin.');
  return out;
}
