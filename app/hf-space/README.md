---
title: FITAIA Avatar
emoji: 🏋️
colorFrom: green
colorTo: gray
sdk: gradio
sdk_version: 5.49.1
app_file: app.py
pinned: false
license: apache-2.0
short_description: Dessine le perso FITAIA à partir d'un selfie (Qwen-Image-Edit)
---

# FITAIA Avatar (gratuit, Apache 2.0)

Space ZeroGPU qui dessine le personnage FITAIA à partir d'un selfie, en gardant le visage de la personne.
Modèle : [Qwen/Qwen-Image-Edit-2509](https://huggingface.co/Qwen/Qwen-Image-Edit-2509) + LoRA Lightning 8 étapes.

## Mise en place (5 minutes, gratuit)
1. Crée un compte sur https://huggingface.co (e-mail vérifié ; ZeroGPU gratuit après 30 jours d'ancienneté du compte, 2 Spaces max).
2. Nouveau Space → nom `fitaia-avatar` → SDK **Gradio** → Hardware **ZeroGPU** → visibilité **Private**.
3. Téléverse les 3 fichiers de ce dossier (`app.py`, `requirements.txt`, `README.md`). Le premier démarrage prend ~10 min (téléchargement du modèle, ~40 Go).
4. Settings → Access Tokens (https://huggingface.co/settings/tokens) → crée un jeton **Read**.
5. Dans Supabase : `supabase secrets set AVATAR_PROVIDER=hf HF_SPACE=<pseudo>/fitaia-avatar HF_TOKEN=hf_...`

## Quotas (ZeroGPU)
- Compte gratuit : 5 min de GPU / jour ≈ 10–20 dessins / jour (≈ 15–25 s par dessin).
- PRO (9 $/mois) : 40 min / jour ≈ 100+ dessins, extensible à 1 $ / 10 min.
- L'app FITAIA met en cache chaque dessin (même fiche + même selfie = jamais redessiné), donc le quota sert uniquement aux vraies nouveautés.

## Test manuel
Ouvre le Space : glisse un selfie, clique « Dessiner ».
