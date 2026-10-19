# Tests unitaires (logique pure, sans React Native)

Exécution dans n'importe quel Node ≥ 18 :
```
npx esbuild tests/economy.test.ts --bundle --platform=node --alias:@=./src --alias:react-native=./tests/rn-stub.js --loader:.jpg=file --outdir=.tests-out && node .tests-out/economy.test.js
```
Même commande pour `profile`, `food`, `coach`, `pose`, `pose2`. Tous passent au 2026-10-02 (économie 11, profil 13, aliments 6, coach 11, pose 6 + 6).

## Communauté (phase 1)
`tests/community.test.ts` : 65 tests (pondération FitMatch, tolérance d’âge, protection du niveau historique, confidentialité, amis/FitMates, blocage, non-lus, limites des messages, signalement). Même commande esbuild, ou directement :
```
node --experimental-strip-types tests/community.test.ts   # Node ≥ 22.6
```
`tests/community-ux.test.ts` : 74 tests de la passe UX (explication « Pourquoi 94 % ? » dont la somme des points = le score, raisons humaines, besoin du jour privé par défaut, état du jour 12 h, fil « Aujourd’hui » fini à 3 éléments et simulé signalé, retour après absence, non-lus par discussion, retrait progressif de l’aide à la conversation, repères du profil, tenue, présence de démonstration). Même commande.

Contrat serveur : `supabase/tests/community_test.sql` (32 vérifications sur PostgreSQL 16 avec un bouchon Supabase, voir `supabase/README.md`).

## Progression + Économie (phase 2)
Domaines purs (aucun React Native) : se lancent **depuis la racine du dépôt**, au choix :
```
node --experimental-strip-types --no-warnings --import ../ts-hook.mjs tests/fitcoins.test.ts      # conteneur (hook de résolution)
npx esbuild tests/fitcoins.test.ts --bundle --platform=node --outdir=.tests-out && node .tests-out/fitcoins.test.js   # PC
```

| Fichier | Vérifications | Contenu |
|---|---|---|
| `tests/progression.test.ts` | 53 | Règles PF de la spécification, plafonds quotidiens, liste blanche (aucune récompense pour manger moins, sauter un repas, perte de poids rapide, déficit, surentraînement, kilos comparés), étapes Déclic → Pilier par `stageId`, meilleur niveau historique (y compris après rééquilibrage des seuils), remises à zéro hebdomadaire et saisonnière, jour serveur Europe/Paris (heure d’hiver comprise), vue Parcours (exemple 860 / 1 500 PF de la spécification), règle désactivée. |
| `tests/fitcoins.test.ts` | 117 | Registre (gain, dépense, remboursement, fonds insuffisants, montants invalides, rejeu et détection d’altération), **suite de conformité** sur le serveur local (75 vérifications : idempotence, 10 réclamations simultanées → 1 transaction, 2 achats de 300 sur 400 → 1 succès / solde 100, doublons, équipement, remboursement, migration `migration:v1:<user>`, reconstruction du registre, événements), pagination, liste exacte des 8 événements et confidentialité des charges utiles, verrou par membre, persistance et refus des données locales corrompues, journée serveur, preuve et blocage, 21 opérations simultanées, configuration invalide, sélecteur d’adaptateur et adaptateur Supabase sur client RPC simulé, textes de refus. |
| `tests/inventory.test.ts` | 31 | Modèle `CosmeticItem` exact, catégories et raretés, objets non achetables (récompense, prestige, désactivé), acquisition sans doublon, emplacements incompatibles (tenue complète ↔ haut/bas/veste), retrait, `AvatarPresentationService` (ordre des couches, objets inconnus signalés), chaîne achat → équipement → descripteur de rendu. |
| `tests/phase2-architecture.test.ts` | 13 | Analyse statique des 36 modules : aucun import React Native / Expo / zustand / `@/` / Human Engine / app existante, domaines indépendants des adaptateurs, solde calculé seulement par le registre, heure et hasard injectés, aucune quantité ni utilisateur dans les dépôts. |

`tests/conformance/phase2Conformance.ts` : suite commune rejouée contre chaque adaptateur (local ici, Supabase sur
PostgreSQL dans `supabase/tests/repository_contract.test.ts`). `tests/helpers/check.ts` : mini-harnais sans dépendance.

Note (constatée le 4 octobre 2026, antérieure à la phase 2) : `tests/food.test.ts` ne se construit plus avec
`tests/rn-stub.js` (pas d’export `Platform`, importé par `src/services/food.ts`). Les autres suites passent.
