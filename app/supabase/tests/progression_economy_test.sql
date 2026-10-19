-- Test de comportement de 0002_progression_economy.sql (après le bouchon Supabase et 0001_community.sql).
-- Membres « authenticated » (request.jwt.claim.sub), opérations serveur en « service_role », gardes du registre
-- vérifiées même pour le propriétaire de la base.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'ok %', label;
end $$;
-- attend une erreur, et la BONNE erreur (motif attendu dans le message) : un refus pour une autre raison est un échec
create or replace function pg_temp.fails(q text, label text, expected text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if sqlerrm !~* expected then raise exception 'ÉCHEC : % (refusé pour une autre raison : %)', label, sqlerrm; end if;
    raise notice 'ok % (refusé : %)', label, sqlerrm; return;
  end;
  raise exception 'ÉCHEC : % (aurait dû être refusé)', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated, anon, service_role;

insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c'),
 ('00000000-0000-0000-0000-00000000000d'), ('00000000-0000-0000-0000-00000000000e');
-- profil social de A (0001) : ses points viendront désormais du registre des PF
insert into public.community_profiles (user_id, display_name, avatar_id, age_range, goal_category)
values ('00000000-0000-0000-0000-00000000000a', 'Alice', 'a1', '25-30', 'perdre');
-- récompenses de test (le serveur seul peut en créer)
insert into public.reward_definitions (id, type, amount, cosmetic_item_id, unlock_condition, repeatable) values
 ('test_grant_400', 'fitcoins', 400, null, '{"kind":"lifetime_points","atLeast":0}', false),
 ('test_reward_tee', 'cosmetic', 1, 'top_tee_graphite', '{"kind":"lifetime_points","atLeast":0}', false),
 ('test_capsule', 'capsule', 1, null, '{"kind":"lifetime_points","atLeast":0}', false),
 ('test_stage_elan', 'badge', 1, null, '{"kind":"stage_reached","stageId":"elan"}', false);

-- ------------------------------------------------------------------ configuration et calendrier serveur
select pg_temp.check((select count(*) from public.progression_rules) = 6, 'six règles de PF');
select pg_temp.check((select points = 5 and daily_cap = 15 from public.progression_rules where action_type = 'meal_logged'), 'repas : +5, max 15/jour');
select pg_temp.check((select string_agg(stage_id || ':' || min_points, ',' order by rank) from public.progression_stages) = 'declic:0,elan:500,regulier:1500,engage:3500,confirme:7000,pilier:12000', 'étapes du Parcours');
select pg_temp.check(public.progression_day('2026-10-04 21:59:00+00') = date '2026-10-04' and public.progression_day('2026-10-04 22:00:00+00') = date '2026-10-05', 'jour serveur à Paris (UTC+2)');
select pg_temp.check(public.progression_day('2026-10-25 23:00:00+00') = date '2026-10-26', 'jour serveur après l’heure d’hiver (UTC+1)');
select pg_temp.check(public.progression_week(date '2026-10-04') = date '2026-09-28' and public.progression_week(date '2026-10-05') = date '2026-10-05', 'semaine = lundi');
select pg_temp.check(public.progression_season(date '2026-09-30') = 'S0' and public.progression_season(date '2026-10-01') = 'S1' and public.progression_season(date '2026-11-26') = 'S2', 'saisons de 56 jours');
select pg_temp.fails($q$insert into public.progression_rules values ('manger_moins', 50, 50, 'self', 'source', 'declarative', true)$q$, 'liste fermée : impossible d’ajouter une action « manger moins »', 'progression_rules_action_type_check');
select pg_temp.fails($q$update public.progression_stages set min_points = 600 where stage_id = 'declic'$q$, 'étapes incohérentes refusées (première étape à 0 PF)', 'étapes incohérentes');
select pg_temp.fails($q$insert into public.reward_definitions (id, type, amount, unlock_condition, repeatable) values ('bad_repeat', 'fitcoins', 5, '{"kind":"lifetime_points","atLeast":1}', true)$q$, 'seule une récompense quotidienne peut être répétable', 'reward_definitions_check');
select pg_temp.fails($q$insert into public.cosmetic_items (id, name, category, rarity, asset_reference, source, price_fitcoins) values ('prestige_payant', 'X', 'TOP', 'RARE', 'a', 'PRESTIGE', 10)$q$, 'un objet de prestige n’a jamais de prix', 'cosmetic_items_check');

-- ------------------------------------------------------------------ membre A : PF, plafonds, idempotence
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((public.get_progression()->>'lifetimePoints')::int = 0 and public.get_progression()->>'currentStage' = 'declic', 'nouveau compte : 0 PF, Déclic');
select pg_temp.check((public.record_progress_action('meal_logged', 'meal-1')->'award'->>'points')::int = 5, 'repas : +5 PF calculés par le serveur');
select pg_temp.check((public.record_progress_action('meal_logged', 'meal-1')->>'replayed')::boolean, 'même repas : rejoué');
select pg_temp.check((public.record_progress_action('meal_logged', 'meal-2')->>'ok')::boolean and (public.record_progress_action('meal_logged', 'meal-3')->>'ok')::boolean, 'deuxième et troisième repas');
select pg_temp.check(public.record_progress_action('meal_logged', 'meal-4')->>'code' = 'DAILY_CAP_REACHED', 'quatrième repas : plafond quotidien');
select pg_temp.check((public.record_progress_action('daily_goal_completed', 'peu-importe')->'award'->>'sourceId') = to_char((now() at time zone 'Europe/Paris')::date, 'YYYY-MM-DD'),
                     'objectif quotidien : +20 PF, source = jour serveur (Paris), jamais celle du client');
select pg_temp.check((public.record_progress_action('daily_goal_completed')->>'replayed')::boolean, 'objectif quotidien : une fois par jour');
select pg_temp.check(public.record_progress_action('meal_logged', 'pas valide !')->>'code' = 'INVALID_SOURCE', 'source invalide refusée');
select pg_temp.check(public.record_progress_action('jeune_intermittent', 'x-1')->>'code' = 'UNKNOWN_ACTION', 'action inconnue refusée');
select pg_temp.check(public.record_progress_action('tip_marked_helpful', 'tip-1')->>'code' = 'WRONG_GRANT_MODE', 'entraide impossible à s’attribuer');
select pg_temp.check((public.get_progression()->>'lifetimePoints')::int = 35, 'total : 15 (repas) + 20 (objectif) = 35 PF');
select pg_temp.check((select count(*) from public.progression_events) = 4, 'registre des PF : 4 attributions, aucune pour les rejeux ou refus');
select pg_temp.check((select points from public.community_profiles where user_id = '00000000-0000-0000-0000-00000000000a') = 35, 'profil social : points = PF permanents du registre (FitMatch)');

-- preuve serveur : l'encouragement doit exister dans la table de 0001, venir de moi, aujourd'hui
insert into public.encouragements (id, from_id, to_id) values ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
select pg_temp.check((public.record_progress_action('encouragement_sent', '11111111-1111-4111-8111-111111111111')->'award'->>'points')::int = 2, 'encouragement réel : +2 PF');
select pg_temp.check(public.record_progress_action('encouragement_sent', '22222222-2222-4222-8222-222222222222')->>'code' = 'NOT_VERIFIED', 'encouragement inventé : refusé');
select pg_temp.check(public.record_progress_action('encouragement_sent', 'pas-un-uuid')->>'code' = 'NOT_VERIFIED', 'encouragement mal formé : refusé');

-- entraide accordée à B
select pg_temp.check((public.record_peer_progress_action('tip_marked_helpful', '00000000-0000-0000-0000-00000000000b', 'tip-9')->>'points')::int = 5, 'conseil « Ça m’aide » : +5 PF pour l’auteur');
select pg_temp.check((public.record_peer_progress_action('tip_marked_helpful', '00000000-0000-0000-0000-00000000000b', 'tip-9')->>'replayed')::boolean, 'même conseil : rejoué');
select pg_temp.check(public.record_peer_progress_action('tip_marked_helpful', '00000000-0000-0000-0000-00000000000a', 'tip-9')->>'code' = 'SELF_PEER_FORBIDDEN', 'pas d’entraide envers soi-même');
select pg_temp.check(public.record_peer_progress_action('tip_marked_helpful', '00000000-0000-0000-0000-0000000000ff', 'tip-9')->>'code' = 'UNKNOWN_TARGET', 'membre inexistant refusé');
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c');
select pg_temp.check(public.record_peer_progress_action('tip_marked_helpful', '00000000-0000-0000-0000-00000000000c', 'tip-9')->>'code' = 'BLOCKED', 'membre bloqué : refusé');
select pg_temp.check(not (public.record_peer_progress_action('tip_marked_helpful', '00000000-0000-0000-0000-00000000000b', 'tip-9') ? 'account'), 'le demandeur ne voit jamais le compte de l’autre');

-- ------------------------------------------------------------------ récompenses
select pg_temp.check(public.claim_reward('milestone_900')->>'code' = 'NOT_ELIGIBLE', 'palier 900 PF non atteint : refusé');
select pg_temp.check(public.claim_reward('test_stage_elan')->>'code' = 'NOT_ELIGIBLE', 'récompense d’étape Élan refusée à Déclic');
select pg_temp.check(public.claim_reward('inconnue')->>'code' = 'UNKNOWN_REWARD', 'récompense inconnue');
select pg_temp.check((public.claim_reward('daily_goal')->'transaction'->>'amount')::int = 10, 'récompense quotidienne : +10 Fitcoins');
select pg_temp.check((public.claim_reward('daily_goal')->>'replayed')::boolean, 'récompense quotidienne : rejouée');
select pg_temp.check((public.claim_reward('test_grant_400')->'wallet'->>'balance')::int = 410, 'wallet : 410');
select pg_temp.check((public.claim_reward('test_grant_400')->>'replayed')::boolean and (public.get_wallet()->>'balance')::int = 410, 'double réclamation : une seule récompense');
select pg_temp.check((select count(*) from public.economy_transactions) = 2, 'registre : 2 transactions');
select pg_temp.check(public.claim_reward('test_capsule')->'claim'->>'status' = 'pending', 'capsule : en attente (Phase 5)');
select pg_temp.check(exists (select 1 from public.get_reward_statuses() s(x), jsonb_array_elements(s.x) e where e->'reward'->>'id' = 'daily_goal' and e->>'state' = 'claimed'), 'état des récompenses : quotidienne récupérée');
-- règle ou récompense désactivée APRÈS coup : la demande déjà traitée est rejouée, une nouvelle est refusée
reset role;
update public.progression_rules set enabled = false where action_type = 'meal_logged';
update public.reward_definitions set enabled = false where id = 'test_grant_400';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((public.record_progress_action('meal_logged', 'meal-1')->>'replayed')::boolean
                     and public.record_progress_action('meal_logged', 'meal-9')->>'code' = 'ACTION_DISABLED', 'action désactivée : rejeu conservé, nouvelle demande refusée');
select pg_temp.check((public.claim_reward('test_grant_400')->>'replayed')::boolean, 'récompense désactivée : la réclamation déjà faite est rejouée');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check(public.claim_reward('test_grant_400')->>'code' = 'REWARD_DISABLED', 'récompense désactivée : refusée aux autres');
reset role;
update public.progression_rules set enabled = true where action_type = 'meal_logged';
update public.reward_definitions set enabled = true where id = 'test_grant_400';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

-- ------------------------------------------------------------------ dépenses et inventaire
select pg_temp.check((public.spend_fitcoins_for_item('top_hoodie_nuit', 'achat-0001')->'wallet'->>'balance')::int = 110, 'achat 300 : solde 110');
select pg_temp.check((public.spend_fitcoins_for_item('top_hoodie_nuit', 'achat-0001')->>'replayed')::boolean, 'même demande : rejouée');
select pg_temp.check(public.spend_fitcoins_for_item('top_hoodie_nuit', 'achat-0002')->>'code' = 'ALREADY_OWNED', 'déjà possédé');
select pg_temp.check(public.spend_fitcoins_for_item('top_tee_graphite', 'achat-0001')->>'code' = 'IDEMPOTENCY_KEY_REUSED', 'clé réutilisée pour un autre objet');
select pg_temp.check(public.spend_fitcoins_for_item('jacket_october_crew', 'achat-0003')->>'code' = 'NOT_FOR_SALE', 'prestige : non achetable');
select pg_temp.check(public.spend_fitcoins_for_item('head_bonnet_hiver', 'achat-0004')->>'code' = 'ITEM_DISABLED', 'objet désactivé');
select pg_temp.check(public.spend_fitcoins_for_item('shoes_runner_lime', 'achat-0005')->>'code' = 'INSUFFICIENT_FUNDS', 'fonds insuffisants (600 > 110)');
select pg_temp.check((public.get_wallet()->>'balance')::int = 110, 'solde intact après les refus');
select pg_temp.check((public.claim_reward('test_reward_tee')->'item'->>'duplicate')::boolean = false, 'récompense cosmétique : objet ajouté');
select pg_temp.check(public.equip_cosmetic('shoes_runner_lime')->>'code' = 'NOT_OWNED', 'impossible d’équiper un objet non possédé');
select pg_temp.check(public.equip_cosmetic('top_hoodie_nuit')->'equipped'->>'TOP' = 'top_hoodie_nuit', 'équiper le hoodie');
select pg_temp.check(public.equip_cosmetic('top_tee_graphite')->'unequipped' = '["top_hoodie_nuit"]'::jsonb, 'un objet par emplacement');
select pg_temp.check(public.unequip_cosmetic('TOP')->'equipped' = '{}'::jsonb, 'retirer le haut');
select pg_temp.check(public.unequip_cosmetic('CAPE')->>'code' = 'INVALID_SLOT', 'emplacement inconnu');
select pg_temp.check((public.equip_cosmetic('top_hoodie_nuit')->>'changed')::boolean, 'remettre le hoodie');
select pg_temp.check((public.get_inventory()->'items') @> '[{"itemId":"top_hoodie_nuit","acquiredVia":"purchase"},{"itemId":"top_tee_graphite","acquiredVia":"reward"}]'::jsonb, 'inventaire : achat et récompense');

-- ------------------------------------------------------------------ RLS et écritures directes interdites aux clients
select pg_temp.check((select count(*) from public.fitcoin_wallets) = 1 and (select count(*) from public.progression_accounts) = 1, 'chacun ne voit que ses lignes');
select pg_temp.fails($q$update public.fitcoin_wallets set balance = 999999$q$, 'client : solde arbitraire impossible', 'permission denied');
select pg_temp.fails($q$insert into public.economy_transactions (user_id, type, amount, reason, source_type, source_id, idempotency_key) values ('00000000-0000-0000-0000-00000000000a', 'earn', 5000, 'daily_reward', 'reward', 'x', 'triche')$q$, 'client : écriture directe dans le registre impossible', 'permission denied');
select pg_temp.fails($q$insert into public.progression_events (user_id, action_type, source_id, points, idempotency_key) values ('00000000-0000-0000-0000-00000000000a', 'challenge_completed', 'x', 50, 'triche')$q$, 'client : PF arbitraires impossibles', 'permission denied');
select pg_temp.fails($q$update public.progression_accounts set lifetime_points = 99999$q$, 'client : progression arbitraire impossible', 'permission denied');
select pg_temp.fails($q$insert into public.user_inventory (user_id, item_id, acquired_via) values ('00000000-0000-0000-0000-00000000000a', 'shoes_runner_lime', 'grant')$q$, 'client : objet gratuit impossible', 'permission denied');
select pg_temp.fails($q$delete from public.economy_transactions$q$, 'client : effacer le registre impossible', 'permission denied');
select pg_temp.fails($q$select * from public.economy_settings$q$, 'client : réglages économiques internes illisibles', 'permission denied');
select pg_temp.fails($q$select public._wallet_ensure('00000000-0000-0000-0000-00000000000a')$q$, 'client : fonctions internes inaccessibles', 'permission denied');
select pg_temp.fails($q$select public.admin_refund_fitcoins('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'support')$q$, 'client : remboursement réservé au serveur', 'permission denied');
select pg_temp.fails($q$select public.admin_migrate_legacy_fitcoins('00000000-0000-0000-0000-00000000000a', 1000000)$q$, 'client : migration réservée au serveur', 'permission denied');
select pg_temp.fails($q$select public.progression_day(now())$q$, 'client : calendrier interne inaccessible', 'permission denied');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) from public.economy_transactions) = 0 and (public.get_progression()->>'lifetimePoints')::int = 5, 'B ne voit pas le registre de A ; B a reçu 5 PF d’entraide');
reset role;
set role anon;
set request.jwt.claim.sub = '';
select pg_temp.fails($q$select public.get_wallet()$q$, 'anonyme : aucune fonction économique', 'permission denied');
select pg_temp.fails($q$select * from public.economy_transactions$q$, 'anonyme : aucune lecture du registre', 'permission denied');
reset role;
set role authenticated;
set request.jwt.claim.sub = '';
select pg_temp.fails($q$select public.get_wallet()$q$, 'session sans utilisateur : refusée', 'non connecté');
reset role;

