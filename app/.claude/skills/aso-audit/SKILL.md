---
name: aso-audit
description: Audit ASO de la fiche App Store / Play Store (titre, sous-titre, mots-clés, description, concurrents). Déclencher sur "audit ASO", "optimise ma fiche store".
---
1. Éditer `store/metadata.json` avec le texte voulu (c'est la source de vérité, rédigée par l'utilisateur).
2. `npm run aso-audit` — corriger les KO (limites de caractères) et les WARN (mots-clés redondants, espaces).
3. Données réelles : uniquement si l'utilisateur dépose des exports dans `store/real/`. Sinon, dire explicitement qu'il n'y a aucune mesure réelle. Ne jamais inventer de volumes, classements ou téléchargements.
Modifie : store/metadata.json. Ne modifie pas : app.json, code.
