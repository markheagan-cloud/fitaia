# FITAIA — Décisions techniques (2026-10-01, mises à jour 2026-10-02)

- Abandon de Base44 : l'app est reconstruite avec Claude, qui écrit le code ; le fondateur valide et teste sur iPhone.
- Le document Base44 (FITAIA-document-projet.md) sert de cahier des charges fonctionnel — SAUF pour la direction visuelle de l'avatar, remplacée ci-dessous.
- Objectif : V1 publiée sur l'App Store avec un rendu haut de gamme.
- RÈGLE (fondateur, 2026-10-02) : design irréprochable et app qui fonctionne parfaitement AVANT toute soumission Apple/Google. La partie store (ASO, Search Ads, preflight) reste prête mais passe après.
- Stack : Expo (dernier SDK, managed, New Architecture) + expo-router + TypeScript strict ; Reanimated, react-native-svg, expo-blur, expo-haptics, zustand. Le comptage caméra nécessitera un « development build » Expo (module natif), pas Expo Go.
- Backend : Supabase (Postgres, auth, stockage privé, fonctions Deno), région UE.
- Paiements : achats intégrés App Store via RevenueCat.
- Builds : EAS → TestFlight. Le fondateur a un Mac et un compte Apple Developer ; il travaille sur un PC Windows.