-- ------------------------------------------------------------------ gardes du registre, même pour le propriétaire de la base
select pg_temp.fails($q$update public.fitcoin_wallets set balance = balance + 500 where user_id = '00000000-0000-0000-0000-00000000000a'$q$, 'propriétaire : solde modifiable uniquement par le registre', 'uniquement par le registre');
select pg_temp.fails($q$insert into public.fitcoin_wallets (user_id, balance, lifetime_earned) values ('00000000-0000-0000-0000-00000000000d', 500, 500)$q$, 'propriétaire : un wallet commence à 0', 'commence à 0');
select pg_temp.fails($q$update public.economy_transactions set amount = amount * 10$q$, 'propriétaire : registre immuable (UPDATE)', 'registre immuable : update');
select pg_temp.fails($q$delete from public.economy_transactions where user_id = '00000000-0000-0000-0000-00000000000a'$q$, 'propriétaire : registre immuable (DELETE)', 'registre immuable : delete');
select pg_temp.fails($q$truncate public.economy_transactions cascade$q$, 'propriétaire : registre immuable (TRUNCATE)', 'registre immuable : truncate');
select pg_temp.fails($q$update public.progression_events set points = 50$q$, 'propriétaire : registre des PF immuable (UPDATE)', 'registre immuable : update');
select pg_temp.fails($q$delete from public.progression_events$q$, 'propriétaire : registre des PF immuable (DELETE)', 'registre immuable : delete');
select pg_temp.fails($q$update public.progression_events set actor_id = null where actor_id is not null$q$, 'propriétaire : auteur d’une entraide non effaçable tant que son compte existe', 'registre immuable : update');
select pg_temp.fails($q$update public.progression_accounts set lifetime_points = 99999$q$, 'propriétaire : progression modifiable uniquement par le registre des PF', 'uniquement par le registre des PF');
select pg_temp.fails($q$update public.reward_claims set status = 'pending' where status = 'fulfilled'$q$, 'propriétaire : réclamation remise immuable', 'réclamation immuable');
select pg_temp.fails($q$delete from public.reward_claims$q$, 'propriétaire : réclamation non effaçable', 'réclamation immuable');
update public.reward_claims set status = 'fulfilled' where reward_id = 'test_capsule';
select pg_temp.check((select fulfilled_at is not null from public.reward_claims where reward_id = 'test_capsule'), 'capsule : seule évolution permise pending → fulfilled (branchement Phase 5)');
select pg_temp.fails($q$insert into public.economy_transactions (user_id, type, amount, reason, source_type, source_id, idempotency_key) values ('00000000-0000-0000-0000-00000000000a', 'spend', -5000, 'cosmetic_purchase', 'cosmetic_item', 'x', 'trou')$q$, 'propriétaire : débit au-delà du solde refusé (jamais négatif)', 'solde insuffisant');
insert into public.economy_transactions (user_id, sequence, type, amount, balance_before, balance_after, reason, source_type, source_id, idempotency_key)
values ('00000000-0000-0000-0000-00000000000a', 77, 'earn', 5, 9999, 10004, 'stage_reward', 'reward', 'manuel', 'manuel-1');
select pg_temp.check((select sequence = 4 and balance_before = 110 and balance_after = 115 from public.economy_transactions where idempotency_key = 'manuel-1'), 'rang et soldes avant/après recalculés par le registre, jamais fournis');
select pg_temp.check((select balance from public.fitcoin_wallets where user_id = '00000000-0000-0000-0000-00000000000a') = 115, 'wallet = projection du registre');
select pg_temp.fails($q$insert into public.progression_events (user_id, action_type, source_id, points, idempotency_key) values ('00000000-0000-0000-0000-00000000000a', 'meal_logged', 'manuel', 5, 'pf-manuel')$q$, 'même le serveur ne dépasse pas le plafond du jour (déclencheur)', 'plafond quotidien');
select pg_temp.fails($q$insert into public.user_equipped_cosmetics (user_id, slot, item_id) values ('00000000-0000-0000-0000-00000000000a', 'SHOES', 'shoes_runner_lime')$q$, 'base : impossible de porter un objet non possédé', 'user_equipped_cosmetics_user_id_item_id_fkey');
select pg_temp.fails($q$insert into public.user_equipped_cosmetics (user_id, slot, item_id) values ('00000000-0000-0000-0000-00000000000a', 'SHOES', 'top_hoodie_nuit')$q$, 'base : un objet ne se porte que dans sa catégorie', 'user_equipped_cosmetics_item_id_slot_fkey');

