-- =====================================================================================================
-- FITAIA Communauté — état du jour et besoin du jour (« coup de pouce »). Prête, non déployée.
-- Même contrat que src/community/models/intentions.ts :
--  - état (« Dispo pour parler »…) : facultatif, choisi par la personne, visible 12 h puis effacé à l'affichage ;
--  - besoin du jour : sert à adapter FitMatch ; visible des autres SEULEMENT si need_public (désactivé par défaut).
-- =====================================================================================================

alter table public.community_profiles
  add column status      text check (status is null or status in ('dispo','motive','entrainement','repas','nuit','aide')),
  add column status_at   timestamptz,
  add column need        text check (need is null or need in ('motivation','repas','entrainement','moral','regularite','ecoute','aider')),
  add column need_at     timestamptz,
  add column need_public boolean not null default false;

-- Les cartes publiques gagnent deux colonnes (en fin de liste : la vue existante reste compatible).
create or replace view public.community_cards as
select
  p.user_id,
  p.display_name,
  p.avatar_id,
  p.language,
  greatest(p.points, p.highest_historical_points)                                                  as level_points,
  p.helpfulness_score,
  p.joined_at,
  p.last_active_at,
  case when p.user_id = auth.uid() or p.show_age then p.age_range end                              as age_range,
  case when p.user_id = auth.uid() or p.show_country then p.country_optional end                   as country,
  case when p.user_id = auth.uid() or p.show_goal then p.goal_category end                         as goal_category,
  (p.user_id = auth.uid() or p.body_progress = 'public'
     or (p.body_progress = 'amis' and public.is_friend(auth.uid(), p.user_id)))                    as show_body_progress,
  (p.user_id <> auth.uid() and (p.allow_messages = 'tous'
     or (p.allow_messages = 'amis' and public.is_friend(auth.uid(), p.user_id))))                  as can_message,
  case when p.status_at > now() - interval '12 hours' then p.status end                            as status,
  case when (p.user_id = auth.uid() or p.need_public) and p.need_at > now() - interval '12 hours'
       then p.need end                                                                             as need
from public.community_profiles p
where auth.uid() is not null
  and (
    p.user_id = auth.uid()
    or (not public.is_blocked(auth.uid(), p.user_id)
        and (p.profile_visible or public.is_friend(auth.uid(), p.user_id)))
  );

-- Le client peut choisir son état et son besoin du jour (colonnes ajoutées aux droits de mise à jour existants).
grant update (status, status_at, need, need_at, need_public) on public.community_profiles to authenticated;
revoke all on public.community_cards from anon;
grant select on public.community_cards to authenticated;
