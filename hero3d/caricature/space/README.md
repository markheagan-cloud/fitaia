---
title: FITAIA caricature
emoji: 🎨
colorFrom: red
colorTo: yellow
sdk: gradio
sdk_version: 6.30.0
app_file: app.py
pinned: false
license: apache-2.0
short_description: Selfie → caricature cool (portrait + 3 corps), FLUX.2 klein 4B
---

# FITAIA — Space « selfie → caricature »

Même recette que `hero3d/caricature/serve_caricature.py` (graine 11, 4 étapes, 512 px), sur ZeroGPU (gratuit : 2 Spaces par
compte vérifié de plus de 30 jours ; quota visiteur 2 min/jour sans compte, 5 min/jour avec, 40 min/jour en PRO).

- Modèle : `black-forest-labs/FLUX.2-klein-4B`, Apache 2.0 (poids et encodeur). Aucun module de reconnaissance faciale.
- API pour l'app : `POST /gradio_api/call/caricature` `{"data": ["<jpeg base64>", "m", "{}"]}` → `{"event_id"}` puis
  `GET /gradio_api/call/caricature/<event_id>` (flux SSE, dernier événement `complete`, `data: ["<json>"]`).
  Le JSON : `{"ok": true, "portrait": "<png base64>", "corps": {"surpoids", "actuel", "athletique"}, "report": {...}}`.
- Le selfie reste en mémoire le temps de la génération, rien n'est écrit sur disque.
- Mise en ligne : `python deploy.py` avec `HF_TOKEN` (jeton « write ») et `HF_SPACE=<compte>/fitaia-caricature`.
- Test local du protocole sans modèle : `FITAIA_STUB=1 python app.py` puis `python test_space.py http://127.0.0.1:7860`.