-- ------------------------------------------------------------------ opérations serveur (service_role)
set role service_role;
select (select id from public.economy_transactions where reason = 'cosmetic_purchase' and user_id = '00000000-0000-0000-0000-00000000000a') as hoodie_tx \gset
select pg_temp.check((public.admin_refund_fitcoins('00000000-0000-0000-0000-00000000000a', :'hoodie_tx', 'support')->'wallet'->>'balance')::int = 415, 'remboursement : +300');
select pg_temp.check((public.admin_refund_fitcoins('00000000-0000-0000-0000-00000000000a', :'hoodie_tx', 'support')->>'replayed')::boolean, 'remboursement rejoué : un seul crédit');
select pg_temp.check(not exists (select 1 from public.user_inventory where user_id = '00000000-0000-0000-0000-00000000000a' and item_id = 'top_hoodie_nuit')
                     and not exists (select 1 from public.user_equipped_cosmetics where item_id = 'top_hoodie_nuit'), 'remboursement : objet retiré et déséquipé');
select pg_temp.check(public.admin_refund_fitcoins('00000000-0000-0000-0000-00000000000a', (select id from public.economy_transactions where reason = 'daily_reward'), 'support')->>'code' = 'NOT_REFUNDABLE', 'un gain n’est pas remboursable');
select pg_temp.check(public.admin_refund_fitcoins('00000000-0000-0000-0000-00000000000a', :'hoodie_tx', 'parce que')->>'code' = 'INVALID_REASON', 'motif de remboursement contrôlé');
select pg_temp.check((public.admin_migrate_legacy_fitcoins('00000000-0000-0000-0000-00000000000d', 12400)->'transaction'->>'amount')::int = 1240, 'migration : 12 400 crédits → 1 240 Fitcoins');
select pg_temp.check((public.admin_migrate_legacy_fitcoins('00000000-0000-0000-0000-00000000000d', 99999)->>'replayed')::boolean, 'migration : une seule fois');
select pg_temp.check((public.admin_migrate_legacy_fitcoins('00000000-0000-0000-0000-00000000000e', 50000000)->'transaction'->>'amount')::int = 2000, 'migration plafonnée à 2 000');
select pg_temp.check((public.admin_grant_cosmetic('00000000-0000-0000-0000-00000000000a', 'top_tee_graphite')->>'acquired')::boolean = false, 'attribution serveur : doublon ignoré');
select pg_temp.check(public.verify_wallet_ledger('00000000-0000-0000-0000-00000000000a') and public.verify_wallet_ledger('00000000-0000-0000-0000-00000000000d')
                     and public.verify_wallet_ledger('00000000-0000-0000-0000-00000000000b'), 'reconstruction : registre rejoué = wallet');
