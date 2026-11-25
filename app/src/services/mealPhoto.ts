/**
 * Photo d'un repas → estimation des aliments, portions et calories (service MealVision de
 * hero3d/caricature/space/modal_app.py, modèle Qwen2.5-VL-7B-Instruct, licence Apache 2.0).
 *
 * C'est une ESTIMATION faite à partir de la photo : l'app le dit, et l'utilisateur ajuste la portion
 * ou corrige avant d'ajouter au journal. Sans adresse configurée, `mealPhotoConfigured` est faux et le bouton n'apparaît pas.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import { callDirect } from '@/avatar/directCall';
import { parseMealEstimate, type MealEstimate } from './mealEstimate';

export { estimateToMeal, parseMealEstimate, type MealEstimate } from './mealEstimate';

const URL_REPAS = (process.env.EXPO_PUBLIC_MEAL_URL ?? '').trim();
const TOKEN = process.env.EXPO_PUBLIC_CARICATURE_TOKEN ?? '';
export const mealPhotoConfigured = URL_REPAS.length > 0;

/** Envoie la photo (réduite à 896 px) et rend l'estimation. */
export async function analyseMealPhoto(uri: string): Promise<MealEstimate | null> {
  if (!mealPhotoConfigured) throw new Error('Analyse photo non configurée.');
  const img = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 896 } }], {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!img.base64) throw new Error('Lecture de la photo impossible.');
  const text = await callDirect(URL_REPAS, { photo: img.base64 }, {
    fetch: fetch as never,
    headers: TOKEN ? { Authorization: 'Bearer ' + TOKEN } : undefined,
    timeoutMs: 120_000,
  });
  return parseMealEstimate(text);
}
