/**
 * IdentityEngine — « qui est cette personne », indépendamment de son poids.
 *
 * Aujourd'hui (prototype) : vide, ou dérivé de la fiche de personnage (apparence, carrure, peau…).
 * V1 : mesures du visage issues d'Apple Vision / MediaPipe → vecteur d'identité.
 * V3 : réseau FITAIA photo → vecteur (poids entraînés = actif propriétaire).
 * Règle : l'identité ne change jamais quand le corps maigrit ; c'est elle qui garde le visage reconnaissable.
 */
import type { CharacterSheet } from '@/data/character';
import type { IdentityVector } from '../core/types';

const EMPTY: IdentityVector = { version: 0, source: 'none', values: [] };

export class IdentityEngine {
  private vector: IdentityVector = EMPTY;
  private sheet: CharacterSheet | null = null;

  /** V0 : on retient la fiche ; elle servira de valeurs par défaut au FaceEngine. */
  fromSheet(sheet: CharacterSheet) {
    this.sheet = sheet;
    this.vector = { version: 0, source: 'sheet', values: [] };
  }

  get(): IdentityVector {
    return this.vector;
  }

  getSheet(): CharacterSheet | null {
    return this.sheet;
  }

  reset() {
    this.vector = EMPTY;
    this.sheet = null;
  }
}
