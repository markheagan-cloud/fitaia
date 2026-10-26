/**
 * Selfie → caricature personnelle (portrait de face + 3 bustes) via le serveur FITAIA hero3d/caricature/serve_caricature.py
 * (FLUX.2 klein 4B, Apache 2.0, qui tourne sur le PC du projet ; en production sur une carte graphique louée à l'heure).
 *
 * Le calcul prend plusieurs minutes sur le PC de test : la création tourne en arrière-plan (état dans le store), l'app
 * reste utilisable, et le perso apparaît partout dès qu'il est prêt. Les quatre PNG sont enregistrés sur le téléphone.
 *
 * Deux serveurs possibles, même résultat :
 *  - EXPO_PUBLIC_CARICATURE_URL : service Modal (hero3d/caricature/space/modal_app.py, une requête JSON, < 1 min) ;
 *  - EXPO_PUBLIC_CARICATURE_SPACE : Space Hugging Face (hero3d/caricature/space, ZeroGPU gratuit, quota 5 min/jour) ;
 *  - EXPO_PUBLIC_CARICATURE_ENDPOINT : serveur local sur le PC (hero3d/caricature/serve_caricature.py, port 8791).
 * Sans aucun des deux, `caricatureConfigured` est faux et l'app le dit : aucun résultat simulé.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import type { AvatarBase } from '@/avatar/identity';
import { runServerJob, type JobFetch } from '@/avatar/avatar3dJob';
import { callDirect } from '@/avatar/directCall';
import { base64ToBytes, callGradio, type GradioFetch } from '@/avatar/gradioCall';
import { BODY_KEYS, buildCaricature, caricatureFileName, finishedCaricature, finishedSpaceCaricature, type BodyKey, type Caricature, type CaricatureJobResult } from '@/avatar/caricature';

const ENDPOINT = (process.env.EXPO_PUBLIC_CARICATURE_ENDPOINT ?? '').replace(/\/+$/, '');
const SPACE = (process.env.EXPO_PUBLIC_CARICATURE_SPACE ?? '').replace(/\/+$/, '');
const URL_DIRECT = (process.env.EXPO_PUBLIC_CARICATURE_URL ?? '').trim();
const TOKEN = process.env.EXPO_PUBLIC_CARICATURE_TOKEN ?? '';

export const caricatureConfigured = URL_DIRECT.length > 0 || SPACE.length > 0 || ENDPOINT.length > 0;
/** D'où vient le dessin : service direct (Modal) en priorité, puis Space Hugging Face, sinon le serveur local. */
export const caricatureSource: 'direct' | 'space' | 'local' | 'none' = URL_DIRECT ? 'direct' : SPACE ? 'space' : ENDPOINT ? 'local' : 'none';

export type { Caricature } from '@/avatar/caricature';

async function selfieJpegBase64(uri: string): Promise<string> {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 768 } }], {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!out.base64) throw new Error('Lecture du selfie impossible.');
  return out.base64;
}

async function savePng(id: string, which: 'portrait' | BodyKey, url: string): Promise<string> {
  const headers = TOKEN ? { Authorization: 'Bearer ' + TOKEN } : undefined;
  // web : pas de disque privé ; l'image reste sur le serveur FITAIA, on garde son adresse
  if (Platform.OS === 'web') return url;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error('Téléchargement du perso impossible (' + res.status + ').');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const dest = new File(Paths.document, caricatureFileName(id, which));
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(bytes);
  return dest.uri;
}

/** Image reçue en base64 (Space) → fichier du téléphone ; sur le web, adresse data: gardée en mémoire. */
async function saveB64Png(id: string, which: 'portrait' | BodyKey, b64: string): Promise<string> {
  if (Platform.OS === 'web') return 'data:image/png;base64,' + b64;
  const dest = new File(Paths.document, caricatureFileName(id, which));
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(base64ToBytes(b64));
  return dest.uri;
}

function deleteDeviceFile(uri: string | null | undefined) {
  if (!uri || Platform.OS === 'web' || !uri.startsWith('file:')) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // déjà supprimé
  }
}

/** Supprime les fichiers d'une ancienne caricature (remplacée ou retirée). */
export function deleteCaricature(c: Caricature | null) {
  if (!c) return;
  deleteDeviceFile(c.portraitUri);
  for (const k of BODY_KEYS) deleteDeviceFile(c.bodies[k]);
}

export type CaricatureProgress = (state: 'queued' | 'running' | 'saving') => void;

/**
 * Envoie le selfie, suit la tâche (plusieurs minutes), enregistre les quatre images sur le téléphone.
 * Lève une erreur lisible en cas d'échec ; jamais de perso partiel.
 */
export async function createCaricature(selfieUri: string, base: AvatarBase, sheet?: Record<string, unknown>, onState?: CaricatureProgress, signal?: AbortSignal): Promise<Caricature> {
  if (!caricatureConfigured) throw new Error('La création du perso à ton image n’est pas encore disponible.');
  const photo = await selfieJpegBase64(selfieUri);
  const headers: Record<string, string> = TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {};
  if (URL_DIRECT || SPACE) {
    onState?.('running');
    const id = String(Date.now().toString(36)) + Math.random().toString(36).slice(2, 8);
    const json = URL_DIRECT
      ? await callDirect(URL_DIRECT, { photo, sex: base, sheet: sheet ?? {} }, { fetch: fetch as unknown as GradioFetch, headers, signal, timeoutMs: 180_000 })
      : await callGradio(SPACE, 'caricature', [photo, base, JSON.stringify(sheet ?? {})], { fetch: fetch as unknown as GradioFetch, headers, signal });
    const r: CaricatureJobResult | null = finishedSpaceCaricature(json, id);
    if (!r) throw new Error('Réponse incomplète du serveur de dessin.');
    onState?.('saving');
    const portrait = await saveB64Png(id, 'portrait', r.portrait);
    const bodies = {} as Record<BodyKey, string>;
    for (const k of BODY_KEYS) bodies[k] = await saveB64Png(id, k, r.bodies[k]);
    return buildCaricature(r, base, { portrait, bodies });
  }
  // ≈ 10 min sur le PC de test (GTX 1650) ; le serveur refuse au-delà de 20 min
  const r = await runServerJob(ENDPOINT, '/v1/caricature', { photo, sex: base, sheet }, { fetch: fetch as unknown as JobFetch, headers, signal, timeoutMs: 25 * 60_000, pollMs: 5000, onState }, finishedCaricature, 'perso');
  onState?.('saving');
  let portrait: string;
  const bodies = {} as Record<BodyKey, string>;
  try {
    portrait = await savePng(r.id, 'portrait', ENDPOINT + r.portrait);
    for (const k of BODY_KEYS) bodies[k] = await savePng(r.id, k, ENDPOINT + r.bodies[k]);
  } catch (e) {
    throw new Error(e instanceof Error && e.message.startsWith('Téléchargement') ? e.message : 'Téléchargement du perso impossible. Réessaie.');
  }
  return buildCaricature(r, base, { portrait, bodies });
}
