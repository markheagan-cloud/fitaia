/** Rapport du serveur « selfie → avatar 3D » → données affichées et sauvegardées (pur, sans module natif). */
import type { AvatarBase } from './identity';

export type Avatar3dTrait = { trait: string; raison: string; source: string };

export type Avatar3d = {
  id: string;
  uri: string;
  base: AvatarBase;
  at: number;
  /** Lu sur la photo. */
  fromPhoto: { skin: string | null; hair: string | null; bald: boolean; faceTargets: number; errorMm: number | null };
  /** Impossible à déduire d'un selfie : vient du profil (taille, poids…). */
  notFromPhoto: Avatar3dTrait[];
  limits: string[];
};

export type ServerReport = {
  ok: boolean;
  erreur?: string;
  traits_photo?: { teint_rgb?: number[] | null; cheveux_rgb?: number[] | null; chauve?: boolean; cibles_visage?: number; erreur_moyenne_mm?: number | null };
  non_deductible?: Avatar3dTrait[];
  limites?: string[];
};

const hex = (rgb?: number[] | null) =>
  rgb && rgb.length >= 3 ? '#' + rgb.slice(0, 3).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('') : null;

/** Rapport serveur → données affichées et sauvegardées (pur, testé). */
export function parseReport(id: string, uri: string, base: AvatarBase, r: ServerReport, at = Date.now()): Avatar3d {
  const t = r.traits_photo ?? {};
  return {
    id,
    uri,
    base,
    at,
    fromPhoto: {
      skin: hex(t.teint_rgb),
      hair: t.chauve ? null : hex(t.cheveux_rgb),
      bald: Boolean(t.chauve),
      faceTargets: t.cibles_visage ?? 0,
      errorMm: typeof t.erreur_moyenne_mm === 'number' ? Math.round(t.erreur_moyenne_mm * 10) / 10 : null,
    },
    notFromPhoto: r.non_deductible ?? [],
    limits: r.limites ?? [],
  };
}

