/**
 * Tenue équipée, vue par les autres sur le profil social (« Sa tenue »).
 * Architecture préparée pour l'économie FITAIA (phase 2) : chaque vêtement raconte d'où il vient
 * (tenue de départ, saison, défi, Cercle, cadeau). AUCUN prix ni monnaie ici : l'économie n'est pas encore branchée.
 * Logique pure (sans React Native).
 */

export type GarmentSlot = 'haut' | 'veste' | 'bas' | 'chaussures' | 'accessoire';

export type GarmentOrigin =
  | { kind: 'depart' }
  | { kind: 'saison'; season: number }
  | { kind: 'defi'; challenge: string }
  | { kind: 'cercle'; circle: string }
  | { kind: 'cadeau'; from: string };

export type Garment = {
  id: string;
  slot: GarmentSlot;
  name: string;
  /** Accord de « Obtenu / Obtenue ». */
  feminine: boolean;
  origin: GarmentOrigin;
  /** Une phrase sur ce que le vêtement raconte. */
  story: string;
};

export type EquippedLook = {
  outfitId: string;
  items: Garment[];
  /** Tenue d'un profil de démonstration : données fictives, signalées comme telles. */
  demo: boolean;
};

export function originLabel(g: Garment): string {
  const o = g.feminine ? 'Obtenue' : 'Obtenu';
  switch (g.origin.kind) {
    case 'depart':
      return o + ' : tenue de départ';
    case 'saison':
      return o + ' : Saison ' + g.origin.season;
    case 'defi':
      return o + ' : défi « ' + g.origin.challenge + ' »';
    case 'cercle':
      return o + ' avec le Cercle ' + g.origin.circle;
    case 'cadeau':
      return 'Offert' + (g.feminine ? 'e' : '') + ' par ' + g.origin.from;
  }
}

export const SLOT_LABEL: Record<GarmentSlot, string> = {
  haut: 'Haut',
  veste: 'Veste',
  bas: 'Bas',
  chaussures: 'Chaussures',
  accessoire: 'Accessoire',
};

const G = (id: string, slot: GarmentSlot, name: string, feminine: boolean, origin: GarmentOrigin, story: string): Garment => ({ id, slot, name, feminine, origin, story });

/**
 * Catalogue des tenues connues (identifiants partagés avec le dessin vectoriel et l'usine d'avatars).
 * DÉMONSTRATION : les origines ci-dessous illustrent l'architecture ; elles deviendront réelles avec la phase 2.
 */
const LOOKS: Record<string, Garment[]> = {
  origine: [
    G('debardeur-origine', 'haut', 'Débardeur Origine', false, { kind: 'depart' }, 'Le premier haut de tout membre FITAIA.'),
    G('jogger-fitaia', 'bas', 'Jogger FITAIA', false, { kind: 'depart' }, 'Le bas de la tenue de départ.'),
    G('baskets-studio', 'chaussures', 'Baskets Studio', true, { kind: 'depart' }, 'Pour les premiers pas.'),
  ],
  creme: [
    G('veste-fitaia', 'veste', 'Veste FITAIA', true, { kind: 'saison', season: 1 }, 'Portée par les membres de la première saison.'),
    G('tee-graphite', 'haut', 'T-shirt Graphite', false, { kind: 'depart' }, 'Un basique de la tenue de départ.'),
    G('baskets-craie', 'chaussures', 'Baskets Craie', true, { kind: 'saison', season: 1 }, 'Gagnées pendant la Saison 1.'),
  ],
  olive: [
    G('sweat-olive', 'haut', 'Sweat Olive', false, { kind: 'saison', season: 1 }, 'Le sweat des matins frais de la Saison 1.'),
    G('legging-graphite', 'bas', 'Legging Graphite', false, { kind: 'depart' }, 'Un basique de la tenue de départ.'),
  ],
  titane: [
    G('debardeur-titane', 'haut', 'Débardeur Titane', false, { kind: 'defi', challenge: '30 jours réguliers' }, 'Réservé à celles et ceux qui ont tenu 30 jours.'),
    G('cargo-sable', 'bas', 'Cargo Sable', false, { kind: 'saison', season: 1 }, 'Le cargo de la Saison 1.'),
  ],
  cargo: [
    G('hoodie-court', 'haut', 'Hoodie court Nuit', false, { kind: 'saison', season: 1 }, 'Pour les séances tardives.'),
    G('cargo-technique', 'bas', 'Cargo technique', false, { kind: 'defi', challenge: '10 séances à la maison' }, 'Gagné à la maison, séance après séance.'),
  ],
  atelier: [
    G('hoodie-atelier', 'haut', 'Hoodie Atelier', false, { kind: 'depart' }, 'Le confort de la tenue de départ.'),
    G('cargo-atelier', 'bas', 'Cargo Atelier', false, { kind: 'depart' }, 'Le bas assorti.'),
  ],
};

export function lookForOutfit(outfitId: string, demo: boolean): EquippedLook | null {
  const items = LOOKS[outfitId];
  return items ? { outfitId, items, demo } : null;
}
