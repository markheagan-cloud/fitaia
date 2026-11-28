-- =====================================================================================================
-- FITAIA Forums — réponses, réactions en un geste, étiquettes (suite de 0004_forums.sql).
-- Même contrat que src/community/models/forums.ts (POST_TAGS, REACTIONS, repliesOf, toggleReaction).
-- ÉTAT : PRÊT, NON DÉPLOYÉ.
-- =====================================================================================================

alter table public.forum_posts
  add column if not exists tag text check (tag is null or tag in ('victoire','question','astuce','progres')),
  add column if not exists parent_id uuid references public.forum_posts(id) on delete cascade;
create index if not exists forum_posts_parent_idx on public.forum_posts (parent_id, created_at);

-- Un seul niveau de réponses, dans le même forum, sans photo ni étiquette ; on ne répond pas à un message masqué.
create or replace function public.tg_forum_replies_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare par public.forum_posts;
begin
  if new.parent_id is null then return new; end if;
  select * into par from public.forum_posts where id = new.parent_id;
  if par.id is null or par.state = 'masque' then raise exception 'message_introuvable'; end if;
  if par.forum_id <> new.forum_id then raise exception 'mauvais_forum'; end if;
  if par.parent_id is not null then new.parent_id := par.parent_id; end if;
  new.tag := null;
  new.photo_path := null;
  return new;
end $$;
create trigger forum_replies_guard before insert on public.forum_posts for each row execute function public.tg_forum_replies_guard();

create table public.forum_reactions (
  post_id    uuid not null references public.forum_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  reaction   text not null check (reaction in ('bravo','force','merci')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, reaction)
);

alter table public.forum_reactions enable row level security;
-- on ne voit et ne pose des réactions que sur un message qu'on a le droit de lire
create policy freact_read on public.forum_reactions for select
  using (exists (select 1 from public.forum_posts p where p.id = post_id and public.can_read_post(p, auth.uid())));
create policy freact_insert on public.forum_reactions for insert
  with check (user_id = auth.uid() and exists (select 1 from public.forum_posts p where p.id = post_id and public.can_read_post(p, auth.uid())));
create policy freact_delete on public.forum_reactions for delete using (user_id = auth.uid());
