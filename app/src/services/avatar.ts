/**
 * Création d'avatar FITAIA à partir d'un selfie.
 *
 * Pipeline (optimisé) :
 *  1. Capture (caméra frontale) → recadrage carré → réduction à 768 px, JPEG 0.82 → ~120 Ko (upload rapide, zéro perte utile).
 *  2. Envoi à la fonction serveur `avatar` (Supabase Edge Function) qui appelle le modèle d'image avec
 *     le style FITAIA (illustration semi-réaliste, athleisure anthracite/crème + lime, fond gris géométrique)
 *     et renvoie le personnage en tenue « Origine » (1024×1280, WebP).
 *  3. Le selfie n'est JAMAIS stocké : il transite en mémoire, est supprimé après génération.
 *  4. L'avatar est affiché via expo-image (cache disque) et persisté dans le store (uri + date).
 *  5. Les variantes par tenue sont générées à la demande (à l'achat), jamais en lot : coût maîtrisé.
 *
 * Sans clé/serveur configuré (EXPO_PUBLIC_AVATAR_ENDPOINT absent), le mode « simulation » renvoie le perso de démo
 * après un délai, clairement signalé à l'utilisateur. Aucun résultat n'est inventé comme réel.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { segmentPerson } from '../../modules/fitaia-pose';
import { Platform } from 'react-native';
import { CharacterSheet, sheetKey, sheetPrompt } from '@/data/character';

export type AvatarStep = 'preparing' | 'uploading' | 'drawing' | 'saving';
export type AvatarResult = { uri: string; simulated: boolean; outfit: string };

const ENDPOINT = process.env.EXPO_PUBLIC_AVATAR_ENDPOINT; // ex. https://xxxx.supabase.co/functions/v1/avatar
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Appel direct Hugging Face : DÉVELOPPEMENT SEULEMENT. Une variable EXPO_PUBLIC_ finit en clair dans l'app publiée ;
// en production le jeton reste côté serveur (fonction Supabase `avatar`, secret HF_TOKEN).
const HF_TOKEN = __DEV__ ? process.env.EXPO_PUBLIC_HF_TOKEN : undefined;
const HF_MODEL = process.env.EXPO_PUBLIC_HF_MODEL || 'black-forest-labs/FLUX.1-schnell';
/** Serveur FITAIA (Supabase) ou appel direct Hugging Face : l'un des deux suffit. */
export const avatarConfigured = Boolean((ENDPOINT && ANON_KEY) || HF_TOKEN);
export const avatarMode: 'server' | 'huggingface' | 'none' = ENDPOINT && ANON_KEY ? 'server' : HF_TOKEN ? 'huggingface' : 'none';

/** Tenues : description pour le modèle d'image, cohérente avec les six rendus de référence. */
const OUTFITS: Record<string, string> = {
  origine: 'off-white sleeveless tank top, charcoal joggers with a thin lime green zip accent, white and lime sneakers',
  cargo: 'charcoal cargo joggers with lime accents, black sports bra or fitted tee, cream hoodie tied at the waist, grey sneakers',
  olive: 'olive green technical t-shirt, black shorts over dark compression tights, black sneakers with lime laces',
  creme: 'cream studio sweatshirt, charcoal leggings with a lime stripe, white sneakers',
  titane: 'titanium grey technical jacket with neon lime seams, black joggers, lime sneakers',
  atelier: 'all-black workshop set: black tee, black cargo trousers with lime stitching, black sneakers',
};
const STYLE = 'Full body, standing, relaxed confident pose, looking at camera, slight smile. Semi-realistic premium illustration, clean soft studio light, neutral light grey concrete wall with subtle geometric panels in the background, muted palette with lime green accents, sharp, no text, no watermark, centered, feet visible.';

async function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('Lecture image impossible'));
    fr.onload = () => res(String(fr.result));
    fr.readAsDataURL(b);
  });
}

/** Appel direct Hugging Face (texte → image). Le selfie n'est pas utilisé ici : le modèle gratuit ne fait pas de ressemblance. */
async function generateWithHF(prompt: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch('https://router.huggingface.co/hf-inference/models/' + HF_MODEL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + HF_TOKEN, 'Content-Type': 'application/json', Accept: 'image/jpeg' },
    body: JSON.stringify({ inputs: prompt, parameters: { width: 768, height: 1024, num_inference_steps: 4 } }),
    signal,
  });
  if (res.status === 503) throw new Error('Le modèle se réveille (gratuit). Réessaie dans 30 secondes.');
  if (res.status === 401) throw new Error('Clé Hugging Face refusée : vérifie EXPO_PUBLIC_HF_TOKEN.');
  if (res.status === 429) throw new Error('Quota gratuit atteint pour le moment. Réessaie plus tard.');
  if (!res.ok) throw new Error('Le dessin a échoué (' + res.status + ').');
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Réponse inattendue du modèle.');
  return blobToDataUrl(blob);
}

