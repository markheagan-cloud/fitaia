# Boutique FITAIA : ce qu'on a pris aux boutiques de jeux, et pourquoi

26 novembre 2026. Recherche faite sur les retours de joueurs et les décisions des éditeurs ; le code est dans
`src/shop/` (fiches, à venir, ma liste) et `app/(tabs)/boutique.tsx` + `app/article/[id].tsx`.

## Ce que les joueurs reprochent, et ce que fait FITAIA

| Reproche fréquent | Exemple | Dans FITAIA |
|---|---|---|
| Comptes à rebours qui poussent à acheter vite | Le régulateur néerlandais (ACM) a mis 1,125 M€ d'amende à Epic, dont une partie pour des minuteurs de la boutique Fortnite ; Epic a remplacé les minuteurs par la date de sortie de chaque article ([ACM](https://acm.nl/en/publications/acm-imposes-fine-epic-unfair-commercial-practices-aimed-children-fortnite-game)) | Une édition limitée affiche sa date de fin et le nombre de jours, jamais un minuteur. La date est appliquée dans le code. |
| Ne pas savoir quand un article part | Fortnite a ajouté « Leaving Today », bien reçu car des joueurs croyaient avoir plus de temps ([Escapist](https://escapistmagazine.com/?p=218690)) | « Derniers jours » sur la carte quand il reste 7 jours ou moins. |
| Monnaie en paquets qui ne tombent jamais juste | Kotaku sur les V-Bucks restants ([Kotaku](https://kotaku.com/fortnite-v-bucks-exact-amount-microtransaction-sonic-halo-2000624959)) | Pas de paquets de monnaie : les Fitcoins se gagnent en faisant ses défis, la fiche dit exactement combien il manque. |
| Boutique « vide », rien qui donne envie | The Finals ([Charlie Intel](https://charlieintel.com/the-finals/the-finals-players-frustrated-as-bare-cosmetic-store-wastes-its-potential-295085)) | 16 tenues dessinées sur le perso, À la une, collections, rayons, et ce qui arrive. |
| Raretés supprimées : casier fade | Fortnite ([TechRadar](https://www.techradar.com/gaming/consoles-pc/fortnite-has-removed-item-rarities-and-some-players-arent-happy)) | Quatre raretés gardées, avec leur couleur. |
| Même articles qui reviennent tout le temps | Fortnite ([Dexerto](https://www.dexerto.com/fortnite/fortnite-players-blast-ridiculous-item-shop-over-rotation-issues-2571203/), [Sportskeeda](https://sportskeeda.com/fortnite/i-m-sick-seeing-fncs-skins-community-frustrated-repetition-fortnite-item-shop-cosmetics)) | Catalogue complet visible, pas de rotation quotidienne ; nouveautés marquées « Nouveau » 21 jours. |
| Rotation qui empêche les nouveaux d'avoir les anciens articles | Darktide, Helldivers 2 (forums Steam) | Les tenues permanentes restent en vente ; seules les éditions limitées ont une fin, annoncée. |
| Tirages au hasard | (constat général, règles Apple sur les probabilités) | Aucun coffre : on choisit l'article. |

## Ce qui plaît et qu'on a repris (mécaniques, pas de noms ni de visuels d'un jeu)

- Voir l'article sur son personnage avant de le prendre (ici : la tenue dessinée sur le perso de la personne).
- Fiche détaillée : pièces de la tenue (haut, bas, chaussures, accessoires), décor, collection, rareté, prix, solde.
- « Ma liste » : garder un article de côté, il remonte en haut de la boutique dès qu'il est en vente.
- Collections avec progression (2 / 4 possédées).
- Articles annoncés « à venir » : jamais d'image inventée, un pictogramme du type d'article et « Dessin à venir ».

## Reste à faire

- Chaussures, casquettes, lunettes et accessoires portables à part : la recette du service de dessin doit apprendre à
  dessiner « tenue + paire choisie » sur le perso. Ensuite on les passe de « À venir » à « En vente ».
- Prix et dates des éditions limitées : à valider par Mark (fichier `src/shop/catalogue.ts`, `WINDOWS`).
