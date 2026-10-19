/**
 * DONNÉES DE DÉVELOPPEMENT — profils fictifs pour essayer la Communauté avant l'ouverture du serveur.
 * Chaque profil porte `demo: true` et l'écran l'indique (« Profil de démonstration »). Leurs réponses sont simulées.
 * Aucune de ces personnes n'existe ; aucun visage réel n'est utilisé (portraits vectoriels FITAIA).
 */
import { DEFAULT_SHEET } from '../../data/character';
import type { CharacterSheet } from '../../data/character';
import { DEFAULT_PRIVACY } from '../models/types';
import type { CommunityProfile } from '../models/types';
import { lookForOutfit } from '../models/outfit';
import type { EquippedLook } from '../models/outfit';
import { DEMO_SOCIAL, demoPresence } from './demoSocial';
import type { SocialStats } from './highlights';

type Demo = Omit<CommunityProfile, 'joinedAt' | 'lastActiveAt' | 'privacy' | 'avatarId' | 'demo' | 'timezone' | 'utcOffset' | 'helpfulnessScore'> & {
  joinedDaysAgo: number;
  activeMinutesAgo: number;
  helpful: number;
  sheet: Partial<CharacterSheet>;
  outfit: string;
  replies: string[];
};

const D: Demo[] = [
  { userId: 'demo_sarah', displayName: 'Sarah', language: 'fr', ageRange: '25-30', countryOptional: 'France', goalCategory: 'perdre', points: 820, highestHistoricalPoints: 820, slots: ['matin', 'soir'], activities: ['marche', 'maison'], support: ['encouragement'], joinedDaysAgo: 34, activeMinutesAgo: 4, helpful: 18,
    sheet: { appearance: 'fem', body: 'rond', skin: 's2', hairStyle: 'milong', hairColor: 'chatain', beard: 'aucune', extras: [] }, outfit: 'olive',
    replies: ['Salut ! Cette semaine je vise 4 marches de 30 minutes. Et toi ?', 'Merci, ça fait du bien 🙂', 'On se tient au courant ce soir ?', 'Top, à ce soir alors !'] },
  { userId: 'demo_nassim', displayName: 'Nassim', language: 'fr', ageRange: '25-30', countryOptional: 'France', goalCategory: 'perdre', points: 640, highestHistoricalPoints: 700, slots: ['soir'], activities: ['salle', 'marche'], support: ['defi', 'encouragement'], joinedDaysAgo: 21, activeMinutesAgo: 1, helpful: 11,
    sheet: { appearance: 'masc', body: 'costaud', skin: 's5', hairStyle: 'degrade', hairColor: 'noir', beard: 'courte', extras: ['montre'] }, outfit: 'origine',
    replies: ['Yo ! Je reprends la salle le soir, 3 fois par semaine.', 'Défi : 8 000 pas demain, tu suis ?', '💪 On lâche rien', 'Je te dis demain soir comment ça s’est passé.'] },
  { userId: 'demo_ines', displayName: 'Inès', language: 'fr', ageRange: '25-30', countryOptional: 'Belgique', goalCategory: 'reprendre', points: 410, highestHistoricalPoints: 410, slots: ['midi'], activities: ['course'], support: ['conseil'], joinedDaysAgo: 9, activeMinutesAgo: 55, helpful: 4,
    sheet: { appearance: 'fem', body: 'mince', skin: 's3', hairStyle: 'queue', hairColor: 'brun', beard: 'aucune', extras: [] }, outfit: 'creme',
    replies: ['Hello ! Je reprends la course doucement, 20 minutes le midi.', 'Un conseil qui m’aide : préparer mes affaires la veille.', 'Merci ! Tu me diras si ça marche pour toi.'] },
  { userId: 'demo_adam', displayName: 'Adam', language: 'fr', ageRange: '25-30', countryOptional: 'Canada', goalCategory: 'muscler', points: 1650, highestHistoricalPoints: 1650, slots: ['matin'], activities: ['salle'], support: ['conseil', 'defi'], joinedDaysAgo: 70, activeMinutesAgo: 240, helpful: 35,
    sheet: { appearance: 'masc', body: 'athle', skin: 's1', hairStyle: 'court', hairColor: 'blond', beard: 'trois', extras: [] }, outfit: 'titane',
    replies: ['Salut ! Je m’entraîne à 6 h avant le travail.', 'Le plus dur c’est la régularité, pas l’intensité.', 'Si tu veux, je te partage ma routine du matin.'] },
  { userId: 'demo_leila', displayName: 'Leïla', language: 'fr', ageRange: '31-35', countryOptional: 'France', goalCategory: 'garder', points: 950, highestHistoricalPoints: 950, slots: ['soir', 'nuit'], activities: ['maison', 'velo'], support: ['ecoute', 'encouragement'], joinedDaysAgo: 45, activeMinutesAgo: 12, helpful: 22,
    sheet: { appearance: 'fem', body: 'athle', skin: 's6', hairStyle: 'boucle', hairColor: 'noir', beard: 'aucune', extras: ['boucles'] }, outfit: 'cargo',
    replies: ['Coucou ! Je travaille de nuit, alors je bouge surtout à la maison.', 'Tu veux qu’on se fixe un petit objectif pour demain ?', 'Ça marche, je te fais signe demain 🙂'] },
  { userId: 'demo_karim', displayName: 'Karim', language: 'fr', ageRange: '25-30', countryOptional: 'Maroc', goalCategory: 'perdre', points: 120, highestHistoricalPoints: 120, slots: ['soir'], activities: ['marche', 'collectif'], support: ['encouragement'], joinedDaysAgo: 3, activeMinutesAgo: 30, helpful: 1,
    sheet: { appearance: 'masc', body: 'rond', skin: 's4', hairStyle: 'court', hairColor: 'noir', beard: 'pleine', extras: [] }, outfit: 'atelier',
    replies: ['Salut ! Je viens de commencer, j’ai besoin de motivation 😅', 'Merci, ça me motive !', 'Le plus dur pour moi, c’est de m’y mettre après le boulot.', 'Carrément, 8 000 pas. On se dit demain soir ?'] },
  { userId: 'demo_julie', displayName: 'Julie', language: 'fr', ageRange: '18-24', countryOptional: 'France', goalCategory: 'energie', points: 560, highestHistoricalPoints: 560, slots: ['matin', 'midi'], activities: ['natation', 'marche'], support: ['defi'], joinedDaysAgo: 18, activeMinutesAgo: 600, helpful: 6,
    sheet: { appearance: 'fem', body: 'mince', skin: 's1', hairStyle: 'long', hairColor: 'blond', beard: 'aucune', extras: [] }, outfit: 'olive',
    replies: ['Hey ! Je nage le mardi et le jeudi.', 'Petit défi : un verre d’eau avant chaque repas ?', 'Je note, on en reparle vendredi !'] },
  { userId: 'demo_thomas', displayName: 'Thomas', language: 'fr', ageRange: '31-35', countryOptional: 'Suisse', goalCategory: 'reprendre', points: 2900, highestHistoricalPoints: 3100, slots: ['midi', 'soir'], activities: ['velo', 'course'], support: ['conseil'], joinedDaysAgo: 120, activeMinutesAgo: 90, helpful: 48,
    sheet: { appearance: 'masc', body: 'mince', skin: 's2', hairStyle: 'degrade', hairColor: 'chatain', beard: 'aucune', extras: ['lunettes'] }, outfit: 'creme',
    replies: ['Salut ! Le vélo pour aller au travail a tout changé pour moi.', 'Tu veux un conseil ou un encouragement ?', 'Garde le rythme, c’est comme ça que ça tient.'] },
];

