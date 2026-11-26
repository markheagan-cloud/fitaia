-- Rythme de déblocage de la boutique (26/11/2026, app/docs/ECONOMIE.md) : premier défi +100 Fitcoins, puis un bonus
-- à chaque étape du Parcours. Mêmes valeurs que src/economy/rewardCatalog.ts (vérifié par supabase/tests/seed_sync.test.ts).
insert into public.reward_definitions (id, type, amount, cosmetic_item_id, unlock_condition, repeatable, enabled) values
  ('first_challenge', 'fitcoins', 100, null, '{"kind":"lifetime_points","atLeast":50}', false, true),
  ('stage_elan', 'fitcoins', 150, null, '{"kind":"stage_reached","stageId":"elan"}', false, true),
  ('stage_regulier', 'fitcoins', 250, null, '{"kind":"stage_reached","stageId":"regulier"}', false, true),
  ('stage_engage', 'fitcoins', 400, null, '{"kind":"stage_reached","stageId":"engage"}', false, true),
  ('stage_confirme', 'fitcoins', 600, null, '{"kind":"stage_reached","stageId":"confirme"}', false, true),
  ('stage_pilier', 'fitcoins', 1000, null, '{"kind":"stage_reached","stageId":"pilier"}', false, true)
on conflict (id) do nothing;
