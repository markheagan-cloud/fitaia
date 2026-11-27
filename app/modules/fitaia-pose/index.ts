/**
 * Module natif FITAIA Pose (iOS, Apple Vision). Disponible uniquement dans une version compilée (development build / TestFlight),
 * pas dans Expo Go. `isAvailable` permet de basculer proprement sur la simulation.
 */
import { requireOptionalNativeModule, requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

export type PosePoint = { x: number; y: number; c: number };
/**
 * `points` et `nose` : coordonnées normalisées de l'image caméra en portrait (0–1, origine en haut à gauche, image non inversée).
 * `aspect` : largeur / hauteur de cette image (≈ 0,56), pour calculer des angles justes.
 * `found: false` arrive aussi quand personne n'est vu, pour guider la personne.
 */
export type PoseEvent = {
  found: boolean;
  side?: 'left' | 'right';
  ts?: number;
  aspect?: number;
  nose?: PosePoint;
  points?: Record<'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle', PosePoint>;
};

export type FitaiaPoseViewProps = ViewProps & {
  active?: boolean;
  position?: 'front' | 'back';
  onPose?: (e: { nativeEvent: PoseEvent }) => void;
  onError?: (e: { nativeEvent: { message: string } }) => void;
};

const native = requireOptionalNativeModule<{ isAvailable: boolean; canSegment?: boolean; segmentPerson?: (uri: string) => Promise<string> }>('FitaiaPose');
export const isPoseAvailable: boolean = Boolean(native?.isAvailable);
export const canSegmentPerson: boolean = Boolean(native?.canSegment);

/** Détourage de la personne (fond transparent). Disponible seulement dans la version compilée ; sinon renvoie l'URI d'origine. */
export async function segmentPerson(uri: string): Promise<string> {
  if (!native?.segmentPerson) return uri;
  try {
    return await native.segmentPerson(uri);
  } catch {
    return uri;
  }
}

let View: ComponentType<FitaiaPoseViewProps> | null = null;
if (isPoseAvailable) {
  try {
    View = requireNativeView<FitaiaPoseViewProps>('FitaiaPose');
  } catch {
    View = null;
  }
}
export const FitaiaPoseView = View;
