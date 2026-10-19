# Phase 2 — Progression + Économie FITAIA : architecture

Contrat : spécification fondateur, section C (`docs/specs/FITAIA-specs-fondateur.md`). Audit de l’existant :
`docs/ECONOMIE-AUDIT.md`. État : **architecture et tests terminés, non branchés à l’interface** (décision du
fondateur : intégration après la refonte de la Communauté).

## 1. Principes

- **points != currency** : les Points FITAIA (PF) mesurent la progression (jamais achetables, jamais dépensés) ; les
  Fitcoins sont la monnaie. Deux registres distincts (`progression_events`, `economy_transactions`).
- **Le téléphone ne décide jamais d’un montant.** Il envoie une action (`actionType` + `sourceId`), une récompense
  (`rewardId`) ou un objet (`itemId` + `requestId`). Le serveur vérifie, calcule, écrit, renvoie le nouvel état.
- **Registre immuable** ; le solde n’est qu’une projection du registre.
- **Idempotence** partout ; **concurrence** sérialisée par membre.
- **Couplage faible** : Économie → Inventaire → AvatarPresentationService → Human Engine.
- **Domaines purs** (aucun import React Native) : le même code tourne dans l’app, les tests et sert de référence au SQL.

## 2. Domaines et fichiers

| Domaine | Fichiers | Rôle |
|---|---|---|
| Plateforme | `src/platform/` : `events.ts`, `idempotency.ts`, `calendar.ts`, `mutex.ts`, `storage.ts`, `clock.ts`, `ids.ts` | Bus d’événements typé, formats de clés, jour/semaine/saison serveur, verrou par membre, stockage clé-valeur, horloge et identifiants injectables. |
| Progression | `src/progression/` : `progressionRules.ts` (**configuration**), `types.ts`, `points.ts`, `stages.ts`, `account.ts`, `parcours.ts`, `ProgressionRepository.ts` | Règles PF et plafonds, étapes par `stageId`, compte (permanent / hebdo / saison), vue Parcours. |
| Économie | `src/economy/` : `types.ts`, `ledger.ts`, `rewardCatalog.ts` (**configuration**), `rewards.ts`, `migration.ts`, `messages.ts`, `EconomyRepository.ts` | Wallet, registre (`earnFitcoins`, `spendFitcoins`, `refundFitcoins`, rejeu), récompenses et éligibilité, migration de l’ancienne monnaie, textes de refus. |
| Inventaire | `src/inventory/` : `types.ts`, `cosmeticCatalog.ts` (**données**), `inventory.ts`, `InventoryRepository.ts` | Objets cosmétiques, acquisition sans doublon, équipement et emplacements incompatibles. |
| Présentation avatar | `src/avatar-presentation/AvatarPresentationService.ts` | `equippedCosmetics` → couches neutres (ancrage, ordre de rendu, ressource). N’importe pas le Human Engine. |
| Adaptateurs | `src/backend/` : `index.ts` (sélecteur), `config.ts`, `eventMapping.ts`, `repositories.ts`, `local/` (serveur local de démo), `supabase/` (client RPC, décodeurs, dépôts) | Implémentations interchangeables des trois dépôts. |
| Serveur SQL | `supabase/migrations/0002_progression_economy.sql` | Tables, contraintes, RLS, déclencheurs, fonctions. Prêt, **non déployé**. |

## 3. Flux de données

```
 Écran (plus tard)                       Sélecteur                     Serveur (calcule tout)
 ──────────────────                      ─────────                     ──────────────────────
 progression.recordAction('meal_logged', 'repas-42') ─┐
 economy.claimReward('milestone_900') ────────────────┤  createPhase2Backend()
 economy.spendFitcoins({ itemId, requestId }) ────────┤   ├─ mode local-demo → LocalEconomyServer (verrou par membre,
 inventory.equip('outfit_urban_001') ─────────────────┘   │                    document unique écrit d’un bloc)
                                                          └─ mode supabase   → RPC SQL (auth.uid(), SELECT … FOR UPDATE)
                                                                   │
                     ┌─────────────────────────────────────────────┴───────────────┐
                     ▼                                                             ▼
        Registre des PF (progression_events)                    Registre Fitcoins (economy_transactions)
        → compte : lifetime / weekly / season,                  → wallet = projection (balance, lifetimeEarned,
          étape courante, meilleure étape historique              lifetimeSpent), jamais modifié autrement
                     │                                                             │
                     └───────────── récompenses (éligibilité serveur) ─────────────┤
                                                                                   ▼
                                                     Inventaire (user_inventory) → equippedCosmetics
                                                                                   │
                                                                                   ▼
                                                  AvatarPresentationService → couches → (adaptateur futur) Human Engine
 Événements métier (8) publiés après validation ──► abonnés UI : « +20 PF », célébration d’étape, historique
```

