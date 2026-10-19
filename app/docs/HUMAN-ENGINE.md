# FITAIA Human Engine — feuille de route

Note de référence, 2 octobre 2026. Décision fondateur : à terme, FITAIA ne dépend d'aucune API d'avatars ; elle possède son moteur (code, mesh, données, poids).

## Le problème précis qu'on doit gagner

Pas « créer des humains » en général. Un seul problème, mieux que tout le monde :

**Une photo → « c'est vraiment moi » → voir mon corps évoluer pendant ma perte de poids.**

Le visage reste reconnaissable pendant que le corps change (aujourd'hui, −5 kg, −10 kg, objectif). C'est ce qui sépare FITAIA d'un générateur d'avatars.

## Architecture cible

```
Selfie
→ Face Encoder        (landmarks, proportions, orientation)
→ Identity Vector     (représentation compacte de la personne)
→ FITAIA Head         (mesh propriétaire + morphs visage)
→ Body Generator      (mesh corps + morphs carrure)
→ Weight Morph Engine (progression corporelle par palier)
→ Skin/Hair Engine    (texture UV personnelle, shaders)
→ Animation Engine    (rig, poses, idle, célébrations)
→ Avatar FITAIA
```

Au début, chaque brique peut être de l'open source. Puis on remplace morceau par morceau par du FITAIA propriétaire. Ce qui doit rester chez nous dès le premier jour : l'algorithme selfie → paramètres, les morphs, les shaders peau/cheveux, les poids entraînés, le système avant/après.

## Les cinq versions

### V1 — Sans entraîner d'IA (objectif : les 3 prochains mois)
- **Entrée** : selfie iPhone. Landmarks via Apple Vision (déjà dans notre module natif, 0 €) ou MediaPipe Face Landmarker (Apache 2.0). Sorties : 468 points, orientation, distances yeux/nez/bouche/mâchoire.
- **Mesh** : un personnage FITAIA modélisé dans Blender, avec 100 à 300 paramètres (shape keys) : largeur du visage, mâchoire, nez, yeux, lèvres, pommettes, graisse du visage, épaules, ventre, cuisses, muscles, etc. C'est le travail dur, humain, incompressible : il faut un modeleur 3D (ou des semaines du fondateur).
- **Moteur** : code FITAIA qui convertit les mesures de la photo en valeurs de morphs (règles + régression simple).
- **Affichage** : Three.js (MIT) dans l'app via `expo-gl` + `expo-three`. Export glTF depuis Blender (format ouvert).
- **Résultat attendu** : un perso 3D aux proportions de la personne, en tenue FITAIA, qui réagit déjà au poids (Weight Morph Engine V0 = 5 paliers → 5 jeux de morphs corps).

### V2 — Texture personnelle
- Projection automatique de la photo sur la texture UV FITAIA : couleur de peau, barbe, sourcils, lèvres, yeux, cheveux.
- C'est là que le perso commence à ressembler vraiment. Technique : projection UV depuis les landmarks + inpainting léger des zones non vues.

### V3 — Notre premier réseau neuronal
- Modèle photo → paramètres FITAIA (ex. 200 sorties = 200 réglages du mesh). PyTorch (licence BSD).
- Données d'entraînement : d'abord synthétiques (notre mesh rendu avec des paramètres aléatoires → paires image/paramètres, illimitées et gratuites), puis données réelles d'utilisateurs **avec consentement explicite**.
- À ce stade, les poids du modèle sont un actif FITAIA.

### V4 — Reconstruction complète
- Plusieurs photos ou selfie vidéo → visage → cheveux → corps → rig automatique → avatar.
- Le Weight Morph Engine prend le relais : aujourd'hui, objectif, −5, −10, −20 kg, visage stable.

### V5 — Notre « foundation model » avatar
- Avec assez de données autorisées, entraîner notre propre modèle de reconstruction 3D, retirer les dépendances expérimentales, posséder tout le pipeline essentiel.

## Licences : ce qui est permis, ce qui est interdit

| Brique | Licence | Usage commercial |
|---|---|---|
| MediaPipe (Google) | Apache 2.0 | Oui |
| Apple Vision | Framework iOS | Oui (sur iOS) |
| Three.js | MIT | Oui, en conservant la mention de licence |
| PyTorch | BSD-3 | Oui |
| Blender (outil) | GPL — n'affecte pas les fichiers produits | Oui, nos modèles nous appartiennent |
| glTF (format) | Ouvert (Khronos) | Oui |
| **SMPL / SMPL-X** (corps paramétrique) | Licence standard non commerciale | **Non** sans licence commerciale (Meshcapade) |
| Modèles de reconstruction 3D universitaires (LAM, LHM, etc.) | Souvent non commerciale ou CC-BY-NC | **À vérifier un par un ; par défaut, non** |

Règle : on ne construit jamais le cœur de FITAIA sur des poids ou un mesh dont la licence interdit le commerce. Quand un papier a l'air parfait, on lit d'abord sa licence.

## Ce qui ne doit jamais être dans l'app

L'app (iPhone) envoie le selfie à l'API FITAIA et reçoit seulement ce qu'il faut pour afficher (paramètres de morphs ou glTF/texture). Le Face Engine, les poids, les règles selfie → paramètres tournent sur notre serveur. Quelqu'un peut copier le bouton « Créer mon perso », pas le moteur.

Exception assumée pour la V1 : les landmarks peuvent être calculés sur le téléphone (Vision/MediaPipe) ; c'est de l'open source, pas notre secret. Le secret commence à la conversion en paramètres.

## Ce qui rend FITAIA difficile à copier

Pas le code de l'interface. Ce qui s'accumule et ne se copie pas :
dataset FITAIA + poids FITAIA + mesh FITAIA + algorithmes FITAIA + shaders FITAIA + système de progression corporelle.

## Où on en est aujourd'hui (état réel du code)

- Perso = l'un de six rendus réalistes choisi d'après la fiche ; dessin IA à l'image via Hugging Face (texte → image) dès qu'une clé est posée. Ce n'est **pas** le Human Engine : c'est le pont pour lancer sans attendre.
- Déjà en place et réutilisable : module natif iOS (Apple Vision : pose, détourage de la personne), fiche de personnage (apparence, carrure, peau, cheveux, visage, yeux, barbe, extras = les futurs paramètres), 5 paliers de poids, selfie stocké sur l'appareil.
- Manque pour V1 : le mesh Blender avec morphs (le gros morceau), l'affichage 3D dans l'app, la conversion landmarks → morphs.

## Prochaines actions concrètes

1. **Mesh V1** : brief de modélisation Blender (un corps neutre, topologie propre, 60 morphs visage + 40 morphs corps, 6 tenues FITAIA, export glTF). Le fondateur décide : commande à un modeleur 3D ou réalisation maison.
2. **Preuve technique** (1 semaine, 0 €) : afficher un glTF de test dans l'app avec expo-gl + Three.js, piloter 3 morphs depuis la fiche ; vérifier les performances sur iPhone.
3. **Face Encoder V1** : à partir de Vision/MediaPipe, 20 mesures (largeur visage, hauteur mâchoire, écart yeux, largeur nez, épaisseur lèvres…) → mapping vers morphs. Tests avec 10 selfies de l'entourage, consentement écrit.
4. **Serveur FITAIA** : endpoint `selfie → paramètres` (ce que fait déjà le squelette Supabase « avatar »), les paramètres étant le seul secret transmis.
5. **Données** : dès V1, consentement explicite et séparé pour l'usage des selfies en entraînement (jamais par défaut, jamais mélangé aux CGU). C'est ce qui rendra V3 possible légalement.

## Preuve technique 3D — action 2 (2 octobre 2026)

Objectif : prouver qu'on charge un avatar GLB dans l'app Expo et qu'on modifie son corps en temps réel via des morph targets pilotés par les données de l'utilisateur, à 0 €, sans API externe.

### Ce qui a été créé

| Fichier | Rôle |
|---|---|
| `src/human-engine/core/types.ts` | Contrat du moteur : `BodyParameters`, noms des morphs, stratégie GPU/CPU, états de chargement, stats ; types des couches futures (`IdentityVector`, `FaceParameters`, `FaceLandmark`). |
| `src/human-engine/core/FitaiaHumanEngine.ts` | Façade unique : `setBody`, `animateTo`, `update(now)`, `subscribe`, `snapshot`, `attachAvatar`. Instance partagée `fitaiaHumanEngine`. |
| `src/human-engine/identity/IdentityEngine.ts` | Couche identité (posée, vide) : retiendra la personne indépendamment du poids. |
| `src/human-engine/face/FaceEngine.ts` | Couche visage (posée, vide) + liste des 12 morphs visage prévus pour le mesh V1. |
| `src/human-engine/body/BodyParameterMapper.ts` | Profil → corps (IMC, sexe, activité) et corps → poids de morphs (table de calibration par mesh). |
| `src/human-engine/body/BodyEngine.ts` | Détient le corps courant, applique la calibration, pousse vers le contrôleur. |
| `src/human-engine/body/MorphController.ts` | Seul code qui touche aux morphs. GPU : `morphTargetInfluences`. CPU : mélange des sommets par le moteur. |
| `src/human-engine/animation/MorphAnimator.ts` | Interpolation avec easing (accélère puis ralentit), repart du corps affiché, durée 0 = mouvement réduit. |
| `src/human-engine/renderer/ExpoThreeRenderer.ts` | three.js sur contexte expo-gl (sans `expo-three`) : scène, lumières, ombre de contact, caméra orbitale, boucle continue ou à la demande, mesures FPS / temps de rendu / appels de dessin / mémoire. |
| `src/human-engine/renderer/AvatarLoader.ts` | Lecture du GLB (fichier du projet, URL ou octets), parsing `GLTFLoader`, mesure sommets / triangles / textures / mémoire géométrie. |
| `src/human-engine/renderer/polyfills.ts` | `navigator.userAgent` et `TextDecoder` pour le `GLTFLoader` sous Hermes (iPhone). |
| `src/human-engine/renderer/HumanAvatarView.tsx` | Vue React : `GLView`, chargement, gestes (1 doigt = rotation, 2 doigts = zoom). Ne touche jamais aux morphs. |
| `src/human-engine/index.ts` | Point d'entrée + hook `useHumanEngine()` (état limité à 12 mises à jour/s pour l'UI). |
| `src/human-engine/assets/prototype-avatar.glb` | Avatar prototype généré par nos soins (voir ci-dessous). |
| `tools/human-engine/build_prototype_avatar.py` | Générateur du GLB, Python pur, aucune dépendance ; `--preview` produit `tools/human-engine/preview.png`. |
| `app/human-engine-debug.tsx` | Page interne `/human-engine-debug`. Accès : Mon perso → « Labo 3D (interne) », visible seulement en développement. |
| `src/components/Slider.tsx` | Curseur 0 → 1 sans dépendance, accessible (réglable au lecteur d'écran). |
| `metro.config.js` | Ajoute `glb` et `gltf` aux fichiers embarquables. |
| `tests/human-engine.test.ts` | 18 tests : profil → corps, bornes, calibration, animation, façade (interruption, abonnement). |

Dépendances ajoutées : `three` 0.170.0 (MIT), `expo-gl` ~57.0.2 et `expo-asset` ~57.0.18 (MIT, versions du SDK 57, vérifiées par `expo install --fix`), `@types/three` 0.170.0 (dev). Rien de payant, aucune API.

### Le GLB prototype

- Fabriqué par `build_prototype_avatar.py` : humanoïde de 1,80 m, construit par anneaux super-elliptiques le long de courbes (tronc, cou, tête, bras, mains, jambes, pieds), une seule primitive, une seule matière, couleurs par sommet (peau, short anthracite, ceinture lime, chaussures). **Aucune texture.**
- Licence : 100 % FITAIA (aucun mesh tiers, aucune donnée externe).
- Morph targets (positions + normales, relatifs) :
  - `body_weight` : masse globale (plateau lisse sur le tronc, hanches, cuisses, bras, cou, bas du visage) ;
  - `belly_fat` : ventre surtout vers l'avant, poignées d'amour sur les côtés ;
  - `muscle` : épaules, pectoraux, dorsaux, bras, quadriceps, mollets, taille légèrement affinée.
- Chiffres : 3 970 sommets, 7 896 triangles, 1 appel de dessin, 447 Ko (≈ 107 Ko de base + 3 × 95 Ko de deltas + index).

### Comment fonctionne le moteur

```
Profil (useGame : sexe, taille, poids, activité, objectif)
  → BodyParameterMapper.currentAndTarget()      IMC 20→38 = poids 0→1 ; IMC 22→36 = ventre 0→1 (×0,8 femmes) ; activité → muscle
  → fitaiaHumanEngine.setBody() / animateTo()   seule API des écrans
  → BodyEngine                                   bornes [0,1] + calibration du mesh
  → MorphController                              GPU : morphTargetInfluences ; CPU : mélange des sommets
  → ExpoThreeRenderer                            appelle engine.update(now) à chaque image
  → GLB
```

Exemples :

```ts
import { fitaiaHumanEngine } from '@/human-engine';
fitaiaHumanEngine.setBody({ weight: 0.65, bellyFat: 0.45, muscle: 0.30 });
await fitaiaHumanEngine.animateTo({ weight: 0.30, bellyFat: 0.20, muscle: 0.35 }, { durationMs: 1600 });
```

Deux stratégies d'application des morphs, au choix dans le labo :
- **GPU** (défaut web) : three.js mélange les morphs dans le shader via une texture de morphs (WebGL 2).
- **CPU** (défaut iPhone pour cette preuve) : le moteur mélange lui-même les sommets et normales et n'envoie que le résultat. Même rendu ; ne dépend pas du support des textures de morph par expo-gl. Coût mesuré côté logique : ≈ 12 000 additions par morph actif, uniquement quand le corps change.

### Remplacer le GLB prototype par le vrai mesh FITAIA

1. Exporter depuis Blender en glTF binaire (`.glb`) : Y vers le haut, mètres, pieds à y = 0, regard vers +Z ; cocher « Shape Keys » (et « Shape Key Normals »).
2. Nommer les shape keys exactement `body_weight`, `belly_fat`, `muscle` (le labo signale tout morph manquant).
3. Remplacer `src/human-engine/assets/prototype-avatar.glb`, ou passer une autre source : `<HumanAvatarView source={require('…/fitaia-v1.glb')} />` ou `{ uri: 'https://…' }`.
4. Si le nouveau mesh réagit plus ou moins fort, ajuster la table `MorphCalibration` (facteur, décalage par morph) dans `BodyParameterMapper.ts` : aucun écran à modifier.
5. Budgets à respecter : ≤ 30 000 triangles, ≤ 3 matières, textures ≤ 2 048 px en KTX2 plus tard, GLB ≤ 5 Mo.

### Ajouter un nouveau morph (ex. `thigh_fat`)

1. Créer la shape key dans Blender (ou dans `build_prototype_avatar.py` : ajouter son nom à `MORPHS` et son déplacement dans `morph_amounts`).
2. `core/types.ts` : ajouter le nom à `MorphTargetName` et à `MORPH_TARGETS` ; si c'est un nouveau réglage utilisateur, l'ajouter à `BodyParameters`.
3. `BodyParameterMapper.ts` : compléter `toMorphWeights`, `PROTOTYPE_CALIBRATION`, `sanitizeBody` (et `bodyFromProfile` si le profil doit le piloter).
4. `MorphAnimator.mixBody` : ajouter la nouvelle clé.
5. Ajouter un test dans `tests/human-engine.test.ts`. Le MorphController, le renderer et la vue n'ont rien à changer.

### Performances observées (2 octobre 2026, PC du fondateur, Chrome intégré, Intel UHD Graphics, zone 3D 686 × 860 px)

| Mesure | GPU (shader) | CPU (moteur) |
|---|---|---|
| Chargement du GLB (lecture + parsing) | 304–359 ms | 220 ms |
| Taille du GLB | 437 Ko (447 008 octets) | idem |
| Sommets / triangles | 3 970 / 7 896 | idem |
| Textures | 0 | 0 |
| Mémoire géométrie (GPU) | 434 Ko | ≈ 110 Ko envoyés par changement de corps |
| Appels de dessin par image | 2 (avatar + ombre) | 2 |
| Image complète, corps qui change à chaque image | 0,82–1,24 ms | 2,1 ms (dont 0,74 ms de mélange CPU) |
| Image avec corps fixe | 0,9 ms | — |

Lecture : l'image coûte environ 1 ms, soit une marge de plus de 15× sur les 16,7 ms d'un écran à 60 Hz (8,3 ms à 120 Hz). Le compteur FPS de la page n'a pas pu être lu sur le PC : le panneau du navigateur était masqué, et le navigateur suspend alors `requestAnimationFrame` (4 puis 1 image/s affichées). D'où le bouton « Mesurer 120 images », qui mesure le coût réel sans dépendre de l'affichage.
**À relever sur iPhone** : ouvrir le labo, lire le compteur FPS en rendu continu, puis appuyer sur « Mesurer 120 images » en GPU et en CPU.

### Vérifications passées

- `tsc --noEmit` : OK sur tout le projet, avec les vrais types de three.
- `expo lint` : 0 problème (les gestes passent par les props « responder » de React Native, pas de `PanResponder`).
- Preflight : 22 PASS, 0 FAIL.
- Tests du moteur (`tests/human-engine.test.ts`) : 18/18.
- Tests manuels sur le PC (navigateur) : chargement GLB, curseurs (clic et glisser), boutons Corps actuel / Objectif, animation 1,6 s échantillonnée image par image, rotation, zoom, bascule GPU ↔ CPU, banc d'essai.

### Limitations actuelles

- Mannequin stylisé : pas de visage, pas de cheveux, pas de mains articulées, pas de squelette (donc pas de poses ni d'animation de membres).
- Morphs génériques : les bourrelets et la répartition des graisses ne sont pas encore réalistes ; un artiste 3D fera mieux en sculptant les shape keys.
- Mapping profil → corps basé sur l'IMC seul (pas de tour de taille, pas de photo).
- Pas d'ombres portées réelles, pas d'anticrénelage sur web (MSAA ×4 demandé sur iPhone).
- Le GLB est embarqué dans l'app (447 Ko) ; en production, le mesh personnel viendra du serveur FITAIA.

### Prochaine étape (validation fondateur avant d'aller plus loin)

1. **Test iPhone** (critère de réussite) : Expo Go → Mon perso → « Labo 3D (interne) ». Relever FPS en rendu continu, puis « Mesurer 120 images » en CPU et en GPU. Si le GPU s'affiche correctement sur iPhone, il devient le défaut partout.
2. **Mesh FITAIA V1** : brief Blender (corps neutre, topologie propre, 40 morphs corps dont les 3 actuels, 12 morphs visage listés dans `FaceEngine.ts`, 6 tenues, ≤ 30 000 triangles, export glTF). Décision : modeleur 3D externe ou réalisation maison.
3. **Intégration produit** : remplacer, sur Mon perso, l'image du perso par `HumanAvatarView` en mode « à la demande », avec « Aujourd'hui → objectif » animé à chaque nouvelle pesée.
4. **Face Encoder V1** (après le mesh) : repères Apple Vision → 12 paramètres visage, côté serveur.

## Avatar premium — branche `premium-avatar` (2 octobre 2026)

Le mannequin de la preuve 3D reste un **asset de test**. Le premier humain premium (`premium-male-01` : visage, yeux,
peau texturée, cheveux, t-shirt, jogging, baskets, 9 morphs, vêtements qui suivent le corps) est branché au moteur
sans changer `BodyParameters`, `setBody()` ni `animateTo()` : une couche de **drivers** par avatar traduit le corps
en morphs du mesh. Le labo `/human-engine-debug` a un comparateur Prototype / Premium (Premium par défaut).
Détails, pipeline, licences (CC0), budgets mobiles : **docs/PREMIUM-AVATAR.md**.

## Ce que l'IA fait et ne fait pas ici

Claude peut écrire l'architecture, le code Python/PyTorch, le code Three.js, les shaders, les scripts d'entraînement, les tests et l'optimisation. Ce qu'aucune IA ne remplace : la modélisation 3D de qualité, la collecte de données consenties et le temps d'entraînement. On planifie en conséquence.
