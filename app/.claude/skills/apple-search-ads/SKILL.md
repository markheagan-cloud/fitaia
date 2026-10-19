---
name: apple-search-ads
description: Préparer la structure Apple Search Ads (mots-clés par intention, campagnes, groupes, exact/broad/négatifs, Custom Product Pages). Déclencher sur "prépare Apple Search Ads", "plan ASA".
---
1. Éditer `store/asa-seed.json` (marque, concurrents, mots-clés, négatifs).
2. `npm run ads-plan` → `store/asa-plan.md` + `store/asa-keywords.csv` (import manuel dans ASA).
3. Audit d'une campagne existante : seulement si l'utilisateur fournit un export ASA réel dans `store/real/`.
INTERDIT : créer une campagne, fixer un budget ou une enchère, ou appeler l'API ASA sans validation écrite explicite de l'utilisateur. Aucun chiffre de volume/CPT n'est estimé.
