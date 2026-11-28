/**
 * Fiches du catalogue de la boutique : ce que le membre lit avant d'acheter (pièces de la tenue, chaussures, décor,
 * collection, date de fin des éditions limitées) et les articles « à venir ».
 *
 * Règles (recherche du 26/11/2026 sur les boutiques de jeux, voir docs/BOUTIQUE.md) :
 * - chaque article en vente a un vrai visuel : la tenue dessinée sur le perso de la personne ; sinon il est « à venir » ;
 * - une édition limitée affiche sa vraie date de fin (pas de compte à rebours) et cette date est appliquée :
 *   après elle, l'article ne s'achète plus, celui qui l'a le garde ;
 * - les pièces listées sont celles que le service dessine vraiment (mêmes mots que hero3d/caricature/space/recette.py) ;
 * - aucun tirage au hasard, prix en Fitcoins affiché sur chaque article.
 * L'économie (prix, rareté, source) reste dans inventory/cosmeticCatalog.ts : ce fichier ne fait que la présentation.
 */
import type { CosmeticCategory, CosmeticItem } from '@/inventory/types';
import { COSMETIC_CATALOG } from '@/inventory/cosmeticCatalog';

export type PieceKind = 'haut' | 'bas' | 'chaussures' | 'accessoire';
export const PIECE_LABEL: Record<PieceKind, string> = { haut: 'Haut', bas: 'Bas', chaussures: 'Chaussures', accessoire: 'Accessoires' };

export type CollectionId = 'essentiels' | 'evasion' | 'arene' | 'neon' | 'prestige';
export const COLLECTIONS: { id: CollectionId; name: string; line: string }[] = [
  { id: 'essentiels', name: 'Essentiels', line: 'Pour tous les jours, à l’entraînement comme dehors.' },
  { id: 'evasion', name: 'Évasion', line: 'Plage, montagne, coucher de soleil : ton perso part en voyage.' },
  { id: 'arene', name: 'Arène', line: 'Les tenues des sports de combat et de vitesse.' },
  { id: 'neon', name: 'Néon', line: 'La nuit, les lumières, le futur.' },
  { id: 'prestige', name: 'Prestige', line: 'Les pièces rares, pour marquer un vrai cap.' },
];

/** Fenêtres des éditions limitées : date de fin incluse (heure de Paris, fin de journée). */
export type LimitedWindow = { label: string; until: string };
export const WINDOWS = {
  lancement: { label: 'Édition de lancement', until: '2027-02-28' },
  hiver: { label: 'Édition Saison 1 · Hiver', until: '2027-01-31' },
} satisfies Record<string, LimitedWindow>;

export type OutfitSheet = {
  /** Identifiant de l'objet du catalogue (outfit_<skin>). */
  itemId: string;
  collection: CollectionId;
  tagline: string;
  pieces: Partial<Record<PieceKind, string>>;
  decor: string;
  /** Date d'arrivée en boutique (badge « Nouveau » pendant 21 jours). */
  addedAt: string;
  limited?: LimitedWindow;
};

const LAUNCH = '2026-11-21';
const BUILD8 = '2026-11-25';

