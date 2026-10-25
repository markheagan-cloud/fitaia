/**
 * Selfie → avatar 3D personnel (GLB) via le serveur FITAIA (hero3d/human/code/serve_avatar.py).
 *
 * Le calcul (repères du visage MediaPipe, cibles de visage MakeHuman, texture du visage, GLB) ne peut pas tourner sur
 * l'iPhone : il passe par le serveur. Le GLB rendu garde les 15 morphs du corps du héros, donc « Mon corps en 3D »
 * l'anime exactement comme la base (setBody / animateTo). Le GLB est enregistré sur le téléphone (persistant).
 *
 * Sans EXPO_PUBLIC_AVATAR3D_ENDPOINT, `avatar3dConfigured` est faux et l'écran le dit : aucun résultat simulé.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import type { AvatarBase } from '@/avatar/identity';
import { parseReport, type Avatar3d } from '@/avatar/avatar3dReport';
import { runAvatarJob, type JobFetch } from '@/avatar/avatar3dJob';

const ENDPOINT = (process.env.EXPO_PUBLIC_AVATAR3D_ENDPOINT ?? '').replace(/\/+$/, '');
const TOKEN = process.env.EXPO_PUBLIC_AVATAR3D_TOKEN ?? '';

export const avatar3dConfigured = ENDPOINT.length > 0;

export { parseReport, type Avatar3d, type Avatar3dTrait, type ServerReport } from '@/avatar/avatar3dReport';

/** Selfie conservé (JPEG ou PNG détouré) → JPEG 768 px base64, format attendu par le serveur. */
async function selfieJpegBase64(uri: string): Promise<string> {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 768 } }], {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!out.base64) throw new Error('Lecture du selfie impossible.');
  return out.base64;
}

async function saveGlb(id: string, url: string): Promise<string> {
  const headers = TOKEN ? { Authorization: 'Bearer ' + TOKEN } : undefined;
  if (Platform.OS === 'web') {
    // web : pas de disque privé ; le GLB reste sur le serveur FITAIA, on garde son adresse
    return url;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error('Téléchargement de l’avatar 3D impossible (' + res.status + ').');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const dest = new File(Paths.document, 'avatar3d-' + id + '.glb');
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(bytes);
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

/** Supprime l'ancien GLB personnel du téléphone (remplacé ou retiré), et son portrait. */
export function deleteAvatar3d(a: Avatar3d | null) {
  if (!a) return;
  deleteDeviceFile(a.uri);
  deleteDeviceFile(a.portraitUri);
  deleteDeviceFile(a.goalPortraitUri);
}

export function deleteAvatar3dPortrait(uri: string | null | undefined) {
  deleteDeviceFile(uri);
}

/**
 * Garde le portrait pris sur le GLB personnel. Sur le téléphone : PNG copié dans le dossier privé (persistant, retrouvé
 * par son nom après une mise à jour). Sur le web : l'image reste en mémoire (data:).
 */
export async function saveAvatar3dPortrait(id: string, snapshotUri: string, kind: 'now' | 'goal' = 'now'): Promise<string> {
  if (Platform.OS === 'web' || !snapshotUri.startsWith('file:')) return snapshotUri;
  const dest = new File(Paths.document, 'avatar3d-portrait-' + id + (kind === 'goal' ? '-objectif' : '') + '.png');
  if (dest.exists) dest.delete();
  await new File(snapshotUri).copy(dest);
  return dest.uri;
}

export async function createAvatar3d(selfieUri: string, base: AvatarBase, sheet?: Record<string, unknown>, signal?: AbortSignal): Promise<Avatar3d> {
  if (!avatar3dConfigured) throw new Error('La création de l’avatar 3D n’est pas encore disponible.');
  const photo = await selfieJpegBase64(selfieUri);
  const headers: Record<string, string> = TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {};
  // envoi puis suivi par requêtes courtes : voir src/avatar/avatar3dJob.ts (délai d'inactivité iOS de 60 s)
  const body = await runAvatarJob(ENDPOINT, { photo, sex: base, sheet }, { fetch: fetch as unknown as JobFetch, headers, signal });
  let uri: string;
  try {
    uri = await saveGlb(body.id, ENDPOINT + body.glb);
  } catch (e) {
    throw new Error(e instanceof Error && e.message.startsWith('Téléchargement') ? e.message : 'Téléchargement de l’avatar 3D impossible. Réessaie.');
  }
  return parseReport(body.id, uri, base, body.report);
}
