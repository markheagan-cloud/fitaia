#!/usr/bin/env bash
# Concurrence RÉELLE sur PostgreSQL : sessions psql parallèles (deux appareils, dix requêtes identiques…).
# Une barrière (verrou consultatif tenu par une session « chef d'orchestre ») libère toutes les sessions au même
# instant, pour qu'elles se percutent vraiment sur la ligne du wallet.
#
# Usage (depuis la racine du dépôt) : bash supabase/tests/concurrency.sh
# Variables : PGHOST (défaut /var/lib/postgresql/fitaia-test), PGPORT (54329), PGUSER (postgres), DB (fitaia_p2_concurrency).
set -euo pipefail

cd "$(dirname "$0")/../.."
export PGHOST="${PGHOST:-/var/lib/postgresql/fitaia-test}" PGPORT="${PGPORT:-54329}" PGUSER="${PGUSER:-postgres}"
DB="${DB:-fitaia_p2_concurrency}"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
CHECKS=0

ok() { CHECKS=$((CHECKS + 1)); echo "ok $1"; }
fail() { echo "ÉCHEC : $1" >&2; exit 1; }
admin() { psql -X -q -At -v ON_ERROR_STOP=1 -d "$DB" -c "$1"; }

# Session d'un membre : attend la barrière, puis exécute la requête en « authenticated ».
member() { # $1 = utilisateur, $2 = requête SQL, $3 = fichier de sortie
  psql -X -q -At -v ON_ERROR_STOP=1 -d "$DB" > "$3" 2>&1 <<SQL
do \$\$ begin perform pg_advisory_lock_shared(4242); perform pg_advisory_unlock_shared(4242); end \$\$;
set role authenticated;
set request.jwt.claim.sub = '$1';
$2
SQL
}

