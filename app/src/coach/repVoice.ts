/**
 * Ce que dit la voix pendant un défi de répétitions : elle compte, encourage selon où on en est, et corrige quand une
 * répétition est refusée. Pur, testé (tests/rep-voice.test.ts). La lecture à voix haute est dans src/services/sound.ts.
 */
export function repPhrase(count: number, target: number): string {
  if (count <= 0) return '';
  const left = target - count;
  if (left <= 0) return count + ' ! Défi réussi, bravo.';
  if (left === 1) return count + '. Encore une, donne tout !';
  if (left === 2 && target >= 4) return count + '. Allez, tu y es presque.';
  if (count === 1) return '1. C’est parti.';
  if (target >= 10 && count === Math.floor(target / 2)) return count + '. La moitié est faite.';
  return String(count);
}

/** Correction quand la répétition n'est pas validée ; on alterne pour ne pas répéter la même phrase. */
export function rejectPhrase(rejected: number): string {
  const tips = ['Descends plus bas.', 'Garde le corps bien droit.', 'Remonte jusqu’en haut, bras tendus.'];
  return rejected > 0 ? tips[(rejected - 1) % tips.length] : '';
}

export const startPhrase = 'Pose le téléphone debout au sol, écran vers toi, à deux mètres sur le côté. Mets-toi de profil, je te dis quand c’est bon.';

/** Correction qui dit exactement ce qui n'allait pas (profondeur ou alignement) ; à défaut, la correction alternée. */
export function rejectWhyPhrase(why: 'depth' | 'align' | undefined, rejected: number): string {
  if (why === 'depth') return 'Pas comptée. Descends plus bas, poitrine près du sol.';
  if (why === 'align') return 'Pas comptée. Garde les hanches alignées, corps bien droit.';
  return rejectPhrase(rejected);
}

/** Dite quand la personne est vue en entier mais pas en position de pompe (debout, assise…). */
export const posturePhrase = 'Mets-toi en position de pompe, bras tendus, de profil.';
