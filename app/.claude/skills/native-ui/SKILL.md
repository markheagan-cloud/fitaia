---
name: native-ui
description: Construire ou auditer des écrans natifs iOS (HIG) / Android (Material 3) fidèles à la maquette Main.dc.html. Déclencher sur "audit UI native", "construis l'écran X", "rends ça natif".
---
Règles FITAIA (direction artistique à respecter) :
- Couleurs uniquement via `src/theme/tokens.ts` (obsidian #1C1D1F, lime #C8F03C, cyan). Jamais de hex en dur dans un écran.
- Boutons `FxButton` (scale .97 au press, haptique, min 48), cartes `FxCard` (ombre composite), tab bar `GlassTabBar` (blur iOS / Android 12+, opaque sinon).
- Easing `motion.easing` = cubic-bezier(.32,.72,0,1) ; durées 180/240/420 ms (identiques à la maquette).
- Chaque écran : `SafeAreaView`, `useTheme()` (dark/light auto), `accessibilityLabel/Role`, cibles ≥ 44, texte ≥ 12.
- Clavier : `KeyboardAvoidingView` dès qu'il y a un `TextInput`. Navigation : expo-router (stack natif).
- Liquid Glass (iOS 26) : uniquement via composant natif quand disponible, fallback `expo-blur` — ne jamais imiter en CSS.
Workflow : lire la section correspondante de Main.dc.html → écrire l'écran dans `app/(tabs)/` → `npm run ui-audit` → corriger jusqu'à 0 écart.
