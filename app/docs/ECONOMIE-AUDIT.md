# Audit de l’économie existante (avant Phase 2)

Date : 4 octobre 2026. Périmètre lu (sans modification) : `src/store/useGame.ts`, `src/store/economy.ts`,
`src/data/content.ts`, `src/services/purchases.ts`, `src/community/hooks/usePoints.ts`,
`src/community/models/types.ts`, `src/social/fitmatch/matching.ts`, `app/(tabs)/boutique.tsx`,
`supabase/migrations/0001_community.sql`. Référence : spécification fondateur, section C.

## 1. Ce qui existe aujourd’hui

| Élément | Où | Comportement actuel |
|---|---|---|
| Monnaie gagnée `earn`, affichée « FIT Crédits » | `useGame.ts` (`earn`, `credit()`) | Solde de démonstration **12 400** au premier lancement. Gagnée par : défi du jour +500 (+100 / +250 de série), repas +300 ou +100 (3 par jour), défis bonus +300 à +600, coffre hebdomadaire +5 000. |
| Monnaie achetée `prem`, affichée « FIT Points » | `useGame.ts` (`prem`, `buyPack`, `buyPass`) | Solde de démonstration **35**. « Recharge » par packs (0,99 € à 9,99 €) et Pass Élite (950). |
| Grand livre | `useGame.ts` `ledger` | `{ id, ts, amount, cur, reason }`, **tronqué aux 200 dernières lignes**, stocké sur le téléphone. |
| Journal du jour | `useGame.ts` `history[jour] = { challenges, meals, earned }` | Sert à la série, aux jours actifs, au coffre et au pass de saison. |
| Pass de saison | `economy.ts` `seasonProgress()` | Paliers calculés à partir de `history.earned` (crédits gagnés déclarés par le téléphone). |
| Tenues | `content.ts` `SKINS`, `useGame.ts` `skinAct()` | 6 portraits complets (`origine`, `cargo`, `olive`, `creme`, `titane`, `atelier`), achetés en `earn` ou en `prem`. |
| Points de communauté (provisoires) | `community/hooks/usePoints.ts` | `somme des gains earn du grand livre / 2`. |
| Étapes du Parcours | `community/models/types.ts` `STAGES` (ids 1 à 6), `0001` `stage_of()` | Mêmes seuils que la spécification (0 / 500 / 1 500 / 3 500 / 7 000 / 12 000), utilisés par FitMatch et les cartes de confidentialité. |
| Achats réels | `services/purchases.ts` | RevenueCat chargé seulement en build natif avec clé ; ne gère que l’abonnement **FITAIA Plus** (droit `plus`). Aucun produit consommable « FIT Points ». |

**Constat central** : tout est décidé par le téléphone. Le montant, l’éligibilité, le plafond, la date, le hasard du
coffre, le prix et le débit sont calculés dans `useGame.ts` puis écrits par `set({ earn: S.earn + amount })` :
exactement le `wallet.balance += 500` côté client que la spécification interdit.

## 2. Écarts avec la spécification C

| # | Écart | Gravité | Traitement Phase 2 |
|---|---|---|---|
| 1 | Montants et soldes calculés et écrits par le client (`credit()`), modifiables via AsyncStorage. | Bloquant | Serveur autoritaire (local de démo puis SQL) : le client n’envoie que des identifiants. |
| 2 | Grand livre tronqué à 200 lignes : impossible de reconstruire « j’avais 800, j’en ai 300 ». | Bloquant | Registre complet et immuable, rejeu testé (`replayLedger`, `verify_wallet_ledger`). |
| 3 | Aucune idempotence : une double exécution crédite deux fois. | Bloquant | Clés uniques (`reward:…`, `pf:…`, `purchase:…`, `refund:…`, `migration:…`). |
| 4 | Aucune protection de concurrence. | Bloquant | Verrou par membre (local) et `SELECT … FOR UPDATE` (SQL), testés en parallèle réel. |
| 5 | **Récompense de repas dépendante du contenu** : `mealScore()` pénalise les repas copieux. Mesuré : blanc de poulet seul de 120 kcal → score 98 → **300** crédits ; repas complet de 950 kcal → score 66 → **100** crédits. Cela récompense le fait de manger moins (règle 7). | Élevée (santé) | PF : « repas enregistré » = **+5 fixe**, indépendant du contenu, plafonné à 15/jour. À l’intégration UI, ne plus afficher de gain lié au score. |
| 6 | `setGoal()` accepte un objectif à **800 kcal/jour** (`Math.max(800, …)`). Si « objectif quotidien terminé » était un respect de budget calorique, on récompenserait un déficit extrême. | Élevée (santé) | La règle PF `daily_goal_completed` doit désigner un objectif d’**actions** raisonnable (bouger, enregistrer ses repas…), jamais « rester sous X kcal ». À décider à l’intégration (question ouverte). |
| 7 | Points de communauté = gains du grand livre tronqué : ils **baissent** quand les vieilles lignes sortent des 200. | Moyenne | `lifetimePoints` permanent + `highestHistoricalStage` ; 0002 alimente `community_profiles.points` depuis le registre des PF. |
| 8 | « Points de communauté » dérivés d’une monnaie : la progression dépend de l’économie. | Moyenne | Séparation stricte : PF (progression) ≠ Fitcoins (monnaie), deux registres distincts. |
| 9 | Coffre : tenue rare tirée au hasard sur le téléphone (`Math.random`). | Moyenne | Récompenses définies côté serveur ; type `capsule` prévu (ouverture en Phase 5, côté serveur). |
| 10 | Pass de saison calculé sur des crédits déclarés par le téléphone. | Moyenne | `seasonPoints` serveur (remise à zéro par saison) pour les futures Saisons. |
| 11 | **Recharge simulée affichée près de « Paiement Apple »** : `buyPack()` crédite `prem` sans aucun paiement (le motif du journal et le toast disent « paiement simulé », mais l’en-tête de la section affiche « Paiement Apple » et des prix en euros). | Élevée (confiance, règles Apple) | Hors périmètre de cette tâche (pas de modification d’écran). Recommandation : masquer la section « Recharger » tant qu’aucun produit consommable réel n’existe. |
| 12 | Aucune donnée économique côté serveur. | Bloquant | Migration `0002_progression_economy.sql` (prête, non déployée). |

