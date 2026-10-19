/**
 * Confidentialité : ce qu'une personne voit d'un profil, selon sa relation avec lui.
 * Exposition minimale par défaut. Le poids, les calories, les mensurations, la photo d'origine, l'adresse
 * et la position ne sont pas dans le profil social : ils ne peuvent donc jamais être affichés.
 */
import { ACTIVITIES, AGE_RANGES, GOALS, SUPPORT, stageOf } from '../models/types';
import type { CommunityProfile } from '../models/types';
import { activeNeed, activeStatus, publicNeed } from '../models/intentions';
import type { NeedId, StatusId } from '../models/intentions';

export type Relation = 'moi' | 'ami' | 'inconnu';

export type PublicCard = {
  userId: string;
  displayName: string;
  avatarId: string;
  stage: string;
  joinedDays: number;
  helpfulness: number;
  ageLabel?: string;
  country?: string;
  goalLabel?: string;
  /** Activités préférées et soutien recherché (libellés) : déjà utilisés par FitMatch, jamais de données de santé. */
  activityLabels: string[];
  supportLabels: string[];
  /** La progression physique de l'avatar peut-elle être montrée à ce visiteur ? */
  showBodyProgress: boolean;
  canMessage: boolean;
  /** État du jour (choisi par la personne, encore valable). */
  status: StatusId | null;
  /** Besoin du jour, seulement si la personne a choisi de le montrer. */
  need: NeedId | null;
  demo: boolean;
};

export function publicCard(p: CommunityProfile, relation: Relation, now = Date.now()): PublicCard | null {
  if (relation !== 'moi' && !p.privacy.profileVisible && relation !== 'ami') return null;
  const own = relation === 'moi';
  const bp = p.privacy.bodyProgress;
  return {
    userId: p.userId,
    displayName: p.displayName,
    avatarId: p.avatarId,
    stage: stageOf(Math.max(p.points, p.highestHistoricalPoints)).name,
    joinedDays: Math.max(1, Math.round((now - p.joinedAt) / 86400000)),
    helpfulness: p.helpfulnessScore,
    ageLabel: own || p.privacy.showAge ? AGE_RANGES.find((a) => a.id === p.ageRange)?.label : undefined,
    country: own || p.privacy.showCountry ? p.countryOptional : undefined,
    goalLabel: own || p.privacy.showGoal ? GOALS.find((g) => g.id === p.goalCategory)?.label : undefined,
    activityLabels: p.activities.map((a) => ACTIVITIES.find((x) => x.id === a)?.label ?? a),
    supportLabels: p.support.map((a) => SUPPORT.find((x) => x.id === a)?.label ?? a),
    showBodyProgress: own || bp === 'public' || (bp === 'amis' && relation === 'ami'),
    canMessage: !own && (p.privacy.allowMessages === 'tous' || (p.privacy.allowMessages === 'amis' && relation === 'ami')),
    status: activeStatus(p, now),
    need: own ? activeNeed(p, now) : publicNeed(p, now),
    demo: !!p.demo,
  };
}
