# FITAIA — Avatar premium (branche `premium-avatar`)

> Objectif : remplacer le mannequin « crash test » par un humain semi-réaliste premium (visage, peau, cheveux,
> vêtements de sport, chaussures), **sans toucher au moteur** : `BodyParameters`, `setBody()`, `animateTo()`,
> la logique actuel → objectif et les tests restent identiques. Seule la couche visuelle change.
>
> Statut au 2 octobre 2026 : **premier homme premium complet** (`premium-male-01`) intégré au moteur,
> visible dans le labo `/human-engine-debug` (comparateur Prototype / Premium). Le mannequin reste un asset de test.

## 0. L'usine à avatars (octobre 2026)

Une commande produit tout le personnage, du corps CC0 au GLB de l'app et à la planche de validation :

```
FITAIA\app\tools\premium-avatar\FABRIQUER-AVATAR.bat      (ou : python factory.py --src <assets-src> --blender <blender.exe>)
```

| Étape | Outil | Sortie |
|---|---|---|
| 1. Vêtements générés sur notre corps (aisance, bords, passepoil) | `garments.py` | `garments_in.json` |
| 2. Simulation du tissu, jogging puis t-shirt, dans la pose finale | Blender `blender/cloth_sim.py` | `garments_out.json` |
| 3. Avatar : corps, visage sculpté, peau, cheveux, vêtements liés au corps, pose idle, 15 morphs | `build_premium_avatar.py` | `avatar.glb` |
| 4. Rendu studio Cycles, 3 états × 4 vues | Blender `blender/render_sheet.py` | `rendus/*.png` |
| 5. Planche de validation | `compose_sheet.py` | `planche.jpg` |

Chaîne Base Human → Identity → Face → Body Shape → Skin → Hair → Clothes → Rig → Body Morphs → FITAIA Runtime :
- **Base Human / Rig** : maillage MakeHuman CC0 + squelette game_engine (52 os), pose contrapposto calculée.
- **Face** : sculpture par cibles CC0 (mâchoire, pommettes, nez, lèvres, yeux, légère asymétrie) dans `CONFIG.base.shape`.
- **Body Shape** : 13 réglages corrélés côté app (`src/human-engine/body/BodyShape.ts`) → 15 morphs du GLB
  (body_weight, body_weight_low, muscle, muscle_low, belly_fat, waist, hips, chest, shoulders, upper_arm, forearm, thigh, calf, face_fat, neck_fat).
  L'app ne pilote que poids / ventre / muscle ; la corrélation garantit un corps cohérent (visage, cou, bras, cuisses évoluent ensemble).
- **Clothes** : générés et simulés sur notre corps, chaque sommet lié à sa zone de peau → ils suivent tous les morphs.
- **Runtime** : inchangé (`setBody`, `animateTo`, drivers par avatar).

Matériel : Blender 4.5 LTS portable (`FITAIA\tools`), carte NVIDIA (OptiX). Simulation ≈ 45 s, rendu ≈ 40 s par vue.

## 0 bis. Portraits sociaux de la Communauté (4 octobre 2026)

Promesse : « je prends ma photo → mon personnage me ressemble → il évolue avec moi » — et c'est CE personnage que les autres
voient. Dans toute la Communauté, une personne est montrée par des rendus de l'usine (même avatar maître que le reste de
l'app), mis en cache en images : on ne charge jamais le GLB complet dans une liste.

```
FITAIA\app\tools\premium-avatar\portraits.py --src <assets-src> --blender <blender.exe> --out FITAIA\hero3d\portraits\<version>
          [--only moi,demo_demo_sarah] [--samples 160] [--framings head,bust,full,card]
python tools/premium-avatar/portraits_table.py        # régénère src/community/avatars/portraits.ts après copie des PNG
```

