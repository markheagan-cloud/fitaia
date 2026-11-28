# Économie de la boutique : combien on gagne, combien ça coûte, quand on débloque

26 novembre 2026. Tous les chiffres ci-dessous sortent du code (`src/shop/rythme.ts`, `scripts/rythme-table.ts`) avec les vraies
règles de l'app : rien n'est estimé à la main. Si un prix ou une récompense change, relancer le script et le test
`tests/shop-rythme.test.ts` dit si un objectif de rythme casse.

## Ce que l'app donne (vrai, en place)

- Défi du jour réussi : +50 Fitcoins (une fois par jour) et 50 Points FITAIA (PF) par défi, 150 PF max par jour.
- Repas enregistré : +10 Fitcoins (une fois par jour) et 5 PF par repas, 15 PF max par jour.
- Nouveau le 26/11 : +100 Fitcoins au premier défi réussi, et un bonus à chaque étape du Parcours :

| Palier | Bonus |
|---|---:|
| Premier défi réussi (50 PF) | +100 |
| Étape Élan (500 PF) | +150 |
| Palier 900 PF (900 PF) | +50 |
| Palier 1300 PF (1300 PF) | +100 |
| Étape Régulier (1500 PF) | +250 |
| Étape Engagé (3500 PF) | +400 |
| Étape Confirmé (7000 PF) | +600 |
| Étape Pilier (12000 PF) | +1000 |

Pas de monnaie payante, pas de coffre au hasard. L'achat en euros des éditions limitées est **préparé mais pas
ouvert** : il passera par les achats intégrés Apple, pas encore branchés.

## Les trois profils (hypothèses écrites, pas des mesures)

| Profil | 7 jours | 30 jours | 60 jours | 90 jours |
|---|---:|---:|---:|---:|
| À fond (3 défis et 3 repas, 7 jours sur 7) | 720 | 2850 | 5250 | 8050 |
| Régulier (Le défi du jour et 2 repas, 6 jours sur 7) | 460 | 2210 | 3770 | 5730 |
| Occasionnel (Le défi du jour et 1 repas, 3 jours par semaine) | 280 | 1030 | 1960 | 2990 |

## Combien de jours pour chaque tenue, en partant de zéro

| Tenue | Rareté | Prix | À fond | Régulier | Occasionnel |
|---|---|---:|---:|---:|---:|
| Sprint Rouge | Commune | 150 | 1 j | 1 j | 1 j |
| Dojo Blanc | Commune | 200 | 2 j | 2 j | 3 j |
| Street Graphite | Rare | 350 | 4 j | 5 j | 10 j |
| Cargo Urbain | Rare | 400 | 4 j | 5 j | 10 j |
| Plage Corail | Rare | 450 | 4 j | 6 j | 12 j |
| Ring Doré | Rare | 550 | 5 j | 9 j | 17 j |
| Olive Tech | Rare | 650 | 6 j | 10 j | 22 j |
| Alpin Givre | Épique | 700 | 7 j | 10 j | 22 j |
| Crème Studio (limitée) | Épique | 900 | 9 j | 12 j | 24 j |
| Pilote Néon (limitée) | Épique | 1100 | 10 j | 17 j | 33 j |
| Titane Néon (limitée) | Légendaire | 1500 | 15 j | 23 j | 45 j |
| Samouraï Néon (limitée) | Légendaire | 1600 | 16 j | 25 j | 50 j |
| Atelier Noir (limitée) | Légendaire | 1800 | 20 j | 27 j | 54 j |
| Astro Lime (limitée) | Légendaire | 2000 | 22 j | 29 j | 61 j |
| Royal Or (limitée) | Légendaire | 2400 | 23 j | 34 j | 68 j |

## La chronologie : ce qu'on débloque, jour après jour

