# Serveur FITAIA (Supabase)

## Fonction `avatar` (selfie → perso dessiné)
1. Créer un projet Supabase (région UE), puis un bucket **privé** `avatars`.
2. `supabase login` · `supabase link --project-ref <ref>`
3. Secrets (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement) :
   - **Gratuit (défaut)** : `supabase secrets set AVATAR_PROVIDER=hf HF_SPACE=<pseudo>/fitaia-avatar HF_TOKEN=hf_...` — Space à créer avec `hf-space/` (Qwen-Image-Edit, Apache 2.0).
   - Payant : `supabase secrets set AVATAR_PROVIDER=openai OPENAI_API_KEY=...`
4. `supabase functions deploy avatar`
5. Dans `app/.env` : `EXPO_PUBLIC_AVATAR_ENDPOINT=https://<ref>.supabase.co/functions/v1/avatar` et `EXPO_PUBLIC_SUPABASE_ANON_KEY=...`

Tant que ces variables sont absentes, l'app est en **mode démo** (aucun dessin réel, annoncé à l'écran).

Coût : 0 € avec le Space ZeroGPU (quota 5 min GPU/jour, PRO 40 min) ; ~0,05 € par dessin avec gpt-image-1. Limite : 5 dessins/heure/IP.
Confidentialité : le selfie transite en mémoire uniquement ; seul le dessin est stocké (bucket privé, URL signée 30 jours).

## Communauté (phase 1) — `migrations/0001_community.sql`
**Prête, non déployée.** L'app tourne en mode « local + démonstration » (`COMMUNITY_MODE = 'local-demo'` dans `src/community/store.ts`) : profils fictifs signalés, réponses simulées, rien n'est envoyé sur Internet.

Contenu : profils (champs de confidentialité, minimum par défaut), vue `community_cards` (champs masqués selon les réglages), amis/FitMates (3 max), `fitmatch_candidates()` (mêmes poids que l'app), discussions via `start_conversation()`, messages avec limites anti-harcèlement (déclencheur), encouragements, blocage (deux sens), signalements (message masqué en revue). Les points ne sont pas modifiables par le client.

Vérification locale (PostgreSQL 16, sans compte Supabase) :
```
createdb t && psql -d t -f supabase/tests/supabase_stub.sql -f supabase/migrations/0001_community.sql -f supabase/tests/community_test.sql
```
Résultat attendu : `TESTS SQL COMMUNAUTE OK` (32 vérifications).

`migrations/0003_community_daily.sql` (passe UX) : état du jour (« Dispo pour parler »…, 12 h) et besoin du jour du « coup de pouce » (privé par défaut, `need_public`), ajoutés à la vue `community_cards`.
```
createdb t && psql -d t -f supabase/tests/supabase_stub.sql -f supabase/migrations/0001_community.sql -f supabase/migrations/0003_community_daily.sql -f supabase/tests/community_test.sql -f supabase/tests/community_daily_test.sql
```
Résultat attendu : `TESTS SQL COMMUNAUTE OK` puis `TESTS SQL COMMUNAUTE (ETAT DU JOUR) OK` (32 + 8 vérifications).

## Progression + Économie (phase 2) — `migrations/0002_progression_economy.sql`
**Prête, NON déployée** (aucun projet Supabase). L'app n'est pas encore branchée : le serveur local de démonstration
(`src/backend/local/`) applique les mêmes règles en attendant ; l'adaptateur Supabase (`src/backend/supabase/`) appelle
ces fonctions et a été vérifié contre PostgreSQL 16 local, jamais contre un vrai projet Supabase.

Contenu : réglages (fuseau, saisons, migration), étapes du Parcours (`progression_stages`), règles des PF
(`progression_rules`, liste d'actions fermée par `CHECK`), comptes de progression et registre des PF, catalogue
cosmétique et exclusions d'emplacements, wallets Fitcoins (`CHECK balance >= 0`, solde = projection du registre),
registre Fitcoins immuable (clés d'idempotence `UNIQUE`, rang et soldes calculés par déclencheur), récompenses
(`fitcoins | cosmetic | badge | capsule`) et réclamations, inventaire et objets portés (clés étrangères : on ne porte
qu'un objet possédé, dans sa catégorie). RLS : chacun lit ses lignes ; aucune écriture directe des clients.

Fonctions de l'app (`authenticated`, utilisateur = `auth.uid()`) : `get_progression`, `record_progress_action`,
`record_peer_progress_action`, `get_wallet`, `get_transactions`, `get_reward_statuses`, `claim_reward`,
`spend_fitcoins_for_item`, `get_cosmetic_catalog`, `get_inventory`, `equip_cosmetic`, `unequip_cosmetic`.
Opérations serveur (`service_role` seulement) : `admin_refund_fitcoins`, `admin_migrate_legacy_fitcoins`,
`admin_grant_cosmetic`, `verify_wallet_ledger`. Les PF permanents alimentent `community_profiles.points` (FitMatch).

Vérification locale (PostgreSQL 16 + bouchon Supabase), depuis la racine du dépôt :
```
createdb t2 && psql -d t2 -f supabase/tests/supabase_stub.sql -f supabase/migrations/0001_community.sql \
  -f supabase/migrations/0002_progression_economy.sql -f supabase/tests/progression_economy_test.sql
```
Résultat attendu : `TESTS SQL PROGRESSION ECONOMIE OK` (115 vérifications ; chaque refus est contrôlé sur son motif).
Non-régression : `community_test.sql` rejoué sur une base avec 0001 + 0002 → `TESTS SQL COMMUNAUTE OK` (32).

Concurrence réelle (sessions psql parallèles, barrière par verrou consultatif) :
```
bash supabase/tests/concurrency.sh      # PGHOST / PGPORT / PGUSER configurables
```
Résultat attendu : `TESTS CONCURRENCE OK (8 vérifications)` — 10 réclamations identiques → 1 transaction ; 2 achats de
300 sur 400 → 1 succès, 1 refus, solde 100 ; même objet sur deux appareils ; attente réelle du verrou ; plafond de PF.

Contrat de l'adaptateur Supabase et synchronisation avec la configuration TypeScript (Node ≥ 22.6) :
```
node --experimental-strip-types --no-warnings --import ../ts-hook.mjs supabase/tests/repository_contract.test.ts   # 78
node --experimental-strip-types --no-warnings --import ../ts-hook.mjs supabase/tests/seed_sync.test.ts             # 16
```
`repository_contract` crée sa propre base, applique 0001 + 0002 et rejoue la suite de conformité à travers
`createSupabaseRepositories` (une session psql par appel) ; sans PostgreSQL joignable il échoue, il ne se déclare
jamais réussi sans avoir tourné.