| Étape | Outil | Sortie |
|---|---|---|
| 1. Avatar maître + mèches + repères de cadrage | `build_premium_avatar.build(src, out, cfg=…)` | `avatar.glb`, `avatar.hair.npz`, `avatar.portrait.json` |
| 2. Studio FITAIA, 4 cadrages, fond transparent, regard caméra | Blender `blender/render_portraits.py` | `_rendus/<clé>/{head,bust,full,card}.png` |
| 3. Réduction (alpha prémultiplié), carte sur fond studio, PNG ≤ 300 Ko, planche | `compose_portraits.py` | `final/<clé>/*.png`, `planche.png` |

Cadrages (contrat `src/community/avatars/portraits.ts`, modes de `AvatarPortrait`) :
`head` 512×512 (tête, transparent) · `bust` 640×640 (buste, transparent) · `full` 640×1024 (corps entier, transparent,
ombre de contact) · `card` 640×800 (carte sociale 4:5, fond studio FITAIA #ECEAE5 → #E3E1DC, halo doux).
Fichiers : `assets/community/portraits/<clé>/<cadrage>.png`, clé = avatarId avec « : » → « _ ».

- **« moi »** = le héros `premium-male-01` : même corps, même visage, même peau, état « actuel » de `states-hero.json`
  (le GLB de l'app et `FABRIQUER-AVATAR` ne changent pas : vérifié identique octet pour octet, md5 `95ccb073…`).
  Pour les portraits seulement (`persons.hero_config()`) : coiffure en mèches de la MÊME coupe (longueurs = épaisseur de
  la coupe en coquilles) et **tenue de portrait** = t-shirt ajusté gris pierre + jogging anthracite (couleurs du héros) en
  vêtement MakeHuman repeint, car le t-shirt simulé du GLB a un col à bords francs (pointes aux épaules, peau qui affleure)
  qui ne passe pas en gros plan.
- Dans l'app (`AvatarPortrait`), « moi » montre TOUJOURS le perso personnalisé de l'utilisateur s'il existe (dessin IA de
  la tenue portée ou fiche validée) ; le portrait de l'usine « moi » ne sert que sans perso personnalisé (jamais l'image
  d'une autre personne à la place de la sienne).
- **Membres de démonstration** (`persons/community-demo.json`, fiches de `devData.ts`) : identités 100 % procédurales —
  cibles MakeHuman CC0 tirées avec une graine fixe par personne, aucun visage réel. `persons.config_for()` :
  macros femme / homme, carrure (mince / athlétique / costaud / rond), origines et peau MakeHuman selon la carnation s1–s8
  (teinte étalonnée sur le héros), sourcils et cils adaptés, coiffure, barbe, accessoires (lunettes, créoles, montre),
  t-shirt ajusté + legging (femme) / jogging (homme) dans une couleur propre à chacun (`wardrobe.py` : vêtements MakeHuman
  repeints, logos, coutures et délavage effacés), baskets blanches. Mêmes 15 morphs du corps que le héros.
- **Cheveux en mèches** (`groom.py`) : 40 000 à 90 000 courbes par tête, poussées sur le cuir chevelu, guidées par un champ
  de coiffage projeté sur le crâne, collisions tête / cou / épaules, mèches (clumping), frisure. Styles : `crop` (court,
  dégradé), `ponytail`, `curly`, `cards` ; barbes `short` / `full` (longueur, volume, frisure réglables par personne).
  Rendu Principled Hair BSDF (mélanine).
  - `cards` (cheveux longs et mi-longs) : la coiffure dessinée par un artiste (cartes MakeHuman CC0, ex. `long01`) est
    convertie en VRAIES mèches — chaque ligne verticale opaque de la texture devient une courbe 3D posée sur la carte, puis
    épaissie, regroupée, ondulée (`wave`) et coupée à la longueur voulue (`cut_below_chin`, en dm sous le menton). On garde
    la silhouette de l'artiste (pas d'effet « casque » ni « rideau »). Le cuir chevelu n'est teinté que là où les racines
    couvrent réellement le crâne, et jamais devant la ligne avant des mèches (pas de bande « rasée » sur le front).
    Les styles procéduraux `long` / `milong` restent disponibles mais ne sont plus utilisés (silhouette en rideau).
  Le GLB temps réel garde des cartes MakeHuman de la même coupe (repli) ; les rendus hors ligne utilisent les mèches.
