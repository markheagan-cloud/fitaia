-- =====================================================================================================
-- FITAIA Communauté — phase 1 : fondation sociale (profils, confidentialité, amis, FitMatch, messages,
-- blocage, signalement). Même contrat que la logique de l'app (src/community, src/social).
--
-- ÉTAT : PRÊT, NON DÉPLOYÉ. L'app tourne en mode « local + démonstration » (COMMUNITY_MODE = 'local-demo').
--
-- Principes :
--  * exposition minimale par défaut ; poids, calories, mensurations, photo, adresse, position et santé
--    n'existent PAS dans ces tables ;
--  * le téléphone n'est jamais seul juge : blocage, limites de messages et confidentialité sont appliqués ici ;
--  * les points ne sont pas modifiables par le client (ils viendront du registre serveur en phase 2) ;
--  * le meilleur niveau historique ne descend jamais (FitMatch ne permet pas de « redescendre »).
-- =====================================================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------------------------------
-- Profils
-- -----------------------------------------------------------------------------------------------------
create table public.community_profiles (
  user_id                   uuid primary key references auth.users(id) on delete cascade,
  display_name              text not null check (char_length(display_name) between 2 and 24),
  avatar_id                 text not null,
  language                  text not null default 'fr' check (language in ('fr','en','es','ar','de','it','pt')),
  age_range                 text not null check (age_range in ('18-24','25-30','31-35','36-45','46+')),
  country_optional          text check (country_optional is null or char_length(country_optional) <= 40),
  timezone                  text not null default 'UTC',
  utc_offset                real not null default 0 check (utc_offset between -12 and 14),
  goal_category             text not null check (goal_category in ('perdre','reprendre','muscler','garder','energie')),
  points                    integer not null default 0 check (points >= 0),
  highest_historical_points integer not null default 0 check (highest_historical_points >= 0),
  slots                     text[] not null default '{}',
  activities                text[] not null default '{}',
  support                   text[] not null default '{}',
  helpfulness_score         integer not null default 0,
  joined_at                 timestamptz not null default now(),
  last_active_at            timestamptz not null default now(),
  -- confidentialité : minimale par défaut
  profile_visible           boolean not null default true,
  show_age                  boolean not null default false,
  show_country              boolean not null default false,
  show_goal                 boolean not null default true,
  body_progress             text not null default 'moi' check (body_progress in ('moi','amis','public')),
  allow_messages            text not null default 'amis' check (allow_messages in ('tous','amis','personne')),
  allow_fitmatch            boolean not null default true
);

create or replace function public.tg_profiles_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.joined_at := old.joined_at;
    new.highest_historical_points := greatest(old.highest_historical_points, new.highest_historical_points, new.points);
  else
    new.highest_historical_points := greatest(new.highest_historical_points, new.points);
  end if;
  return new;
end $$;

create trigger profiles_guard before insert or update on public.community_profiles
  for each row execute function public.tg_profiles_guard();

-- -----------------------------------------------------------------------------------------------------
-- Blocage (dans les deux sens : plus de messages, plus de suggestion, profil invisible)
-- -----------------------------------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- -----------------------------------------------------------------------------------------------------
-- Amis et FitMates (trois FitMates au maximum)
-- -----------------------------------------------------------------------------------------------------
create table public.friendships (
  id                uuid primary key default gen_random_uuid(),
  user_a            uuid not null references auth.users(id) on delete cascade,   -- demandeur
  user_b            uuid not null references auth.users(id) on delete cascade,
  status            text not null default 'en_attente' check (status in ('en_attente','accepte','refuse')),
  relationship_type text not null default 'ami' check (relationship_type in ('contact','fitmate','ami')),
  created_at        timestamptz not null default now(),
  check (user_a <> user_b)
);
create unique index friendships_pair on public.friendships (least(user_a, user_b), greatest(user_a, user_b));

create or replace function public.is_friend(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepte'
      and least(user_a, user_b) = least(a, b) and greatest(user_a, user_b) = greatest(a, b)
  );
$$;

