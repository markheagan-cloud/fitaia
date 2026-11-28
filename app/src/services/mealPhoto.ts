/**
 * Photo d'un repas → estimation des aliments, portions et calories (service MealVision de
 * hero3d/caricature/space/modal_app.py, modèle Qwen2.5-VL-7B-Instruct, licence Apache 2.0).
 *
 * C'est une ESTIMATION faite à partir de la photo : l'app le dit, et l'utilisateur ajuste la portion
 * ou corrige avant d'ajouter au journal. Sans adresse configurée, `mealPhotoConfigured` est faux et le bouton n'apparaît pas.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import { callDirect } from '@/avatar/directCall';
import { mealErrorText, mealRetryable, parseMealEstimate, type MealEstimate } from './mealEstimate';

export { estimateToMeal, parseMealEstimate, type MealEstimate } from './mealEstimate';

const URL_REPAS = (process.env.EXPO_PUBLIC_MEAL_URL ?? '').trim();
const TOKEN = process.env.EXPO_PUBLIC_CARICATURE_TOKEN ?? '';
export const mealPhotoConfigured = URL_REPAS.length > 0;

const opts = (timeoutMs: number) => ({
  fetch: fetch as never,
  headers: TOKEN ? { Authorization: 'Bearer ' + TOKEN } : undefined,
  timeoutMs,
});

/** Réveille le service pendant que la personne cadre son assiette : la réponse arrive ensuite en quelques secondes. */
export function warmMealPhoto(): void {
  if (!mealPhotoConfigured) return;
  callDirect(URL_REPAS, { warm: true }, opts(90_000)).catch(() => undefined);
}

/**
 * Envoie la photo (réduite à 768 px de large) et rend l'estimation. Un service endormi peut dépasser le délai du
 * réseau d'iOS au premier appel : on réessaie une fois avant d'afficher un message.
 */
export async function analyseMealPhoto(uri: string): Promise<MealEstimate | null> {
  if (!mealPhotoConfigured) throw new Error('Analyse photo non configurée.');
  const img = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 768 } }], {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!img.base64) throw new Error('Lecture de la photo impossible. Reprends-la.');
  const once = async () => parseMealEstimate(await callDirect(URL_REPAS, { photo: img.base64 }, opts(75_000)));
  try {
    return await once();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!mealRetryable(msg)) throw new Error(mealErrorText(msg));
    try {
      return await once();
    } catch (e2) {
      throw new Error(mealErrorText(e2 instanceof Error ? e2.message : String(e2)));
    }
  }
}
