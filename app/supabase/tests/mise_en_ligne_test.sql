-- Test de 0006_mise_en_ligne.sql (après 0001 + 0003 + 0004 + 0005 + leurs tests : mêmes utilisateurs a, b, c, d).
\set ON_ERROR_STOP 1
create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'ok %', label;
end $$;
create or replace function pg_temp.fails(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'ok % (refusé : %)', label, sqlerrm; return; end;
  raise exception 'ÉCHEC : % (aurait dû être refusé)', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated;
reset role;

select pg_temp.check((select count(*) from public.forums where kind = 'running') = 21, '21 running clubs (un par ville de l''app)');
select pg_temp.check(exists (select 1 from public.forums where id = 'run_geneve' and city = 'Genève'), 'identifiant de ville sans accent (run_geneve)');

insert into auth.users values ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000e2');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
insert into public.community_profiles (user_id, display_name, avatar_id, age_range, goal_category, slots, activities, support)
values ('00000000-0000-0000-0000-0000000000e1', 'Eve', 'moi', '25-30', 'muscler', '{soir}', '{salle}', '{defi}');
update public.community_profiles set gender = 'f', match_with = 'tous' where user_id = auth.uid();
select pg_temp.check((select gender from public.community_profiles where user_id = auth.uid()) = 'f', 'le genre et le filtre se mettent à jour par la personne');
select pg_temp.fails($q$update public.community_profiles set points = 99999 where user_id = auth.uid()$q$, 'les points restent réservés au serveur');
select public.sync_my_points(800);
select pg_temp.check((select points from public.community_profiles where user_id = auth.uid()) = 800, 'points déclarés par le téléphone');
select public.sync_my_points(100);
select pg_temp.check((select points from public.community_profiles where user_id = auth.uid()) = 800, 'les points ne redescendent jamais');
select public.sync_my_points(999999);
select pg_temp.check((select points from public.community_profiles where user_id = auth.uid()) = 50000, 'points bornés');
select pg_temp.check((select activities from public.community_cards where user_id = auth.uid()) = '{salle}', 'carte publique : activités');
select pg_temp.check(not exists (select 1 from information_schema.columns where table_name = 'community_cards' and column_name = 'gender'), 'le genre n’apparaît jamais dans la carte publique');

-- photos : seulement les siennes
insert into public.forum_rules_acceptances (user_id) values (auth.uid());
select pg_temp.fails($q$insert into public.forum_posts (forum_id, author_id, content, photo_path) values ('f_repas', '00000000-0000-0000-0000-0000000000e1', 'photo', '00000000-0000-0000-0000-0000000000e2/x.jpg')$q$, 'photo d’un autre refusée');
insert into public.forum_posts (forum_id, author_id, content, photo_path) values ('f_repas', auth.uid(), 'mon repas', auth.uid()::text || '/repas.jpg');

-- file de modération : invisible pour l'app
select pg_temp.fails($q$select * from public.moderation_queue$q$, 'file de modération illisible depuis l’app');
select pg_temp.fails($q$select public.admin_resolve_report(gen_random_uuid(), true)$q$, 'décision de modération réservée au service');

-- auteurs de forum
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.check((select display_name from public.forum_authors(array['00000000-0000-0000-0000-0000000000e1'::uuid])) = 'Eve', 'prénom de l’auteur lisible');

-- revue humaine : signaler puis masquer
insert into public.forum_reports (post_id, reporter_id, reason) select id, auth.uid(), 'contenu_inapproprie' from public.forum_posts where content = 'mon repas';
reset role;
select public.admin_resolve_report((select report_id from public.moderation_queue where content = 'mon repas'), false);
select pg_temp.check((select state from public.forum_posts where content = 'mon repas') = 'masque', 'revue humaine : contenu masqué pour tous');
select pg_temp.check((select status from public.forum_reports r join public.forum_posts p on p.id = r.post_id where p.content = 'mon repas') = 'traite', 'signalement marqué traité');

-- suppression du compte
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select public.delete_my_account();
reset role;
select pg_temp.check(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000e1'), 'compte supprimé');
select pg_temp.check(not exists (select 1 from public.community_profiles where user_id = '00000000-0000-0000-0000-0000000000e1'), 'profil supprimé avec le compte');
select pg_temp.check(not exists (select 1 from public.forum_posts where author_id = '00000000-0000-0000-0000-0000000000e1'), 'messages de forum supprimés avec le compte');
set role anon;
select pg_temp.fails($q$select public.delete_my_account()$q$, 'suppression impossible sans être connecté');
reset role;
\echo TESTS SQL MISE EN LIGNE OK
