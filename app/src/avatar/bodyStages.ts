/**
 * Les trois silhouettes du héros rendues par l'usine d'avatars (hero3d/human/code/factory.py, même avatar, même tenue
 * t-shirt + jogging) : départ, en cours, objectif. Elles ne servent que si la fiche ressemble au héros (homme, peau claire
 * à mate, sans voile) et pour une perte de poids ; sinon l'app garde ses images habituelles.
 */
import type { ImageSourcePropType } from 'react-native';
import type { CharacterSheet } from '@/data/character';

export const BODY_STAGES: { id: 'surpoids' | 'actuel' | 'athletique'; label: string; img: ImageSourcePropType }[] = [
  { id: 'surpoids', label: 'Départ', img: require('../../assets/hero/surpoids.jpg') },
  { id: 'actuel', label: 'En route', img: require('../../assets/hero/actuel.jpg') },
  { id: 'athletique', label: 'Objectif', img: require('../../assets/hero/athletique.jpg') },
];

/** La fiche correspond-elle au héros de l'usine ? (sinon on ne montre pas son corps à la place du sien) */
export function sheetMatchesHero(s: CharacterSheet, ready: boolean): boolean {
  if (!ready) return true;
  return s.appearance === 'masc' && ['s1', 's2', 's3', 's4'].includes(s.skin) && s.hairStyle !== 'hijab';
}

/** Palier 1 → départ, paliers 2 à 4 → en route, palier 5 ou objectif atteint → objectif. */
export function stageIndex(tier: { current: number; reached: boolean }): number {
  if (tier.reached || tier.current >= 5) return 2;
  return tier.current <= 1 ? 0 : 1;
}
