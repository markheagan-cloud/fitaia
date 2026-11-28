/**
 * Point de l'image caméra (0–1, origine en haut à gauche) → point de l'aperçu (remplissage « aspect fill », comme l'aperçu natif).
 * La caméra avant est affichée en miroir par iOS : `mirrored` retourne x pour que le squelette tombe sur la personne.
 */
export function toView(p: { x: number; y: number }, aspect: number, w: number, h: number, mirrored: boolean) {
  const s = Math.max(w / aspect, h); // hauteur de l'image affichée
  const ox = (w - aspect * s) / 2;
  const oy = (h - s) / 2;
  const x = ox + p.x * aspect * s;
  return { x: mirrored ? w - x : x, y: oy + p.y * s };
}
