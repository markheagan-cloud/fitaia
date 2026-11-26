/**
 * Mélange de tenues : s'habiller pièce par pièce (haut, bas, chaussures, accessoire, décor) avec des pièces de tenues
 * DIFFÉRENTES qu'on possède. Le service dessine le mélange sur le perso de la personne (mode « mix » de
 * hero3d/caricature/space/recette.py) : jamais un collage d'images, toujours un vrai dessin.
 *
 * Mêmes règles que la recette (tests/shop-melange.test.ts lit recette.py pour vérifier qu'elles ne divergent pas) :
 *  - un haut est obligatoire ;
 *  - une combinaison (Pilote, Astro) couvre tout le corps : pas de bas ;
 *  - sinon il faut un bas ;
 *  - une pièce ne vient que d'une tenue qui l'a (Samouraï n'a pas de chaussures, Dojo pas d'accessoire) ;
 *  - sans chaussures choisies : baskets blanches unies ; sans décor choisi : celui de la tenue du haut.
 * Pur, sans React.
 */
export type Slot = 'haut' | 'bas' | 'chaussures' | 'accessoire';
export const SLOTS: Slot[] = ['haut', 'bas', 'chaussures', 'accessoire'];
export type Mix = Partial<Record<Slot | 'fond', string>>;

/** Pièces que la recette sait dessiner pour chaque tenue (identifiant de skin). */
export const MIX_PIECES: Record<string, Slot[]> = {
  origine: ['haut', 'bas', 'chaussures'],
  cargo: ['haut', 'bas', 'chaussures', 'accessoire'],
  olive: ['haut', 'bas', 'chaussures', 'accessoire'],
  creme: ['haut', 'bas', 'chaussures', 'accessoire'],
  titane: ['haut', 'bas', 'chaussures', 'accessoire'],
  atelier: ['haut', 'bas', 'chaussures', 'accessoire'],
  sprint: ['haut', 'bas', 'chaussures', 'accessoire'],
  dojo: ['haut', 'bas', 'chaussures'],
  street: ['haut', 'bas', 'chaussures', 'accessoire'],
  plage: ['haut', 'bas', 'chaussures', 'accessoire'],
  ring: ['haut', 'bas', 'chaussures', 'accessoire'],
  alpin: ['haut', 'bas', 'chaussures', 'accessoire'],
  pilote: ['haut', 'chaussures', 'accessoire'],
  samourai: ['haut', 'bas', 'accessoire'],
  astro: ['haut', 'chaussures', 'accessoire'],
  royal: ['haut', 'bas', 'chaussures', 'accessoire'],
};

/** Hauts qui couvrent tout le corps (combinaisons). */
export const PLEIN = new Set(['pilote', 'astro']);

export const hasPiece = (skin: string, slot: Slot) => !!MIX_PIECES[skin]?.includes(slot);

/** Clé stable d'un mélange, identique à cle_melange() côté service : m-<haut>-<bas>-<chaussures>-<accessoire>-<fond>. */
export const mixKey = (mix: Mix) => 'm-' + [...SLOTS, 'fond' as const].map((k) => mix[k] || 'x').join('-');

/** Raison pour laquelle le mélange ne peut pas être dessiné, ou null s'il est bon. */
export function mixProblem(mix: Mix): string | null {
  if (!mix.haut || !MIX_PIECES[mix.haut]) return 'Choisis un haut.';
  for (const k of SLOTS) {
    const v = mix[k];
    if (v && !hasPiece(v, k)) return 'Cette tenue n’a pas cette pièce.';
  }
  if (PLEIN.has(mix.haut) && mix.bas) return 'Ce haut est une combinaison : pas de bas avec.';
  if (!PLEIN.has(mix.haut) && !mix.bas) return 'Choisis un bas.';
  if (mix.fond && !MIX_PIECES[mix.fond]) return 'Décor inconnu.';
  return null;
}

/**
 * Change une pièce et garde le mélange cohérent : un haut « combinaison » retire le bas ; un haut normal après une
 * combinaison reprend le bas de sa propre tenue. Choisir la même pièce l'enlève (sauf le haut, obligatoire).
 */
export function setPiece(mix: Mix, slot: Slot | 'fond', skin: string): Mix {
  const next: Mix = { ...mix };
  if (slot !== 'haut' && next[slot] === skin) {
    delete next[slot];
    return next;
  }
  next[slot] = skin;
  if (slot === 'haut') {
    if (PLEIN.has(skin)) delete next.bas;
    else if (!next.bas) next.bas = hasPiece(skin, 'bas') ? skin : undefined;
  }
  if (slot === 'bas' && next.haut && PLEIN.has(next.haut)) delete next.bas;
  return Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Mix;
}

/** Une tenue entière vue comme un mélange (point de départ du vestiaire : la tenue qu'on porte). */
export function mixOfOutfit(skin: string): Mix {
  const m: Mix = {};
  for (const k of SLOTS) if (hasPiece(skin, k)) m[k] = skin;
  return m;
}

/** Vrai si le mélange est en fait une tenue entière telle quelle (pas besoin d'un nouveau dessin). */
export function wholeOutfit(mix: Mix): string | null {
  const h = mix.haut;
  if (!h || (mix.fond && mix.fond !== h)) return null;
  return SLOTS.every((k) => (mix[k] ?? null) === (hasPiece(h, k) ? h : null)) ? h : null;
}