export const DEMO_IDS = new Set(D.map((d) => d.userId));

export function demoProfiles(now = Date.now()): CommunityProfile[] {
  return D.map((d) => ({
    ...demoDaily(d.userId, now),
    userId: d.userId,
    displayName: d.displayName,
    avatarId: 'demo:' + d.userId,
    language: d.language,
    ageRange: d.ageRange,
    countryOptional: d.countryOptional,
    timezone: 'Europe/Paris',
    utcOffset: d.countryOptional === 'Canada' ? -4 : d.countryOptional === 'Maroc' ? 1 : 2,
    goalCategory: d.goalCategory,
    points: d.points,
    highestHistoricalPoints: d.highestHistoricalPoints,
    slots: d.slots,
    activities: d.activities,
    support: d.support,
    helpfulnessScore: d.helpful,
    joinedAt: now - d.joinedDaysAgo * 86400000,
    lastActiveAt: now - d.activeMinutesAgo * 60000,
    privacy: { ...DEFAULT_PRIVACY, showAge: true, showCountry: true, allowMessages: 'tous' },
    demo: true,
  }));
}

/** État et besoin du jour des profils de démonstration (renouvelés chaque jour : la démo reste vivante). */
export function demoDaily(userId: string, now: number): Pick<CommunityProfile, 'status' | 'statusAt' | 'need' | 'needAt' | 'needPublic'> {
  const x = DEMO_SOCIAL[userId];
  if (!x) return {};
  const at = now - (20 + (x.baseMinutes * 13) % 160) * 60000;
  return { status: x.status, statusAt: x.status ? at : undefined, need: x.need, needAt: x.need ? at : undefined, needPublic: !!x.need };
}

/** Présence simulée (selon les moments habituels de chacun) + état du jour, à appliquer à l'ouverture. */
export function demoRefresh(now: number, hour: number): Record<string, Partial<CommunityProfile>> {
  const pres = demoPresence(D.map((d) => ({ userId: d.userId, slots: d.slots })), hour, now);
  const out: Record<string, Partial<CommunityProfile>> = {};
  for (const d of D) out[d.userId] = { lastActiveAt: pres[d.userId], ...demoDaily(d.userId, now) };
  return out;
}

export function demoStats(userId: string): SocialStats | null {
  return DEMO_SOCIAL[userId]?.stats ?? null;
}

export function demoLook(userId: string): EquippedLook | null {
  const d = D.find((x) => x.userId === userId);
  return d ? lookForOutfit(d.outfit, true) : null;
}

export function demoAvatar(userId: string): { sheet: CharacterSheet; outfit: string } | null {
  const d = D.find((x) => x.userId === userId);
  return d ? { sheet: { ...DEFAULT_SHEET, ...d.sheet }, outfit: d.outfit } : null;
}

/** Réponse simulée n° `index` ; plus rien quand le script est épuisé (jamais de réponse répétée). */
export function demoReply(userId: string, index: number): string | null {
  const d = D.find((x) => x.userId === userId);
  if (!d) return null;
  return d.replies[index] ?? null;
}