## 3. Collision de noms : « FIT Points » ≠ « Points FITAIA (PF) »

La monnaie **achetée** s’appelle aujourd’hui « FIT Points » (`CUR_NAMES[1]`) alors que la spécification nomme
« Points FITAIA (PF) » la **progression**, qui ne doit jamais être achetable. Un membre lirait « j’ai acheté des
points » : c’est précisément la confusion que la règle « points != currency » interdit.

Aucun texte d’écran n’a été modifié ici (décision du fondateur : pas de branchement UI pendant la refonte).

**Recommandation** (à valider par le fondateur) :
1. Supprimer la monnaie premium `prem` comme monnaie distincte. Conformément à la section A (« l’argent réel achète
   un pack au contenu connu »), l’argent réel achète des produits **au contenu connu** (FITAIA Plus, packs de tenues
   nommés), jamais des PF et jamais une troisième monnaie.
2. Si une monnaie premium est malgré tout conservée, la renommer sans le mot « Points » (ex. « Gemmes FIT ») et ne
   jamais la convertir en PF.
3. En attendant : ne plus afficher « FIT Points » ni la recharge simulée dans la nouvelle UX.

## 4. Plan de migration des soldes existants

Aucun membre réel n’a encore payé ni gagné de crédits sur une version publique : les soldes présents sur les
téléphones sont des valeurs de démonstration (12 400 / 35) ou de tests.

| Donnée ancienne | Proposition |
|---|---|
| `earn` (FIT Crédits) | Solde d’ouverture Fitcoins écrit **une seule fois** dans le registre : `type = migration`, `reason = legacy_migration`, `sourceId = legacy_earn_v1`, clé **`migration:v1:<userId>`**. Taux proposé 10 crédits = 1 Fitcoin (l’échelle des anciens crédits est environ dix fois celle des Fitcoins), **plafonné à 2 000** car le solde est déclaré par le téléphone et invérifiable. Implémenté et testé : `LocalEconomyServer.migrateLegacyBalance`, `admin_migrate_legacy_fitcoins` (réservé au service, jamais appelable par l’app). **Alternative recommandée pour la production** : solde d’ouverture 0 (pas de joueurs réels), migration réservée aux testeurs. |
| `prem` (FIT Points) | **Non migré** : jamais payé réellement (recharge simulée). Si de vrais achats existaient un jour, ils seraient restaurés depuis les reçus RevenueCat côté serveur, jamais depuis la valeur du téléphone. |
| `ledger` (200 lignes) | Non importé (invérifiable, incomplet). Peut rester lisible comme « ancien historique » le temps de la transition. |
| `history` | Non converti en PF : les PF naissent uniquement d’actions vérifiées par le serveur. Tout le monde démarre à 0 PF, étape Déclic. |
| `owned` / `equipped` (6 portraits `SKINS`) | Pas d’équivalent 1:1 dans le nouveau catalogue (portraits complets ≠ pièces portées par l’avatar). Proposition : ne pas migrer, ou attribuer `outfit_urban_001` aux testeurs via `admin_grant_cosmetic`. |
| `STAGES` 1 à 6 (communauté) | Correspondance directe : 1 `declic`, 2 `elan`, 3 `regulier`, 4 `engage`, 5 `confirme`, 6 `pilier`. À l’intégration : faire dériver `STAGES` de `src/progression/progressionRules.ts` (source unique) et, en 0003, faire lire `progression_stages` par `stage_of()`. |
| `useMyPoints()` | À remplacer par `progression.getAccount().lifetimePoints` à l’intégration. |

## 5. Ce qui n’a pas été touché

`src/store/useGame.ts`, `src/store/economy.ts`, `app/`, les composants de la Communauté et `src/human-engine` sont
inchangés. Les tests existants (`tests/economy.test.ts`, 11 vérifications de l’ancienne économie) restent valides.
