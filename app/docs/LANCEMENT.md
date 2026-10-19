# FITAIA — de la version actuelle à l'App Store

État : l'app est complète côté produit (design, économie, journal, boutique, coach, selfie). Quatre branchements dépendent de comptes **à ton nom** ; chacun prend 10–15 min. Dès qu'une clé existe, je la branche et je vérifie.

## 1. Build iOS réel (indispensable : caméra, podomètre, TestFlight)
- Créer un compte **Expo** (expo.dev, gratuit) et avoir un **Apple Developer** (99 $/an).
- Dans `app\` : `npx eas-cli login` → `npx eas-cli init` (remplit `extra.eas.projectId`) → `npx eas-cli build --profile development --platform ios`.
- Installer la version sur l'iPhone (lien EAS). La détection de posture (module `modules/fitaia-pose`, Apple Vision) et le podomètre deviennent réels. Expo Go reste utilisable pour tout le reste.
- Pour TestFlight / App Store : `npx eas-cli build --profile production --platform ios` puis `npx eas-cli submit --platform ios`.

## 2. Supabase (données en ligne + avatar)
- Projet Supabase (région EU), bucket privé `avatars`, puis `supabase functions deploy avatar` (voir `supabase/README.md`).
- Dans `app\.env` : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_AVATAR_ENDPOINT`.

## 3. Hugging Face (dessin d'avatar — GRATUIT, visage conservé)
- **Le plus simple : double-clique `CONFIGURER-AVATAR.bat` sur le bureau** — il crée le Space, envoie les fichiers, déploie le serveur Supabase et règle l'app. Tu crées seulement les 2 comptes (liens ouverts automatiquement) et tu colles 1 jeton.
- Modèle **Qwen-Image-Edit** (Apache 2.0, usage commercial OK) sur ton propre Space **ZeroGPU** : dossier `hf-space/` (3 fichiers à téléverser, guide dans `hf-space/README.md`, ~5 min).
- Jeton Read → `supabase secrets set AVATAR_PROVIDER=hf HF_SPACE=<pseudo>/fitaia-avatar HF_TOKEN=hf_...`
- Gratuit : 5 min de GPU/jour (≈ 10–20 dessins) ; PRO 9 $/mois : 40 min/jour. Chaque dessin est mis en cache, donc jamais redessiné deux fois.
- Alternative payante si besoin de volume immédiat : `AVATAR_PROVIDER=openai` + `OPENAI_API_KEY` (gpt-image-1, ≈ 0,05 € par dessin). Google (Nano Banana) n'a plus de tier gratuit ; FLUX Kontext est interdit en usage commercial.

## 4. RevenueCat + App Store Connect (FIT Points en €)
- Produits in-app dans App Store Connect (100 / 550 / 1 200 FIT Points), projet RevenueCat, clé iOS → `EXPO_PUBLIC_REVENUECAT_IOS_KEY`.
- Restauration des achats : bouton présent dans l'écran Plus (`app/paywall.tsx`). Entitlement RevenueCat à nommer `plus`, offering par défaut avec paquets `monthly` et `annual`. Dépendance à ajouter au moment du build : `npx expo install react-native-purchases` (chargée paresseusement : absente, l'app affiche « s'active dans la version App Store », jamais un faux paiement).

## Avant soumission (Claude s'en charge)
- `npm run preflight` à 0 FAIL, captures d'écran, texte App Store (`store/metadata.json`), politique de confidentialité, icône 1024.