## 4. Configuration (équilibrage sans réécrire l’app)

- `src/progression/progressionRules.ts` : points et plafonds (objectif +20, activité +15, repas +5 max 15/j,
  défi +50, encouragement +2 max 10/j, conseil « Ça m’aide » +5 max 20/j), étapes `declic 0 / elan 500 /
  regulier 1500 / engage 3500 / confirme 7000 / pilier 12000`, libellés séparés (`STAGE_LABELS`), calendrier.
- Plafonds **proposés** (non fixés par la spécification, à valider) : objectif quotidien 1/j, activité 30 PF/j
  (2 activités : pas de prime au surentraînement), défi 150 PF/j (3 défis).
- `src/economy/rewardCatalog.ts` : paliers 900 (+50 Fitcoins), 1 000 (Capsule), 1 150 (Accessoire), 1 300
  (+100 Fitcoins) ; `daily_goal` répétable par jour (+10, valeur de démonstration).
- `src/inventory/cosmeticCatalog.ts` : 12 objets de départ (toutes catégories et raretés), exclusions d’emplacements.
- `src/economy/migration.ts` : proposition de migration de l’ancienne monnaie (10:1, plafond 2 000).
- Les mêmes valeurs sont insérées par la migration 0002 ; **`supabase/tests/seed_sync.test.ts` échoue si les deux
  divergent** (règles, liste blanche, étapes, calendrier, catalogue, exclusions, récompenses, motifs, fonctions RPC).
- Interdits (règle 7) : la liste des actions est une **liste blanche fermée** (TypeScript + `CHECK` SQL) ; aucune
  règle ne porte de quantité (calories, kilos, durée) ; chaque action est plafonnée par jour.

## 5. Clés d’idempotence

| Opération | Clé | Effet d’une seconde demande identique |
|---|---|---|
| PF pour une action | `pf:<membre>:<action>:<source>` (objectif quotidien : source = jour serveur) | Rejeu (`replayed: true`), aucun PF |
| PF d’entraide | `pf:<bénéficiaire>:<action>:<source>:<auteur>` | Rejeu |
| Récompense | `reward:<membre>:<rewardId>` ; répétable : `reward:<membre>:<rewardId>:<AAAA-MM-JJ>` | Rejeu de la réclamation et de sa transaction |
| Achat | `purchase:<membre>:<requestId>` (`requestId` généré une fois par intention d’achat et **réutilisé pour chaque nouvelle tentative**) | Rejeu ; même clé pour un autre objet → `IDEMPOTENCY_KEY_REUSED` |
| Remboursement | `refund:<transactionId>` | Rejeu, un seul crédit |
| Migration | `migration:v1:<membre>` | Rejeu, une seule fois même avec un autre solde déclaré |

Un rejeu est vérifié **avant** le contrôle « règle / récompense encore active » : même demande → même réponse.

## 6. Concurrence

- Local : `KeyedMutex` (une file par membre) + document du membre écrit en une fois. Portée : un processus (l’app).
- SQL : chaque fonction verrouille la ligne du membre (`fitcoin_wallets` pour l’économie et l’équipement,
  `progression_accounts` pour les PF) par `SELECT … FOR UPDATE`. Aucune fonction ne verrouille à la fois un compte
  de progression et un wallet : pas d’interblocage possible entre elles.
- Défense en profondeur SQL : le déclencheur du registre recalcule rang, solde avant et solde après depuis le wallet
  verrouillé ; `CHECK (balance >= 0)` ; plafond du jour revérifié par le déclencheur des PF ; clés `UNIQUE`.
- Prouvé par `supabase/tests/concurrency.sh` (sessions psql parallèles) : 10 réclamations identiques → 1 transaction ;
  2 achats de 300 sur 400 → 1 succès, 1 `INSUFFICIENT_FUNDS`, solde 100 ; attente réelle du verrou mesurée. Une
  variante de la migration sans verrou fait échouer ce test (vérifié).

## 7. Registre, wallet, récompenses, inventaire

- `EconomyTransaction` : `id, userId, sequence, type (earn|spend|refund|migration), currency (FITCOIN), amount signé,
  balanceBefore, balanceAfter, reason, sourceType, sourceId, idempotencyKey, metadata, createdAt`.
- Motifs : `progression_milestone`, `stage_reward`, `daily_reward`, `cosmetic_purchase`, `purchase_refund`,
  `legacy_migration`. `lifetimeSpent` = dépenses nettes (un remboursement annule sa dépense).
- SQL : `UPDATE` direct du solde refusé **même au propriétaire de la base** (seul le déclencheur du registre peut le
  faire) ; registres non modifiables, non effaçables, non tronquables (sauf effacement RGPD du compte : les lignes du
  membre partent avec lui, l’auteur d’une entraide est anonymisé).
