/**
 * Identité visuelle du perso : UNE seule règle pour savoir quelle base montrer (homme ou femme), partout.
 * Accueil, Mon perso, Communauté (images 2D) et « Mon corps en 3D » (GLB) lisent tous cette fonction.
 *
 * Avant : la 3D suivait le sexe du profil, la 2D suivait la fiche du créateur (masculine par défaut, même pour une
 * femme qui n'avait pas encore ouvert le créateur). Une utilisatrice voyait donc un homme sur l'accueil et une femme
 * en 3D. Ici, la fiche ne compte que si le créateur a été validé ; sinon c'est le profil qui décide.
 */
import type { CharacterSheet } from '@/data/character';
import { DEFAULT_SHEET } from '@/data/character';

export type AvatarBase = 'm' | 'f';
export type ProfileSex = 'm' | 'f' | 'x';

export function avatarBase(sex: ProfileSex, sheet: Pick<CharacterSheet, 'appearance'>, ready: boolean): AvatarBase {
  if (ready) {
    if (sheet.appearance === 'fem') return 'f';
    if (sheet.appearance === 'masc') return 'm';
  }
  return sex === 'f' ? 'f' : 'm';
}

/** Apparence du créateur qui correspond au sexe déclaré (fiche de départ). */
export function appearanceForSex(sex: ProfileSex): string {
  return sex === 'f' ? 'fem' : sex === 'x' ? 'neutre' : 'masc';
}

/** Fiche de départ cohérente avec le profil : pas de barbe proposée d'office à une femme. */
export function defaultSheetFor(sex: ProfileSex): CharacterSheet {
  const appearance = appearanceForSex(sex);
  return appearance === 'masc' ? { ...DEFAULT_SHEET } : { ...DEFAULT_SHEET, appearance, beard: 'aucune', hairStyle: sex === 'f' ? 'long' : DEFAULT_SHEET.hairStyle };
}
