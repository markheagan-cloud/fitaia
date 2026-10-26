/**
 * Caricature personnelle (selfie → portrait « caricature cool » + 3 bustes) : types et lecture de la réponse du serveur
 * hero3d/caricature/serve_caricature.py. Pur, sans module natif (tests/caricature.test.ts).
 *
 * C'est le perso validé par Mark le 2026-10-26 : une seule photo en entrée, en sortie le même personnage de face,
 * puis en surpoids / actuel / athlétique. Rien n'est inventé côté app : sans réponse complète du serveur, pas de perso.
 */
import type { AvatarBase } from './identity';
import type { JobBody } from './avatar3dJob';

export const BODY_KEYS = ['surpoids', 'actuel', 'athletique'] as const;
export type BodyKey = (typeof BODY_KEYS)[number];

export type Caricature = {
  id: string;
  base: AvatarBase;
  at: number;
  /** Portrait de face : c'est lui que montrent Accueil, Mon perso et Communauté. */
  portraitUri: string;
  /** Le même personnage selon le corps (illustrations, pas une prédiction). */
  bodies: Record<BodyKey, string>;
  /** Ce que le serveur dit ne pas garantir (texte lisible). */
  limits: string[];
  model: string | null;
  seed: number | null;
  /** Durée de la création côté serveur, en secondes. */
  durationS: number | null;
};

/** Résultat brut du serveur une fois la tâche finie : chemins relatifs à l'adresse du serveur. */
export type CaricatureJobResult = { id: string; portrait: string; bodies: Record<BodyKey, string>; report: CaricatureReport };

export type CaricatureReport = { limites?: string[]; duree_s?: number; modele?: string; graine?: number };

/** Lit la réponse « done » du serveur ; null si un des quatre fichiers manque (jamais de perso incomplet). */
export function finishedCaricature(body: JobBody): CaricatureJobResult | null {
  if (!body.ok || !body.id || !body.portrait || !body.corps) return null;
  const bodies = {} as Record<BodyKey, string>;
  for (const k of BODY_KEYS) {
    const v = body.corps[k];
    if (typeof v !== 'string' || !v) return null;
    bodies[k] = v;
  }
  const r = (body.report ?? {}) as CaricatureReport;
  return { id: body.id, portrait: body.portrait, bodies, report: r };
}

/** Réponse JSON du Space Hugging Face (images en base64) → même résultat que le serveur local, ou null si incomplète. */
export function finishedSpaceCaricature(json: string, id: string): CaricatureJobResult | null {
  let r: { ok?: boolean; error?: string; portrait?: string; corps?: Record<string, string>; report?: CaricatureReport };
  try {
    r = JSON.parse(json);
  } catch {
    return null;
  }
  if (!r || typeof r !== 'object') return null;
  if (r.ok === false) throw new Error(typeof r.error === 'string' && r.error ? r.error : 'Création du perso impossible.');
  return finishedCaricature({ ok: Boolean(r.ok), id, portrait: r.portrait, corps: r.corps, report: r.report as Record<string, unknown> });
}

/** Nom du fichier gardé sur le téléphone (retrouvé par son nom après une mise à jour de l'app). */
export function caricatureFileName(id: string, which: 'portrait' | BodyKey): string {
  return 'caricature-' + id + '-' + which + '.png';
}

/** Réponse du serveur + fichiers déjà enregistrés → donnée affichée et sauvegardée. */
export function buildCaricature(r: CaricatureJobResult, base: AvatarBase, files: { portrait: string; bodies: Record<BodyKey, string> }, at = Date.now()): Caricature {
  return {
    id: r.id,
    base,
    at,
    portraitUri: files.portrait,
    bodies: files.bodies,
    limits: Array.isArray(r.report.limites) ? r.report.limites.filter((l): l is string => typeof l === 'string') : [],
    model: typeof r.report.modele === 'string' ? r.report.modele : null,
    seed: typeof r.report.graine === 'number' ? r.report.graine : null,
    durationS: typeof r.report.duree_s === 'number' ? Math.round(r.report.duree_s) : null,
  };
}