create or replace function public.tg_friendships_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if public.is_blocked(new.user_a, new.user_b) then
    raise exception 'action impossible' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    -- seuls le statut peut changer, et seulement depuis « en attente »
    new.user_a := old.user_a; new.user_b := old.user_b;
    new.relationship_type := old.relationship_type; new.created_at := old.created_at;
    if old.status <> 'en_attente' then
      raise exception 'demande déjà traitée' using errcode = 'P0001';
    end if;
  end if;
  if new.status = 'accepte' and new.relationship_type = 'fitmate' then
    select count(*) into n from public.friendships f
     where f.status = 'accepte' and f.relationship_type = 'fitmate' and f.id <> new.id
       and (f.user_a in (new.user_a, new.user_b) or f.user_b in (new.user_a, new.user_b));
    if n >= 3 then
      raise exception 'trois FitMates au maximum' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger friendships_guard before insert or update on public.friendships
  for each row execute function public.tg_friendships_guard();

-- Bloquer quelqu'un supprime l'amitié
create or replace function public.tg_blocks_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships
   where least(user_a, user_b) = least(new.blocker_id, new.blocked_id)
     and greatest(user_a, user_b) = greatest(new.blocker_id, new.blocked_id);
  return new;
end $$;

create trigger blocks_after after insert on public.blocks
  for each row execute function public.tg_blocks_after();

-- -----------------------------------------------------------------------------------------------------
-- Cartes publiques : ce qu'un membre voit d'un autre (masquage des champs selon les réglages)
-- -----------------------------------------------------------------------------------------------------
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
     or (p.allow_messages = 'amis' and public.is_friend(auth.uid(), p.user_id))))                  as can_message
from public.community_profiles p
where auth.uid() is not null
  and (
    p.user_id = auth.uid()
    or (not public.is_blocked(auth.uid(), p.user_id)
        and (p.profile_visible or public.is_friend(auth.uid(), p.user_id)))
  );

-- -----------------------------------------------------------------------------------------------------
-- FitMatch (calcul côté serveur, mêmes poids que src/social/fitmatch/matching.ts)
-- progression 30 · objectif 25 · langue 20 · disponibilités 10 · activités 5 · soutien 5 · fuseau 5
-- -----------------------------------------------------------------------------------------------------
create table public.fitmatch_passes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  passed_id  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, passed_id)
);

create or replace function public.stage_of(pts integer) returns integer
language sql immutable as $$
  select case when pts >= 12000 then 6 when pts >= 7000 then 5 when pts >= 3500 then 4
              when pts >= 1500 then 3 when pts >= 500 then 2 else 1 end;
$$;

create or replace function public.age_mid(r text) returns real
language sql immutable as $$
  select case r when '18-24' then 21 when '25-30' then 27.5 when '31-35' then 33
                when '36-45' then 40.5 when '46+' then 52 else 30 end::real;
$$;

create or replace function public.jaccard(a text[], b text[]) returns real
language sql immutable as $$
  select case
    when coalesce(cardinality(a), 0) = 0 or coalesce(cardinality(b), 0) = 0 then 0::real
    else (select count(*) from (select unnest(a) intersect select unnest(b)) i)::real
       / (select count(*) from (select unnest(a) union select unnest(b)) u)::real
  end;
$$;

create or replace function public.progression_similarity(pa integer, pb integer) returns real
language sql immutable as $$
  select case
    when abs(public.stage_of(pa) - public.stage_of(pb)) >= 2 then 0::real
    when public.stage_of(pa) = public.stage_of(pb)
      then (0.7 + 0.3 * least(pa, pb)::real / greatest(pa, pb, 1))::real
    else (0.5 * least(pa, pb)::real / greatest(pa, pb, 1) + 0.15)::real
  end;
$$;

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
-- Conversations et messages
-- -----------------------------------------------------------------------------------------------------
create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  type       text not null default 'prive' check (type in ('prive','cercle')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null references auth.users(id) on delete cascade,
  type             text not null default 'texte' check (type in ('texte','encouragement','reaction','systeme')),
  content          text not null check (char_length(btrim(content)) between 1 and 600),
  created_at       timestamptz not null default now(),
  moderation_state text not null default 'ok' check (moderation_state in ('ok','en_revue','masque'))
);
create index messages_conv on public.messages (conversation_id, created_at);
create index messages_sender on public.messages (sender_id, created_at);

create or replace function public.is_member(conv uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_members where conversation_id = conv and user_id = uid);
$$;

