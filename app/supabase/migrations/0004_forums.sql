-- =====================================================================================================
-- FITAIA Communauté — forums OUVERTS, running clubs par ville, filtre « Me proposer » (femmes / hommes).
-- Même contrat que la logique de l'app (src/community/models/forums.ts, src/social/fitmatch/matching.ts).
--
-- ÉTAT : PRÊT, NON DÉPLOYÉ. L'app tourne en mode « local + démonstration ».
--
-- App Store 1.2 (contenu publié par les utilisateurs) :
--  * filtre avant publication : longueur, débit, liens, numéros (ici) + mots interdits (app, puis service de modération) ;
--  * signalement : le message passe « en_revue » et disparaît pour celui qui signale ; 3 signalements distincts
--    le masquent pour tout le monde en attendant la revue humaine ;
--  * blocage : les messages et sorties d'une personne bloquée (dans un sens ou l'autre) ne sont pas lisibles ;
--  * règles acceptées avant toute publication (forum_rules_acceptances).
-- Confidentialité : aucune position GPS, aucune adresse ; la ville est choisie dans une liste fermée.
-- =====================================================================================================

-- Filtre « Me proposer » : genre (facultatif) + préférence, réciproques, jamais exposés dans la carte publique.
alter table public.community_profiles
  add column if not exists gender text check (gender is null or gender in ('f','m')),
  add column if not exists match_with text not null default 'tous' check (match_with in ('tous','f','m'));

create or replace function public.gender_allows(me uuid, other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (a.match_with = 'tous' or b.gender = a.match_with)
       and (b.match_with = 'tous' or a.gender = b.match_with)
    from public.community_profiles a, public.community_profiles b
    where a.user_id = me and b.user_id = other
  ), false);
$$;

-- FitMatch côté serveur : mêmes règles qu'en 0001, plus le filtre réciproque.
create or replace function public.fitmatch_candidates(lim integer default 10)
returns table (candidate_id uuid, compatibility_score integer, reason_codes text[])
language sql stable security definer set search_path = public as $$
  with me as (
    select * from public.community_profiles where user_id = auth.uid() and allow_fitmatch
  ),
  scored as (
    select
      o.user_id as oid,
      o.last_active_at as seen,
      public.progression_similarity(greatest(me.points, me.highest_historical_points),
                                    greatest(o.points, o.highest_historical_points))      as prog,
      (me.goal_category = o.goal_category)::int                                           as goal,
      (me.language = o.language)::int                                                    as lang,
      public.jaccard(me.slots, o.slots)                                                   as avail,
      public.jaccard(me.activities, o.activities)                                         as act,
      public.jaccard(me.support, o.support)                                               as sup,
      case when abs(me.utc_offset - o.utc_offset) <= 1 then 1
           when abs(me.utc_offset - o.utc_offset) <= 3 then 0.5 else 0 end                as tz
    from me
    join public.community_profiles o on o.user_id <> me.user_id
    where o.profile_visible and o.allow_fitmatch
      and abs(public.age_mid(me.age_range) - public.age_mid(o.age_range)) <= 7.5
      and not public.is_blocked(me.user_id, o.user_id)
      and public.gender_allows(me.user_id, o.user_id)
      and not exists (select 1 from public.fitmatch_passes x where x.user_id = me.user_id and x.passed_id = o.user_id)
      and not exists (
        select 1 from public.friendships f
        where (f.user_a = me.user_id and f.user_b = o.user_id and f.status <> 'refuse')
           or (f.user_b = me.user_id and f.user_a = o.user_id and f.status = 'accepte')
      )
  ),
  totals as (
    select s.*, least(100, 30 * prog + 25 * goal + 20 * lang + 10 * avail + 5 * act + 5 * sup + 5 * tz) as total
    from scored s
  )
  select
    oid,
    round(total)::int,
    array_remove(array[
      case when prog >= 0.7 then 'meme_niveau' end,
      case when goal = 1 then 'meme_objectif' end,
      case when lang = 1 then 'meme_langue' end,
      case when avail >= 0.5 then 'memes_horaires' end,
      case when act > 0 then 'meme_activite' end,
      case when sup > 0 then 'meme_soutien' end,
      case when tz = 1 then 'meme_fuseau' end,
      case when seen > now() - interval '15 minutes' then 'actif_maintenant' end
    ], null)
  from totals
  where round(total) >= 35
  order by round(total) desc, seen desc
  limit least(greatest(lim, 1), 20);
