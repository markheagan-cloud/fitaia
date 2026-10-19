# FITAIA — repères pour Claude Code
Stack : Expo (dernier SDK, managed, New Architecture), expo-router (tabs + stack), TypeScript strict, Reanimated, react-native-svg, expo-blur, expo-haptics, zustand. Gestionnaire : npm.
Maquette de référence : ../Main.dc.html (prototype cliquable, 390x844). L'app native doit lui être fidèle au pixel ; les tokens exacts sont dans src/theme/tokens.ts, la logique métier (DCLogic) est portée dans src/store/useGame.ts.
Structure : app/(tabs)/{index,defis,scanner,boutique,perso}.tsx + app/selfie.tsx ; composants dans src/components ; contenu statique dans src/data/content.ts.
Skills : .claude/skills/* — preflight, aso-audit, app-icons, native-ui, apple-search-ads. Voir docs/SKILLS.md.
Règles : jamais de secret en dur (.env + .env.example), jamais de données store inventées, jamais de "PASS" sur un test non exécuté, aucune dépense ASA sans validation explicite.
Piège connu : ne JAMAIS lancer `expo start` avec CI=1 dans l'environnement (Metro désactive la surveillance des fichiers : « reloads are disabled »). Le lanceur retire CI avant de démarrer.
Typo : Archivo SemiExpanded/Expanded ExtraBold embarquées dans assets/fonts (OFL) = font-stretch 112/125 % de la maquette ; DM Sans via @expo-google-fonts.
Ombres : `boxShadow` multi-couches (tokens.shadow), jamais shadow*/elevation.
Priorité produit : design irréprochable + fonctionnel complet AVANT toute soumission Apple/Google. Installation/lancement : ..\LANCER-FITAIA.bat ; vérification seule : ..\VERIFIER-FITAIA.bat.
Prochaines étapes réelles (non simulées) : caméra + détection de posture (expo-camera + modèle de pose), scan repas (vision), persistance (Supabase), achats (RevenueCat), selfie → avatar (API image).