create or replace function public.can_message(me uuid, other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select me <> other
     and not public.is_blocked(me, other)
     and exists (select 1 from public.community_profiles p where p.user_id = other)
     and (
       -- l'autre a déjà répondu dans une discussion commune
       exists (
         select 1 from public.messages m
         join public.conversation_members a on a.conversation_id = m.conversation_id and a.user_id = me
         where m.sender_id = other
       )
       or exists (
         select 1 from public.community_profiles p
         where p.user_id = other
           and (p.allow_messages = 'tous' or (p.allow_messages = 'amis' and public.is_friend(me, other)))
       )
     );
$$;

-- Ouvre (ou retrouve) une discussion privée. 10 nouvelles prises de contact par jour au maximum.
create or replace function public.start_conversation(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  conv uuid;
  today integer;
begin
  if me is null then raise exception 'non connecté' using errcode = 'P0001'; end if;
  if not public.can_message(me, other) then raise exception 'message impossible' using errcode = 'P0001'; end if;
  select c.id into conv from public.conversations c
   where c.type = 'prive'
     and exists (select 1 from public.conversation_members a where a.conversation_id = c.id and a.user_id = me)
     and exists (select 1 from public.conversation_members b where b.conversation_id = c.id and b.user_id = other)
   limit 1;
  if conv is not null then return conv; end if;
  select count(*) into today from public.conversations
   where created_by = me and created_at > now() - interval '1 day';
  if today >= 10 then raise exception 'trop de nouvelles discussions aujourd''hui' using errcode = 'P0001'; end if;
  insert into public.conversations (type, created_by) values ('prive', me) returning id into conv;
  insert into public.conversation_members (conversation_id, user_id) values (conv, me), (conv, other);
  return conv;
end $$;

-- Limites anti-harcèlement (identiques à src/social/messages/safety.ts)
create or replace function public.tg_messages_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  other uuid;
  last_min integer;
  same_text integer;
  mine_here integer;
  replied boolean;
  age_days real;
begin
  if not public.is_member(new.conversation_id, new.sender_id) then
    raise exception 'pas membre de la discussion' using errcode = 'P0001';
  end if;
  select user_id into other from public.conversation_members
   where conversation_id = new.conversation_id and user_id <> new.sender_id limit 1;
  if other is not null and public.is_blocked(new.sender_id, other) then
    raise exception 'vous ne pouvez plus échanger' using errcode = 'P0001';
  end if;
  new.content := btrim(new.content);
  new.created_at := now();
  new.moderation_state := 'ok';

  select count(*) into last_min from public.messages
   where sender_id = new.sender_id and created_at > now() - interval '1 minute';
  if last_min >= 8 then raise exception 'attends une minute' using errcode = 'P0001'; end if;

  select count(*) into same_text from public.messages
   where sender_id = new.sender_id and created_at > now() - interval '1 hour' and lower(content) = lower(new.content);
  if same_text >= 3 then raise exception 'message répété' using errcode = 'P0001'; end if;

  select exists (select 1 from public.messages where conversation_id = new.conversation_id and sender_id = other) into replied;
  select count(*) into mine_here from public.messages where conversation_id = new.conversation_id and sender_id = new.sender_id;
  if not replied and mine_here >= 2 then raise exception 'attends sa réponse' using errcode = 'P0001'; end if;

  select extract(epoch from now() - joined_at) / 86400 into age_days from public.community_profiles where user_id = new.sender_id;
  if coalesce(age_days, 0) < 2 and new.content ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|fr|net|org|io|ly|me|app)\M)' then
    raise exception 'liens désactivés les premiers jours' using errcode = 'P0001';
  end if;
  if not replied and new.content ~ '\+?[0-9][0-9 .-]{7,}[0-9]' then
    raise exception 'pas de numéro de téléphone dans un premier échange' using errcode = 'P0001';
  end if;

  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end $$;

create trigger messages_guard before insert on public.messages
  for each row execute function public.tg_messages_guard();

-- -----------------------------------------------------------------------------------------------------
-- Encouragements (sans discussion) : 20 par jour, 1 par heure et par personne
-- -----------------------------------------------------------------------------------------------------
create table public.encouragements (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null references auth.users(id) on delete cascade,
  to_id      uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);

create or replace function public.tg_encouragements_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_blocked(new.from_id, new.to_id) then raise exception 'action impossible' using errcode = 'P0001'; end if;
  new.created_at := now();
  if (select count(*) from public.encouragements where from_id = new.from_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'limite du jour atteinte' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.encouragements where from_id = new.from_id and to_id = new.to_id and created_at > now() - interval '1 hour') then
    raise exception 'déjà encouragé, réessaie plus tard' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger encouragements_guard before insert on public.encouragements
  for each row execute function public.tg_encouragements_guard();