reset role;
select pg_temp.check((select sum(amount) from public.economy_transactions where user_id = '00000000-0000-0000-0000-00000000000a')
                     = (select balance from public.fitcoin_wallets where user_id = '00000000-0000-0000-0000-00000000000a'), 'somme du registre = solde (415)');

-- ------------------------------------------------------------------ étape courante, meilleur niveau historique
update public.progression_stages set min_points = 30 where stage_id = 'elan';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check(public.record_progress_action('challenge_completed', 'defi-1')->'stageChange' = '{"from":"declic","to":"elan"}'::jsonb, 'passage d’étape Déclic → Élan signalé');
select pg_temp.check((public.claim_reward('test_stage_elan')->>'ok')::boolean, 'récompense d’étape Élan débloquée');
reset role;
update public.progression_stages set min_points = 500 where stage_id = 'elan';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check(public.get_progression()->>'currentStage' = 'declic' and public.get_progression()->>'highestHistoricalStage' = 'elan', 'seuils rééquilibrés : étape courante Déclic, meilleur niveau historique Élan conservé');
reset role;

-- ------------------------------------------------------------------ effacement d'un compte (RGPD)
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check(not exists (select 1 from public.economy_transactions where user_id = '00000000-0000-0000-0000-00000000000a')
                     and not exists (select 1 from public.progression_events where user_id = '00000000-0000-0000-0000-00000000000a'), 'compte effacé : ses registres partent avec lui');