| Profil | Ordre de déblocage, jour par jour (la moins chère d’abord) |
|---|---|
| À fond | J1 Sprint Rouge · J4 Dojo Blanc · J7 Street Graphite · J10 Cargo Urbain · J15 Plage Corail · J22 Ring Doré · J29 Olive Tech · J40 Alpin Givre · J45 Crème Studio · J64 Pilote Néon · J73 Titane Néon · J99 Samouraï Néon |
| Régulier | J1 Sprint Rouge · J5 Dojo Blanc · J10 Street Graphite · J17 Cargo Urbain · J24 Plage Corail · J29 Ring Doré · J40 Olive Tech · J54 Alpin Givre · J68 Crème Studio · J86 Pilote Néon · J115 Titane Néon |
| Occasionnel | J1 Sprint Rouge · J10 Dojo Blanc · J22 Street Graphite · J33 Cargo Urbain · J47 Plage Corail · J64 Ring Doré · J80 Olive Tech · J108 Alpin Givre |

## Les choix et pourquoi

| Choix | Pourquoi (source) |
|---|---|
| Une tenue dès le premier jour (+100 au premier défi) | Effet de progression offerte : une carte de fidélité avec 2 tampons offerts est complétée par 34 % des clients contre 19 % sans ([Nunes et Drèze, 2006](https://msbfile03.usc.edu/digitalmeasures/jnunes/intellcont/Endowed%20Progress%20Effect-1.pdf)) |
| Un déblocage environ chaque semaine le premier mois pour un régulier, puis des objectifs plus longs | Même logique que les passes de saison : récompenses rapprochées au début, plus espacées ensuite |
| Bonus d'étape de plus en plus gros | Garder une raison de continuer quand les prix montent |
| Les éditions limitées : une légendaire possible pour un régulier avant la fin, pas toutes | Il faut choisir ; c'est là que l'achat en euros aura du sens plus tard. Date de fin affichée, pas de minuteur ([amende ACM à Epic](https://acm.nl/en/publications/acm-imposes-fine-epic-unfair-commercial-practices-aimed-children-fortnite-game)) |
| Délai affiché sur l'article et calendrier personnel | Calculés sur les 14 derniers jours de la personne (ses défis et repas réels) ; avec moins de 3 jours de données, l'app le dit et prend le profil Régulier |
| Prix des « monnaies » qui tombent juste | Pas de paquets de monnaie : les joueurs détestent les restes de V-Bucks ([Kotaku](https://kotaku.com/fortnite-v-bucks-exact-amount-microtransaction-sonic-halo-2000624959)) |
| Comparaison Duolingo | Duolingo vend un gel de série environ 200 gemmes et donne des gemmes pour les quêtes du jour ([guide](https://duolingoguides.com/how-much-is-a-streak-freeze-on-duolingo/), source non officielle) : même idée, une monnaie gagnée par la régularité |

Ce qui reste à décider par Mark : les prix en euros des éditions limitées (au moment des achats Apple), et s'il veut
un bonus de série (7 jours d'affilée), qui demande une nouvelle règle côté serveur.

## Prix en euros (26 novembre 2026)

Décision de Mark : un prix fixe Apple par tenue, pas de monnaie achetable, pas de lot. Les Fitcoins restent gagnés
seulement. Grille calée sur le marché (`src/shop/prixEuros.ts`, testée par `tests/shop-prix.test.ts`) :

| Rareté | Prix | Repère marché |
|---|---|---|
| Commune | Fitcoins seulement | on l'a en 1 à 4 jours de défis |
| Rare | 2,99 € | Brawl Stars : apparence 2,49 € à 5,99 € |
| Épique | 5,99 € | Fortnite : tenue rare 800 V-Bucks ≈ 6,50 € |
| Légendaire | 9,99 € | Clash Royale : apparences de tour 1 500 à 2 500 gemmes, lots 10 à 15 € |
| Royal Or | 14,99 € | Fortnite : tenues légendaires 2 000 V-Bucks ≈ 16 € |

Chaque tenue payable en euros reste payable en Fitcoins : payer va plus vite, ne donne rien de plus.
Produits App Store : `com.fitaia.app.tenue.<tenue>` (non consommables), créés par `node scripts/asc-achats.mjs --appliquer`.
