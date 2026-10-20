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
import { parseReport, type Avatar3d, type ServerReport } from '@/avatar/avatar3dReport';

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

/** Supprime l'ancien GLB personnel du téléphone (remplacé ou retiré). */
export function deleteAvatar3d(a: Avatar3d | null) {
  if (!a || Platform.OS === 'web' || !a.uri.startsWith('file:')) return;
  try {
    const f = new File(a.uri);
    if (f.exists) f.delete();
  } catch {
    // déjà supprimé
  }
}

export async function createAvatar3d(selfieUri: string, base: AvatarBase, sheet?: Record<string, unknown>, signal?: AbortSignal): Promise<Avatar3d> {
  if (!avatar3dConfigured) throw new Error('La création de l’avatar 3D n’est pas encore disponible.');
  const photo = await selfieJpegBase64(selfieUri);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
  let res: Response;
  try {
    res = await fetch(ENDPOINT + '/v1/avatar', { method: 'POST', headers, body: JSON.stringify({ photo, sex: base, sheet }), signal });
  } catch {
    throw new Error('Serveur d’avatar injoignable. Vérifie ta connexion.');
  }
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; glb?: string; error?: string; report?: ServerReport };
  if (!res.ok || !body.ok || !body.id || !body.glb || !body.report) throw new Error(body.error || 'Création de l’avatar 3D impossible (' + res.status + ').');
  let uri: string;
  try {
    uri = await saveGlb(body.id, ENDPOINT + body.glb);
  } catch (e) {
    throw new Error(e instanceof Error && e.message.startsWith('Téléchargement') ? e.message : 'Téléchargement de l’avatar 3D impossible. Réessaie.');
  }
  return parseReport(body.id, uri, base, body.report);
}
