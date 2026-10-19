/**
 * Registre des avatars (couche visuelle). Le moteur ne connaît que BodyParameters ; chaque avatar dit comment ces
 * paramètres pilotent SES morphs (drivers). Ajouter une base (femme, autre carnation, autre tenue) = ajouter une entrée.
 *
 *  - prototype       : mannequin technique (preuve 3D), gardé comme asset de test.
 *  - premium-male-01 : homme premium (MakeHuman CC0, pipeline tools/premium-avatar) : visage, peau, cheveux, vêtements.
 */
import type { AvatarDefinition, MorphDriver } from '../core/types';
import { PROTOTYPE_DRIVERS } from '../body/BodyParameterMapper';

/* eslint-disable @typescript-eslint/no-require-imports -- les assets Metro (GLB) ne s'importent que par require() */
const PROTOTYPE_GLB = require('../assets/prototype-avatar.glb');
const PREMIUM_MALE_01_GLB = require('../assets/premium-male-01.glb');
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Drivers du héros FITAIA (homme 01). Le moteur ne pilote que poids / ventre / muscle ; body/BodyShape.ts en déduit
 * 13 réglages corrélés (graisse, ventre profond, taille, hanches, poitrine, épaules, bras, avant-bras, cuisses, mollets,
 * visage, cou, masse musculaire), chacun relié ici à son morph. Sous l'IMC de base, body_weight_low / muscle_low amincissent.
 */
export const PREMIUM_MALE_DRIVERS: MorphDriver[] = [
  { morph: 'body_weight_low', input: 'weight', points: [[0, 0.5], [0.167, 0]] },
  { morph: 'body_weight', input: 'bodyFat', points: [[0.167, 0], [1, 1]] },
  { morph: 'muscle_low', input: 'muscleMass', points: [[0, 0.4], [0.28, 0]] },
  { morph: 'muscle', input: 'muscleMass', points: [[0.28, 0], [1, 1]] },
  { morph: 'belly_fat', input: 'visceralBelly', points: [[0.2, 0], [1, 0.8]] },
  { morph: 'waist', input: 'waist', points: [[0.3, 0], [1, 0.6]] },
  { morph: 'hips', input: 'hips', points: [[0.3, 0], [1, 0.5]] },
  { morph: 'chest', input: 'chest', points: [[0.4, 0], [1, 0.6]] },
  { morph: 'shoulders', input: 'shoulders', points: [[0.35, 0], [1, 1]] },
  { morph: 'upper_arm', input: 'upperArm', points: [[0.25, 0], [1, 0.9]] },
  { morph: 'forearm', input: 'forearm', points: [[0.3, 0], [1, 0.7]] },
  { morph: 'thigh', input: 'thigh', points: [[0.25, 0], [1, 0.8]] },
  { morph: 'calf', input: 'calf', points: [[0.3, 0], [1, 0.6]] },
  { morph: 'face_fat', input: 'faceFat', points: [[0.25, 0], [1, 0.9]] },
  { morph: 'neck_fat', input: 'neckFat', points: [[0, 0], [1, 0.9]] },
];

export const AVATARS: Record<string, AvatarDefinition> = {
  prototype: { id: 'prototype', label: 'Prototype', source: PROTOTYPE_GLB, drivers: PROTOTYPE_DRIVERS, look: 'clay' },
  'premium-male-01': { id: 'premium-male-01', label: 'Héros', source: PREMIUM_MALE_01_GLB, drivers: PREMIUM_MALE_DRIVERS, look: 'studio' },
};

export const DEFAULT_AVATAR = AVATARS['premium-male-01'];
