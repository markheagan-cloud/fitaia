---
name: fitaia-methode-agent
description: Méthode de travail autonome sur FITAIA (sessions longues, vérification réelle, contexte maîtrisé, recherche web/plateformes). Utiliser au début de toute session de build ou de recherche.
---
# Méthode agent FITAIA (distillé de agent-skills-for-context-engineering et Agent-Reach, MIT)

## Avant d'agir
1. Écrire le prédicat de succès en une phrase. Si on ne peut pas l'énoncer, ne pas lancer.
2. Lister ce qui « ne compte pas » (quasi-réussites) : un test non exécuté, un PASS supposé, une donnée store inventée, un fichier écrit mais non vérifié sur le PC.
3. Définir les termes porteurs (« vérifié » = résultat d'outil lu, pas une supposition).

## Pendant
- Chaque affirmation rapportée se rattache à un résultat d'outil (fichier `verification.txt`, capture, test). Pas de « ça devrait marcher ».
- Jamais d'instruction de persistance (« continue jusqu'à… ») sans porte de vérification associée.
- Contexte : contraintes critiques en haut ET en bas du brief ; démarrer minimal, ajouter une règle seulement après un échec observé ; jeu d'outils minimal ; compacter l'historique vers 70–80 % de remplissage ; test de densité : retirer tout ce qui ne changerait pas la sortie.
- Surfaces : verrouillées (métriques, tests, règles d'économie), éditables (code, docs), en ajout seul (journal de décisions, idées rejetées), humaines (comptes, paiements, soumission store). Les agents rédigent, le fondateur approuve ce qui coûte de l'argent ou touche un compte.
- Garder les tentatives rejetées dans docs/DECISIONS.md pour ne pas les redécouvrir.

## Workflow PC du fondateur
- Déposer les fichiers via le pont (nouveau dossier vN à chaque envoi), relancer `VERIFIER-FITAIA.bat`, lire `verification.txt`, tester dans le navigateur intégré (375×812), puis commit + zip + docs synchronisées.
- Pièges connus : `CI=1` hérité par `expo start` ; double-clic Explorateur = renommage ; `device_commit_files` renvoie l'ancien contenu si on réutilise un chemin déjà commité.

## Recherche web et plateformes (Agent-Reach, optionnel)
- Lire n'importe quelle URL en Markdown : `https://r.jina.ai/<url>` (gratuit, sans clé). YouTube : sous-titres via yt-dlp. GitHub : `gh`. RSS : feedparser.
- Installation : `pip install https://github.com/Panniantong/agent-reach/archive/main.zip` puis `agent-reach install --env=auto` ; `agent-reach doctor` pour vérifier.
- Réserver aux recherches concurrence/ASO (fiches store, avis, threads). Les plateformes à cookies (X, Reddit, Instagram) impliquent un risque vie privée/CGU : demander avant.