- **Détails de tenue** : la chaussette haute des baskets MakeHuman (`shoes05`) traversait le legging aux chevilles → option
  `cut_above` (faces au-dessus du col de la chaussure retirées) ; les pixels hors des îlots UV des vêtements prennent la
  couleur de la pièce voisine (logo du t-shirt effacé sans tache) ; jogging ajusté des hommes : entrejambe sobre
  (`pelvis/bulge-decr` + lissage laplacien du pli sur la topologie du vêtement, option `smooth_crotch` — fait AVANT la
  séparation des coutures UV : un lissage au rendu ouvrait les coutures et laissait des fentes noires).
- **Lunettes** (`accessories.py`) : monture à la largeur des tempes (mesurée devant l'oreille), branches droites plaquées
  contre la tête et posées sur la racine de l'oreille.
- Seuls des **petits gestes de rendu** sont appliqués au héros (pas au GLB) : la coiffure, la tenue de portrait, le regard.

État au 4 octobre 2026 : 9 avatars × 4 cadrages dans `assets/community/portraits/` (36 PNG, 136 à 285 Ko, 7,8 Mo au total),
table de `portraits.ts` générée ; vérifié sur une copie de l'app (TypeScript OK, les 36 `require()` résolus par esbuild,
lint OK). Rendus : Cycles 128 échantillons, ×1,5 puis réduction, ≈ 2 min par avatar (GTX 1650).

## 0 ter. Contrôle visuel de l'identité (photo → avatar)

« Un score algorithmique est un signal de test, pas la vérité. Identité visuelle réelle > score numérique. »
Chaque identité produit dans `controle.json` :

- `automated_similarity_score` : l'ancien score géométrique (rapports de repères MediaPipe) — **signal de test** ;
- `visual_quality_gate` ∈ `FAIL` | `REVIEW_REQUIRED` | `PASS` :
  - `FAIL` si le verdict humain est FAIL, ou si UNE mesure stricte dépasse son seuil ;
  - `PASS` **uniquement** avec un verdict humain explicite (`identites/<nom>/human_review.json`
    `{"verdict": "PASS"|"FAIL", "by", "note", "avatar_md5"}`) et aucune mesure stricte hors seuil ;
  - sinon `REVIEW_REQUIRED` (jamais de PASS automatique).
  Un verdict humain porte sur une version précise de l'avatar (`avatar_md5`) : si l'avatar est refabriqué, il ne s'applique
  plus et une nouvelle revue est demandée.
- `valid_output` = gate PASS **et** score ≥ 85.

Mesures strictes (photo ↔ rendu au même angle, aligné par similarité sur des repères stables ; seuils de perception) :
largeur de mâchoire, largeur du bas du visage (bouche / menton), proportion largeur / hauteur du bas du visage, **largeur
réelle du bas du visage sur la silhouette** (segmentation peau du visage), hauteur nez → menton, distances verticales
yeux → nez, nez → bouche, bouche → menton, nez (largeur, longueur), yeux (largeur, ouverture), forme du contour du visage,
**contour des cheveux** (IoU des masques « cheveux »), **coiffure reconnue comme des cheveux** (une coiffure en casque est
vue comme un chapeau par la segmentation), silhouette du haut de la tête, **sourire visible sur l'avatar** (blendshapes
MediaPipe du rendu), coins de bouche relevés, bouche entrouverte. Les mesures perturbées par le sourire de la PHOTO sont
« non mesurées » (jamais comptées comme réussies). La planche `ressemblance.jpg` affiche le statut du contrôle visuel en
premier, puis le score automatique.

