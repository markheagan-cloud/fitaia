# Skills FITAIA

| Skill | Commande | Phrase déclencheur | Entrées | Modifie | Ne modifie pas | Dépendances |
|---|---|---|---|---|---|---|
| Preflight | `npm run preflight` | "Fais le preflight complet" | app.json, eas.json, code, .gitignore | rien (lecture seule) | tout | node ≥ 18 ; typecheck/lint si node_modules |
| ASO Audit | `npm run aso-audit` | "Audit ASO" | store/metadata.json, store/real/* (optionnel) | rien | tout | node |
| App Icons | `npm run icons [src]` | "Prépare les icônes" | assets/icon-source.png | assets/*.png, assets/store/* | app.json | sharp (devDep) |
| Native UI | `npm run ui-audit` + composants | "Audit UI native" / "Construis l'écran X" | app/, src/ | app/(tabs)/*.tsx, src/components | tokens sans accord | expo-blur, expo-haptics, reanimated |
| Copy sans slop | — | "Relis ce texte" / tout texte visible | textes app, store, coach | textes | — | — |
| UI qualité | — | "Vérifie l'écran X" | écrans RN | app/, src/ | tokens | — |
| Lancement & marketing | — | "Prépare la fiche store / le lancement / le paywall" | store/, onboarding | store/*, docs | prix sans accord | — |
| Méthode agent | — | début de session longue | — | docs/DECISIONS.md | — | Agent-Reach (optionnel) |
| Apple Search Ads | `npm run ads-plan` | "Prépare Apple Search Ads" | store/asa-seed.json | store/asa-plan.md, store/asa-keywords.csv | compte ASA (jamais) | node |

## Ce qui nécessite un compte / une clé externe
- `eas init`, `eas build`, `eas submit` : compte Expo (gratuit) + Apple Developer (99 $/an) + Google Play Console (25 $ une fois).
- Supabase : `EXPO_PUBLIC_SUPABASE_URL` / `ANON_KEY` dans `.env`.
- RevenueCat : clés iOS/Android dans `.env` + produits créés dans App Store Connect / Play Console.
- Génération d'icône IA : `OPENAI_API_KEY` (optionnel).

## Démarrer sur ton PC
Double-clique `C:\Users\33766\Desktop\FITAIA\LANCER-FITAIA.bat` : installe Node si besoin, installe les dépendances alignées sur le dernier SDK Expo, lance le typecheck + preflight, puis `expo start` (QR code pour Expo Go sur iPhone).
Vérification seule : `VERIFIER-FITAIA.bat`. En ligne de commande : `cd app && npm run typecheck && npm run preflight && npx expo start`.

## Sources distillées (2026-10-02, licences MIT)
- hardikpandya/stop-slop → fitaia-copy-sans-slop
- nextlevelbuilder/ui-ux-pro-max-skill (uupm.cc) → fitaia-ui-qualite
- coreyhaines31/marketingskills (aso, launch, copywriting, pricing, paywalls, onboarding) → fitaia-lancement-marketing
- muratcankoylan/agent-skills-for-context-engineering + Panniantong/Agent-Reach → fitaia-methode-agent
- bloxks.app : concurrent/benchmark (constructeur no-code Expo à 25 €/mois), pas de skill à extraire.