select pg_temp.check((select actor_id is null and points = 5 from public.progression_events where user_id = '00000000-0000-0000-0000-00000000000b'), 'PF d’entraide reçus par B conservés, auteur anonymisé');
select pg_temp.check(public.verify_wallet_ledger('00000000-0000-0000-0000-00000000000d'), 'les autres registres restent intacts');

-- ------------------------------------------------------------------ droits : seules les 12 fonctions de l'app sont exécutables par un membre
select pg_temp.check((
  select string_agg(p.proname, ',' order by p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and p.proname not in ('tg_profiles_guard','is_blocked','is_friend','tg_friendships_guard','tg_blocks_after','stage_of','age_mid',
                          'jaccard','progression_similarity','fitmatch_candidates','is_member','can_message','start_conversation',
                          'tg_messages_guard','tg_encouragements_guard','tg_reports_after')
) = 'claim_reward,equip_cosmetic,get_cosmetic_catalog,get_inventory,get_progression,get_reward_statuses,get_transactions,get_wallet,record_peer_progress_action,record_progress_action,spend_fitcoins_for_item,unequip_cosmetic',
'droits : un membre n’exécute que les 12 fonctions de l’app (aucune aide interne, aucune opération serveur)');
select pg_temp.check(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
    and p.proname in ('claim_reward','spend_fitcoins_for_item','record_progress_action','get_wallet','admin_refund_fitcoins','_wallet_ensure')
), 'droits : un anonyme n’exécute aucune fonction économique');

\echo TESTS SQL PROGRESSION ECONOMIE OK
