# FITAIA, sauvetage de l'avatar 3D : rapport du 18 octobre 2026

## Ce qui était faux, et pourquoi
| Défaut vu sur tes captures | Cause trouvée | Correction (à la source) |
|---|---|---|
| Épaules gonflées | Le corps nu est normal (rendu sans vêtements). C'est le t-shirt MakeHuman, taillé pour d'autres épaules, qui flottait jusqu'à plusieurs cm au-dessus de la peau | Au-dessus de la poitrine, le t-shirt est ramené à 1 cm max de la peau (`_clear_body`, paramètre `cap_gap`) |
| Épaules carrées, cou long | Écart d'épaules +10 %, deltoïdes +30 %, clavicules à plat | Écart d'épaules d'origine, deltoïdes +15 %, clavicules −10°, trapèze plus marqué, cou raccourci |
| Bras rigides, mains plaquées sur les cuisses | Avant-bras pliés de 22° vers l'avant | Avant-bras à 10°, bras écartés de 19° : les mains pendent le long des cuisses |
| Peau qui perce le t-shirt, ourlet déchiqueté près des bras | Le t-shirt ne tenait pas compte du corps ; les avant-bras le repoussaient | Tissu toujours au-dessus de la peau, sauf avant-bras et mains |
| Plis du t-shirt qui se retournaient en Surpoids (aisselles) | Mélange des morphs `body_weight` + autres | `_unflip` : 120 triangles retournés ramenés à 16 (0,04 %) sur tout le parcours |
| Raie claire sur la nuque | Couture UV du crâne | Peinture du cuir chevelu étendue au-delà des coutures (`face_art.py`) |
| L'app chargeait un GLB du 4 octobre | `FABRIQUER-AVATAR.bat` appelait une ancienne copie du code | Le .bat appelle l'usine `hero3d`, contrôle le GLB, puis le copie dans l'app seulement s'il est valide |

## Contrôle technique du GLB (exécuté, `validate_glb.py`)
- GLB lisible, 3,9 Mo, 37 312 triangles, 8 images embarquées, 7 matériaux, aucun fichier externe.
- 15 morphs avec les mêmes noms sur les 7 meshes (corps, yeux, sourcils, cils, cheveux, tenue, baskets).
- Chaque morph déforme réellement au moins un mesh (ventre 8,2 cm, poids 5,4 cm, muscle 4,2 cm…). Ventre, taille, hanches, cuisses et mollets n'agissent que sur la tenue : la peau cachée par les vêtements n'est pas dans le GLB (moins de triangles).
- Triangles retournés : corps 0 ; t-shirt 13 en Surpoids, 2 en Actuel, 16 en Objectif, 14 à 16 aux étapes 25, 50 et 75 %.
- Résultat : GLB VALIDE (`validation.json`).

## Dans l'app (testé sur la version web, pas encore sur iPhone)
- Nouvel écran « Mon corps en 3D » (`app/corps.tsx`) : ouvert en touchant le perso dans Mon perso.
- On y voit le vrai GLB, avec une rotation 360° au doigt, les boutons Aujourd'hui / Objectif et un curseur continu entre les deux. La mention « illustration, pas une prédiction médicale » est affichée.
- Le corps vient du profil (taille, poids, objectif) via `setBody` / `animateTo`. Aucun contrat du moteur n'a changé.
- tsc, lint et les 13 fichiers de tests passent, dont les 29 tests du Human Engine.

## Fichiers modifiés ou créés
- `hero3d/human/code/build_premium_avatar.py` : pose, proportions, ajustement du t-shirt, `_clear_body`, `_unflip`, ourlet, couleur des cheveux
- `hero3d/human/code/face_art.py` : coutures UV du cuir chevelu
- `hero3d/human/code/wardrobe.py` : plis peints adoucis
- `hero3d/human/code/pipeline/validate_glb.py` (nouveau) : contrôle du GLB
- `app/tools/premium-avatar/FABRIQUER-AVATAR.bat` : une seule chaîne, avec contrôle et copie
- `app/src/human-engine/assets/premium-male-01.glb` et `.stats.json` : nouveau GLB
- `app/app/corps.tsx` (nouveau), `app/app/_layout.tsx`, `app/app/(tabs)/perso.tsx`
- `app/assets/hero/*.jpg` et `app/assets/community/portraits/moi/*.png` : nouveaux rendus

## Ce qui n'est pas résolu
- **Visage** : c'est encore le visage MakeHuman retouché. Il est crédible mais générique. Pour un visage vraiment unique, il faut le module photo → visage, déjà dans le dépôt mais non validé.
- **Vêtements** : c'est un vêtement CC0 recoupé et non un vrai patronage. Il reste un petit pan de tissu sous le bras en Objectif, et l'ourlet est un peu irrégulier de dos.
- **Cheveux en 3D temps réel** : ce sont des cartes plus sombres que dans les rendus Cycles.
- **iPhone** : pas encore mesuré (FPS, mémoire, décodage des textures). Il faut un build EAS avec ton compte Expo.
- **Morphs** : pas de rendu « chaque morph seul » pour cette version. Les 13 paramètres sont vérifiés par le contrôle du GLB et les 29 tests du moteur, pas par une planche.
