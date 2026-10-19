/**
 * FITAIA Human Engine — types partagés. Aucune dépendance (ni React, ni three) : ce fichier décrit le contrat du moteur.
 *
 * Flux : UserProfile → BodyParameters → FitaiaHumanEngine → BodyEngine → MorphController → three.js → GLB.
 */

/** Paramètres corporels normalisés (0 → 1). Ils décrivent un corps, pas un mesh : ils survivront au changement de GLB. */
export type BodyParameters = {
  /** Masse globale (0 = très mince, 1 = très fort). */
  weight: number;
  /** Graisse abdominale et tour de taille. */
  bellyFat: number;
  /** Développement musculaire (épaules, bras, torse). */
  muscle: number;
};

/** Noms des morph targets attendus dans le GLB (contrat avec l'artiste 3D). */
export type MorphTargetName = 'body_weight' | 'belly_fat' | 'muscle';
export const MORPH_TARGETS: readonly MorphTargetName[] = ['body_weight', 'belly_fat', 'muscle'];

/** Valeurs envoyées aux morphTargetInfluences (0 → 1). */
export type MorphWeights = Record<MorphTargetName, number>;

/** Valeurs de morphs par nom, quel que soit le mesh (prototype : 3 noms ; premium : body_weight_low, muscle_low…). */
export type MorphValues = Record<string, number>;

/**
 * Driver : comment un réglage du corps pilote un morph d'un mesh donné (courbe linéaire par morceaux).
 * C'est la couche qui rend BodyParameters indépendants du mesh : un nouveau GLB = une nouvelle table de drivers.
 */
export type MorphDriver = {
  morph: string;
  /** Réglage source : un des 3 BodyParameters ou un des 13 réglages détaillés corrélés (BodyShape). */
  input: keyof BodyParameters | DetailedBodyKey;
  /** Points (entrée, poids du morph), entrées croissantes. Hors bornes : valeur du point extrême. */
  points: [number, number][];
};

/** Clés des 13 réglages détaillés (voir body/BodyShape.ts). */
export type DetailedBodyKey =
  | 'bodyFat' | 'visceralBelly' | 'waist' | 'hips' | 'chest' | 'shoulders' | 'upperArm' | 'forearm' | 'thigh' | 'calf' | 'faceFat' | 'neckFat' | 'muscleMass';

/** Définition d'un avatar : son fichier, ses drivers, son rendu. */
export type AvatarDefinition = {
  id: string;
  label: string;
  /** require('…glb') ou URL. */
  source: number | string | { uri: string };
  drivers: MorphDriver[];
  /** 'clay' : prototype sans texture ; 'studio' : éclairage premium (tone mapping, lumières de studio). */
  look: 'clay' | 'studio';
};

/**
 * Comment les morphs sont appliqués :
 *  - 'gpu' : three.js mélange les morphs dans le shader (morphTargetInfluences) — standard, zéro coût CPU ;
 *  - 'cpu' : le moteur mélange lui-même les sommets et envoie le résultat — même résultat visuel, ne dépend pas
 *    du support des textures de morph par le GPU (filet de sécurité pour expo-gl sur iPhone).
 */
export type MorphStrategy = 'gpu' | 'cpu';

export type LoadState =
  | { status: 'idle' }
  | { status: 'loading'; startedAt: number }
  | { status: 'ready'; ms: number; bytes: number; /** Décodage des textures (iPhone/Android ; 0 sur le web). */ textureMs?: number }
  | { status: 'error'; message: string };

export type MeshStats = {
  vertices: number;
  triangles: number;
  meshes: number;
  materials: number;
  textures: number;
  /** Morphs trouvés dans le GLB. */
  morphTargets: string[];
  /** Morphs attendus par les drivers de l'avatar mais absents du GLB (ils sont ignorés sans erreur). */
  missingMorphs: string[];
  /** Estimation de la mémoire GPU des géométries (octets). */
  geometryBytes: number;
};

export type RenderStats = {
  fps: number;
  /** Intervalle moyen entre deux images (ms). */
  frameMs: number;
  /** Temps CPU moyen passé dans renderer.render (ms). */
  renderMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
};

export type EngineSnapshot = {
  body: BodyParameters;
  morphs: MorphValues;
  animating: boolean;
  strategy: MorphStrategy;
  load: LoadState;
  mesh: MeshStats | null;
  render: RenderStats | null;
};

export type AnimateOptions = {
  /** Durée en ms (défaut 1 600). 0 = immédiat (mouvement réduit). */
  durationMs?: number;
  /** Point de départ ; par défaut, le corps affiché à cet instant. */
  from?: Partial<BodyParameters>;
};

// ---------- Couches futures (contrats posés dès maintenant, implémentations à venir) ----------

/** Vecteur d'identité : la représentation compacte d'une personne (V1 : issu de la fiche ; V3 : d'un réseau). */
export type IdentityVector = {
  version: number;
  source: 'none' | 'sheet' | 'selfie';
  values: number[];
};

/** Paramètres du visage (noms de morphs visage → valeur). Vide tant que FaceEngine n'est pas implémenté. */
export type FaceParameters = Record<string, number>;

/** Point de repère du visage (normalisé 0 → 1 dans l'image), tel que fourni par Apple Vision ou MediaPipe. */
export type FaceLandmark = { x: number; y: number; z?: number };
