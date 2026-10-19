/**
 * Profil social : petits repères (« Régulier », « 14 encouragements », « 3 défis terminés ») et parcours en étapes.
 * Seules des données qui EXISTENT sont montrées : un repère sans donnée réelle (ou de démonstration signalée) n'apparaît pas.
 * Jamais de poids, de calories ni de mensurations. Logique pure.
 */
import { STAGES, stageOf } from '../models/types';

export type HighlightId = 'regulier' | 'encouragements' | 'defis';
/** `label` : forme courte (« 14 encouragements ») ; `value` + `caption` : forme en colonne (« 14 » / « encouragements »). */
export type Highlight = { id: HighlightId; label: string; value: string; caption: string; demo: boolean };

/** Statistiques sociales venues de la progression (phase 2) ; pour l'instant, seulement pour les profils de démonstration. */
export type SocialStats = { regular: boolean; challengesDone: number; demo: boolean };

export function profileHighlights(input: { helpfulness: number; stats: SocialStats | null }): Highlight[] {
  const out: Highlight[] = [];
  const s = input.stats;
  if (s?.regular) out.push({ id: 'regulier', label: 'Régulier', value: 'Régulier', caption: 'son rythme', demo: s.demo });
  if (input.helpfulness > 0) {
    const cap = 'encouragement' + (input.helpfulness > 1 ? 's' : '');
    out.push({ id: 'encouragements', label: input.helpfulness + ' ' + cap, value: String(input.helpfulness), caption: cap, demo: false });
  }
  if (s && s.challengesDone > 0) {
    const cap = 'défi' + (s.challengesDone > 1 ? 's' : '') + ' terminé' + (s.challengesDone > 1 ? 's' : '');
    out.push({ id: 'defis', label: s.challengesDone + ' ' + cap, value: String(s.challengesDone), caption: cap, demo: s.demo });
  }
  return out;
}

export type StageStep = { id: number; name: string; state: 'passe' | 'actuel' | 'futur' };

/** Les six étapes du Parcours, à partir du meilleur niveau atteint (jamais un niveau « redescendu »). */
export function stageTrack(points: number, highest: number): StageStep[] {
  const cur = stageOf(Math.max(points, highest)).id;
  return STAGES.map((s) => ({ id: s.id, name: s.name, state: s.id < cur ? 'passe' : s.id === cur ? 'actuel' : 'futur' }));
}

/** « Étape Élan · 21 jours » */
export function journeyLine(stage: string, days: number): string {
  return 'Étape ' + stage + ' · ' + days + ' jour' + (days > 1 ? 's' : '');
}
