# Caricature FITAIA — selfie → portrait + 3 corps (FLUX.2 klein 4B, local)

Serveur : `serve_caricature.py` (port 8791), lancé par `SERVEUR-CARICATURE.bat` à la racine. Contrat HTTP dans l'en-tête du script.
Aucune photo ni image générée dans le dépôt : les sorties vont dans `out/` (ignoré par git), le selfie est supprimé en fin de tâche.

## Installation (une fois, sur le PC serveur)
Dans `tools/comfyui/` (ignoré par git) :
- ComfyUI (GPL-3.0) cloné dans `ComfyUI/`, nœud `ComfyUI/custom_nodes/ComfyUI-GGUF` (city96, Apache 2.0) ;
- venv créé avec le Python de Blender (`tools/blender-4.5.14-windows-x64/4.5/python/bin/python.exe -m venv venv`) ;
- `venv\Scripts\python.exe -m pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu126`
  (cu126 fonctionne avec le pilote NVIDIA 555, pas besoin de cu130), puis les `requirements.txt` de ComfyUI (sans torch) et de ComfyUI-GGUF.
- Modèles (tous Apache 2.0) :

| Fichier | Dossier | Source |
|---|---|---|
| flux-2-klein-4b-Q4_K_M.gguf (2,6 Go) | ComfyUI/models/diffusion_models | huggingface.co/unsloth/FLUX.2-klein-4B-GGUF |
| Qwen3-4B-Q4_K_M.gguf (2,5 Go) | ComfyUI/models/text_encoders | huggingface.co/unsloth/Qwen3-4B-GGUF |
| flux2-vae.safetensors (0,34 Go) | ComfyUI/models/vae | huggingface.co/Comfy-Org/Flux-2-Klein-4B |

Pas de FLUX.2 klein 9B, ni de FLUX.1-dev, InstantID, PuLID, PhotoMaker, InfiniteYou ou modèles insightface : licences non commerciales.

## Réglages GTX 1650 (4 Go)
`--force-fp32` (en fp16 : image noire), `--disable-dynamic-vram --disable-pinned-memory` (sinon plantage au chargement GGUF), `--lowvram`.
Workflows : `workflows/klein4b_ref1.api.json` (1 image de référence) et `klein4b_ref2.api.json` (selfie + image de style).
512×512, 4 étapes, cfg 1.0 (modèle distillé), sampler euler, graine 11, VAE décodé en tuiles de 512.

## Chaîne d'une tâche
1. portrait : selfie (+ image de style facultative, `FITAIA_CARICATURE_STYLE`, chemin local hors dépôt) → `portrait.png`
2. bustes : `portrait.png` comme référence d'identité → `surpoids.png`, `actuel.png`, `athletique.png`

Durées mesurées sur GTX 1650 : ≈ 2 à 3,5 min par image en fp32. Objectif « 1 minute » : GPU loué (non mesuré).

## Variables
`FITAIA_COMFYUI_URL` (défaut http://127.0.0.1:8188), `FITAIA_CARICATURE_TOKEN`, `FITAIA_CARICATURE_TIMEOUT` (défaut 1200 s), `FITAIA_CARICATURE_STYLE`.
