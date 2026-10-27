"""Crée ou met à jour le Space (ZeroGPU) depuis ce dossier. Variables : HF_TOKEN (write), HF_SPACE (ex. compte/fitaia-caricature)."""
import os
import sys

from huggingface_hub import HfApi

token = os.environ.get('HF_TOKEN')
space = os.environ.get('HF_SPACE')
if not token or not space:
    sys.exit('HF_TOKEN et HF_SPACE sont requis')
api = HfApi(token=token)
api.create_repo(space, repo_type='space', space_sdk='gradio', exist_ok=True, private=False)
try:
    api.request_space_hardware(space, 'zero-a10g')   # ZeroGPU ; refusé si le compte n'y a pas droit (voir README)
except Exception as e:  # noqa: BLE001
    print('matériel ZeroGPU non appliqué :', str(e)[:200])
here = os.path.dirname(os.path.abspath(__file__))
api.upload_folder(folder_path=here, repo_id=space, repo_type='space', allow_patterns=['app.py', 'recette.py', 'requirements.txt', 'README.md'])
print('Space mis à jour : https://huggingface.co/spaces/' + space)