## État du code (2026-10-02, 18 h 45)
- Projet Expo réel dans `C:\Users\33766\Desktop\FITAIA\app` (SDK Expo le plus récent, RN 0.86, React 19.2, Reanimated 4.5, TypeScript 6) : port 1:1 de la maquette Main.dc.html — 6 écrans, header commun, barre d'onglets en verre, toasts, coach Fito, thème clair/sombre. Typo Archivo SemiExpanded/Expanded ExtraBold embarquée (OFL), ombres `boxShadow` multi-couches.
- VÉRIFIÉ RÉELLEMENT sur le PC du fondateur (par Claude, contrôle de l'ordinateur + navigateur intégré) : `tsc` OK · `expo lint` 0 problème · expo-doctor 20/21 (`.expo`/git, réglé au `git init`) · preflight 21 PASS / 0 FAIL · serveur Expo en mode Expo Go avec QR code (`exp://192.168.0.150:8081`) · rechargement à chaud ~8 s · parcours testés dans le navigateur : navigation, défi 5 pompes, scan + saisie manuelle de repas, achat de tenue, coach, toasts, persistance après rechargement.
- NON vérifié : rendu sur iPhone réel (Expo Go), podomètre réel, génération d'avatar réelle (serveur non configuré), compilation du Swift (build EAS).
- CRÉATEUR DE PERSO « illimité comme GTA » (décision fondateur, 2026-10-02) : écran `app/creator.tsx` — fiche de personnage (apparence, morphologie, taille 150–200 cm, 8 peaux, 11 coiffures dont hijab, 8 couleurs, visage, yeux, barbe, accessoires multiples) = 4 136 140 800 combinaisons ; modifications et redessins GRATUITS et illimités (aucun crédit) ; le selfie reste la base de la ressemblance (optionnel : sans selfie, dessin d'après la fiche seule) ; aperçu approximatif instantané (perso peint le plus proche), rendu final dessiné par le serveur avec cache par empreinte de fiche + tenue (jamais regénéré deux fois). Parcours : Mon perso → (selfie si absent) → créateur → dessin → retour Mon perso. Vérifié sur PC : tsc OK, lint 0, preflight 21 PASS / 0 FAIL, parcours testé dans le navigateur (mode démo annoncé).
- ÉCONOMIE INTELLIGENTE (src/store/economy.ts + useGame.ts, tests unitaires passés) : journée réelle (reset du journal à minuit, soldes conservés) ; défi du jour +50 une fois/jour, bonus série +10 (≥3 j) / +25 (≥7 j) ; repas : 3 récompensés/jour max, +30 si score ≥70 sinon +10 ; coffre hebdo : 5 jours actifs → +500 crédits + tenue rare mystère, une fois/semaine ; grand livre (200 derniers mouvements, affiché dans Mon perso) ; persistance AsyncStorage (clé `fitaia-v1`).
- Défis bonus réels : « Scanner 2 repas » validé automatiquement avec les vrais repas ; « Marcher 6 000 pas » lit le podomètre (expo-sensors, iOS Core Motion dans Expo Go) ; squats/gainage marqués « version installée sur iPhone » (caméra).
- Saisie manuelle de repas (nom, kcal, macros) avec score heuristique explicable (part de protéines, densité calorique, excès de lipides/glucides) : bowl 95 · salade saumon 82 · burger-frites 33.
- AVATAR (selfie → perso) : écran réel (caméra frontale via expo-image-picker, recadrage carré 768 px JPEG ~120 Ko, aperçu dans l'ovale, étapes, erreurs, reprise, selfie supprimé après usage) ; service `src/services/avatar.ts` ; fonction Supabase `supabase/functions/avatar` (gpt-image-1 en mode édition pour garder l'identité, prompt de style FITAIA par tenue, bucket privé + URL signée 30 j, 5 dessins/h/IP) ; variantes par tenue générées à la demande. Sans `EXPO_PUBLIC_AVATAR_ENDPOINT` : mode démo annoncé à l'écran, jamais présenté comme réel. À faire par le fondateur : projet Supabase + clé OpenAI (voir `app/supabase/README.md`, ~10 min).
- Pièges réglés : `CI=1` hérité par `expo start` (watch désactivé) ; toast Reanimated-web ; `expo-doctor` interactif ; règle `react-hooks/set-state-in-effect` ; largeur SVG négative au premier rendu ; fenêtres de lanceur empilées (lanceur en console dédiée, nettoyage automatique).
- Crédits à l'échelle des centaines (décision fondateur) : défi +500, repas +300/+100, série +100/+250, coffre +5 000, tenues 4 000 / 6 500 crédits ; solde de départ 12 400. Migration automatique v2 des données sauvegardées (×10 sur les crédits, FIT Points inchangés) — vérifiée (1 270 → 12 700).
- DÉTECTION DE POSTURE RÉELLE écrite : module natif Expo `modules/fitaia-pose` (Swift, AVCaptureSession + VNDetectHumanBodyPoseRequest, 24 images/s, côté le mieux vu, coordonnées normalisées) + compteur `src/pose/repCounter.ts` (angle coude ≤ 90° puis ≥ 160°, alignement hanche ≤ 18°, lissage, raisons de refus lisibles) validé par 6 tests unitaires. L'écran Défis bascule automatiquement : caméra réelle dans la version compilée (EAS development build), simulation étiquetée « Simulation » dans Expo Go / web. Le Swift n'a pas encore été compilé (nécessite le build EAS → compte Expo + Apple Developer).
- DESSIN D'AVATAR GRATUIT (décision 2026-10-02, recherche vérifiée) : fournisseur par défaut = Qwen-Image-Edit-2509 (Apache 2.0, commercial OK, rendu illustré fidèle au visage) sur un Space Hugging Face ZeroGPU appartenant au fondateur (`hf-space/`, gratuit : 5 min GPU/jour ≈ 10–20 dessins, PRO 9 $/mois : 40 min). La fonction Supabase `avatar` bascule par secret `AVATAR_PROVIDER=hf|openai` ; cache inchangé. Écartés : Google Nano Banana (plus de tier gratuit, ~0,03–0,07 $/image), FLUX Kontext dev (non commercial).
- FITAIA STUDIO (décision fondateur 18 h, « crée ton propre système ») : perso VECTORIEL dessiné dans l'app (`src/avatar/VectorAvatar.tsx`, react-native-svg) — gratuit, instantané, hors ligne, illimité ; chaque réglage de la fiche change le dessin ; la tenue équipée s'affiche dessus ; le selfie (optionnel) devient le visage (clip ovale). Affiché sur Accueil / Mon perso dès que le créateur est validé (`characterReady`). Le rendu IA « HD » (Supabase + Hugging Face ZeroGPU/Qwen-Image-Edit ou OpenAI) reste une option, visible seulement si le serveur est configuré. Comptes HF/Supabase non créés à ce jour (script `CONFIGURER-AVATAR.bat` prêt).
- MOTEUR INTERNE 0 € (18 h) : nutrition réelle — base locale 80 aliments (valeurs moyennes) + Open Food Facts (ODbL, sans clé) par recherche (iPhone ; bloquée par CORS sur web) et par CODE-BARRES (expo-camera, Expo Go OK ; saisie manuelle sur web) ; portions en grammes, macros et score calculés. Profil (`src/store/profile.ts`) : Mifflin-St Jeor × activité − déficit (plancher 1 200/1 500), 5 paliers départ→objectif, journal de poids, niveaux et stats dérivés de l'historique. Coach Fito (`src/coach/brain.ts`) : règles sur données réelles (repas du soir, protéines, budget, poids lissé 7 j, paliers, défis, crédits). Onboarding 3 étapes au premier lancement. Squats/gainage : compteurs de pose écrits et testés (activés par le build EAS). FX : compteurs, barres animées, pluie de crédits + haptique ; mouvement réduit respecté ; hitSlop ; Dynamic Type plafonné.
- VISAGE RÉALISTE (18 h 50) : le selfie est fondu dans la tête du perso (masque à dégradé radial, ombrage), tête agrandie de 8 % avec photo ; dans la version compilée, `segmentPerson` (Apple Vision VNGeneratePersonSegmentationRequest, sur l'appareil, gratuit) détoure la personne → selfie PNG à fond transparent. Aperçu vérifié hors app avec une photo réelle. Non vérifié : compilation Swift (build EAS).
- STORE (19 h 30) : fiche App Store/Play réécrite (`store/metadata.json`, sous-titre 27 car., mots-clés 98 octets), confidentialité + conditions (`store/privacy.md`, `terms.md`), paywall FITAIA Plus (`app/paywall.tsx`, après le premier défi réussi, RevenueCat chargé seulement en build), pass de saison calculé (Saison 1 du 1er oct., 8 semaines, palier/1 000 crédits). CAPTURES : `CAPTURES-FITAIA.bat` → Playwright sur le PC prend les vrais écrans en 1290×2796 (état de démo `scripts/captures-state.json`), `scripts/compose-captures.py` ajoute légende Archivo + bande lime → `store/captures/final/` (6,7″ et 6,5″, 5 chacune, faites). Icône gardée (anneau lime + F). Leçon outillage : chaque envoi de fichier vers le PC doit passer par un NOUVEAU chemin de staging (un chemin réutilisé renvoie l'ancienne version).
- REVIREMENT PERSO (19 h 45, fondateur : « les personnages sont horribles ») : le perso vectoriel est RETIRÉ de tous les écrans (fichier `VectorAvatar.tsx` conservé mais inutilisé). Partout : `previewImage(sheet)` = le plus proche des six rendus réalistes (sexe, carrure, peau, pilosité, voile). Dessin à l'image de l'utilisateur : `EXPO_PUBLIC_HF_TOKEN` (compte Hugging Face gratuit) → appel direct `router.huggingface.co` FLUX.1-schnell depuis l'app, prompt = fiche + tenue + style des six rendus ; sans serveur. Le selfie n'est utilisé que par le mode serveur (ressemblance). Pollinations testé : exige désormais un jeton Turnstile → inutilisable. Aucune API d'image gratuite sans compte n'existe à ce jour.
- REVUE DESIGN (20 h, skill ui-ux-pro-max, sur captures réelles) : contrastes mesurés tous ≥ 5,2:1 (ink2 sur surf 6,8 ; lime/obsidienne 12,8) ; insets tab bar OK ; cibles tactiles OK. Corrigé : écran Défi au repos (cible « 5 pompes à faire » au lieu de « 0/5 », squelette masqué tant que la caméra n'analyse pas), libellés « version installée » → « version App Store », chips de portion sans retour à la ligne, colonne « prochain palier » = vignette du perso de l'utilisateur. Non corrigé (choix) : panneau caméra haut quand inactif.
- DIRECTION LONG TERME (19 h 45, fondateur) : FITAIA Human Engine — moteur d'avatar propriétaire en 5 versions (V1 landmarks + mesh Blender à morphs + Three.js, V2 texture personnelle, V3 réseau photo→paramètres PyTorch, V4 reconstruction complète, V5 modèle maison). Jamais de brique non commerciale (SMPL-X interdit). Le moteur reste côté serveur. Note complète : `docs/HUMAN-ENGINE.md` (aussi dans le projet Claude).
- HUMAN ENGINE, PREUVE 3D (20 h 30) : GLB maison `src/human-engine/assets/prototype-avatar.glb` (généré par `tools/human-engine/build_prototype_avatar.py`, 3 970 sommets, 7 896 triangles, 0 texture, 437 Ko, morphs body_weight / belly_fat / muscle). Moteur en couches `src/human-engine/` (core, identity, face, body, animation, renderer) ; three 0.170 + expo-gl 57.0.2, sans expo-three. Page `/human-engine-debug` (Mon perso → Labo 3D, dev uniquement). Mesuré sur PC : ≈ 1 ms par image (GPU), 2,1 ms (CPU), chargement 220–360 ms. Défaut iPhone = morphs CPU (repli sûr) tant que le GPU n'est pas vérifié sur l'appareil. Doc : `docs/HUMAN-ENGINE.md`.
- Tests unitaires versionnés dans `app/tests/` : économie 11, profil 13, aliments 6, coach 11, pose 6 + 6 — tous passés.
- VÉRIFIÉ sur PC (navigateur intégré) : onboarding → créateur (aperçu en direct) → Mon perso (données réelles) → scanner (recherche locale, portion, ajout +300, défi bonus repas) → code-barres réel (Nutella via Open Food Facts).
- Skills (fondateur) : plugin « power-skills » (~80 skills : marketingskills, ui-ux-pro-max, stop-slop, context-engineering, agent-reach) installé dans son compte + 4 skills distillés FITAIA ; copies dans `app/.claude/skills`.
- Guide de lancement : `app/docs/LANCEMENT.md` — les 4 comptes à créer par le fondateur (Expo + Apple Developer, Supabase, OpenAI, RevenueCat) et les commandes exactes.
- Workflow : `LANCER-FITAIA.bat` (nettoie, installe/aligne les dépendances, typecheck, preflight, serveur) ; `VERIFIER-FITAIA.bat` (typecheck + lint + doctor + preflight → `verification.txt`). Scripts versionnés dans `app/tools/`.

## Direction visuelle
- Personnages ILLUSTRÉS semi-réalistes (peinture numérique), en pied ; morphologies variées ; athleisure anthracite/crème + vert lime ; fond gris clair géométrique. Remplace l'avatar 3D.
- Perso généré à partir d'un SELFIE ; il ÉVOLUE par paliers de corps ; des TENUES (skins) se débloquent.
- App en mode clair ET sombre. Tokens : béton #E6E4DF, craie #F5F4F1, graphite #1C1D1F, ardoise #5A5D63, lime #C8F03C (remplissage uniquement), ambre #E9A10B, rouge #E2483D. Typo Archivo élargie (titres, chiffres tabulaires) + DM Sans.
- Principes (passe design du 2026-10-02) : un seul élément spectaculaire (le perso en pleine largeur) ; barre d'onglets en verre façon iOS ; animations seulement en réponse à une action (transform/opacité, ~0,3 s, cubic-bezier(.32,.72,0,1)), mouvement réduit respecté ; pas de libellés en majuscules ni de « · » décoratifs ; rayons imbriqués ; cibles tactiles ≥ 44 px.

## Coach « Fito »
- Petit personnage présent en haut à gauche de chaque écran ; c'est lui qui formule les alertes calories et l'impact d'un repas scanné.
- Feuille de chat : questions suggérées (lipides ou glucides, que manger ce soir, pourquoi je stagne) + question libre. Réponses fondées sur le journal et les objectifs de l'utilisateur, nuancées (ex. aucun macronutriment n'est « meilleur »).

## Défis caméra
- Défis quotidiens gratuits (ex. 5 pompes) comptés par la CAMÉRA, exigence « zéro erreur » : rep validée seulement si amplitude complète (coudes ≈90° en bas, bras tendus en haut, corps aligné) ; reps refusées signalées.
- Piste technique : détection de pose Apple Vision (19 points, 8–12 ms/image) ou SDK QuickPose ; lissage sur plusieurs images, filtrage par confiance, guidage du placement (profil, ~1,5 m).

## Économie (façon Fortnite, noms façon FIFA)
- Monnaie gagnée : FIT CRÉDITS (défis, repas sains, coffre hebdo). Monnaie premium : FIT POINTS (achetés en € via Apple). Choix du fondateur, inspiré des Coins / FIFA Points.
- Raretés : Commune, Rare (FIT Crédits) ; Épique, Légendaire (FIT Points). Boutique qui tourne.
- Pass de saison : voie gratuite + voie Élite (950 FIT Points), qui rend 1 200 FIT Points au fil des paliers.
- Packs FIT Points : 100 / 0,99 € · 550 / 4,99 € · 1 200 / 9,99 € (provisoire).

## Nutrition
- Budget du jour = objectif + calories brûlées (défis, pas). Chiffre principal = kcal restantes. Barre de 30 segments : vert < 85 %, orange 85–100 %, rouge au-delà (surplus).
- Alertes du coach avec conseil concret. Avant d'ajouter un repas scanné, on montre son impact sur la journée.

## Stratégie des Skills (2026-10-02)

Pour renforcer la qualité design et développement du prototype et de l'app, les **meilleurs skills de design** ont été identifiés sur skills.sh :

| Skill | Installs | Rôle | Installation |
|---|---|---|---|
| **sleek-design-mobile-apps** | 11/week | Mobile-first patterns (iOS/Android) | `npx skills add https://github.com/sleekdotdesign/agent-skills --skill sleek-design-mobile-apps` |
| **design-taste-frontend** | 26K/week | Design taste opiniâtre, anti-slop | `npx skills add https://github.com/leonxlnx/taste-skill --skill design-taste-frontend` |
| **delight** | 82K total | Micro-interactions & motion | `npx skills add https://github.com/pbakaus/impeccable --skill delight` |
| **polish** | n/a | Finition visuelle (espacement, typo) | `npx skills add https://github.com/pbakaus/impeccable --skill polish` |
| **emil-design-eng** | n/a | Motion engineering & craftsmanship | `npx skills add https://github.com/emilkowalski/skill --skill emil-design-eng` |

→ Détails : voir `FITAIA-skills-integration.md`

Les 5 skills projet (preflight, aso-audit, app-icons, native-ui, apple-search-ads) vivent dans `app/.claude/skills/` (dans `fitaia-app.zip` ; ce dossier ne peut pas être écrit à distance) et sont documentés dans `app/docs/SKILLS.md`.

- Maquette/prototype : https://claude.ai/artifact/31KrHhCrMSX5Zi8mPdRZg8
- Après la V1 : habitudes, notifications, HealthKit, Android.
- Feuille de route : https://claude.ai/artifact/UEjF9yizEyqDCS3ti32mVT

## Avatar premium (2 octobre 2026)
- Base humaine : **MakeHuman / MPFB2, assets CC0** (corps, macros poids/muscle, peau, yeux, cheveux, vêtements). Code GPL de MPFB2 non utilisé : nos scripts Python lisent seulement les données.
- Pipeline maison `tools/premium-avatar` → un GLB (≈ 3,9 Mo, 33 k triangles) ; aucun logiciel 3D ni service payant.
- Le moteur reste indépendant du mesh : **drivers** (courbes BodyParameters → morphs) par avatar ; registre `AVATARS`.
- Vêtements = proxies ajustés au corps pour chaque morph → ils suivent la morphologie.
- Rendu « studio » (tone mapping ACES, key/fill/rims, ombre de contact, pas de shadow map) ; textures décodées en JS sur iPhone/Android (jpeg-js, upng-js).
- Prototype conservé comme asset de test (comparateur dans le labo).

## Modèle gratuit à jouer (20 octobre 2026, cahier des charges du fondateur)
- Plus d'abonnement, de paywall, de pass payant ni de monnaie achetable. Retirés : FITAIA Plus, Pass Élite, FIT Points, packs.
- Une seule monnaie, gagnée en jouant : **Fitcoins** (ancien nom affiché « FIT Crédits »). Les Points FITAIA (PF) mesurent la progression et ne s'achètent jamais.
- Seuls des cosmétiques se vendent, par achat intégré Apple (origine `STORE` du catalogue) : jamais payables en Fitcoins, attribués par le serveur après reçu vérifié.
- Toute l'économie passe par le registre Phase 2 (`src/services/session.ts` → `src/store/useEco.ts`) : l'écran déclare une action, le serveur décide (règles, plafonds, idempotence). Mode local tant que Supabase n'est pas branché.
- Revenus quotidiens : premier défi du jour +50 Fitcoins, premier repas +10 ; chaque défi +50 PF (max 150/j), chaque repas +5 PF (max 15/j). Paliers du Parcours inchangés.
- Ancien solde converti une fois : 10 crédits = 1 Fitcoin, plafond 2 000 ; tenues possédées conservées.
- Supprimés car contraires au modèle ou malsains : coffre hebdomadaire à tenue aléatoire (tirage au sort), bonus de série en monnaie, récompense de repas selon le score (récompensait le fait de manger moins).
- Communauté réservée aux 18 ans et plus.
