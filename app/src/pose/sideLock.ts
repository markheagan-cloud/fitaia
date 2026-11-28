/**
 * Garde le même côté du corps pendant tout le défi. Le module de pose envoie, à chaque image, le côté le mieux vu ;
 * mais d'une image à l'autre il peut basculer (bras gauche puis bras droit), ce qui fait sauter l'angle du coude
 * et fausse le comptage. On verrouille le côté quand la personne est bien placée.
 */
import type { PoseEvent } from '../../modules/fitaia-pose';
import type { Pose } from './repCounter';

export function poseForSide(ev: PoseEvent, side: 'left' | 'right' | null): Pose | undefined {
  if (!ev.found) return undefined;
  if (side && ev[side]) return ev[side];
  return ev.points;
}
