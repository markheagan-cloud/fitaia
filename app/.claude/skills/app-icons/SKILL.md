---
name: app-icons
description: Génère icon.png, adaptive-icon.png, splash.png, favicon et versions store à partir d'une icône source. Déclencher sur "prépare les icônes", "génère les assets".
---
1. Placer l'icône source 1024x1024 carrée dans `assets/icon-source.png` (sinon un placeholder est créé).
2. `npm run icons` (nécessite `sharp`, installé en devDependency). Vérifier la ligne "Zone de sécurité adaptive".
3. Expo dérive tous les formats iOS/Android au build : ne pas créer de dossiers mipmap/AppIcon.appiconset à la main.
4. Génération IA optionnelle : clé lue depuis `OPENAI_API_KEY` (env), jamais en dur ; `--generate`.
Modifie : assets/. Ne modifie pas : app.json (déjà câblé).
