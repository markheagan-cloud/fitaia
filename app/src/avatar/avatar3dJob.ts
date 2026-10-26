/**
 * Protocole « selfie → avatar 3D » avec le serveur FITAIA (pur, sans module natif : testé dans tests/avatar3d-job.test.ts).
 *
 * Construire un avatar prend ≈ 1 min. Une seule requête qui attend la fin reste muette pendant tout ce temps : sur
 * iPhone, URLSession l'abandonne après 60 s d'inactivité (délai par défaut), et elle meurt si l'écran se verrouille.
 * Le serveur répond donc tout de suite (202 + identifiant) et l'app demande l'état toutes les quelques secondes.
 * Une coupure brève pendant le suivi n'annule pas la tâche : on réessaie. Aucun résultat n'est inventé côté app.
 */
import type { ServerReport } from './avatar3dReport';

export type JobFetch = (url: string, init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export type JobBody = {
  ok?: boolean;
  id?: string;
  state?: 'queued' | 'running' | 'done' | 'failed';
  status?: string;
  glb?: string;
  error?: string;
  /** Rapport du serveur : avatar 3D (ServerReport) ou caricature (voir src/avatar/caricature.ts). */
  report?: ServerReport | Record<string, unknown>;
  /** Caricature (serve_caricature.py) : portrait et bustes, chemins relatifs au serveur. */
  portrait?: string;
  corps?: Record<string, string>;
};

export type JobOptions = {
  fetch: JobFetch;
  headers: Record<string, string>;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Intervalle entre deux demandes d'état. */
  pollMs?: number;
  /** Au-delà, on abandonne (la file du serveur est trop longue ou il est bloqué). */
  timeoutMs?: number;
  /** Coupures réseau consécutives tolérées pendant le suivi. */
  maxNetworkErrors?: number;
  /** Appelé à chaque changement d'état (file d'attente, en cours). */
  onState?: (state: 'queued' | 'running') => void;
};

export type JobResult = { id: string; glb: string; report: ServerReport };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const aborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error('Création annulée.');
};

async function readJson(res: { json(): Promise<unknown> }): Promise<JobBody> {
  return ((await res.json().catch(() => ({}))) ?? {}) as JobBody;
}

function finished(body: JobBody): JobResult | null {
  return body.ok && body.id && body.glb && body.report ? { id: body.id, glb: body.glb, report: body.report as ServerReport } : null;
}

/**
 * Protocole commun « envoi (202 + identifiant) puis suivi » des serveurs FITAIA (avatar 3D, caricature).
 * `path` : route d'envoi (ex. '/v1/avatar') ; `done` : lit le résultat final dans la réponse, ou null si elle est incomplète ;
 * `what` : nom de la chose créée dans les messages d'erreur (« avatar 3D », « perso »).
 */
export async function runServerJob<T>(endpoint: string, path: string, payload: unknown, o: JobOptions, done: (body: JobBody) => T | null, what: string): Promise<T> {
  const sleep = o.sleep ?? defaultSleep;
  const now = o.now ?? Date.now;
  const pollMs = o.pollMs ?? 3000;
  const timeoutMs = o.timeoutMs ?? 6 * 60_000;
  const maxNetworkErrors = o.maxNetworkErrors ?? 10;
  const headers = { 'Content-Type': 'application/json', ...o.headers };
  // appel sans `this` : le fetch natif du navigateur refuse d'être appelé comme méthode d'un autre objet (« Illegal invocation »)
  const request = o.fetch;
  const unreachable = 'Serveur d’avatar injoignable. Vérifie ta connexion.';

  let res: Awaited<ReturnType<JobFetch>>;
  try {
    res = await request(endpoint + path, { method: 'POST', headers, body: JSON.stringify(payload), signal: o.signal });
  } catch {
    aborted(o.signal);
    throw new Error(unreachable);
  }
  const first = await readJson(res);
  if (!res.ok || !first.ok || !first.id) throw new Error(first.error || 'Création de l’' + what + ' impossible (' + res.status + ').');
  // ancien serveur (réponse synchrone) : le résultat est déjà là
  const direct = done(first);
  if (direct && res.status === 200) return direct;

  const statusUrl = endpoint + (first.status ?? path + '/' + first.id);
  const start = now();
  let networkErrors = 0;
  let last: string | undefined;
  for (;;) {
    aborted(o.signal);
    if (now() - start > timeoutMs) throw new Error('La création prend trop de temps. Réessaie dans quelques minutes.');
    await sleep(pollMs);
    aborted(o.signal);
    let r: Awaited<ReturnType<JobFetch>>;
    try {
      r = await request(statusUrl, { method: 'GET', headers: o.headers, signal: o.signal });
    } catch {
      aborted(o.signal);
      // réseau coupé un instant (écran verrouillé, Wi-Fi qui change) : la tâche continue sur le serveur
      if (++networkErrors > maxNetworkErrors) throw new Error(unreachable);
      continue;
    }
    networkErrors = 0;
    const body = await readJson(r);
    if (r.status === 404) throw new Error('Le serveur a perdu la création (redémarré ?). Relance-la.');
    if (!r.ok || body.ok === false || body.state === 'failed') throw new Error(body.error || 'Création de l’' + what + ' impossible (' + r.status + ').');
    if (body.state === 'done') {
      const result = done(body);
      if (!result) throw new Error('Réponse incomplète du serveur d’avatar.');
      return result;
    }
    if ((body.state === 'queued' || body.state === 'running') && body.state !== last) {
      last = body.state;
      o.onState?.(body.state);
    }
  }
}

/** Envoie la photo puis suit la tâche jusqu'au GLB. Lève une erreur lisible en cas d'échec. */
export function runAvatarJob(endpoint: string, payload: unknown, o: JobOptions): Promise<JobResult> {
  return runServerJob(endpoint, '/v1/avatar', payload, o, finished, 'avatar 3D');
}
