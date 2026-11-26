-- =====================================================================================================
-- FITAIA Communauté — mise en ligne réelle (complète 0001 + 0003 + 0004 pour l'app branchée sur le serveur).
--
--  * droits de mise à jour du genre et du filtre « Me proposer » (oubliés en 0004) ;
--  * carte publique : activités, soutien, créneaux et fuseau (déjà utilisés par FitMatch, aucune donnée de santé) ;
--  * running clubs : un forum par ville de la liste fermée de l'app (src/community/models/forums.ts) ;
--  * suppression du compte par la personne elle-même (exigence Apple 5.1.1(v)) : toutes ses données partent ;
--  * file de modération pour la revue humaine (lisible seulement par le service, jamais par l'app) ;
--  * photos des forums : stockage PRIVÉ, lisible seulement si le message est lisible (bloc « storage » plus bas).
-- =====================================================================================================

grant update (gender, match_with) on public.community_profiles to authenticated;

-- Carte publique v3 : colonnes ajoutées EN FIN de liste (la vue existante reste compatible).
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
       then p.need end                                                                             as need,
  p.slots,
  p.activities,
  p.support,
  p.utc_offset,
  p.allow_messages
from public.community_profiles p
where auth.uid() is not null
  and (
    p.user_id = auth.uid()
    or (not public.is_blocked(auth.uid(), p.user_id)
        and (p.profile_visible or public.is_friend(auth.uid(), p.user_id)))
  );
revoke all on public.community_cards from anon;
grant select on public.community_cards to authenticated;

-- Running clubs : un forum par ville proposée dans l'app.
insert into public.forums (id, kind, title, description, city) values
  ('run_paris', 'running', 'Running club Paris', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Paris'),
  ('run_marseille', 'running', 'Running club Marseille', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Marseille'),
  ('run_lyon', 'running', 'Running club Lyon', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Lyon'),
  ('run_toulouse', 'running', 'Running club Toulouse', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Toulouse'),
  ('run_lille', 'running', 'Running club Lille', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Lille'),
  ('run_bordeaux', 'running', 'Running club Bordeaux', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Bordeaux'),
  ('run_nantes', 'running', 'Running club Nantes', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Nantes'),
  ('run_strasbourg', 'running', 'Running club Strasbourg', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Strasbourg'),
  ('run_nice', 'running', 'Running club Nice', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Nice'),
  ('run_montpellier', 'running', 'Running club Montpellier', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Montpellier'),
  ('run_rennes', 'running', 'Running club Rennes', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Rennes'),
  ('run_grenoble', 'running', 'Running club Grenoble', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Grenoble'),
  ('run_bruxelles', 'running', 'Running club Bruxelles', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Bruxelles'),
  ('run_geneve', 'running', 'Running club Genève', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Genève'),
  ('run_lausanne', 'running', 'Running club Lausanne', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Lausanne'),
  ('run_montreal', 'running', 'Running club Montréal', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Montréal'),
  ('run_casablanca', 'running', 'Running club Casablanca', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Casablanca'),
  ('run_alger', 'running', 'Running club Alger', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Alger'),
  ('run_tunis', 'running', 'Running club Tunis', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Tunis'),
  ('run_dakar', 'running', 'Running club Dakar', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Dakar'),
  ('run_abidjan', 'running', 'Running club Abidjan', 'On court ensemble toutes les deux semaines, puis on se raconte la sortie ici.', 'Abidjan')
on conflict (id) do nothing;

-- Suppression du compte : la ligne auth.users part, tout le reste suit (on delete cascade partout).
-- Les photos sont retirées par l'app via l'API de stockage juste avant (Supabase interdit de les effacer en SQL).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'non connecté' using errcode = 'P0001'; end if;
  delete from auth.users where id = me;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- File de modération (revue humaine depuis le tableau de bord Supabase, rôle service uniquement).
create or replace view public.moderation_queue as
select 'forum'::text as kind, r.id as report_id, r.reason, r.created_at, r.status,
       fp.id as content_id, fp.author_id as target_user_id, fp.content, fp.photo_path, fp.state
  from public.forum_reports r join public.forum_posts fp on fp.id = r.post_id
union all
select 'message', r.id, r.reason, r.created_at, r.status,
       m.id, r.target_user_id, m.content, null, m.moderation_state
  from public.reports r left join public.messages m on m.id = r.message_id_optional;
revoke all on public.moderation_queue from public, anon, authenticated;
grant select on public.moderation_queue to service_role;

-- Décision humaine : garder (le contenu redevient visible) ou masquer pour tout le monde.
create or replace function public.admin_resolve_report(p_report uuid, p_keep boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.forum_posts set state = case when p_keep then 'ok' else 'masque' end
   where id = (select post_id from public.forum_reports where id = p_report);
  update public.forum_reports set status = 'traite' where post_id = (select post_id from public.forum_reports where id = p_report);
  update public.messages set moderation_state = case when p_keep then 'ok' else 'masque' end
   where id = (select message_id_optional from public.reports where id = p_report);
  update public.reports set status = 'traite' where id = p_report;
end $$;
revoke execute on function public.admin_resolve_report(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_resolve_report(uuid, boolean) to service_role;

-- Messages de forum : lire le prénom de l'auteur même s'il a masqué son profil de FitMatch.
create or replace function public.forum_authors(ids uuid[]) returns table (user_id uuid, display_name text, avatar_id text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.display_name, p.avatar_id from public.community_profiles p
   where p.user_id = any(ids) and auth.uid() is not null and not public.is_blocked(auth.uid(), p.user_id);
$$;
revoke execute on function public.forum_authors(uuid[]) from public, anon;
grant execute on function public.forum_authors(uuid[]) to authenticated;

-- Photos des forums : seau privé « forum-photos », chemin <mon id>/<nom>. Ignoré hors Supabase (tests locaux).
do $do$
begin
  if to_regclass('storage.objects') is null then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('forum-photos', 'forum-photos', false, 3145728, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;
  execute $p$create policy forum_photos_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'forum-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy forum_photos_delete on storage.objects for delete to authenticated
    using (bucket_id = 'forum-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy forum_photos_read on storage.objects for select to authenticated
    using (bucket_id = 'forum-photos' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.forum_posts fp where fp.photo_path = name and public.can_read_post(fp, auth.uid()))
    ))$p$;
end
$do$;

-- Une photo de forum ne peut être que celle de son auteur (chemin <auteur>/...).
create or replace function public.tg_forum_photo_owner() returns trigger
language plpgsql as $$
begin
  if new.photo_path is not null and split_part(new.photo_path, '/', 1) <> new.author_id::text then
    raise exception 'photo_interdite';
  end if;
  return new;
end $$;
create trigger forum_photo_owner before insert on public.forum_posts for each row execute function public.tg_forum_photo_owner();

-- Niveau affiché dans la Communauté : en attendant le registre serveur des points (0002), le téléphone déclare ses
-- Points FITAIA. Ils ne font que monter (jamais redescendre) et restent bornés ; ils ne donnent rien d'autre qu'un
-- niveau affiché et un critère FitMatch (aucune monnaie, aucun objet).
create or replace function public.sync_my_points(p integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'non connecté' using errcode = 'P0001'; end if;
  update public.community_profiles
     set points = greatest(points, least(greatest(p, 0), 50000)), last_active_at = now()
   where user_id = auth.uid();
end $$;
revoke execute on function public.sync_my_points(integer) from public, anon;
grant execute on function public.sync_my_points(integer) to authenticated;