-- -----------------------------------------------------------------------------------------------------
-- Signalements : un message signalé est masqué en attendant la vérification
-- -----------------------------------------------------------------------------------------------------
create table public.reports (
  id                  uuid primary key default gen_random_uuid(),
  reporter_id         uuid not null references auth.users(id) on delete cascade,
  target_user_id      uuid not null references auth.users(id) on delete cascade,
  message_id_optional uuid references public.messages(id) on delete set null,
  reason              text not null check (reason in ('harcelement','spam','contenu_inapproprie','conseil_dangereux','faux_profil','autre')),
  created_at          timestamptz not null default now(),
  status              text not null default 'recu' check (status in ('recu','traite'))
);

create or replace function public.tg_reports_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.message_id_optional is not null then
    update public.messages set moderation_state = 'en_revue'
     where id = new.message_id_optional
       and sender_id = new.target_user_id
       and public.is_member(conversation_id, new.reporter_id);
  end if;
  return new;
end $$;

create trigger reports_after after insert on public.reports
  for each row execute function public.tg_reports_after();

-- -----------------------------------------------------------------------------------------------------
-- Règles d'accès (RLS)
-- -----------------------------------------------------------------------------------------------------
alter table public.community_profiles   enable row level security;
alter table public.blocks               enable row level security;
alter table public.friendships          enable row level security;
alter table public.fitmatch_passes      enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.encouragements       enable row level security;
alter table public.reports              enable row level security;

-- Profils : chacun lit et écrit SA ligne ; les autres passent par la vue community_cards (champs masqués).
create policy profiles_own_select on public.community_profiles for select using (user_id = auth.uid());
create policy profiles_own_insert on public.community_profiles for insert with check (user_id = auth.uid() and points = 0 and highest_historical_points = 0 and helpfulness_score = 0);
create policy profiles_own_update on public.community_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_own_delete on public.community_profiles for delete using (user_id = auth.uid());
-- points, niveau historique et entraide : réservés au serveur
revoke update on public.community_profiles from anon, authenticated;
grant update (display_name, avatar_id, language, age_range, country_optional, timezone, utc_offset, goal_category,
              slots, activities, support, last_active_at, profile_visible, show_age, show_country, show_goal,
              body_progress, allow_messages, allow_fitmatch)
  on public.community_profiles to authenticated;
revoke all on public.community_cards from anon;
grant select on public.community_cards to authenticated;

create policy blocks_select on public.blocks for select using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks for insert with check (blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete using (blocker_id = auth.uid());

create policy friendships_select on public.friendships for select using (auth.uid() in (user_a, user_b));
create policy friendships_insert on public.friendships for insert
  with check (user_a = auth.uid() and status = 'en_attente');
create policy friendships_respond on public.friendships for update
  using (user_b = auth.uid()) with check (user_b = auth.uid() and status in ('accepte','refuse'));
create policy friendships_delete on public.friendships for delete using (auth.uid() in (user_a, user_b));

create policy passes_select on public.fitmatch_passes for select using (user_id = auth.uid());
create policy passes_insert on public.fitmatch_passes for insert with check (user_id = auth.uid());

create policy conversations_select on public.conversations for select using (public.is_member(id, auth.uid()));
create policy members_select on public.conversation_members for select using (public.is_member(conversation_id, auth.uid()));
-- création de discussion : uniquement via start_conversation()

create policy messages_select on public.messages for select using (
  public.is_member(conversation_id, auth.uid())
  and (sender_id = auth.uid() or not public.is_blocked(auth.uid(), sender_id))
  and (moderation_state <> 'masque' or sender_id = auth.uid())
);
create policy messages_insert on public.messages for insert
  with check (sender_id = auth.uid() and public.is_member(conversation_id, auth.uid()));

create policy encouragements_select on public.encouragements for select using (auth.uid() in (from_id, to_id));
create policy encouragements_insert on public.encouragements for insert with check (from_id = auth.uid());

create policy reports_select on public.reports for select using (reporter_id = auth.uid());
create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid() and status = 'recu');

revoke execute on function public.fitmatch_candidates(integer) from public, anon;
grant execute on function public.fitmatch_candidates(integer) to authenticated;
revoke execute on function public.start_conversation(uuid) from public, anon;
grant execute on function public.start_conversation(uuid) to authenticated;