Corrections de la chaîne d'identité (itérations du 4 octobre) : couleur des cheveux en mélanine / rougeur estimées sur la
photo (le paramétrage « couleur » blanchissait les cheveux clairs) ; mèches plus denses (90 000), longueur ≈ 3 × l'épaisseur
mesurée, dessus jamais nu là où la photo a des cheveux plaqués, cuir chevelu teinté de la couleur des cheveux ; la passe 2
corrige aussi à partir des mesures strictes (`yeux_nez` → nez abaissé, `silhouette_bas_visage_menton` → graisse du visage
réduite, cible posée telle quelle car invisible aux repères) ; planche en UTF-8.
Sourire de la photo neutralisé avant projection (bouche exclue → lèvres neutres de la
texture de base, plis du sourire adoucis) ; état « actuel » = visage ajusté tel quel (plus de graisse de visage héritée du
héros, cause du bas du visage trop large) ; option `--strands` : coiffure en mèches dont les longueurs viennent de
l'épaisseur des cheveux mesurée sur la photo (fin du « casque » dentelé).

## 1. Architecture : ce qui a changé et ce qui n'a pas changé

```
UserProfile → BodyParameters (inchangé) → FitaiaHumanEngine (inchangé : setBody / animateTo / update)
            → BodyEngine → [NOUVEAU] drivers de l'avatar → MorphController (par NOM) → GLB
```

- **Drivers** (`MorphDriver`) : chaque avatar déclare comment `weight / bellyFat / muscle` pilotent SES morphs
  (courbe linéaire par morceaux). Le prototype a des drivers « identité » ; le premium en a d'autres.
  Un nouveau GLB = une nouvelle table de drivers, jamais une modification du moteur.
- **Registre** `src/human-engine/avatars/index.ts` : `AVATARS`, `DEFAULT_AVATAR` (= premium), `PREMIUM_MALE_DRIVERS`.
- **MorphController** applique les valeurs par nom sur **tous** les meshes : le même `body_weight` déforme le corps,
  le t-shirt, le jogging et les chaussures → **les vêtements suivent le corps**.
- **Renderer** : option `look` — `clay` (prototype) ou `studio` (tone mapping ACES, key chaude, fill froide, deux rims,
  ombre de contact ; aucune shadow map pour rester à 60 FPS sur mobile).
- **Textures sur iPhone/Android** : expo-gl ne décode pas les images d'un GLB. `AvatarLoader` les retire du fichier
  avant GLTFLoader, les décode en JS (`jpeg-js`, `upng-js`) et les pose en `DataTexture` (mipmaps, sRGB).
  Sur le web, GLTFLoader les décode normalement. Le labo affiche le temps de décodage.

## 2. Pipeline de fabrication (outil Python, hors app)

`tools/premium-avatar/build_premium_avatar.py` — 100 % reproductible, ~3 s, aucun logiciel 3D requis.

| Couche | Ce que fait le script | Source |
|---|---|---|
| Squelette | rig « game engine » (joints), poids de skinning ; pose détendue bras le long du corps (LBS à pivots fixes → les morphs restent linéaires) | MakeHuman / MPFB2 |
| Mesh de base | `base.obj` (groupe `body`), proportions idéales, mélange d'origines | MakeHuman |
| Morphs du corps | macros officielles (poids, muscle) + cibles locales (ventre, taille, hanches, torse, épaules) | MakeHuman `.target` |
| Visage | yeux haute définition (iris marron), sourcils, cils — ajustés au visage par proxy | MakeHuman |
| Peau | texture jeune homme 2048 px, rugosité douce | MakeHuman |
| Cheveux | coupe courte (alpha-test) | MakeHuman |
| Vêtements | t-shirt anthracite + jogging noir (recolorés, AO conservée, logo effacé), baskets ; normal map | MakeHuman (asset packs CC0) |
| Animations | à venir (respiration / idle) | — |

