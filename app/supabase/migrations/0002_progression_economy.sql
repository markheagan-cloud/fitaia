-- =====================================================================================================
-- FITAIA Phase 2 — Progression (Points FITAIA) + Économie (Fitcoins) + Inventaire cosmétique.
-- Contrat identique au serveur local de démonstration (src/backend/local/LocalEconomyServer.ts).
--
-- ÉTAT : PRÊT, NON DÉPLOYÉ (aucun projet Supabase). Vérifié sur PostgreSQL 16 local avec le bouchon Supabase :
-- supabase/tests/progression_economy_test.sql, supabase/tests/concurrency.sh, supabase/tests/*.test.ts.
-- Dépend de 0001_community.sql (blocage, encouragements, points du profil social).
--
-- Principes :
--  * points != monnaie : les PF (progression_events) et les Fitcoins (economy_transactions) ne se mélangent jamais ;
--  * le téléphone ne décide jamais d'un montant : il appelle une fonction (action, récompense, objet), le serveur
--    vérifie, calcule, écrit et renvoie le nouvel état ;
--  * registre immuable : aucune ligne modifiée ni supprimée (sauf effacement du compte utilisateur) ;
--  * le solde n'est qu'une projection du registre : il ne change QUE par l'insertion d'une ligne du registre
--    (déclencheur), jamais par un UPDATE direct, même du propriétaire de la base ;
--  * idempotence : chaque écriture porte une clé UNIQUE ; deux demandes identiques = une seule écriture ;
--  * concurrence : toute opération d'un utilisateur verrouille sa ligne (SELECT … FOR UPDATE) ;
--  * RLS : chacun lit ses lignes ; aucune écriture directe des clients (tout passe par les fonctions).
-- =====================================================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------------------------------
-- 1. Réglages (modifiables par l'administration sans migration)
-- -----------------------------------------------------------------------------------------------------
create table public.progression_settings (
  id                 boolean primary key default true check (id),
  day_time_zone      text    not null default 'Europe/Paris',
  season_anchor_day  date    not null default date '2026-10-01',
  season_length_days integer not null default 56 check (season_length_days between 7 and 366)
);
insert into public.progression_settings default values;

create table public.economy_settings (
  id                          boolean primary key default true check (id),
  legacy_migration_version    text    not null default 'v1' check (legacy_migration_version ~ '^v[0-9]+$'),
  legacy_credits_per_fitcoin  integer not null default 10 check (legacy_credits_per_fitcoin > 0),
  legacy_max_opening_fitcoins integer not null default 2000 check (legacy_max_opening_fitcoins >= 0)
);
insert into public.economy_settings default values;

-- Étapes du Parcours FITAIA : identifiant interne stable ; le texte affiché vit dans l'app (STAGE_LABELS).
create table public.progression_stages (
  stage_id   text    primary key check (stage_id ~ '^[a-z_]{2,32}$'),
  rank       integer not null unique check (rank >= 1),
  min_points integer not null unique check (min_points >= 0)
);
insert into public.progression_stages (stage_id, rank, min_points) values
  ('declic', 1, 0),
  ('elan', 2, 500),
  ('regulier', 3, 1500),
  ('engage', 4, 3500),
  ('confirme', 5, 7000),
  ('pilier', 6, 12000);

-- Rangs et seuils strictement croissants, première étape à 0 PF (vérifié après chaque modification).
create or replace function public.tg_progression_stages_consistency() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.progression_stages where min_points = 0)
     or exists (select 1 from public.progression_stages a join public.progression_stages b
                 on a.rank < b.rank and a.min_points >= b.min_points) then
    raise exception 'étapes incohérentes : seuils croissants avec le rang, première étape à 0 PF' using errcode = '23514';
  end if;
  return null;
end $$;
create trigger progression_stages_consistency after insert or update or delete on public.progression_stages
  for each statement execute function public.tg_progression_stages_consistency();

-- Règles des PF (mêmes valeurs que src/progression/progressionRules.ts). La liste des actions est FERMÉE :
-- aucune action liée au fait de manger moins, sauter un repas, perdre du poids vite, déficit, surentraînement
-- ou kilos comparés ne peut être ajoutée sans une nouvelle migration relue.
create table public.progression_rules (
  action_type  text    primary key check (action_type in ('daily_goal_completed','activity_logged','meal_logged',
                                                          'challenge_completed','encouragement_sent','tip_marked_helpful')),
  points       integer not null check (points > 0),
  daily_cap    integer not null,
  grant_mode   text    not null check (grant_mode in ('self','peer')),
  dedupe_scope text    not null check (dedupe_scope in ('day','source')),
  proof        text    not null check (proof in ('declarative','server_record')),
  enabled      boolean not null default true,
  check (daily_cap >= points)
);
insert into public.progression_rules (action_type, points, daily_cap, grant_mode, dedupe_scope, proof, enabled) values
  ('daily_goal_completed', 20, 20, 'self', 'day', 'declarative', true),
  ('activity_logged', 15, 30, 'self', 'source', 'declarative', true),
  ('meal_logged', 5, 15, 'self', 'source', 'declarative', true),
  ('challenge_completed', 50, 150, 'self', 'source', 'declarative', true),
  ('encouragement_sent', 2, 10, 'self', 'source', 'server_record', true),
  ('tip_marked_helpful', 5, 20, 'peer', 'source', 'declarative', true);

-- -----------------------------------------------------------------------------------------------------
-- 2. Calendrier serveur (mêmes calculs que src/platform/calendar.ts)
-- -----------------------------------------------------------------------------------------------------
create or replace function public.progression_day(at timestamptz default now()) returns date
language sql stable set search_path = public, pg_temp as $$
  select (at at time zone s.day_time_zone)::date from public.progression_settings s
$$;

create or replace function public.progression_week(d date) returns date
language sql immutable as $$
  select d - (extract(isodow from d)::integer - 1)
$$;

create or replace function public.progression_season(d date) returns text
language sql stable set search_path = public, pg_temp as $$
  select 'S' || greatest(0, floor((d - s.season_anchor_day)::numeric / s.season_length_days)::integer + 1)
  from public.progression_settings s
$$;

create or replace function public.progression_stage_for(pts bigint) returns text
language sql stable set search_path = public, pg_temp as $$
  select stage_id from public.progression_stages where min_points <= pts order by min_points desc limit 1
$$;

create or replace function public.progression_stage_rank(sid text) returns integer
language sql stable set search_path = public, pg_temp as $$
  select coalesce((select rank from public.progression_stages where stage_id = sid), 0)
$$;

-- -----------------------------------------------------------------------------------------------------
-- 3. Comptes de progression et registre des PF
-- -----------------------------------------------------------------------------------------------------
create table public.progression_accounts (
  user_id                  uuid        primary key references auth.users(id) on delete cascade,
  lifetime_points          bigint      not null default 0 check (lifetime_points >= 0),
  weekly_points            bigint      not null default 0 check (weekly_points >= 0),
  season_points            bigint      not null default 0 check (season_points >= 0),
  week_key                 date        not null,
  season_key               text        not null check (season_key ~ '^S[0-9]+$'),
  current_stage            text        not null references public.progression_stages(stage_id),
  highest_historical_stage text        not null references public.progression_stages(stage_id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (weekly_points <= lifetime_points and season_points <= lifetime_points)
);

-- day_key, week_key, season_key, created_at : calculés par le déclencheur (horloge et fuseau du serveur).
create table public.progression_events (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  action_type     text        not null references public.progression_rules(action_type),
  source_id       text        not null check (source_id ~ '^[A-Za-z0-9:_.-]{1,128}$'),
  actor_id        uuid        references auth.users(id) on delete set null,
  points          integer     not null check (points > 0),
  day_key         date        not null,
  week_key        date        not null,
  season_key      text        not null,
  idempotency_key text        not null unique check (char_length(idempotency_key) between 1 and 300),
  created_at      timestamptz not null default now(),
  check (actor_id is null or actor_id <> user_id)
);
create index progression_events_user_day on public.progression_events (user_id, day_key, action_type);

-- Le compte ne change QUE par l'insertion d'une attribution (déclencheur ci-dessous).
create or replace function public.tg_progression_accounts_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.lifetime_points <> 0 or new.weekly_points <> 0 or new.season_points <> 0 then
      raise exception 'un compte de progression commence à 0 PF' using errcode = '42501';
    end if;
    new.created_at := now(); new.updated_at := now();
    return new;
  end if;
  if pg_trigger_depth() < 2 then
    raise exception 'progression modifiable uniquement par le registre des PF' using errcode = '42501';
  end if;
  new.user_id := old.user_id; new.created_at := old.created_at;
  return new;
end $$;
create trigger progression_accounts_guard before insert or update on public.progression_accounts
  for each row execute function public.tg_progression_accounts_guard();

-- Applique une attribution : clés de période calculées ici, plafond du jour revérifié (défense en profondeur),
-- remise à zéro hebdomadaire / saisonnière, étape courante et meilleure étape historique (jamais en baisse).
create or replace function public.tg_progression_event_apply() returns trigger
language plpgsql as $$
declare
  r public.progression_rules;
  acc public.progression_accounts;
  used bigint;
  lifetime bigint;
  stage text;
begin
  select * into r from public.progression_rules where action_type = new.action_type;
  if not found or not r.enabled then raise exception 'action inconnue ou désactivée' using errcode = '22023'; end if;
  new.id := coalesce(new.id, gen_random_uuid());
  new.created_at := now();
  new.day_key := public.progression_day(new.created_at);
  new.week_key := public.progression_week(new.day_key);
  new.season_key := public.progression_season(new.day_key);
  select * into acc from public.progression_accounts where user_id = new.user_id for update;
  if not found then raise exception 'compte de progression absent' using errcode = '23503'; end if;
  select coalesce(sum(points), 0) into used from public.progression_events
   where user_id = new.user_id and action_type = new.action_type and day_key = new.day_key;
  if new.points > r.points or used + new.points > r.daily_cap then
    raise exception 'plafond quotidien dépassé' using errcode = '23514';
  end if;
  lifetime := acc.lifetime_points + new.points;
  stage := public.progression_stage_for(lifetime);
  update public.progression_accounts set
    lifetime_points = lifetime,
    weekly_points = (case when week_key = new.week_key then weekly_points else 0 end) + new.points,
    season_points = (case when season_key = new.season_key then season_points else 0 end) + new.points,
    week_key = new.week_key,
    season_key = new.season_key,
    current_stage = stage,
    highest_historical_stage = case when public.progression_stage_rank(stage) > public.progression_stage_rank(highest_historical_stage)
                                    then stage else highest_historical_stage end,
    updated_at = now()
  where user_id = new.user_id;
  return new;
end $$;
create trigger progression_events_apply before insert on public.progression_events
  for each row execute function public.tg_progression_event_apply();

-- -----------------------------------------------------------------------------------------------------
-- 4. Catalogue cosmétique, wallet, registre Fitcoins, récompenses, inventaire
-- -----------------------------------------------------------------------------------------------------
create table public.cosmetic_items (
  id              text        primary key check (id ~ '^[a-z0-9_]{2,64}$'),
  name            text        not null check (char_length(name) between 1 and 60),
  category        text        not null check (category in ('TOP','BOTTOM','SHOES','JACKET','HEAD','GLASSES','ACCESSORY','FULL_OUTFIT')),
  rarity          text        not null check (rarity in ('COMMON','RARE','EPIC','LEGENDARY')),
  asset_reference text        not null check (char_length(asset_reference) between 1 and 200),
  source          text        not null check (source in ('SHOP','REWARD','EVENT','LIMITED','PRESTIGE')),
  price_fitcoins  integer     check (price_fitcoins is null or price_fitcoins > 0),
  enabled         boolean     not null default true,
  created_at      timestamptz not null default now(),
  unique (id, category),
  check (source not in ('REWARD','PRESTIGE') or price_fitcoins is null)
);
-- Catalogue de départ (démonstration ; même contenu que src/inventory/cosmeticCatalog.ts).
insert into public.cosmetic_items (id, name, category, rarity, asset_reference, source, price_fitcoins, enabled, created_at) values
  ('outfit_urban_001', 'Tenue Urbaine', 'FULL_OUTFIT', 'COMMON', 'cosmetic/full_outfit/outfit_urban_001', 'SHOP', 250, true, '2026-10-04T00:00:00Z'),
  ('top_tee_graphite', 'Tee Essentiel Graphite', 'TOP', 'COMMON', 'cosmetic/top/top_tee_graphite', 'SHOP', 120, true, '2026-10-04T00:00:00Z'),
  ('top_hoodie_nuit', 'Hoodie Nuit', 'TOP', 'RARE', 'cosmetic/top/top_hoodie_nuit', 'SHOP', 300, true, '2026-10-04T00:00:00Z'),
  ('jacket_coupe_vent_citron', 'Coupe-vent Citron', 'JACKET', 'RARE', 'cosmetic/jacket/jacket_coupe_vent_citron', 'SHOP', 300, true, '2026-10-04T00:00:00Z'),
  ('bottom_jogger_graphite', 'Jogger Graphite', 'BOTTOM', 'COMMON', 'cosmetic/bottom/bottom_jogger_graphite', 'SHOP', 150, true, '2026-10-04T00:00:00Z'),
  ('shoes_runner_craie', 'Runner Craie', 'SHOES', 'COMMON', 'cosmetic/shoes/shoes_runner_craie', 'SHOP', 180, true, '2026-10-04T00:00:00Z'),
  ('shoes_runner_lime', 'Runner Lime', 'SHOES', 'EPIC', 'cosmetic/shoes/shoes_runner_lime', 'SHOP', 600, true, '2026-10-04T00:00:00Z'),
  ('head_casquette_noire', 'Casquette Noire', 'HEAD', 'COMMON', 'cosmetic/head/head_casquette_noire', 'SHOP', 100, true, '2026-10-04T00:00:00Z'),
  ('glasses_sport_fume', 'Lunettes Sport Fumé', 'GLASSES', 'RARE', 'cosmetic/glasses/glasses_sport_fume', 'SHOP', 220, true, '2026-10-04T00:00:00Z'),
  ('accessory_montre_parcours', 'Montre du Parcours', 'ACCESSORY', 'RARE', 'cosmetic/accessory/accessory_montre_parcours', 'REWARD', null, true, '2026-10-04T00:00:00Z'),
  ('jacket_october_crew', 'Veste October Crew', 'JACKET', 'LEGENDARY', 'cosmetic/jacket/jacket_october_crew', 'PRESTIGE', null, true, '2026-10-04T00:00:00Z'),
  ('head_bonnet_hiver', 'Bonnet Hiver', 'HEAD', 'COMMON', 'cosmetic/head/head_bonnet_hiver', 'EVENT', 150, false, '2026-10-04T00:00:00Z');

-- Emplacements incompatibles (même contenu que SLOT_EXCLUSIONS) : une tenue complète remplace haut, bas et veste.
create table public.cosmetic_slot_exclusions (
  slot          text not null check (slot in ('TOP','BOTTOM','SHOES','JACKET','HEAD','GLASSES','ACCESSORY','FULL_OUTFIT')),
  excluded_slot text not null check (excluded_slot in ('TOP','BOTTOM','SHOES','JACKET','HEAD','GLASSES','ACCESSORY','FULL_OUTFIT')),
  primary key (slot, excluded_slot),
  check (slot <> excluded_slot)
);
insert into public.cosmetic_slot_exclusions (slot, excluded_slot) values
  ('FULL_OUTFIT', 'TOP'), ('FULL_OUTFIT', 'BOTTOM'), ('FULL_OUTFIT', 'JACKET'),
  ('TOP', 'FULL_OUTFIT'), ('BOTTOM', 'FULL_OUTFIT'), ('JACKET', 'FULL_OUTFIT');

create table public.fitcoin_wallets (
  user_id         uuid        primary key references auth.users(id) on delete cascade,
  balance         bigint      not null default 0 check (balance >= 0),
  lifetime_earned bigint      not null default 0 check (lifetime_earned >= 0),
  lifetime_spent  bigint      not null default 0 check (lifetime_spent >= 0),
  last_sequence   bigint      not null default 0 check (last_sequence >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (balance = lifetime_earned - lifetime_spent)
);

-- Un wallet naît vide et ne change que par le registre (UPDATE direct refusé, même au propriétaire de la base).
create or replace function public.tg_fitcoin_wallets_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.balance <> 0 or new.lifetime_earned <> 0 or new.lifetime_spent <> 0 or new.last_sequence <> 0 then
      raise exception 'un wallet commence à 0 Fitcoin' using errcode = '42501';
    end if;
    new.created_at := now(); new.updated_at := now();
    return new;
  end if;
  if pg_trigger_depth() < 2 then
    raise exception 'solde modifiable uniquement par le registre' using errcode = '42501';
  end if;
  new.user_id := old.user_id; new.created_at := old.created_at;
  return new;
end $$;
create trigger fitcoin_wallets_guard before insert or update on public.fitcoin_wallets
  for each row execute function public.tg_fitcoin_wallets_guard();

-- sequence, balance_before, balance_after, created_at : calculés par le déclencheur, jamais fournis par l'appelant.
create table public.economy_transactions (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  sequence        bigint      not null check (sequence >= 1),
  type            text        not null check (type in ('earn','spend','refund','migration')),
  currency        text        not null default 'FITCOIN' check (currency = 'FITCOIN'),
  amount          bigint      not null check (amount <> 0),
  balance_before  bigint      not null check (balance_before >= 0),
  balance_after   bigint      not null check (balance_after >= 0),
  reason          text        not null check (reason in ('progression_milestone','stage_reward','daily_reward',
                                                         'cosmetic_purchase','purchase_refund','legacy_migration')),
  source_type     text        not null check (source_type in ('reward','cosmetic_item','transaction','migration')),
  source_id       text        not null check (char_length(source_id) between 1 and 128),
  idempotency_key text        not null unique check (char_length(idempotency_key) between 1 and 300),
  metadata        jsonb       not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  created_at      timestamptz not null default now(),
  unique (user_id, sequence),
  check (balance_after = balance_before + amount),
  check ((type = 'spend') = (amount < 0))
);
create index economy_transactions_source on public.economy_transactions (user_id, source_type, source_id);

-- Le registre fait foi : solde avant, solde après et rang sont CALCULÉS ici depuis le wallet verrouillé,
-- puis le wallet est mis à jour. Un solde négatif viole les contraintes : toute la transaction est annulée.
create or replace function public.tg_economy_transaction_apply() returns trigger
language plpgsql as $$
declare w public.fitcoin_wallets;
begin
  select * into w from public.fitcoin_wallets where user_id = new.user_id for update;
  if not found then raise exception 'wallet absent' using errcode = '23503'; end if;
  new.id := coalesce(new.id, gen_random_uuid());
  new.currency := 'FITCOIN';
  new.sequence := w.last_sequence + 1;
  new.balance_before := w.balance;
  new.balance_after := w.balance + new.amount;
  new.created_at := now();
  if new.balance_after < 0 then raise exception 'solde insuffisant' using errcode = '23514'; end if;
  update public.fitcoin_wallets set
    balance = new.balance_after,
    lifetime_earned = lifetime_earned + case when new.type in ('earn','migration') then new.amount else 0 end,
    lifetime_spent = lifetime_spent - case when new.type in ('spend','refund') then new.amount else 0 end,
    last_sequence = new.sequence,
    updated_at = now()
  where user_id = new.user_id;
  return new;
end $$;
create trigger economy_transactions_apply before insert on public.economy_transactions
  for each row execute function public.tg_economy_transaction_apply();

create table public.reward_definitions (
  id               text        primary key check (id ~ '^[a-z0-9_]{2,64}$'),
  type             text        not null check (type in ('fitcoins','cosmetic','badge','capsule')),
  amount           integer     not null check (amount > 0),
  cosmetic_item_id text        references public.cosmetic_items(id),
  unlock_condition jsonb       not null,
  repeatable       boolean     not null default false,
  enabled          boolean     not null default true,
  created_at       timestamptz not null default now(),
  check ((type = 'cosmetic') = (cosmetic_item_id is not null)),
  check (type <> 'cosmetic' or amount = 1),
  check (case unlock_condition->>'kind'
    when 'lifetime_points' then jsonb_typeof(unlock_condition->'atLeast') = 'number'
                                and (unlock_condition->>'atLeast')::numeric >= 0 and not repeatable
    when 'stage_reached' then jsonb_typeof(unlock_condition->'stageId') = 'string' and not repeatable
    when 'action_completed_today' then jsonb_typeof(unlock_condition->'action') = 'string'
    else false end)
);
-- Paliers du Parcours (spécification C, point 10) + récompense quotidienne de démonstration.
insert into public.reward_definitions (id, type, amount, cosmetic_item_id, unlock_condition, repeatable, enabled) values
  ('milestone_900', 'fitcoins', 50, null, '{"kind":"lifetime_points","atLeast":900}', false, true),
  ('milestone_1000', 'capsule', 1, null, '{"kind":"lifetime_points","atLeast":1000}', false, true),
  ('milestone_1150', 'cosmetic', 1, 'accessory_montre_parcours', '{"kind":"lifetime_points","atLeast":1150}', false, true),
  ('milestone_1300', 'fitcoins', 100, null, '{"kind":"lifetime_points","atLeast":1300}', false, true),
  ('daily_goal', 'fitcoins', 10, null, '{"kind":"action_completed_today","action":"daily_goal_completed"}', true, true);

-- `pending` : capsule due, ouverture construite en Phase 5 (seule évolution permise : pending → fulfilled).
create table public.reward_claims (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  reward_id       text        not null references public.reward_definitions(id),
  status          text        not null check (status in ('fulfilled','pending')),
  period_key      text        check (period_key is null or period_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  idempotency_key text        not null unique check (char_length(idempotency_key) between 1 and 300),
  transaction_id  uuid        references public.economy_transactions(id),
  duplicate_item  boolean     not null default false,
  claimed_at      timestamptz not null default now(),
  fulfilled_at    timestamptz,
  unique nulls not distinct (user_id, reward_id, period_key)
);

create table public.user_inventory (
  user_id               uuid        not null references auth.users(id) on delete cascade,
  item_id               text        not null references public.cosmetic_items(id),
  acquired_via          text        not null check (acquired_via in ('purchase','reward','grant')),
  acquired_at           timestamptz not null default now(),
  source_transaction_id uuid        references public.economy_transactions(id),
  source_claim_id       uuid        references public.reward_claims(id),
  primary key (user_id, item_id),
  check ((acquired_via = 'purchase') = (source_transaction_id is not null)),
  check ((acquired_via = 'reward') = (source_claim_id is not null))
);

-- Un emplacement = une catégorie ; on ne peut porter qu'un objet possédé, dans SA catégorie (clés étrangères).
create table public.user_equipped_cosmetics (
  user_id     uuid        not null,
  slot        text        not null,
  item_id     text        not null,
  equipped_at timestamptz not null default now(),
  primary key (user_id, slot),
  foreign key (user_id, item_id) references public.user_inventory(user_id, item_id) on delete cascade,
  foreign key (item_id, slot) references public.cosmetic_items(id, category)
);

-- -----------------------------------------------------------------------------------------------------
-- 5. Immuabilité des registres
-- -----------------------------------------------------------------------------------------------------
-- Aucune modification ; suppression seulement quand le compte utilisateur lui-même est effacé (cascade RGPD).
create or replace function public.tg_ledger_immutable() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from auth.users where id = old.user_id) then
      return old;
    end if;
  elsif tg_table_name = 'progression_events' then
    -- Effacement du compte d'un membre qui a accordé des PF : son identifiant est retiré (ON DELETE SET NULL), rien d'autre.
    if to_jsonb(new) ->> 'actor_id' is null
       and not exists (select 1 from auth.users where id = (to_jsonb(old) ->> 'actor_id')::uuid)
       and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
      return new;
    end if;
  end if;
  raise exception 'registre immuable : % refusé sur %', lower(tg_op), tg_table_name using errcode = '42501';
end $$;
create trigger economy_transactions_immutable before update or delete on public.economy_transactions
  for each row execute function public.tg_ledger_immutable();
create trigger progression_events_immutable before update or delete on public.progression_events
  for each row execute function public.tg_ledger_immutable();

create or replace function public.tg_ledger_no_truncate() returns trigger
language plpgsql as $$
begin
  raise exception 'registre immuable : truncate refusé sur %', tg_table_name using errcode = '42501';
end $$;
create trigger economy_transactions_no_truncate before truncate on public.economy_transactions
  for each statement execute function public.tg_ledger_no_truncate();
create trigger progression_events_no_truncate before truncate on public.progression_events
  for each statement execute function public.tg_ledger_no_truncate();
create trigger reward_claims_no_truncate before truncate on public.reward_claims
  for each statement execute function public.tg_ledger_no_truncate();

create or replace function public.tg_reward_claims_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from auth.users where id = old.user_id) then return old; end if;
    raise exception 'réclamation immuable' using errcode = '42501';
  end if;
  if old.status = 'pending' and new.status = 'fulfilled'
     and (new.id, new.user_id, new.reward_id, new.period_key, new.idempotency_key, new.transaction_id, new.duplicate_item, new.claimed_at)
         is not distinct from
         (old.id, old.user_id, old.reward_id, old.period_key, old.idempotency_key, old.transaction_id, old.duplicate_item, old.claimed_at) then
    new.fulfilled_at := now();
    return new;
  end if;
  raise exception 'réclamation immuable (seul pending → fulfilled est permis)' using errcode = '42501';
end $$;
create trigger reward_claims_guard before update or delete on public.reward_claims
  for each row execute function public.tg_reward_claims_guard();

-- -----------------------------------------------------------------------------------------------------
-- 6. Aides internes (jamais appelables par un client)
-- -----------------------------------------------------------------------------------------------------
create or replace function public._iso(ts timestamptz) returns text
language sql immutable as $$
  select to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create or replace function public._progression_ensure(uid uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
declare d date := public.progression_day();
begin
  insert into public.progression_accounts (user_id, week_key, season_key, current_stage, highest_historical_stage)
  values (uid, public.progression_week(d), public.progression_season(d), public.progression_stage_for(0), public.progression_stage_for(0))
  on conflict (user_id) do nothing;
end $$;

create or replace function public._wallet_ensure(uid uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  insert into public.fitcoin_wallets (user_id) values (uid) on conflict (user_id) do nothing;
end $$;

-- Vue normalisée du compte (période courante, étape recalculée avec les seuils actuels, meilleure étape conservée).
create or replace function public._progression_json(uid uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  with p as (select public.progression_day() as d)
  select jsonb_build_object(
    'userId', a.user_id,
    'lifetimePoints', a.lifetime_points,
    'weeklyPoints', case when a.week_key = public.progression_week(p.d) then a.weekly_points else 0 end,
    'seasonPoints', case when a.season_key = public.progression_season(p.d) then a.season_points else 0 end,
    'weekKey', to_char(public.progression_week(p.d), 'YYYY-MM-DD'),
    'seasonKey', public.progression_season(p.d),
    'currentStage', public.progression_stage_for(a.lifetime_points),
    'highestHistoricalStage', case when public.progression_stage_rank(public.progression_stage_for(a.lifetime_points))
                                        > public.progression_stage_rank(a.highest_historical_stage)
                                   then public.progression_stage_for(a.lifetime_points) else a.highest_historical_stage end,
    'createdAt', public._iso(a.created_at),
    'updatedAt', public._iso(a.updated_at))
  from public.progression_accounts a, p where a.user_id = uid
$$;

create or replace function public._pf_event_json(e public.progression_events) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', e.id, 'userId', e.user_id, 'actionType', e.action_type, 'sourceId', e.source_id,
    'actorId', e.actor_id, 'points', e.points, 'dayKey', to_char(e.day_key, 'YYYY-MM-DD'),
    'weekKey', to_char(e.week_key, 'YYYY-MM-DD'), 'seasonKey', e.season_key,
    'idempotencyKey', e.idempotency_key, 'createdAt', public._iso(e.created_at))
$$;

create or replace function public._wallet_json(uid uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('userId', w.user_id, 'balance', w.balance, 'lifetimeEarned', w.lifetime_earned,
    'lifetimeSpent', w.lifetime_spent, 'createdAt', public._iso(w.created_at), 'updatedAt', public._iso(w.updated_at))
  from public.fitcoin_wallets w where w.user_id = uid
$$;

create or replace function public._tx_json(t public.economy_transactions) returns jsonb
language sql immutable as $$
  select case when t.id is null then null else jsonb_build_object('id', t.id, 'userId', t.user_id, 'sequence', t.sequence,
    'type', t.type, 'currency', t.currency, 'amount', t.amount, 'balanceBefore', t.balance_before,
    'balanceAfter', t.balance_after, 'reason', t.reason, 'sourceType', t.source_type, 'sourceId', t.source_id,
    'idempotencyKey', t.idempotency_key, 'metadata', t.metadata, 'createdAt', public._iso(t.created_at)) end
$$;

create or replace function public._claim_json(c public.reward_claims) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', c.id, 'userId', c.user_id, 'rewardId', c.reward_id, 'status', c.status,
    'periodKey', c.period_key, 'claimedAt', public._iso(c.claimed_at), 'idempotencyKey', c.idempotency_key,
    'transactionId', c.transaction_id, 'duplicateItem', c.duplicate_item)
$$;

create or replace function public._reward_json(r public.reward_definitions) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', r.id, 'type', r.type, 'amount', r.amount, 'cosmeticItemId', r.cosmetic_item_id,
    'unlockCondition', r.unlock_condition, 'repeatable', r.repeatable, 'enabled', r.enabled)
$$;

create or replace function public._equipped_json(uid uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(slot, item_id), '{}'::jsonb) from public.user_equipped_cosmetics where user_id = uid
$$;

-- Progression vers la condition d'une récompense : (courant, requis).
create or replace function public._reward_progress(uid uuid, r public.reward_definitions, d date, out current bigint, out required bigint)
language plpgsql stable set search_path = public, pg_temp as $$
declare
  acc public.progression_accounts;
  best integer;
  needed integer;
begin
  select * into acc from public.progression_accounts where user_id = uid;
  case r.unlock_condition->>'kind'
    when 'lifetime_points' then
      current := coalesce(acc.lifetime_points, 0);
      required := (r.unlock_condition->>'atLeast')::bigint;
    when 'stage_reached' then
      best := greatest(public.progression_stage_rank(acc.highest_historical_stage),
                       public.progression_stage_rank(public.progression_stage_for(coalesce(acc.lifetime_points, 0))));
      needed := public.progression_stage_rank(r.unlock_condition->>'stageId');
      current := best;
      required := case when needed = 0 then 9007199254740991 else needed end;
    when 'action_completed_today' then
      current := case when exists (select 1 from public.progression_events e where e.user_id = uid
                                     and e.action_type = r.unlock_condition->>'action' and e.day_key = d) then 1 else 0 end;
      required := 1;
    else
      current := 0; required := 9007199254740991;
  end case;
end $$;

create or replace function public._ledger_reason(r public.reward_definitions) returns text
language sql immutable as $$
  select case r.unlock_condition->>'kind' when 'lifetime_points' then 'progression_milestone'
                                          when 'stage_reached' then 'stage_reward' else 'daily_reward' end
$$;

-- Preuve serveur d'une action (proof = 'server_record') : l'encouragement doit exister, venir de moi, aujourd'hui.
create or replace function public._progression_proof_ok(uid uuid, action text, source text, d date) returns boolean
language plpgsql stable set search_path = public, pg_temp as $$
begin
  if action = 'encouragement_sent' then
    if source !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
    return exists (select 1 from public.encouragements e
                    where e.id = source::uuid and e.from_id = uid and public.progression_day(e.created_at) = d);
  end if;
  return false;
end $$;

-- Les PF permanents alimentent le profil social (FitMatch) : le registre serveur remplace les points provisoires.
create or replace function public._sync_community_points(uid uuid) returns void
language sql set search_path = public, pg_temp as $$
  update public.community_profiles p set points = a.lifetime_points::integer
    from public.progression_accounts a
   where a.user_id = uid and p.user_id = uid and p.points <> a.lifetime_points
$$;

-- -----------------------------------------------------------------------------------------------------
-- 7. Fonctions appelées par l'app (utilisateur connecté = auth.uid(), jamais un paramètre)
-- -----------------------------------------------------------------------------------------------------
create or replace function public._require_user() returns uuid
language plpgsql stable set search_path = public, pg_temp as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'non connecté' using errcode = '28000'; end if;
  return me;
end $$;

create or replace function public.get_progression() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := public._require_user();
begin
  perform public._progression_ensure(me);
  return public._progression_json(me);
end $$;

-- Action déclarée par le membre : le serveur choisit la règle, la source (le jour pour l'objectif quotidien),
-- vérifie la preuve si elle existe côté serveur, applique le plafond du jour et écrit l'attribution.
create or replace function public.record_progress_action(p_action text, p_source_id text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := public._require_user();
  r public.progression_rules;
  acc public.progression_accounts;
  d date := public.progression_day();
  v_source text;
  v_key text;
  ev public.progression_events;
  used bigint;
  pts integer;
  after_stage text;
begin
  perform public._progression_ensure(me);
  select * into acc from public.progression_accounts where user_id = me for update;
  select * into r from public.progression_rules where action_type = p_action;
  if not found then return jsonb_build_object('ok', false, 'code', 'UNKNOWN_ACTION', 'account', public._progression_json(me)); end if;
  if r.grant_mode <> 'self' then return jsonb_build_object('ok', false, 'code', 'WRONG_GRANT_MODE', 'account', public._progression_json(me)); end if;
  if r.dedupe_scope = 'day' then
    v_source := to_char(d, 'YYYY-MM-DD');
  elsif p_source_id is not null and p_source_id ~ '^[A-Za-z0-9:_.-]{1,128}$' then
    v_source := p_source_id;
  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_SOURCE', 'account', public._progression_json(me));
  end if;
  v_key := format('pf:%s:%s:%s', me, p_action, v_source);
  select * into ev from public.progression_events where idempotency_key = v_key;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'award', public._pf_event_json(ev),
                              'account', public._progression_json(me), 'stageChange', null);
  end if;
  -- Rejeu d'abord (même demande → même réponse), puis seulement : règle encore active ?
  if not r.enabled then return jsonb_build_object('ok', false, 'code', 'ACTION_DISABLED', 'account', public._progression_json(me)); end if;
  if r.proof = 'server_record' and not public._progression_proof_ok(me, p_action, v_source, d) then
    return jsonb_build_object('ok', false, 'code', 'NOT_VERIFIED', 'account', public._progression_json(me));
  end if;
  select coalesce(sum(points), 0) into used from public.progression_events
   where user_id = me and action_type = p_action and day_key = d;
  pts := least(r.points, r.daily_cap - used);
  if pts <= 0 then return jsonb_build_object('ok', false, 'code', 'DAILY_CAP_REACHED', 'account', public._progression_json(me)); end if;
  insert into public.progression_events (user_id, action_type, source_id, actor_id, points, idempotency_key)
  values (me, p_action, v_source, null, pts, v_key) returning * into ev;
  perform public._sync_community_points(me);
  select current_stage into after_stage from public.progression_accounts where user_id = me;
  return jsonb_build_object('ok', true, 'replayed', false, 'award', public._pf_event_json(ev),
    'account', public._progression_json(me),
    'stageChange', case when after_stage <> acc.current_stage then jsonb_build_object('from', acc.current_stage, 'to', after_stage) end);
end $$;

-- Entraide accordée à un autre membre (ex. conseil marqué « Ça m'aide ») : verrou et plafond du BÉNÉFICIAIRE,
-- jamais soi-même, jamais un membre bloqué ; le demandeur ne voit pas le compte de l'autre.
create or replace function public.record_peer_progress_action(p_action text, p_target uuid, p_source_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := public._require_user();
  r public.progression_rules;
  ev public.progression_events;
  v_key text;
  used bigint;
  pts integer;
  d date := public.progression_day();
begin
  select * into r from public.progression_rules where action_type = p_action;
  if not found then return jsonb_build_object('ok', false, 'code', 'UNKNOWN_ACTION'); end if;
  if r.grant_mode <> 'peer' then return jsonb_build_object('ok', false, 'code', 'WRONG_GRANT_MODE'); end if;
  if p_target is null or p_target = me then return jsonb_build_object('ok', false, 'code', 'SELF_PEER_FORBIDDEN'); end if;
  if p_source_id is null or p_source_id !~ '^[A-Za-z0-9:_.-]{1,128}$' then return jsonb_build_object('ok', false, 'code', 'INVALID_SOURCE'); end if;
  if not exists (select 1 from auth.users where id = p_target) then return jsonb_build_object('ok', false, 'code', 'UNKNOWN_TARGET'); end if;
  if public.is_blocked(me, p_target) then return jsonb_build_object('ok', false, 'code', 'BLOCKED'); end if;
  perform public._progression_ensure(p_target);
  perform 1 from public.progression_accounts where user_id = p_target for update;
  v_key := format('pf:%s:%s:%s:%s', p_target, p_action, p_source_id, me);
  select * into ev from public.progression_events where idempotency_key = v_key;
  if found then return jsonb_build_object('ok', true, 'replayed', true, 'points', ev.points); end if;
  if not r.enabled then return jsonb_build_object('ok', false, 'code', 'ACTION_DISABLED'); end if;
  select coalesce(sum(points), 0) into used from public.progression_events
   where user_id = p_target and action_type = p_action and day_key = d;
  pts := least(r.points, r.daily_cap - used);
  if pts <= 0 then return jsonb_build_object('ok', false, 'code', 'DAILY_CAP_REACHED'); end if;
  insert into public.progression_events (user_id, action_type, source_id, actor_id, points, idempotency_key)
  values (p_target, p_action, p_source_id, me, pts, v_key) returning * into ev;
  perform public._sync_community_points(p_target);
  return jsonb_build_object('ok', true, 'replayed', false, 'points', ev.points);
end $$;

create or replace function public.get_wallet() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := public._require_user();
begin
  perform public._wallet_ensure(me);
  return public._wallet_json(me);
end $$;

create or replace function public.get_transactions(p_limit integer default 50, p_before_sequence bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me uuid := public._require_user();
begin
  return (select coalesce(jsonb_agg(public._tx_json(t) order by t.sequence desc), '[]'::jsonb)
          from (select * from public.economy_transactions
                 where user_id = me and (p_before_sequence is null or sequence < p_before_sequence)
                 order by sequence desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) t);
end $$;

create or replace function public.get_reward_statuses() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := public._require_user();
  d date := public.progression_day();
  statuses jsonb := '[]'::jsonb;
  r public.reward_definitions;
  period text;
  prog record;
begin
  perform public._progression_ensure(me);
  for r in select * from public.reward_definitions where enabled order by created_at, id loop
    period := case when r.repeatable then to_char(d, 'YYYY-MM-DD') end;
    prog := public._reward_progress(me, r, d);
    statuses := statuses || jsonb_build_array(jsonb_build_object(
      'reward', public._reward_json(r),
      'state', case when exists (select 1 from public.reward_claims c where c.user_id = me and c.reward_id = r.id
                                   and c.period_key is not distinct from period) then 'claimed'
                    when prog.current >= prog.required then 'claimable' else 'locked' end,
      'periodKey', period,
      'progress', jsonb_build_object('current', prog.current, 'required', prog.required)));
  end loop;
  return statuses;
end $$;

-- Réclamation d'une récompense : idempotente (clé reward:<user>:<id>[:<jour>]), éligibilité vérifiée ici,
-- montant lu dans la définition ; verrou du wallet = sérialisation de toutes les opérations économiques du membre.
create or replace function public.claim_reward(p_reward_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := public._require_user();
  d date := public.progression_day();
  r public.reward_definitions;
  it public.cosmetic_items;
  c public.reward_claims;
  t public.economy_transactions;
  v_period text;
  v_key text;
  v_claim uuid := gen_random_uuid();
  dup boolean := false;
  prog record;
begin
  perform public._wallet_ensure(me);
  perform public._progression_ensure(me);
  perform 1 from public.fitcoin_wallets where user_id = me for update;
  select * into r from public.reward_definitions where id = p_reward_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'UNKNOWN_REWARD', 'wallet', public._wallet_json(me)); end if;
  if r.cosmetic_item_id is not null then select * into it from public.cosmetic_items where id = r.cosmetic_item_id; end if;
  v_period := case when r.repeatable then to_char(d, 'YYYY-MM-DD') end;
  v_key := 'reward:' || me || ':' || r.id || coalesce(':' || v_period, '');
  select * into c from public.reward_claims where idempotency_key = v_key;
  if found then
    select * into t from public.economy_transactions where id = c.transaction_id;
    return jsonb_build_object('ok', true, 'replayed', true, 'rewardType', r.type, 'claim', public._claim_json(c),
      'transaction', public._tx_json(t), 'wallet', public._wallet_json(me),
      'item', case when it.id is not null then jsonb_build_object('itemId', it.id, 'category', it.category, 'duplicate', c.duplicate_item) end);
  end if;
  if not r.enabled then return jsonb_build_object('ok', false, 'code', 'REWARD_DISABLED', 'wallet', public._wallet_json(me)); end if;
  prog := public._reward_progress(me, r, d);
  if prog.current < prog.required then
    return jsonb_build_object('ok', false, 'code', 'NOT_ELIGIBLE', 'wallet', public._wallet_json(me));
  end if;
  if r.type = 'cosmetic' and (it.id is null or not it.enabled) then
    return jsonb_build_object('ok', false, 'code', 'ITEM_UNAVAILABLE', 'wallet', public._wallet_json(me));
  end if;
  if r.type = 'fitcoins' then
    insert into public.economy_transactions (user_id, type, amount, reason, source_type, source_id, idempotency_key, metadata)
    values (me, 'earn', r.amount, public._ledger_reason(r), 'reward', r.id, v_key,
            jsonb_build_object('rewardType', r.type, 'claimId', v_claim))
    returning * into t;
  end if;
  if r.type = 'cosmetic' then
    dup := exists (select 1 from public.user_inventory where user_id = me and item_id = it.id);
  end if;
  insert into public.reward_claims (id, user_id, reward_id, status, period_key, idempotency_key, transaction_id, duplicate_item, fulfilled_at)
  values (v_claim, me, r.id, case when r.type = 'capsule' then 'pending' else 'fulfilled' end, v_period, v_key, t.id, dup,
          case when r.type = 'capsule' then null else now() end)
  returning * into c;
  if r.type = 'cosmetic' and not dup then
    insert into public.user_inventory (user_id, item_id, acquired_via, source_claim_id) values (me, it.id, 'reward', c.id);
  end if;
  return jsonb_build_object('ok', true, 'replayed', false, 'rewardType', r.type, 'claim', public._claim_json(c),
    'transaction', public._tx_json(t), 'wallet', public._wallet_json(me),
    'item', case when it.id is not null then jsonb_build_object('itemId', it.id, 'category', it.category, 'duplicate', dup) end);
end $$;

-- Dépense pour un objet : le prix vient du catalogue ; clé purchase:<user>:<requestId> (une intention d'achat).
create or replace function public.spend_fitcoins_for_item(p_item_id text, p_request_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := public._require_user();
  it public.cosmetic_items;
  t public.economy_transactions;
  w public.fitcoin_wallets;
  v_key text;
begin
  perform public._wallet_ensure(me);
  select * into w from public.fitcoin_wallets where user_id = me for update;
  if p_request_id is null or p_request_id !~ '^[A-Za-z0-9_-]{8,64}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST_ID', 'wallet', public._wallet_json(me));
  end if;
  v_key := 'purchase:' || me || ':' || p_request_id;
  select * into t from public.economy_transactions where idempotency_key = v_key;
  if found then
    if t.source_id is distinct from p_item_id then
      return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_KEY_REUSED', 'wallet', public._wallet_json(me));
    end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'transaction', public._tx_json(t), 'wallet', public._wallet_json(me),
      'item', jsonb_build_object('itemId', t.source_id, 'category', t.metadata->>'category'));
  end if;
  select * into it from public.cosmetic_items where id = p_item_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'ITEM_NOT_FOUND', 'wallet', public._wallet_json(me)); end if;
  if not it.enabled then return jsonb_build_object('ok', false, 'code', 'ITEM_DISABLED', 'wallet', public._wallet_json(me)); end if;
  if it.price_fitcoins is null or it.source in ('REWARD','PRESTIGE') then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOR_SALE', 'wallet', public._wallet_json(me));
  end if;
  if exists (select 1 from public.user_inventory where user_id = me and item_id = it.id) then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_OWNED', 'wallet', public._wallet_json(me));
  end if;
  if w.balance < it.price_fitcoins then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_FUNDS', 'wallet', public._wallet_json(me));
  end if;
  insert into public.economy_transactions (user_id, type, amount, reason, source_type, source_id, idempotency_key, metadata)
  values (me, 'spend', -it.price_fitcoins, 'cosmetic_purchase', 'cosmetic_item', it.id, v_key,
          jsonb_build_object('category', it.category, 'rarity', it.rarity, 'requestId', p_request_id))
  returning * into t;
  insert into public.user_inventory (user_id, item_id, acquired_via, source_transaction_id) values (me, it.id, 'purchase', t.id);
  return jsonb_build_object('ok', true, 'replayed', false, 'transaction', public._tx_json(t), 'wallet', public._wallet_json(me),
    'item', jsonb_build_object('itemId', it.id, 'category', it.category));
end $$;

create or replace function public.get_cosmetic_catalog() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_user();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'category', i.category, 'rarity', i.rarity,
            'assetReference', i.asset_reference, 'source', i.source, 'priceFitcoins', i.price_fitcoins, 'enabled', i.enabled,
            'createdAt', public._iso(i.created_at)) order by i.created_at, i.id), '[]'::jsonb)
          from public.cosmetic_items i);
end $$;

create or replace function public.get_inventory() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me uuid := public._require_user();
begin
  return jsonb_build_object(
    'userId', me,
    'items', coalesce((select jsonb_agg(jsonb_build_object('itemId', v.item_id, 'acquiredVia', v.acquired_via,
                         'acquiredAt', public._iso(v.acquired_at), 'sourceTransactionId', v.source_transaction_id,
                         'sourceClaimId', v.source_claim_id) order by v.acquired_at, v.item_id)
                       from public.user_inventory v where v.user_id = me), '[]'::jsonb),
    'equipped', public._equipped_json(me));
end $$;

create or replace function public.equip_cosmetic(p_item_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := public._require_user();
  it public.cosmetic_items;
  current_item text;
  removed text[];
begin
  perform public._wallet_ensure(me);
  perform 1 from public.fitcoin_wallets where user_id = me for update;
  select * into it from public.cosmetic_items where id = p_item_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'ITEM_NOT_FOUND'); end if;
  if not exists (select 1 from public.user_inventory where user_id = me and item_id = it.id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_OWNED');
  end if;
  select item_id into current_item from public.user_equipped_cosmetics where user_id = me and slot = it.category;
  if current_item = it.id then
    return jsonb_build_object('ok', true, 'changed', false, 'equipped', public._equipped_json(me), 'unequipped', '[]'::jsonb);
  end if;
  with gone as (
    delete from public.user_equipped_cosmetics q
     where q.user_id = me
       and (q.slot = it.category or q.slot in (select x.excluded_slot from public.cosmetic_slot_exclusions x where x.slot = it.category))
    returning q.item_id
  ) select coalesce(array_agg(item_id), '{}') into removed from gone;
  insert into public.user_equipped_cosmetics (user_id, slot, item_id) values (me, it.category, it.id);
  return jsonb_build_object('ok', true, 'changed', true, 'equipped', public._equipped_json(me), 'unequipped', to_jsonb(removed));
end $$;

create or replace function public.unequip_cosmetic(p_slot text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := public._require_user();
  removed text;
begin
  if p_slot is null or p_slot not in ('TOP','BOTTOM','SHOES','JACKET','HEAD','GLASSES','ACCESSORY','FULL_OUTFIT') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SLOT');
  end if;
  perform public._wallet_ensure(me);
  perform 1 from public.fitcoin_wallets where user_id = me for update;
  delete from public.user_equipped_cosmetics where user_id = me and slot = p_slot returning item_id into removed;
  return jsonb_build_object('ok', true, 'changed', removed is not null, 'equipped', public._equipped_json(me),
    'unequipped', case when removed is null then '[]'::jsonb else jsonb_build_array(removed) end);
end $$;

-- -----------------------------------------------------------------------------------------------------
-- 8. Opérations serveur (service_role uniquement : support, migration, cadeaux futurs)
-- -----------------------------------------------------------------------------------------------------
-- Remboursement : exactement le montant d'un achat, une seule fois (clé refund:<transaction>), objet retiré.
create or replace function public.admin_refund_fitcoins(p_user uuid, p_transaction_id uuid, p_refund_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.economy_transactions;
  t public.economy_transactions;
  v_key text;
begin
  if p_refund_reason is null or p_refund_reason not in ('support','item_withdrawn','purchase_error') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REASON');
  end if;
  perform 1 from public.fitcoin_wallets where user_id = p_user for update;
  select * into o from public.economy_transactions where id = p_transaction_id and user_id = p_user;
  if not found then return jsonb_build_object('ok', false, 'code', 'TRANSACTION_NOT_FOUND'); end if;
  if o.type <> 'spend' then return jsonb_build_object('ok', false, 'code', 'NOT_REFUNDABLE'); end if;
  v_key := 'refund:' || o.id;
  select * into t from public.economy_transactions where idempotency_key = v_key;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'transaction', public._tx_json(t), 'wallet', public._wallet_json(p_user));
  end if;
  insert into public.economy_transactions (user_id, type, amount, reason, source_type, source_id, idempotency_key, metadata)
  values (p_user, 'refund', -o.amount, 'purchase_refund', 'transaction', o.id::text, v_key,
          jsonb_build_object('refundReason', p_refund_reason, 'itemId', o.source_id))
  returning * into t;
  if o.source_type = 'cosmetic_item' then
    delete from public.user_inventory where user_id = p_user and item_id = o.source_id and source_transaction_id = o.id;
  end if;
  return jsonb_build_object('ok', true, 'replayed', false, 'transaction', public._tx_json(t), 'wallet', public._wallet_json(p_user));
end $$;

-- Solde d'ouverture depuis l'ancienne monnaie gagnée (déclarée par le téléphone, donc plafonnée), une seule fois.
create or replace function public.admin_migrate_legacy_fitcoins(p_user uuid, p_legacy_balance bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.economy_settings;
  t public.economy_transactions;
  v_key text;
  amount bigint;
begin
  select * into s from public.economy_settings;
  if p_legacy_balance is null or p_legacy_balance < 0 then return jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT'); end if;
  perform public._wallet_ensure(p_user);
  perform 1 from public.fitcoin_wallets where user_id = p_user for update;
  v_key := 'migration:' || s.legacy_migration_version || ':' || p_user;
  select * into t from public.economy_transactions where idempotency_key = v_key;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'transaction', public._tx_json(t), 'wallet', public._wallet_json(p_user));
  end if;
  amount := least(p_legacy_balance / s.legacy_credits_per_fitcoin, s.legacy_max_opening_fitcoins);
  if amount = 0 then
    return jsonb_build_object('ok', true, 'replayed', false, 'transaction', null, 'wallet', public._wallet_json(p_user));
  end if;
  insert into public.economy_transactions (user_id, type, amount, reason, source_type, source_id, idempotency_key, metadata)
  values (p_user, 'migration', amount, 'legacy_migration', 'migration', 'legacy_earn_' || s.legacy_migration_version, v_key,
          jsonb_build_object('legacyBalance', p_legacy_balance, 'creditsPerFitcoin', s.legacy_credits_per_fitcoin,
                             'maxOpeningFitcoins', s.legacy_max_opening_fitcoins))
  returning * into t;
  return jsonb_build_object('ok', true, 'replayed', false, 'transaction', public._tx_json(t), 'wallet', public._wallet_json(p_user));
end $$;

create or replace function public.admin_grant_cosmetic(p_user uuid, p_item_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare it public.cosmetic_items; n integer;
begin
  select * into it from public.cosmetic_items where id = p_item_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'ITEM_NOT_FOUND'); end if;
  if not it.enabled then return jsonb_build_object('ok', false, 'code', 'ITEM_DISABLED'); end if;
  insert into public.user_inventory (user_id, item_id, acquired_via) values (p_user, it.id, 'grant') on conflict do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'acquired', n = 1);
end $$;

-- Rejoue le registre d'un membre et le compare au wallet (audit, support).
create or replace function public.verify_wallet_ledger(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  with chain as (
    select t.*, row_number() over (order by t.sequence) as rn,
           coalesce(sum(t.amount) over (order by t.sequence rows between unbounded preceding and 1 preceding), 0) as expected_before
    from public.economy_transactions t where t.user_id = p_user
  )
  select not exists (select 1 from chain where sequence <> rn or balance_before <> expected_before
                                         or balance_after <> balance_before + amount or balance_after < 0)
     and coalesce((select balance = coalesce((select sum(amount) from public.economy_transactions where user_id = p_user), 0)
                     and lifetime_earned = coalesce((select sum(amount) from public.economy_transactions
                                                      where user_id = p_user and type in ('earn','migration')), 0)
                     and lifetime_spent = -coalesce((select sum(amount) from public.economy_transactions
                                                      where user_id = p_user and type in ('spend','refund')), 0)
                     and last_sequence = coalesce((select max(sequence) from public.economy_transactions where user_id = p_user), 0)
                   from public.fitcoin_wallets where user_id = p_user),
                  not exists (select 1 from public.economy_transactions where user_id = p_user))
$$;

-- -----------------------------------------------------------------------------------------------------
-- 9. Règles d'accès (RLS) et droits
-- -----------------------------------------------------------------------------------------------------
alter table public.progression_settings      enable row level security;
alter table public.economy_settings          enable row level security;
alter table public.progression_stages        enable row level security;
alter table public.progression_rules         enable row level security;
alter table public.progression_accounts      enable row level security;
alter table public.progression_events        enable row level security;
alter table public.cosmetic_items            enable row level security;
alter table public.cosmetic_slot_exclusions  enable row level security;
alter table public.fitcoin_wallets           enable row level security;
alter table public.economy_transactions      enable row level security;
alter table public.reward_definitions        enable row level security;
alter table public.reward_claims             enable row level security;
alter table public.user_inventory            enable row level security;
alter table public.user_equipped_cosmetics   enable row level security;

-- Configuration lisible par les membres connectés (règles transparentes) ; réglages économiques internes.
create policy stages_read      on public.progression_stages       for select to authenticated using (true);
create policy rules_read       on public.progression_rules        for select to authenticated using (true);
create policy settings_read    on public.progression_settings     for select to authenticated using (true);
create policy items_read       on public.cosmetic_items           for select to authenticated using (true);
create policy exclusions_read  on public.cosmetic_slot_exclusions for select to authenticated using (true);
create policy rewards_read     on public.reward_definitions       for select to authenticated using (true);
-- Données personnelles : chacun lit SES lignes.
create policy accounts_own     on public.progression_accounts     for select to authenticated using (user_id = auth.uid());
create policy pf_events_own    on public.progression_events       for select to authenticated using (user_id = auth.uid());
create policy wallets_own      on public.fitcoin_wallets          for select to authenticated using (user_id = auth.uid());
create policy transactions_own on public.economy_transactions     for select to authenticated using (user_id = auth.uid());
create policy claims_own       on public.reward_claims            for select to authenticated using (user_id = auth.uid());
create policy inventory_own    on public.user_inventory           for select to authenticated using (user_id = auth.uid());
create policy equipped_own     on public.user_equipped_cosmetics  for select to authenticated using (user_id = auth.uid());

-- Aucune écriture directe des clients : tout passe par les fonctions ci-dessus.
revoke all on public.progression_settings, public.economy_settings, public.progression_stages, public.progression_rules,
              public.progression_accounts, public.progression_events, public.cosmetic_items, public.cosmetic_slot_exclusions,
              public.fitcoin_wallets, public.economy_transactions, public.reward_definitions, public.reward_claims,
              public.user_inventory, public.user_equipped_cosmetics
  from anon, authenticated;
grant select on public.progression_settings, public.progression_stages, public.progression_rules,
                public.progression_accounts, public.progression_events, public.cosmetic_items, public.cosmetic_slot_exclusions,
                public.fitcoin_wallets, public.economy_transactions, public.reward_definitions, public.reward_claims,
                public.user_inventory, public.user_equipped_cosmetics
  to authenticated;

-- Fonctions : par défaut (Supabase) tout le monde peut les exécuter → on retire tout, puis on rend explicitement.
revoke execute on function
  public.progression_day(timestamptz), public.progression_week(date), public.progression_season(date),
  public.progression_stage_for(bigint), public.progression_stage_rank(text),
  public._iso(timestamptz), public._progression_ensure(uuid), public._wallet_ensure(uuid), public._progression_json(uuid),
  public._pf_event_json(public.progression_events), public._wallet_json(uuid), public._tx_json(public.economy_transactions),
  public._claim_json(public.reward_claims), public._reward_json(public.reward_definitions), public._equipped_json(uuid),
  public._reward_progress(uuid, public.reward_definitions, date), public._ledger_reason(public.reward_definitions),
  public._progression_proof_ok(uuid, text, text, date), public._sync_community_points(uuid), public._require_user(),
  public.get_progression(), public.record_progress_action(text, text), public.record_peer_progress_action(text, uuid, text),
  public.get_wallet(), public.get_transactions(integer, bigint), public.get_reward_statuses(), public.claim_reward(text),
  public.spend_fitcoins_for_item(text, text), public.get_cosmetic_catalog(), public.get_inventory(),
  public.equip_cosmetic(text), public.unequip_cosmetic(text),
  public.admin_refund_fitcoins(uuid, uuid, text), public.admin_migrate_legacy_fitcoins(uuid, bigint),
  public.admin_grant_cosmetic(uuid, text), public.verify_wallet_ledger(uuid),
  public.tg_progression_stages_consistency(), public.tg_progression_accounts_guard(), public.tg_progression_event_apply(),
  public.tg_fitcoin_wallets_guard(), public.tg_economy_transaction_apply(), public.tg_ledger_immutable(),
  public.tg_ledger_no_truncate(), public.tg_reward_claims_guard()
  from public, anon, authenticated;

grant execute on function
  public.get_progression(), public.record_progress_action(text, text), public.record_peer_progress_action(text, uuid, text),
  public.get_wallet(), public.get_transactions(integer, bigint), public.get_reward_statuses(), public.claim_reward(text),
  public.spend_fitcoins_for_item(text, text), public.get_cosmetic_catalog(), public.get_inventory(),
  public.equip_cosmetic(text), public.unequip_cosmetic(text)
  to authenticated;

grant execute on function
  public.admin_refund_fitcoins(uuid, uuid, text), public.admin_migrate_legacy_fitcoins(uuid, bigint),
  public.admin_grant_cosmetic(uuid, text), public.verify_wallet_ledger(uuid)
  to service_role;
