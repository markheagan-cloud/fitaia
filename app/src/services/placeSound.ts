/** À quel endroit de l'app correspond un écran : chaque endroit a son propre son (services/sound.ts). Pur, testé. */
export type Place = 'accueil' | 'defis' | 'scan' | 'boutique' | 'perso' | 'communaute';

export function placeOf(pathname: string): Place | null {
  const p = pathname.replace(/^\/\(tabs\)/, '') || '/';
  if (p === '/' || p === '/index') return 'accueil';
  if (p.startsWith('/defis')) return 'defis';
  if (p.startsWith('/scanner')) return 'scan';
  if (p.startsWith('/boutique') || p.startsWith('/article') || p.startsWith('/vestiaire')) return 'boutique';
  if (p.startsWith('/perso') || p.startsWith('/creator') || p.startsWith('/corps')) return 'perso';
  if (p.startsWith('/communaute')) return 'communaute';
  return null; // selfie, révélation, premiers pas : ils ont déjà leur propre son
}