- Récompenses : types `fitcoins | cosmetic | badge | capsule` ; conditions `lifetime_points`, `stage_reached`
  (sur le meilleur niveau historique), `action_completed_today`. Une capsule est réclamée en statut `pending`
  (seule évolution permise ensuite : `pending → fulfilled`, prévue pour la Phase 5).
- Inventaire : un objet possédé une fois au plus ; doublon de récompense signalé (`duplicateItem`), sans
  compensation (question ouverte) ; achat d’un objet possédé refusé avant tout débit ; remboursement = objet retiré
  et déséquipé ; un objet désactivé reste portable s’il est possédé. SQL : on ne peut porter qu’un objet possédé, dans
  sa catégorie (clés étrangères).

## 8. Événements métier

Exactement : `progression.points_awarded`, `progression.stage_changed`, `economy.fitcoins_earned`
(gain, remboursement ou migration, champ `transactionType`), `economy.fitcoins_spent`, `reward.claimed`,
`reward.rejected` (refus de récompense **ou** d’action), `inventory.item_acquired`, `inventory.item_equipped`.

- Publiés après validation de l’écriture, jamais pour un rejeu ; un abonné en erreur n’annule rien.
- Charges utiles : identifiants, catégories d’action, montants. Aucune donnée de santé, aucun secret ; un texte libre
  reçu du téléphone n’est jamais recopié (action inconnue → `unknown`, récompense mal formée → `invalid`).
- Mêmes événements quel que soit l’adaptateur (`src/backend/eventMapping.ts` partagé).

## 9. Adaptateurs

| | Local (`local-demo`) | Supabase |
|---|---|---|
| Où tourne le « serveur » | Sur le téléphone (`LocalEconomyServer`) | PostgreSQL (fonctions de 0002) |
| Stockage | `KeyValueStorage` injecté (mémoire en test ; AsyncStorage dans l’app, même interface) | Tables 0002 |
| Anti-triche | **Aucune** (un téléphone modifié peut tout changer, horloge comprise) : démonstration seulement | Réel : RLS, droits, verrous, déclencheurs |
| Preuve des encouragements | Acceptée (démo) | Vérifiée dans `encouragements` (0001) |
| Blocage / membre inconnu pour l’entraide | Non vérifié (démo) | Vérifié (`is_blocked`, `auth.users`) |
| `isDemo` | `true` (l’écran doit l’annoncer) | `false` |

Brancher Supabase plus tard : déployer 0002, puis `createPhase2Backend({ mode: 'supabase', userId, rpc: supabase })`
(le client supabase-js a déjà la forme `rpc(fn, args) → { data, error }`). Les opérations serveur (`admin_*`,
`verify_wallet_ledger`) sont réservées au rôle `service_role` (Edge Function), jamais à l’app.

## 10. Pour l’intégration UI (étape suivante)

- Obtenir le backend une fois (racine de composition) ; l’écran ne connaît que les trois dépôts et `events`.
- Parcours : `buildParcours(account, rewardStatuses, STAGES, catalog)` donne étape, `860 / 1 500 PF`, paliers à venir,
  PF manquants. L’ordre de `getRewardStatuses()` n’est pas garanti : le Parcours trie lui-même par seuil.
- Micro-feedback : s’abonner à `progression.points_awarded` (« +20 PF ») et `progression.stage_changed` (célébration).
- Achat : générer `requestId` (UUID) à l’ouverture de la confirmation et le réutiliser en cas de nouvelle tentative.
- Refus : `rejectionMessage(code)` fournit le texte français.
- Avatar : `createAvatarPresentationService(catalog).present(inventory.equipped)` → couches à passer à un adaptateur
  du Human Engine (à écrire, sans toucher au mesh).

## 11. Questions ouvertes

1. Collision « FIT Points » / « Points FITAIA » : supprimer ou renommer la monnaie achetée (voir l’audit).
2. Migration de `earn` : taux 10:1 plafonné à 2 000, ou solde d’ouverture 0 en production ?
3. Définition de « l’objectif quotidien raisonnable » (jamais un budget calorique).
4. Plafonds proposés : activité 30 PF/j, défi 150 PF/j.
5. Fuseau : Europe/Paris pour tous (MVP) ou fuseau par membre (risque de triche au changement de fuseau).
6. Doublon de récompense cosmétique : compensation en Fitcoins ou non (lié aux Capsules, Phase 5).
7. Récompense quotidienne `daily_goal` (+10) : à garder, équilibrer ou retirer.
8. Saisons : 56 jours depuis le 1er octobre 2026 repris de l’app actuelle, provisoire.

## 12. Tests

Voir `tests/README.md` et `supabase/README.md` : progression, Fitcoins (avec la suite de conformité locale),
inventaire, architecture, synchronisation TypeScript ↔ SQL, comportement SQL, concurrence réelle, contrat de
l’adaptateur Supabase sur PostgreSQL 16.
