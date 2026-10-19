-- Test de comportement de 0001_community.sql (exécuté en tant que membres « authenticated »).
\set ON_ERROR_STOP 1
create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'ok %', label;
end $$;
-- attend une erreur
create or replace function pg_temp.fails(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'ok % (refusé : %)', label, sqlerrm; return; end;
  raise exception 'ÉCHEC : % (aurait dû être refusé)', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users values
 ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'), ('00000000-0000-0000-0000-000000000003'),
 ('00000000-0000-0000-0000-000000000004'), ('00000000-0000-0000-0000-000000000005'), ('00000000-0000-0000-0000-000000000006'),
 ('00000000-0000-0000-0000-000000000007');

-- profils créés par le serveur (comptes de 30 jours, points issus du registre)
insert into public.community_profiles (user_id, display_name, avatar_id, age_range, goal_category, points, slots, activities, support, joined_at, show_age, allow_messages)
values
 ('00000000-0000-0000-0000-000000000001','Moi','a1','25-30','perdre',800,'{soir}','{marche}','{encouragement}', now() - interval '30 days', false, 'amis'),
 ('00000000-0000-0000-0000-000000000002','Sarah','a2','25-30','perdre',820,'{soir}','{marche}','{encouragement}', now() - interval '30 days', false, 'tous'),
 ('00000000-0000-0000-0000-000000000003','Bob','a3','25-30','muscler',900,'{matin}','{salle}','{conseil}', now() - interval '30 days', true, 'amis'),
 ('00000000-0000-0000-0000-000000000004','Vieux','a4','46+','perdre',800,'{soir}','{marche}','{encouragement}', now() - interval '30 days', false, 'tous'),
 ('00000000-0000-0000-0000-000000000005','F5','a5','25-30','perdre',800,'{soir}','{marche}','{encouragement}', now() - interval '30 days', false, 'amis'),
 ('00000000-0000-0000-0000-000000000006','F6','a6','25-30','perdre',800,'{soir}','{marche}','{encouragement}', now() - interval '30 days', false, 'amis'),
 ('00000000-0000-0000-0000-000000000007','F7','a7','25-30','perdre',800,'{soir}','{marche}','{encouragement}', now() - interval '30 days', false, 'amis');
update public.community_profiles set points = 100 where user_id = '00000000-0000-0000-0000-000000000003';
select pg_temp.check((select highest_historical_points from public.community_profiles where user_id = '00000000-0000-0000-0000-000000000003') = 900, 'niveau historique conservé quand les points baissent');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

-- confidentialité
select pg_temp.check((select count(*) from public.community_profiles) = 1, 'la table des profils ne montre que ma ligne');
select pg_temp.check((select age_range from public.community_cards where user_id = '00000000-0000-0000-0000-000000000002') is null, 'âge masqué par défaut');
select pg_temp.check((select age_range from public.community_cards where user_id = '00000000-0000-0000-0000-000000000003') = '25-30', 'âge visible si la personne le choisit');
select pg_temp.check((select age_range from public.community_cards where user_id = '00000000-0000-0000-0000-000000000001') = '25-30', 'je vois mon propre âge');
select pg_temp.check(not (select show_body_progress from public.community_cards where user_id = '00000000-0000-0000-0000-000000000002'), 'progression physique privée par défaut');
select pg_temp.fails($q$update public.community_profiles set points = 99999 where user_id = '00000000-0000-0000-0000-000000000001'$q$, 'points non modifiables par le client');
update public.community_profiles set show_goal = false where user_id = '00000000-0000-0000-0000-000000000001';
select pg_temp.check(not (select show_goal from public.community_profiles), 'réglage de confidentialité modifiable');
update public.community_profiles set show_goal = false where user_id = '00000000-0000-0000-0000-000000000002';
select pg_temp.check((select goal_category from public.community_cards where user_id = '00000000-0000-0000-0000-000000000002') = 'perdre', 'impossible de modifier le profil d’un autre (0 ligne touchée)');

-- FitMatch
select pg_temp.check((select candidate_id from public.fitmatch_candidates(10) limit 1) = '00000000-0000-0000-0000-000000000002', 'FitMatch : Sarah en premier');
select pg_temp.check(not exists (select 1 from public.fitmatch_candidates(10) where candidate_id = '00000000-0000-0000-0000-000000000004'), 'FitMatch : écart d’âge exclu');
select pg_temp.check((select compatibility_score from public.fitmatch_candidates(10) where candidate_id = '00000000-0000-0000-0000-000000000005') = 100, 'FitMatch : profil identique = 100');
select pg_temp.check((select 'meme_objectif' = any(reason_codes) from public.fitmatch_candidates(10) where candidate_id = '00000000-0000-0000-0000-000000000002'), 'FitMatch : raisons');
insert into public.fitmatch_passes (user_id, passed_id) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005');
select pg_temp.check(not exists (select 1 from public.fitmatch_candidates(10) where candidate_id = '00000000-0000-0000-0000-000000000005'), 'FitMatch : personne passée exclue');

-- messages
select pg_temp.fails($q$select public.start_conversation('00000000-0000-0000-0000-000000000003')$q$, 'message refusé : amis seulement');
select public.start_conversation('00000000-0000-0000-0000-000000000002') as conv \gset
insert into public.messages (conversation_id, sender_id, content) values (:'conv', '00000000-0000-0000-0000-000000000001', 'Salut !');
insert into public.messages (conversation_id, sender_id, content) values (:'conv', '00000000-0000-0000-0000-000000000001', 'Tu es là ?');
select pg_temp.fails(format($q$insert into public.messages (conversation_id, sender_id, content) values (%L, %L, 'Allô ?')$q$, :'conv', '00000000-0000-0000-0000-000000000001'), '3e message refusé avant réponse');
select pg_temp.fails(format($q$insert into public.messages (conversation_id, sender_id, content) values (%L, %L, 'usurpation')$q$, :'conv', '00000000-0000-0000-0000-000000000002'), 'impossible d’écrire au nom d’un autre');
select pg_temp.fails($q$insert into public.conversation_members values (gen_random_uuid(), '00000000-0000-0000-0000-000000000001')$q$, 'membres ajoutés seulement par start_conversation');

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
insert into public.messages (conversation_id, sender_id, content) values (:'conv', '00000000-0000-0000-0000-000000000002', 'Salut, ça avance');
select id as sarah_msg from public.messages where sender_id = '00000000-0000-0000-0000-000000000002' \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.messages (conversation_id, sender_id, content) values (:'conv', '00000000-0000-0000-0000-000000000001', 'Top !');
select pg_temp.check((select count(*) from public.messages) = 4, 'après réponse : discussion libre');

-- signalement
insert into public.reports (reporter_id, target_user_id, message_id_optional, reason) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', :'sarah_msg', 'harcelement');
select pg_temp.check((select moderation_state from public.messages where id = :'sarah_msg') = 'en_revue', 'message signalé : en revue');

-- amis et FitMates
insert into public.friendships (user_a, user_b, relationship_type) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'ami');
update public.friendships set status = 'accepte' where user_b = '00000000-0000-0000-0000-000000000003';
select pg_temp.check(not exists (select 1 from public.friendships where status = 'accepte'), 'le demandeur ne peut pas accepter lui-même');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
update public.friendships set status = 'accepte' where user_a = '00000000-0000-0000-0000-000000000001';
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.check(public.is_friend('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003'), 'amitié acceptée');
select public.start_conversation('00000000-0000-0000-0000-000000000003') is not null as ok \gset
select pg_temp.check(:'ok', 'amis : discussion possible');
reset role;
insert into public.friendships (user_a, user_b, status, relationship_type) values
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','accepte','fitmate'),
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006','accepte','fitmate'),
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000007','accepte','fitmate');
select pg_temp.fails($q$insert into public.friendships (user_a, user_b, status, relationship_type) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','accepte','fitmate')$q$, 'trois FitMates au maximum');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

-- blocage
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003');
select pg_temp.check(not public.is_friend('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003'), 'blocage : amitié supprimée');
select pg_temp.check(not exists (select 1 from public.community_cards where user_id = '00000000-0000-0000-0000-000000000003'), 'blocage : profil invisible');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.check(not exists (select 1 from public.community_cards where user_id = '00000000-0000-0000-0000-000000000001'), 'blocage : invisible dans les deux sens');
select pg_temp.check(not exists (select 1 from public.fitmatch_candidates(10) where candidate_id = '00000000-0000-0000-0000-000000000001'), 'blocage : plus de suggestion');
select pg_temp.fails($q$select public.start_conversation('00000000-0000-0000-0000-000000000001')$q$, 'blocage : plus de discussion');
select pg_temp.fails($q$insert into public.encouragements (from_id, to_id) values ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001')$q$, 'blocage : plus d’encouragement');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

-- encouragements
insert into public.encouragements (from_id, to_id) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
select pg_temp.fails($q$insert into public.encouragements (from_id, to_id) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')$q$, 'encouragement : 1 par heure et par personne');

-- anonyme
reset role; set role anon; set request.jwt.claim.sub = '';
select pg_temp.fails($q$select * from public.community_cards$q$, 'anonyme : aucun accès aux profils');
reset role;
\echo TESTS SQL COMMUNAUTE OK
