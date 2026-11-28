-- Test de comportement de 0004_forums.sql (après 0001 + 0003 + community_test.sql : mêmes utilisateurs).
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

insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d');
insert into public.community_profiles (user_id, display_name, avatar_id, age_range, goal_category, points, slots, activities, support, joined_at, gender, match_with)
values
 ('00000000-0000-0000-0000-00000000000a','Ana','fa','25-30','perdre',800,'{soir}','{marche}','{encouragement}', now() - interval '30 days', 'f', 'f'),
 ('00000000-0000-0000-0000-00000000000b','Bea','fb','25-30','perdre',800,'{soir}','{marche}','{encouragement}', now() - interval '30 days', 'f', 'tous'),
 ('00000000-0000-0000-0000-00000000000c','Carl','mc','25-30','perdre',800,'{soir}','{marche}','{encouragement}', now() - interval '30 days', 'm', 'tous'),
 ('00000000-0000-0000-0000-00000000000d','Dom','md','25-30','perdre',800,'{soir}','{marche}','{encouragement}', now() - interval '30 days', null, 'tous');

-- filtre « Me proposer » (réciproque)
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select count(*) from public.fitmatch_candidates(20) c where c.candidate_id = '00000000-0000-0000-0000-00000000000b') = 1, 'filtre Femmes : une femme est proposée');
select pg_temp.check((select count(*) from public.fitmatch_candidates(20) c where c.candidate_id = '00000000-0000-0000-0000-00000000000c') = 0, 'filtre Femmes : un homme n’est pas proposé');
select pg_temp.check((select count(*) from public.fitmatch_candidates(20) c where c.candidate_id = '00000000-0000-0000-0000-00000000000d') = 0, 'filtre Femmes : genre non indiqué non proposé');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check((select count(*) from public.fitmatch_candidates(20) c where c.candidate_id = '00000000-0000-0000-0000-00000000000a') = 0, 'réciproque : Ana (Femmes) n’est pas proposée à un homme');
select pg_temp.check((select count(*) from public.fitmatch_candidates(20) c where c.candidate_id = '00000000-0000-0000-0000-00000000000b') = 1, 'sans filtre : Bea est proposée à Carl');

-- forums : règles obligatoires, filtre, débit
select pg_temp.fails($q$insert into public.forum_posts (forum_id, author_id, content) values ('f_perte', '00000000-0000-0000-0000-00000000000c', 'Salut')$q$, 'publication refusée sans règles acceptées');
insert into public.forum_rules_acceptances (user_id) values ('00000000-0000-0000-0000-00000000000c');
insert into public.forum_posts (forum_id, author_id, content) values ('f_perte', '00000000-0000-0000-0000-00000000000c', 'Premier message');
select pg_temp.check((select count(*) from public.forum_members where forum_id = 'f_perte') = 1, 'publier fait rejoindre le forum');
select pg_temp.fails($q$insert into public.forum_posts (forum_id, author_id, content) values ('f_perte', '00000000-0000-0000-0000-00000000000c', 'va sur www.promo.com')$q$, 'lien refusé');
select pg_temp.fails($q$insert into public.forum_posts (forum_id, author_id, content) values ('f_perte', '00000000-0000-0000-0000-00000000000c', 'appelle 06 12 34 56 78')$q$, 'numéro refusé');
select pg_temp.fails($q$insert into public.forum_posts (forum_id, author_id, content) values ('f_perte', '00000000-0000-0000-0000-00000000000b', 'usurpation')$q$, 'impossible de publier au nom d’un autre');
insert into public.forum_posts (forum_id, author_id, content) values ('f_perte', '00000000-0000-0000-0000-00000000000c', 'deux'), ('f_perte', '00000000-0000-0000-0000-00000000000c', 'trois'), ('f_perte', '00000000-0000-0000-0000-00000000000c', 'quatre');
select pg_temp.fails($q$insert into public.forum_posts (forum_id, author_id, content) values ('f_perte', '00000000-0000-0000-0000-00000000000c', 'cinq')$q$, 'plus de 4 messages par minute refusé');

-- lecture, signalement, blocage
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) from public.forum_posts where forum_id = 'f_perte') = 4, 'forum ouvert : tout le monde lit');
insert into public.forum_reports (post_id, reporter_id, reason) select id, '00000000-0000-0000-0000-00000000000b', 'spam' from public.forum_posts where content = 'deux';
select pg_temp.check((select count(*) from public.forum_posts where forum_id = 'f_perte') = 3, 'message signalé : disparaît pour celui qui signale');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select count(*) from public.forum_posts where forum_id = 'f_perte') = 4, 'message en revue : encore visible pour les autres');
reset role;
insert into public.forum_reports (post_id, reporter_id, reason) select id, u, 'spam' from public.forum_posts, (values ('00000000-0000-0000-0000-00000000000a'::uuid), ('00000000-0000-0000-0000-00000000000d'::uuid)) v(u) where content = 'deux';
set role authenticated;
select pg_temp.check((select count(*) from public.forum_posts where forum_id = 'f_perte') = 3, '3 signalements : masqué pour tout le monde');
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from public.forum_posts where forum_id = 'f_perte') = 0, 'auteur bloqué : ses messages ne sont plus lisibles');

-- running club
reset role;
insert into public.forums (id, kind, title, city) values ('run_paris', 'running', 'Running club Paris', 'Paris') on conflict (id) do nothing;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.fails($q$insert into public.run_meetups (forum_id, organizer_id, start_at, place, distance_km, pace) values ('f_perte', '00000000-0000-0000-0000-00000000000c', now() + interval '3 days', 'Entrée du parc', 5, 'tranquille')$q$, 'sortie refusée hors running club');
select pg_temp.fails($q$insert into public.run_meetups (forum_id, organizer_id, start_at, place, distance_km, pace) values ('run_paris', '00000000-0000-0000-0000-00000000000c', now() + interval '3 days', '12 rue des Lilas', 5, 'tranquille')$q$, 'adresse privée refusée');
select pg_temp.fails($q$insert into public.run_meetups (forum_id, organizer_id, start_at, place, distance_km, pace) values ('run_paris', '00000000-0000-0000-0000-00000000000c', now() + interval '10 minutes', 'Entrée du parc', 5, 'tranquille')$q$, 'sortie trop proche refusée');
insert into public.run_meetups (forum_id, organizer_id, start_at, place, distance_km, pace) values ('run_paris', '00000000-0000-0000-0000-00000000000c', now() + interval '3 days', 'Entrée du parc', 5, 'tranquille');
insert into public.run_rsvps (meetup_id, user_id) select id, '00000000-0000-0000-0000-00000000000c' from public.run_meetups;
select pg_temp.check((select count(*) from public.run_rsvps) = 1, 'je viens enregistré');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) from public.run_meetups) = 1, 'sortie visible par un autre membre');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select count(*) from public.run_meetups) = 0, 'sortie d’une personne bloquée invisible');

reset role;
select 'TESTS SQL FORUMS OK';
