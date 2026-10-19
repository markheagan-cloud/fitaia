/**
 * FaceEngine — forme du visage (morphs visage) à partir des repères du selfie.
 *
 * Prototype : non implémenté (le GLB de test n'a pas de morphs visage). Le contrat est posé :
 *  - entrée : repères du visage (Apple Vision sur iPhone, MediaPipe Face Landmarker ailleurs — Apache 2.0) ;
 *  - sortie : FaceParameters = { nom_du_morph_visage: valeur 0 → 1 } appliqués par un MorphController dédié.
 * Le calcul repères → paramètres est le cœur propriétaire : en production il tourne côté serveur FITAIA.
 */
import type { FaceLandmark, FaceParameters } from '../core/types';

/** Morphs visage prévus pour le mesh FITAIA V1 (contrat avec l'artiste 3D). */
export const PLANNED_FACE_MORPHS = [
  'face_width',
  'jaw_width',
  'jaw_height',
  'chin_length',
  'cheekbones',
  'cheek_fat',
  'nose_width',
  'nose_length',
  'eye_spacing',
  'eye_size',
  'lip_fullness',
  'brow_height',
] as const;

export class FaceEngine {
  private params: FaceParameters = {};

  /** À implémenter (V1) : repères → mesures → paramètres. Pour l'instant, ne modifie rien. */
  fromLandmarks(_points: FaceLandmark[]): FaceParameters {
    return this.params;
  }

  get(): FaceParameters {
    return { ...this.params };
  }
}