export const OUTFIT_SHEETS: OutfitSheet[] = [
  { itemId: 'outfit_origine', collection: 'essentiels', addedAt: LAUNCH, tagline: 'La tenue de départ, offerte à tout le monde.',
    pieces: { haut: 'T-shirt rouge col rond', bas: 'Jogging noir à bande citron', chaussures: 'Baskets blanches' }, decor: 'Fond crème' },
  { itemId: 'outfit_sprint', collection: 'essentiels', addedAt: BUILD8, tagline: 'Tenue de course, faite pour aller vite.',
    pieces: { haut: 'Débardeur de running rouge', bas: 'Short de course noir fendu', chaussures: 'Running rouge vif', accessoire: 'Bandeau blanc' }, decor: 'Piste d’athlétisme au petit matin' },
  { itemId: 'outfit_street', collection: 'essentiels', addedAt: BUILD8, tagline: 'Le confort de la rue, en gris graphite.',
    pieces: { haut: 'Hoodie oversize graphite', bas: 'Jogging noir', chaussures: 'Baskets blanches épaisses', accessoire: 'Bonnet noir' }, decor: 'Mur de béton, lumière citron' },
  { itemId: 'outfit_olive', collection: 'essentiels', addedAt: LAUNCH, tagline: 'Techwear : imperméable, pratique, prêt pour tout.',
    pieces: { haut: 'Veste imperméable olive, gilet utilitaire noir', bas: 'Pantalon noir fuselé', chaussures: 'Chaussures de trail', accessoire: 'Petit sac de poitrine' }, decor: 'Vert profond, halo de lumière' },
  { itemId: 'outfit_cargo', collection: 'evasion', addedAt: LAUNCH, tagline: 'Floride au coucher du soleil.',
    pieces: { haut: 'Chemise ouverte feuilles de palmier rose et turquoise, débardeur blanc', bas: 'Short cargo sable', chaussures: 'Baskets blanches', accessoire: 'Lunettes de soleil sur la tête' }, decor: 'Ciel rose et orange, palmiers' },
  { itemId: 'outfit_plage', collection: 'evasion', addedAt: BUILD8, tagline: 'Les pieds dans le sable.',
    pieces: { haut: 'Chemise en lin blanche ouverte', bas: 'Short de bain corail à vagues', chaussures: 'Tongs', accessoire: 'Serviette sur l’épaule' }, decor: 'Mer turquoise et sable blanc' },
  { itemId: 'outfit_alpin', collection: 'evasion', addedAt: BUILD8, tagline: 'Au sommet, dans le froid.',
    pieces: { haut: 'Veste de ski bleu glacier', bas: 'Pantalon de ski blanc', chaussures: 'Après-ski', accessoire: 'Masque de ski, gants gris' }, decor: 'Sommets enneigés, ciel bleu' },
  { itemId: 'outfit_dojo', collection: 'arene', addedAt: BUILD8, tagline: 'Calme, concentré, en garde.',
    pieces: { haut: 'Veste de kimono blanche', bas: 'Pantalon de kimono blanc', chaussures: 'Pieds nus', accessoire: 'Ceinture noire' }, decor: 'Dojo en bois et papier' },
  { itemId: 'outfit_ring', collection: 'arene', addedAt: BUILD8, tagline: 'L’entrée sur le ring.',
    pieces: { haut: 'Peignoir en satin noir à liseré or', bas: 'Short de boxe or brillant', chaussures: 'Bottines de boxe noires', accessoire: 'Gants de boxe rouges' }, decor: 'Ring sous les projecteurs' },
  { itemId: 'outfit_pilote', collection: 'arene', addedAt: BUILD8, limited: WINDOWS.hiver, tagline: 'Pilote de nuit, bandes néon.',
    pieces: { haut: 'Combinaison de course noire, bandes magenta et cyan', chaussures: 'Bottines de pilote', accessoire: 'Gants de course, casque noir sous le bras' }, decor: 'Circuit de nuit, lumières floues' },
  { itemId: 'outfit_creme', collection: 'neon', addedAt: LAUNCH, limited: WINDOWS.lancement, tagline: 'Soirée sur la côte, sous les néons.',
    pieces: { haut: 'Costume en lin crème, manches retroussées, t-shirt rose vif', bas: 'Pantalon en lin crème', chaussures: 'Mocassins blancs', accessoire: 'Fine chaîne dorée' }, decor: 'Ville de nuit, néons rose et cyan' },
  { itemId: 'outfit_titane', collection: 'neon', addedAt: LAUNCH, limited: WINDOWS.hiver, tagline: 'Armure de sport futuriste.',
    pieces: { haut: 'Plaques en titane brossé sur combinaison noire', bas: 'Combinaison à lignes néon cyan', chaussures: 'Baskets à semelle néon', accessoire: 'Visière lumineuse relevée' }, decor: 'Bleu nuit, lueur cyan' },
  { itemId: 'outfit_samourai', collection: 'neon', addedAt: BUILD8, limited: WINDOWS.hiver, tagline: 'Samouraï des rues, bords magenta.',
    pieces: { haut: 'Armure en couches noire et rouge, bords magenta', bas: 'Pantalon large noir', accessoire: 'Sabre au fourreau' }, decor: 'Ruelle de nuit, lanternes rouges' },
  { itemId: 'outfit_atelier', collection: 'prestige', addedAt: LAUNCH, limited: WINDOWS.lancement, tagline: 'Le grand manteau brodé d’or.',
    pieces: { haut: 'Long manteau noir brodé d’or, col roulé noir', bas: 'Pantalon noir', chaussures: 'Baskets noir et or', accessoire: 'Chaîne en or' }, decor: 'Rayons de lumière dorée' },
  { itemId: 'outfit_astro', collection: 'prestige', addedAt: BUILD8, limited: WINDOWS.lancement, tagline: 'En orbite, panneaux citron lumineux.',
    pieces: { haut: 'Combinaison spatiale blanche à panneaux citron', chaussures: 'Bottes à semelle citron', accessoire: 'Casque sous le bras' }, decor: 'Espace étoilé, grande planète' },
  { itemId: 'outfit_royal', collection: 'prestige', addedAt: BUILD8, limited: WINDOWS.lancement, tagline: 'Le roi des champions.',
    pieces: { haut: 'Cape en velours violet à bordure or, tenue de sport noir et or', bas: 'Pantalon de sport noir et or', chaussures: 'Baskets dorées', accessoire: 'Petite couronne dorée' }, decor: 'Grande salle, rayons dorés' },
];

