-- Test de 0005 (après forums_test.sql : mêmes membres ; Carl a publié dans f_perte, Ana l'a bloqué).
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
insert into public.forum_rules_acceptances (user_id) values ('00000000-0000-0000-0000-00000000000b') on conflict do nothing;
-- message de Bea (étiquette Question)
insert into public.forum_posts (forum_id, author_id, content, tag) values ('f_repas', '00000000-0000-0000-0000-00000000000b', 'Petit-déj qui tient ?', 'question');
update public.forum_posts set created_at = now() - interval '1 hour' where author_id = '00000000-0000-0000-0000-00000000000c';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into public.forum_posts (forum_id, author_id, content, parent_id) select 'f_repas', '00000000-0000-0000-0000-00000000000c', 'Flocons d’avoine + yaourt', id from public.forum_posts where content = 'Petit-déj qui tient ?';
select pg_temp.check((select count(*) from public.forum_posts where parent_id is not null) = 1, 'réponse enregistrée');
-- réponse à une réponse : rattachée au message principal
insert into public.forum_posts (forum_id, author_id, content, parent_id, tag) select 'f_repas', '00000000-0000-0000-0000-00000000000c', 'Et des fruits', id, 'victoire' from public.forum_posts where content = 'Flocons d’avoine + yaourt';
select pg_temp.check((select parent_id from public.forum_posts where content = 'Et des fruits') = (select id from public.forum_posts where content = 'Petit-déj qui tient ?'), 'un seul niveau de réponses');
select pg_temp.check((select tag from public.forum_posts where content = 'Et des fruits') is null, 'pas d’étiquette sur une réponse');
select pg_temp.fails($q$insert into public.forum_posts (forum_id, author_id, content, parent_id) select 'f_perte', '00000000-0000-0000-0000-00000000000c', 'ailleurs', id from public.forum_posts where content = 'Petit-déj qui tient ?'$q$, 'réponse dans un autre forum refusée');

-- réactions
insert into public.forum_reactions (post_id, user_id, reaction) select id, '00000000-0000-0000-0000-00000000000c', 'merci' from public.forum_posts where content = 'Petit-déj qui tient ?';
select pg_temp.fails($q$insert into public.forum_reactions (post_id, user_id, reaction) select id, '00000000-0000-0000-0000-00000000000c', 'merci' from public.forum_posts where content = 'Petit-déj qui tient ?'$q$, 'même réaction deux fois refusée');
insert into public.forum_reactions (post_id, user_id, reaction) select id, '00000000-0000-0000-0000-00000000000c', 'bravo' from public.forum_posts where content = 'Petit-déj qui tient ?';
select pg_temp.check((select count(*) from public.forum_reactions) = 2, 'plusieurs réactions différentes');
select pg_temp.fails($q$insert into public.forum_reactions (post_id, user_id, reaction) select id, '00000000-0000-0000-0000-00000000000b', 'bravo' from public.forum_posts where content = 'Petit-déj qui tient ?'$q$, 'réagir au nom d’un autre refusé');
select pg_temp.fails($q$insert into public.forum_reactions (post_id, user_id, reaction) select id, '00000000-0000-0000-0000-00000000000c', 'like' from public.forum_posts where content = 'Petit-déj qui tient ?'$q$, 'réaction inconnue refusée');
-- Ana a bloqué Carl : elle ne voit ni ses réponses ni ses réactions sur ses messages
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select count(*) from public.forum_posts where parent_id is not null) = 0, 'réponses d’une personne bloquée invisibles');
reset role;
select id as fruits from public.forum_posts where content = 'Et des fruits' \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.fails(format($q$insert into public.forum_reactions (post_id, user_id, reaction) values (%L, '00000000-0000-0000-0000-00000000000a', 'bravo')$q$, :'fruits'), 'pas de réaction sur un message illisible');
delete from public.forum_reactions where user_id = '00000000-0000-0000-0000-00000000000c';
reset role;
select pg_temp.check((select count(*) from public.forum_reactions) = 2, 'impossible de retirer la réaction d’un autre');
select 'TESTS SQL FORUMS REPONSES OK';
