---
name: fitaia-ui-qualite
description: Vérifier et améliorer la qualité visuelle et UX d'un écran React Native/Expo FITAIA avant livraison (anti-slop UI, accessibilité, mouvement, safe areas). Utiliser à chaque nouvel écran ou refonte.
---
# Qualité UI FITAIA (inspiré de ui-ux-pro-max-skill / uupm.cc, MIT, + direction FITAIA)

## Direction visuelle FITAIA (verrouillée)
- Un seul élément spectaculaire par écran (le perso). Tout le reste est calme.
- Tokens : béton #E6E4DF · craie #F5F4F1 · graphite #1C1D1F · ardoise #5A5D63 · lime #C8F03C (remplissage uniquement, jamais en texte sur clair) · ambre #E9A10B · rouge #E2483D. Mode sombre : #121315 / #1D1F22 / #EDEEF0.
- Typo : Archivo SemiExpanded/Expanded ExtraBold pour titres et chiffres (tabular-nums), DM Sans pour le reste. Pas de majuscules décoratives, pas de « · » décoratifs.
- Rayons imbriqués (carte 26–28, bouton 18–22, puce 999). Ombres `boxShadow` multi-couches des tokens, jamais d'`elevation` brute.
- Mouvement : uniquement en réponse à une action, transform/opacité, ~300 ms, cubic-bezier(.32,.72,0,1), `prefers-reduced-motion` respecté. Compteurs ≤ 600 ms. Jamais d'animation en boucle hors « live dot ».

## Checklist avant livraison (chaque écran)
- [ ] Pas d'emoji en guise d'icône : SVG (Icons.tsx) uniquement.
- [ ] Contraste texte ≥ 4,5:1 en clair ET en sombre ; le sens d'un badge ne repose jamais sur la couleur seule (icône ou texte en plus).
- [ ] Cibles tactiles ≥ 44 px ; `accessibilityLabel` sur chaque bouton-icône ; `accessibilityRole` et `accessibilityState` sur les puces sélectionnables ; icônes décoratives `accessible={false}`.
- [ ] Safe areas (haut/bas) et barre d'onglets en verre : rien de caché derrière la nav (padding bas = NAV_H + insets).
- [ ] Texte, puces et badges se réorganisent sans coupure à 320, 375, 430 px de large ; `numberOfLines` + `flexShrink` sur les titres.
- [ ] États : chargement (indicateur), vide (une phrase + action), erreur (cause + action), hors-ligne (ce qui marche encore).
- [ ] Un geste rapide peut annuler une animation, mais l'état final (texte, focus, données) reste juste.
- [ ] Haptique : `Press haptic="medium"` sur les validations, léger ailleurs, jamais sur un scroll.
- [ ] Nombres : `fmt()` (espaces fines) et `fmtKg()` (virgule). Jamais de `.toFixed` affiché brut.
- [ ] Rien d'inventé à l'écran : chaque chiffre vient du store ou d'un calcul ; une simulation est étiquetée « Simulation » ou « démo ».

## Anti-patterns à refuser
- Dégradés violets/bleus « IA », glassmorphism partout, 3 cartes identiques en rangée « features », icônes dans des cercles pastel, titres centrés en majuscules, confettis permanents.
- Textes « Bienvenue dans ton voyage », « Débloque ton potentiel ».

## Méthode
1. Lire la maquette Main.dc.html (source de vérité) et les tokens.
2. Construire l'écran avec les composants existants (Screen, Card, Press, Txt/Display, Bar, Icons) avant d'en créer.
3. Rendre un aperçu (navigateur intégré, 375×812) et comparer à la maquette.
4. Passer la checklist ; corriger ; relancer `VERIFIER-FITAIA.bat` (tsc + lint + preflight) et lire le résultat réel.