const SHEET_BY_ID = new Map(OUTFIT_SHEETS.map((s) => [s.itemId, s]));
export const sheetOf = (itemId: string): OutfitSheet | undefined => SHEET_BY_ID.get(itemId);

/** Jour (AAAA-MM-JJ) à Paris : les dates de fin s'entendent en heure de Paris. */
export function parisDay(now: Date): string {
  try {
    return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

const dayNumber = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000);

export type LimitedState = { open: true; daysLeft: number; untilLabel: string } | { open: false; untilLabel: string };

/** État d'une édition limitée à une date : ouverte (jours restants, dernier jour compris) ou terminée. */
export function limitedState(w: LimitedWindow, now: Date): LimitedState {
  const today = parisDay(now);
  const untilLabel = frenchDate(w.until);
  const left = dayNumber(w.until) - dayNumber(today);
  return left >= 0 ? { open: true, daysLeft: left + 1, untilLabel } : { open: false, untilLabel };
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function frenchDate(d: string): string {
  return +d.slice(8, 10) + (d.slice(8, 10) === '01' ? 'er' : '') + ' ' + MONTHS[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4);
}

/** Phrase de disponibilité d'une édition limitée (date de fin, jamais de compte à rebours à la seconde). */
export function limitedLine(w: LimitedWindow, now: Date): string {
  const s = limitedState(w, now);
  if (!s.open) return 'Édition terminée le ' + s.untilLabel;
  return 'Jusqu’au ' + s.untilLabel + (s.daysLeft <= 1 ? ' · dernier jour' : ' · encore ' + s.daysLeft + ' jours');
}

export const isNew = (sheet: OutfitSheet, now: Date) => dayNumber(parisDay(now)) - dayNumber(sheet.addedAt) <= 21;

/** Un article en vente peut-il s'acheter aujourd'hui ? (édition terminée : non ; celui qui l'a la garde.) */
export function onSale(itemId: string, now: Date): boolean {
  const w = sheetOf(itemId)?.limited;
  return !w || limitedState(w, now).open;
}

// ---------------------------------------------------------------------------------------------------------------
// À venir : articles annoncés, pas encore dessinables sur le perso. Aucun visuel inventé : un pictogramme du type
// d'article et la mention « À venir ». Le prix vient du catalogue quand il y est déjà, sinon « annoncé à la sortie ».
// ---------------------------------------------------------------------------------------------------------------
export type UpcomingKind = 'chaussures' | 'couvre-chef' | 'lunettes' | 'haut' | 'bas' | 'veste' | 'accessoire' | 'tenue';
export const UPCOMING_LABEL: Record<UpcomingKind, string> = {
  chaussures: 'Chaussures', 'couvre-chef': 'Couvre-chef', lunettes: 'Lunettes', haut: 'Haut', bas: 'Bas', veste: 'Veste', accessoire: 'Accessoire', tenue: 'Tenue complète',
};

export type Upcoming = {
  id: string;
  name: string;
  kind: UpcomingKind;
  rarity: CosmeticItem['rarity'];
  detail: string;
  /** Comment on l'obtiendra : achat en Fitcoins, palier du Parcours, défi, événement. */
  how: string;
  /** Objet déjà prévu dans le catalogue économique (prix, source), s'il existe. */
  catalogId?: string;
  /** Mois de sortie visé (indicatif). */
  eta?: string;
};

export const UPCOMING: Upcoming[] = [
  // Chaussures : une paire se portera avec n'importe quelle tenue
  { id: 'shoes_runner_craie', catalogId: 'shoes_runner_craie', name: 'Runner Craie', kind: 'chaussures', rarity: 'COMMON', how: 'Fitcoins', eta: 'décembre 2026',
    detail: 'Running blanc cassé, semelle épaisse, lacets ton sur ton. La paire de tous les jours.' },
  { id: 'shoes_runner_lime', catalogId: 'shoes_runner_lime', name: 'Runner Lime', kind: 'chaussures', rarity: 'EPIC', how: 'Fitcoins', eta: 'décembre 2026',
    detail: 'Running noir, semelle et virgule citron qui brillent la nuit. Aux couleurs de FITAIA.' },
  { id: 'shoes_trail_mousse', name: 'Trail Mousse', kind: 'chaussures', rarity: 'RARE', how: 'Fitcoins', eta: 'janvier 2027',
    detail: 'Chaussure de trail vert mousse, crampons orange, guêtre courte. Pour les sorties en forêt.' },
  { id: 'shoes_haute_neon', name: 'Montante Néon', kind: 'chaussures', rarity: 'LEGENDARY', how: 'Édition limitée', eta: 'janvier 2027',
    detail: 'Basket montante noire, lignes néon magenta et cyan, semelle translucide.' },
  { id: 'shoes_claquettes_recup', name: 'Claquettes Récup', kind: 'chaussures', rarity: 'COMMON', how: 'Palier du Parcours', eta: 'janvier 2027',
    detail: 'Claquettes de récupération graphite, bride rembourrée. Le cadeau des jours de repos.' },
  { id: 'shoes_pointes_piste', name: 'Pointes Piste', kind: 'chaussures', rarity: 'EPIC', how: 'Défi de sprint', eta: 'février 2027',
    detail: 'Pointes d’athlétisme rouge et blanc, très fines. À gagner, elles ne s’achètent pas.' },
  // Haut, bas, vestes : déjà prévus au catalogue
  { id: 'top_tee_graphite', catalogId: 'top_tee_graphite', name: 'Tee Essentiel Graphite', kind: 'haut', rarity: 'COMMON', how: 'Fitcoins', eta: 'janvier 2027',
    detail: 'T-shirt ajusté gris graphite, col rond, petit logo citron sur le cœur.' },
  { id: 'top_hoodie_nuit', catalogId: 'top_hoodie_nuit', name: 'Hoodie Nuit', kind: 'haut', rarity: 'RARE', how: 'Fitcoins', eta: 'janvier 2027',
    detail: 'Hoodie bleu nuit, capuche doublée, poche kangourou.' },
  { id: 'jacket_coupe_vent_citron', catalogId: 'jacket_coupe_vent_citron', name: 'Coupe-vent Citron', kind: 'veste', rarity: 'RARE', how: 'Fitcoins', eta: 'janvier 2027',
    detail: 'Coupe-vent léger citron, zip noir, bandes réfléchissantes.' },
  { id: 'bottom_jogger_graphite', catalogId: 'bottom_jogger_graphite', name: 'Jogger Graphite', kind: 'bas', rarity: 'COMMON', how: 'Fitcoins', eta: 'janvier 2027',
    detail: 'Jogging graphite resserré aux chevilles, poches zippées.' },
  { id: 'jacket_october_crew', catalogId: 'jacket_october_crew', name: 'Veste October Crew', kind: 'veste', rarity: 'LEGENDARY', how: 'Prestige : réservée aux premiers membres',
    detail: 'Veste noire brodée, réservée aux membres de la première heure. Ne s’achète pas.' },
  // Couvre-chefs, lunettes, accessoires
  { id: 'head_casquette_noire', catalogId: 'head_casquette_noire', name: 'Casquette Noire', kind: 'couvre-chef', rarity: 'COMMON', how: 'Fitcoins', eta: 'décembre 2026',
    detail: 'Casquette noire à visière courbée, logo brodé.' },
  { id: 'head_bonnet_hiver', catalogId: 'head_bonnet_hiver', name: 'Bonnet Hiver', kind: 'couvre-chef', rarity: 'COMMON', how: 'Événement d’hiver', eta: 'décembre 2026',
    detail: 'Bonnet côtelé à pompon, pour l’événement d’hiver.' },
  { id: 'glasses_sport_fume', catalogId: 'glasses_sport_fume', name: 'Lunettes Sport Fumé', kind: 'lunettes', rarity: 'RARE', how: 'Fitcoins', eta: 'janvier 2027',
    detail: 'Lunettes de sport enveloppantes, verres fumés.' },
  { id: 'accessory_montre_parcours', catalogId: 'accessory_montre_parcours', name: 'Montre du Parcours', kind: 'accessoire', rarity: 'RARE', how: 'Palier du Parcours',
    detail: 'Montre de sport au cadran citron. Se gagne en avançant dans le Parcours.' },
  { id: 'acc_gourde_inox', name: 'Gourde Inox', kind: 'accessoire', rarity: 'COMMON', how: 'Défi « 7 jours d’affilée »', eta: 'février 2027',
    detail: 'Gourde en inox brossé tenue à la main. Pour 7 jours de défis d’affilée.' },
  // Tenues de la saison suivante
  { id: 'outfit_foret', name: 'Forêt Brume', kind: 'tenue', rarity: 'EPIC', how: 'Fitcoins', eta: 'mars 2027',
    detail: 'Tenue de trail kaki et brume, gilet d’hydratation, en pleine forêt au petit matin.' },
  { id: 'outfit_desert', name: 'Dune Solaire', kind: 'tenue', rarity: 'RARE', how: 'Fitcoins', eta: 'mars 2027',
    detail: 'Tenue légère sable et terracotta, chèche, dans les dunes au coucher du soleil.' },
  { id: 'outfit_arcade', name: 'Arcade 8 bits', kind: 'tenue', rarity: 'LEGENDARY', how: 'Édition limitée', eta: 'avril 2027',
    detail: 'Survêtement à pixels multicolores, fond de salle d’arcade.' },
];

/** Prix prévu (Fitcoins) d'un article à venir, s'il est déjà fixé dans le catalogue économique. */
export function upcomingPrice(u: Upcoming): number | null {
  if (!u.catalogId) return null;
  return COSMETIC_CATALOG.find((i) => i.id === u.catalogId)?.priceFitcoins ?? null;
}

export const KIND_FILTERS: { id: 'tout' | 'limitees' | 'tenues' | 'chaussures' | 'accessoires' | 'avenir' | 'liste'; label: string }[] = [
  { id: 'tout', label: 'Tout' },
  { id: 'limitees', label: 'Éditions limitées' },
  { id: 'tenues', label: 'Tenues' },
  { id: 'chaussures', label: 'Chaussures' },
  { id: 'accessoires', label: 'Accessoires' },
  { id: 'avenir', label: 'À venir' },
  { id: 'liste', label: 'Ma liste' },
];
export type KindFilter = (typeof KIND_FILTERS)[number]['id'];

const ACCESSORY_KINDS: UpcomingKind[] = ['couvre-chef', 'lunettes', 'accessoire'];
export const upcomingMatches = (u: Upcoming, f: KindFilter) =>
  f === 'tout' || f === 'avenir' || (f === 'chaussures' && u.kind === 'chaussures') || (f === 'accessoires' && ACCESSORY_KINDS.includes(u.kind)) ||
  (f === 'tenues' && ['tenue', 'haut', 'bas', 'veste'].includes(u.kind));

/** Catégorie économique → libellé court (pour les articles déjà au catalogue). */
export const SLOT_OF: Partial<Record<UpcomingKind, CosmeticCategory>> = { chaussures: 'SHOES', 'couvre-chef': 'HEAD', lunettes: 'GLASSES', haut: 'TOP', bas: 'BOTTOM', veste: 'JACKET', accessoire: 'ACCESSORY', tenue: 'FULL_OUTFIT' };