$$;

-- -----------------------------------------------------------------------------------------------------
-- Forums
-- -----------------------------------------------------------------------------------------------------
create table public.forums (
  id          text primary key,
  kind        text not null check (kind in ('theme','running')),
  title       text not null check (char_length(title) between 3 and 60),
  description text not null default '' check (char_length(description) <= 200),
  city        text check ((kind = 'running') = (city is not null)),
  created_at  timestamptz not null default now()
);

insert into public.forums (id, kind, title, description) values
  ('f_perte', 'theme', 'Perdre du poids', 'Astuces, rechutes, petites victoires. Sans jugement.'),
  ('f_muscle', 'theme', 'Prendre du muscle', 'Programmes, progrès, questions de débutant.'),
  ('f_repas', 'theme', 'Repas et recettes', 'Ce que tu manges cette semaine, en photo si tu veux.'),
  ('f_reprise', 'theme', 'Reprendre le sport', 'Pour ceux qui recommencent, à leur rythme.'),
  ('f_motivation', 'theme', 'Motivation du jour', 'Un coup de mou ? Un coup de boost ? C’est ici.')
on conflict (id) do nothing;

create table public.forum_rules_acceptances (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  accepted_at timestamptz not null default now()
);

create table public.forum_members (
  forum_id  text not null references public.forums(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (forum_id, user_id)
);

create table public.forum_posts (
  id               uuid primary key default gen_random_uuid(),
  forum_id         text not null references public.forums(id) on delete cascade,
  author_id        uuid not null references auth.users(id) on delete cascade,
  content          text not null default '' check (char_length(content) <= 500),
  photo_path       text,                                -- stockage privé, servi seulement si state = 'ok'
  state            text not null default 'ok' check (state in ('ok','en_revue','masque')),
  created_at       timestamptz not null default now(),
  check (char_length(content) > 0 or photo_path is not null)
);
create index forum_posts_forum_idx on public.forum_posts (forum_id, created_at desc);

create or replace function public.tg_forum_posts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.forum_rules_acceptances where user_id = new.author_id) then
    raise exception 'regles_non_acceptees';
  end if;
  if not exists (select 1 from public.community_profiles where user_id = new.author_id and profile_visible) then
    raise exception 'profil_inactif';
  end if;
  if (select count(*) from public.forum_posts where author_id = new.author_id and created_at > now() - interval '1 minute') >= 4 then
    raise exception 'trop_rapide';
  end if;
  if (select count(*) from public.forum_posts where author_id = new.author_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'trop_de_messages';
  end if;
  if new.content ~* '(https?://|www\.|[a-z0-9-]+\.(com|fr|net|org|io|ly|me|app|shop|store)\M)' then
    raise exception 'lien_interdit';
  end if;
  if new.content ~ '\+?\d[\d .-]{7,}\d' then
    raise exception 'numero_interdit';
  end if;
  new.state := 'ok';
  new.created_at := now();
  insert into public.forum_members (forum_id, user_id) values (new.forum_id, new.author_id) on conflict do nothing;
  return new;
end $$;
create trigger forum_posts_guard before insert on public.forum_posts for each row execute function public.tg_forum_posts_guard();

create table public.forum_reports (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.forum_posts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason      text not null check (reason in ('harcelement','spam','contenu_inapproprie','conseil_dangereux','faux_profil','autre')),
  created_at  timestamptz not null default now(),
  status      text not null default 'recu' check (status in ('recu','traite')),
  unique (post_id, reporter_id)
);

create or replace function public.tg_forum_reports_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.forum_posts set state = 'en_revue' where id = new.post_id and state = 'ok';
  if (select count(*) from public.forum_reports where post_id = new.post_id) >= 3 then
    update public.forum_posts set state = 'masque' where id = new.post_id;
  end if;
  return new;
end $$;
create trigger forum_reports_after after insert on public.forum_reports for each row execute function public.tg_forum_reports_after();

-- Message lisible : visible (ok, ou en_revue pour tout le monde sauf ceux qui l'ont signalé), auteur non bloqué.
create or replace function public.can_read_post(p public.forum_posts, me uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p.author_id = me
      or (p.state = 'ok' or (p.state = 'en_revue' and not exists (select 1 from public.forum_reports r where r.post_id = p.id and r.reporter_id = me)))
     and not public.is_blocked(me, p.author_id);
$$;

-- -----------------------------------------------------------------------------------------------------
-- Running clubs : sorties proposées par les membres
-- -----------------------------------------------------------------------------------------------------
create table public.run_meetups (
  id              uuid primary key default gen_random_uuid(),
  forum_id        text not null references public.forums(id) on delete cascade,
  organizer_id    uuid not null references auth.users(id) on delete cascade,
  start_at        timestamptz not null,
  every_two_weeks boolean not null default true,
  place           text not null check (char_length(place) between 4 and 80),
  distance_km     real not null check (distance_km between 1 and 42),
  pace            text not null check (pace in ('tranquille','moyen','rapide')),
  cancelled       boolean not null default false,
  created_at      timestamptz not null default now()
);

create or replace function public.tg_run_meetups_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select kind from public.forums where id = new.forum_id) <> 'running' then raise exception 'pas_un_running_club'; end if;
  if not exists (select 1 from public.forum_rules_acceptances where user_id = new.organizer_id) then raise exception 'regles_non_acceptees'; end if;
  if new.start_at < now() + interval '1 hour' or new.start_at > now() + interval '60 days' then raise exception 'date_invalide'; end if;
  if new.place ~* '\d{1,4}\s*(bis|ter)?,?\s*(rue|avenue|av\.?|boulevard|bd|allée|impasse|chemin|place|quai)' or new.place ~ '\+?\d[\d .-]{7,}\d' then
    raise exception 'lieu_prive_interdit';
  end if;
  if (select count(*) from public.run_meetups where organizer_id = new.organizer_id and forum_id = new.forum_id and not cancelled) >= 2 then
    raise exception 'trop_de_sorties';
  end if;
  return new;
end $$;
create trigger run_meetups_guard before insert on public.run_meetups for each row execute function public.tg_run_meetups_guard();

create table public.run_rsvps (
  meetup_id  uuid not null references public.run_meetups(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

-- -----------------------------------------------------------------------------------------------------
-- Accès
-- -----------------------------------------------------------------------------------------------------
alter table public.forums                  enable row level security;
alter table public.forum_rules_acceptances enable row level security;
alter table public.forum_members           enable row level security;
alter table public.forum_posts             enable row level security;
alter table public.forum_reports           enable row level security;
alter table public.run_meetups             enable row level security;
alter table public.run_rsvps               enable row level security;

create policy forums_read on public.forums for select using (auth.uid() is not null);
create policy rules_own on public.forum_rules_acceptances for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy members_own_select on public.forum_members for select using (user_id = auth.uid());
create policy members_own_insert on public.forum_members for insert with check (user_id = auth.uid());
create policy members_own_delete on public.forum_members for delete using (user_id = auth.uid());

create policy posts_read on public.forum_posts for select using (public.can_read_post(forum_posts, auth.uid()));
create policy posts_insert on public.forum_posts for insert with check (author_id = auth.uid());
create policy posts_delete_own on public.forum_posts for delete using (author_id = auth.uid());

create policy freports_insert on public.forum_reports for insert with check (reporter_id = auth.uid());
create policy freports_own on public.forum_reports for select using (reporter_id = auth.uid());

create policy runs_read on public.run_meetups for select using (auth.uid() is not null and not public.is_blocked(auth.uid(), organizer_id));
create policy runs_insert on public.run_meetups for insert with check (organizer_id = auth.uid());
create policy runs_cancel_own on public.run_meetups for update using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());

create policy rsvps_read on public.run_rsvps for select using (auth.uid() is not null);
create policy rsvps_own_insert on public.run_rsvps for insert with check (user_id = auth.uid());
create policy rsvps_own_delete on public.run_rsvps for delete using (user_id = auth.uid());
