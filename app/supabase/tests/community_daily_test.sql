-- Test de 0003_community_daily.sql (après community_test.sql : mêmes membres).
\set ON_ERROR_STOP 1
reset role;
create or replace function pg_temp.check2(ok boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'ok %', label;
end $$;
create or replace function pg_temp.fails2(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'ok % (refusé : %)', label, sqlerrm; return; end;
  raise exception 'ÉCHEC : % (aurait dû être refusé)', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
update public.community_profiles set status = 'dispo', status_at = now(), need = 'moral', need_at = now() where user_id = '00000000-0000-0000-0000-000000000002';
select pg_temp.fails2($q$update public.community_profiles set status = 'invente' where user_id = '00000000-0000-0000-0000-000000000002'$q$, 'état inconnu refusé');
select pg_temp.fails2($q$update public.community_profiles set need = 'poids' where user_id = '00000000-0000-0000-0000-000000000002'$q$, 'besoin inconnu refusé');
select pg_temp.check2((select need from public.community_cards where user_id = '00000000-0000-0000-0000-000000000002') = 'moral', 'je vois mon propre besoin');

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.check2((select status from public.community_cards where user_id = '00000000-0000-0000-0000-000000000002') = 'dispo', 'état du jour visible');
select pg_temp.check2((select need from public.community_cards where user_id = '00000000-0000-0000-0000-000000000002') is null, 'besoin du jour privé par défaut');

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
update public.community_profiles set need_public = true where user_id = '00000000-0000-0000-0000-000000000002';
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.check2((select need from public.community_cards where user_id = '00000000-0000-0000-0000-000000000002') = 'moral', 'besoin visible seulement si partagé');

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
update public.community_profiles set status_at = now() - interval '13 hours', need_at = now() - interval '13 hours' where user_id = '00000000-0000-0000-0000-000000000002';
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.check2((select status is null and need is null from public.community_cards where user_id = '00000000-0000-0000-0000-000000000002'), 'état et besoin effacés après 12 h');
select pg_temp.check2(not exists (select 1 from information_schema.columns where table_name = 'community_cards' and column_name ~ '(weight|poids|calor|photo|adresse|lat|lng)'), 'aucune colonne de santé ou de position dans les cartes');
reset role;
\echo TESTS SQL COMMUNAUTE (ETAT DU JOUR) OK