# Lance N sessions identiques derrière la barrière puis les libère ensemble.
race() { # $1 = préfixe des sorties ; ensuite paires (utilisateur, requête)
  local prefix=$1; shift
  psql -X -q -At -d "$DB" -c "select pg_advisory_lock(4242); select pg_sleep(1.5);" > /dev/null &
  local chief=$!
  sleep 0.4
  local i=0 pids=()
  while [ $# -gt 0 ]; do
    member "$1" "$2" "$OUT/$prefix.$i" &
    pids+=($!)
    i=$((i + 1)); shift 2
  done
  wait "$chief"
  # Une session en erreur n'arrête pas le script : sa sortie (message d'erreur) est vérifiée juste après.
  for p in "${pids[@]}"; do wait "$p" || true; done
}

echo "Base $DB sur $PGHOST:$PGPORT"
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/supabase_stub.sql -f supabase/migrations/0001_community.sql \
  -f supabase/migrations/0002_progression_economy.sql > /dev/null 2>&1
admin "insert into public.reward_definitions (id, type, amount, unlock_condition) values ('test_grant_400', 'fitcoins', 400, '{\"kind\":\"lifetime_points\",\"atLeast\":0}');"
U1=00000000-0000-0000-0000-0000000000c1   # 10 réclamations identiques
U2=00000000-0000-0000-0000-0000000000c2   # 2 achats de 300 sur 400 (objets différents)
U3=00000000-0000-0000-0000-0000000000c3   # 2 achats du même objet
U4=00000000-0000-0000-0000-0000000000c4   # verrou tenu : l'autre appareil attend
U5=00000000-0000-0000-0000-0000000000c5   # 10 fois le même repas, puis 10 repas différents
admin "insert into auth.users values ('$U1'), ('$U2'), ('$U3'), ('$U4'), ('$U5');"
# Wallets et comptes créés AVANT les courses : les sessions se disputent bien la ligne existante (SELECT … FOR UPDATE),
# et non la création de la ligne (qui sérialise à elle seule).
for u in "$U1" "$U2" "$U3" "$U4" "$U5"; do
  member "$u" "select public.get_wallet() is not null and public.get_progression() is not null;" "$OUT/init.$u"
  [ "$(cat "$OUT/init.$u")" = t ] || fail "initialisation de $u"
done

# 1. Dix réclamations simultanées identiques → une seule transaction créditée.
args=(); for i in $(seq 1 10); do args+=("$U1" "select public.claim_reward('test_grant_400')->>'replayed';"); done
race claim "${args[@]}"
fresh=$(cat "$OUT"/claim.* | grep -cx false || true)
replayed=$(cat "$OUT"/claim.* | grep -cx true || true)
[ "$fresh" = 1 ] && [ "$replayed" = 9 ] || fail "10 réclamations : $fresh écriture(s), $replayed rejeu(x)"
ok "10 réclamations simultanées identiques : 1 écriture, 9 rejeux"
[ "$(admin "select count(*) from public.economy_transactions where user_id = '$U1'")" = 1 ] || fail "plusieurs transactions"
[ "$(admin "select balance from public.fitcoin_wallets where user_id = '$U1'")" = 400 ] || fail "solde différent de 400"
ok "une seule transaction créditée, solde 400"

# 2. Deux appareils dépensent 300 sur 400 (objets différents) → une réussite, un refus, solde 100.
for u in "$U2" "$U3" "$U4"; do
  member "$u" "select public.claim_reward('test_grant_400')->'wallet'->>'balance';" "$OUT/fund.$u" || true
  [ "$(cat "$OUT/fund.$u")" = 400 ] || fail "préparation du wallet $u"
done
race spend "$U2" "select coalesce(public.spend_fitcoins_for_item('top_hoodie_nuit', 'appareil-a-0001')->>'code', 'OK');" \
            "$U2" "select coalesce(public.spend_fitcoins_for_item('jacket_coupe_vent_citron', 'appareil-b-0001')->>'code', 'OK');"
results=$(cat "$OUT"/spend.* | sort | tr '\n' ' ')
[ "$results" = "INSUFFICIENT_FUNDS OK " ] || fail "deux achats de 300 : $results"
ok "deux achats simultanés de 300 sur 400 : un réussit, un échoue (INSUFFICIENT_FUNDS)"
[ "$(admin "select balance from public.fitcoin_wallets where user_id = '$U2'")" = 100 ] || fail "solde final"
[ "$(admin "select count(*) from public.economy_transactions where user_id = '$U2' and balance_after < 0")" = 0 ] || fail "solde négatif"
ok "solde final 100, jamais -200"

# 3. Le même objet acheté au même instant depuis deux appareils → un seul débit.
race same "$U3" "select coalesce(public.spend_fitcoins_for_item('top_hoodie_nuit', 'appareil-a-0002')->>'code', 'OK');" \
           "$U3" "select coalesce(public.spend_fitcoins_for_item('top_hoodie_nuit', 'appareil-b-0002')->>'code', 'OK');"
results=$(cat "$OUT"/same.* | sort | tr '\n' ' ')
[ "$results" = "ALREADY_OWNED OK " ] || fail "même objet : $results"
[ "$(admin "select balance from public.fitcoin_wallets where user_id = '$U3'")" = 100 ] || fail "solde après double achat"
ok "même objet acheté depuis deux appareils : un débit, l'autre ALREADY_OWNED, solde 100"

# 4. Verrou réellement attendu : l'appareil A garde la ligne du wallet 2 s ; l'appareil B attend puis voit 100.
psql -X -q -At -v ON_ERROR_STOP=1 -d "$DB" > "$OUT/lock.a" 2>&1 <<SQL &
set role authenticated;
set request.jwt.claim.sub = '$U4';
begin;
select coalesce(public.spend_fitcoins_for_item('top_hoodie_nuit', 'verrou-a-0001')->>'code', 'OK');
select pg_sleep(2);
commit;
SQL
holder=$!
sleep 0.5
start=$(date +%s%N)
member "$U4" "select coalesce(public.spend_fitcoins_for_item('jacket_coupe_vent_citron', 'verrou-b-0001')->>'code', 'OK');" "$OUT/lock.b" || true
waited_ms=$(( ($(date +%s%N) - start) / 1000000 ))
wait "$holder" || true
[ "$(cat "$OUT/lock.a")" = OK ] && [ "$(cat "$OUT/lock.b")" = INSUFFICIENT_FUNDS ] || fail "verrou : A=$(cat "$OUT/lock.a") B=$(cat "$OUT/lock.b")"
[ "$waited_ms" -ge 1000 ] || fail "B n'a pas attendu le verrou ($waited_ms ms)"
ok "SELECT … FOR UPDATE : l'appareil B a attendu ${waited_ms} ms puis a vu le solde à jour (refus, solde 100)"

# 5. Dix fois le même repas en parallèle → une seule attribution de PF ; dix repas différents → plafond 15 PF.
args=(); for i in $(seq 1 10); do args+=("$U5" "select public.record_progress_action('meal_logged', 'repas-unique')->>'replayed';"); done
race meal "${args[@]}"
[ "$(cat "$OUT"/meal.* | grep -cx false || true)" = 1 ] || fail "même repas : plusieurs attributions"
args=(); for i in $(seq 1 10); do args+=("$U5" "select coalesce(public.record_progress_action('meal_logged', 'repas-$i')->>'code', 'OK');"); done
race meals "${args[@]}"
awarded=$(cat "$OUT"/meals.* | grep -cx OK || true)
[ "$awarded" = 2 ] || fail "repas différents : $awarded attributions au lieu de 2 (plafond 15 PF)"
[ "$(admin "select lifetime_points from public.progression_accounts where user_id = '$U5'")" = 15 ] || fail "PF du jour"
ok "PF en parallèle : même repas une fois, puis plafond de 15 PF/jour respecté (3 repas sur 11)"

# 6. Registres rejoués : chaque wallet est exactement la somme de son registre.
[ "$(admin "select bool_and(public.verify_wallet_ledger(id)) from auth.users")" = t ] || fail "registre incohérent"
ok "vérification du registre après la course : conforme pour les 5 membres"

psql -X -q -d postgres -c "drop database $DB"
echo "TESTS CONCURRENCE OK ($CHECKS vérifications)"
