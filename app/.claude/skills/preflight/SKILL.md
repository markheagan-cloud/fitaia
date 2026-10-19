---
name: preflight
description: Contrôle complet avant soumission App Store / Google Play. Déclencher sur "fais le preflight", "preflight complet", "prêt pour l'App Store ?".
---
1. `npm run preflight` — lire chaque FAIL/WARN/SKIP. Ne jamais annoncer PASS pour un contrôle SKIP.
2. Si node_modules présent : `npm run typecheck`, `npm run lint`, `npx expo-doctor`.
3. Corriger les FAIL sans risque (asset manquant → `npm run icons`, permission manquante → app.json infoPlist). Ne pas toucher aux secrets ni aux identifiants de compte.
4. Rapporter : tableau Élément | Statut | Test réellement exécuté | Résultat | Action restante.
Ne modifie pas : eas.json submit (identifiants Apple/Google), .env.
