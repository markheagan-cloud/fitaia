# FITAIA — démarrer

1. Installe **Expo Go** sur ton iPhone (App Store, gratuit).
2. Double-clique **LANCER-FITAIA.bat**. La première fois : 5 à 10 min (installation). Ne ferme pas la fenêtre.
3. Un QR code s'affiche : ouvre l'appareil photo de l'iPhone, vise-le, touche la bannière → l'app FITAIA s'ouvre dans Expo Go.
   - Si rien ne se passe (PC et iPhone sur des réseaux différents) : dans la fenêtre, appuie sur `s` pour passer en mode tunnel, puis rescanne.
   - Mode sombre/clair : suit le réglage de l'iPhone.
4. Tout changement de code dans `app\` se recharge en direct sur le téléphone (et sur http://localhost:8081 dans un navigateur du PC).

**VERIFIER-FITAIA.bat** : relance le typecheck TypeScript + le preflight sans démarrer l'app.

**Main.dc.html** : la maquette cliquable de référence (ouvre-la dans un navigateur).

Dossier `app\` : le projet Expo. Documentation des skills : `app\docs\SKILLS.md`.