Les vêtements, yeux, cheveux sont des **proxies `.mhclo`** : chaque sommet = 3 sommets du corps pondérés + décalage.
Le script refait cet ajustement pour **chaque morph** → les vêtements suivent exactement la morphologie.

Reconstruire (sur le PC, après `TELECHARGER-AVATAR-PREMIUM.bat` et `PREPARER-MORPHS.bat`) :

```
npm run avatar:premium        # → src/human-engine/assets/premium-male-01.glb (+ .stats.json)
python tools/premium-avatar/preview_glb.py   # aperçu logiciel (contrôle sans lancer l'app)
```

## 3. L'avatar `premium-male-01`

| Mesure | Valeur |
|---|---|
| Fichier | 3,9 Mo (textures incluses) |
| Sommets / triangles | 18 497 / 33 108 |
| Taille | 1,76 m |
| Morphs | body_weight, body_weight_low, muscle, muscle_low, belly_fat, waist, hips, chest, shoulders |
| Textures | peau 2048, cheveux 1024, yeux PNG, vêtements + normal map |

Drivers (calibrés sur les macros MakeHuman) :
- **poids** : sous IMC ≈ 23 → `body_weight_low` (amincit) ; au-dessus → `body_weight` (macro MakeHuman « max weight »
  ×2,3 + un peu de taille et de hanches : ventre, bras, cuisses, visage s'épaississent — pas un simple scale) ;
- **muscle** : `muscle_low` sous la moyenne, `muscle` au-dessus ;
- **ventre** : `belly_fat` plafonné à 0,75 (au-delà l'effet devient irréaliste).
- `waist, hips, chest, shoulders` sont dans le GLB mais pas encore pilotés (prochaine étape : nouveaux `BodyParameters`).

## 4. Licences

Assets MakeHuman / MPFB2 : **CC0 1.0** (domaine public, usage commercial libre, sans attribution obligatoire).
Le code de MPFB2 (GPLv3) n'est **pas** utilisé : nos scripts lisent seulement les fichiers de données.
Les archives source sont dans `FITAIA/assets-src` (hors du dépôt de l'app).

## 5. Ajouter une base, une carnation, une coiffure, une tenue

1. Copier le bloc `CONFIG` du script, changer `id`, `base.race`, `skin`, `hair`, `clothes` (tout asset MakeHuman CC0).
2. Lancer le script → nouveau GLB dans `src/human-engine/assets/`.
3. Ajouter une entrée dans `AVATARS` (source + drivers). Femme : macros `female-young` ; drivers propres.
4. Le labo l'affiche automatiquement dans le comparateur.

Une identité FITAIA cohérente = même éclairage studio, même famille de tenues (anthracite / noir / accent citron),
même niveau de détail pour toutes les bases.

## 6. Budgets mobiles

- Cible : < 40 000 triangles, < 6 Mo par avatar, 1 seul avatar à l'écran, rendu « à la demande » en production.
- Si un iPhone ancien peine : peau 1024 px (÷4 en mémoire), puis LOD (mesh décimé), puis KTX2.
- Morphs : stratégie CPU par défaut sur mobile (indépendante du support GPU des textures de morph).

## 7. Limites connues (v0.1)

- Photo 2 (référence artistique) pas encore reçue : la cible visuelle provisoire = les rendus réalistes de l'app.
- Racine des cheveux un peu nette (alpha-test) ; reflet clair sur le dessus.
- Très léger reste du logo d'origine sur le t-shirt ; accent citron des baskets peu visible.
- Pas encore d'animation idle ; pas d'ombres portées (ombre de contact seulement).
- Les FPS affichés dans le panneau navigateur intégré sont bridés par le navigateur (le banc d'essai mesure 3,3 ms/image sur le PC → ~300 FPS possibles).
- Décodage des textures sur iPhone (Hermes) à mesurer en vrai.
