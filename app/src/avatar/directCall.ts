/**
 * Appel direct d'un service « selfie → caricature » qui répond en une seule requête JSON (hero3d/caricature/space/modal_app.py
 * sur Modal). Pur, testé (tests/direct-call.test.ts).
 *
 *   POST <url>  {"photo": "<jpeg base64>", "sex": "m"|"f", "sheet": {...}}  →  JSON {"ok", "portrait", "corps", "report"}
 *
 * La réponse arrive d'un bloc après le calcul (quelques dizaines de secondes sur une carte louée) ; au-delà de
 * `timeoutMs` l'appel est abandonné avec un message lisible.
 */
import type { GradioFetch } from './gradioCall';

export type DirectOptions = { fetch: GradioFetch; headers?: Record<string, string>; signal?: AbortSignal; timeoutMs?: number };

/** Message lisible pour l'app selon le code HTTP du service. */
export function directError(status: number): string {
  if (status === 401 || status === 403) return 'Serveur de dessin : accès refusé (jeton).';
  if (status === 429) return 'Serveur de dessin saturé, réessaie dans une minute.';
  if (status === 404) return 'Serveur de dessin introuvable à cette adresse.';
  if (status >= 500) return 'Serveur de dessin en erreur (' + status + '). Réessaie.';
  return 'Serveur de dessin : réponse ' + status + '.';
}

/** Envoie la requête et rend le texte JSON de la réponse ; lève une erreur lisible sinon. */
export async function callDirect(url: string, payload: Record<string, unknown>, o: DirectOptions): Promise<string> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const onAbort = () => ctl?.abort();
  o.signal?.addEventListener('abort', onAbort);
  const timer = ctl ? setTimeout(() => ctl.abort(), o.timeoutMs ?? 180_000) : null;
  try {
    const res = await o.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(o.headers ?? {}) },
      body: JSON.stringify(payload),
      signal: ctl?.signal ?? o.signal,
    });
    if (!res.ok) throw new Error(directError(res.status));
    const text = await res.text();
    if (!text.trim()) throw new Error('Réponse vide du serveur de dessin.');
    return text;
  } catch (e) {
    if (o.signal?.aborted) throw new Error('Création du perso annulée.');
    if (e instanceof Error && e.name === 'AbortError') throw new Error('Le serveur de dessin met trop de temps à répondre. Réessaie.');
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
    o.signal?.removeEventListener('abort', onAbort);
  }
}