/** Réduit et recadre le selfie : carré centré, 768 px, JPEG. Renvoie l'URI locale et la base64. */
export async function prepareSelfie(uri: string, width: number, height: number): Promise<{ uri: string; base64: string }> {
  const side = Math.min(width, height);
  const originX = Math.max(0, Math.round((width - side) / 2));
  const originY = Math.max(0, Math.round((height - side) / 2));
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: { originX, originY, width: side, height: side } }, { resize: { width: 768, height: 768 } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return { uri: out.uri, base64: out.base64 ?? '' };
}

/**
 * Conserve le selfie dans l'espace privé de l'app (jamais envoyé sauf le temps d'un dessin). Renvoie l'URI persistante.
 * Dans la version compilée, la personne est détourée sur l'appareil (Apple Vision) : fond transparent, visage net dans le perso.
 */
export async function keepSelfie(tmpUri: string): Promise<string> {
  if (Platform.OS === 'web') return tmpUri; // web : reste en mémoire de session
  const cut = await segmentPerson(tmpUri);
  const isPng = cut !== tmpUri;
  const dest = new File(Paths.document, isPng ? 'selfie.png' : 'selfie.jpg');
  for (const old of ['selfie.jpg', 'selfie.png']) {
    try {
      const f = new File(Paths.document, old);
      if (f.exists) f.delete();
    } catch {
      // ignore
    }
  }
  new File(cut).copy(dest);
  return dest.uri;
}

/** Lit le selfie conservé en base64 (pour un dessin). */
export async function readSelfieBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const blob = await fetch(uri).then((r) => r.blob());
    const dataUrl = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(new Error('Lecture impossible'));
      fr.readAsDataURL(blob);
    });
    return dataUrl.split(',')[1] ?? '';
  }
  const f = new File(uri);
  return await Promise.resolve(f.base64());
}

/** Supprime le selfie temporaire du disque (confidentialité). */
export async function discardSelfie(uri: string): Promise<void> {
  try {
    if (Platform.OS !== 'web' && uri.startsWith('file:')) new File(uri).delete();
  } catch {
    // déjà supprimé ou inaccessible : sans conséquence
  }
}

/**
 * Génère l'avatar. `onStep` permet d'afficher l'avancement.
 * Lève une erreur lisible si le serveur refuse ; ne renvoie jamais un résultat simulé sans le dire.
 */
export async function generateAvatar(
  selfie: { base64: string } | null,
  outfit: string,
  onStep: (s: AvatarStep) => void,
  signal?: AbortSignal,
  sheet?: CharacterSheet,
): Promise<AvatarResult> {
  onStep('preparing');

  if (!avatarConfigured) {
    // Mode simulation (pas de serveur configuré) : délai réaliste, résultat = perso de démo.
    onStep('drawing');
    await new Promise((r) => setTimeout(r, 1800));
    onStep('saving');
    return { uri: '', simulated: true, outfit };
  }

  if (avatarMode === 'huggingface') {
    onStep('drawing');
    const base = sheet ? sheetPrompt(sheet, OUTFITS[outfit] ?? OUTFITS.origine) : 'athletic adult. Outfit: ' + (OUTFITS[outfit] ?? OUTFITS.origine) + '.';
    const uri = await generateWithHF(base + ' ' + STYLE, signal);
    onStep('saving');
    return { uri, simulated: false, outfit };
  }

  onStep('uploading');
  const res = await fetch(ENDPOINT as string, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ANON_KEY, apikey: ANON_KEY as string },
    body: JSON.stringify({ selfie: selfie?.base64 ?? null, outfit, sheet: sheet ? { key: sheetKey(sheet, outfit), prompt: sheetPrompt(sheet, outfit) } : null }),
    signal,
  });
  onStep('drawing');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(res.status === 429 ? 'Trop de demandes, réessaie dans une minute.' : 'Le dessin a échoué (' + res.status + '). ' + txt.slice(0, 120));
  }
  const data = (await res.json()) as { url?: string; error?: string };
  if (!data.url) throw new Error(data.error || 'Réponse serveur incomplète.');

  onStep('saving');
  // L'image est affichée via expo-image (cache disque automatique) : pas de téléchargement manuel.
  return { uri: data.url, simulated: false, outfit };
}
