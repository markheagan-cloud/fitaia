"""
FITAIA — service Modal « selfie → caricature » (FLUX.2 klein 4B, Apache 2.0), même recette que le Space et le serveur du PC.

Pourquoi Modal : 30 $ de calcul offerts par mois (modal.com/pricing, 26/10/2026), facturation à la seconde, rien d'installé
ni stocké sur le PC ; les poids (~13 Go bf16) sont gardés dans un volume Modal. Carte L4 (24 Go) : quelques secondes par image.

Mise en ligne (jetons MODAL_TOKEN_ID / MODAL_TOKEN_SECRET en variables d'environnement, jamais dans le chat) :
    pip install modal
    modal deploy hero3d/caricature/space/modal_app.py
Modal affiche l'adresse https://<espace>--fitaia-caricature-caricaturemodel-caricature.modal.run ; dans app/.env :
    EXPO_PUBLIC_CARICATURE_URL=<cette adresse>
    EXPO_PUBLIC_CARICATURE_TOKEN=<même valeur que le secret Modal FITAIA_CARICATURE_TOKEN, facultatif>

API : POST <url>  {"photo": "<jpeg base64>", "sex": "m"|"f", "sheet": {...}}  → même JSON que le Space (api.py).
Le selfie reste en mémoire le temps de la requête, rien n'est écrit sur disque.
"""
import os

import modal
from fastapi import Request

MODELE_HF = 'black-forest-labs/FLUX.2-klein-4B'
CACHE = '/cache'

image = (
    modal.Image.debian_slim(python_version='3.12')
    .apt_install('git')
    .pip_install('torch==2.8.0', 'git+https://github.com/huggingface/diffusers.git', 'transformers>=4.57', 'accelerate',
                 'sentencepiece', 'pillow', 'fastapi[standard]', 'huggingface_hub')
    .env({'HF_HOME': CACHE, 'HF_HUB_ENABLE_HF_TRANSFER': '0'})
    .add_local_python_source('recette', 'api')
)
app = modal.App('fitaia-caricature', image=image)
volume = modal.Volume.from_name('fitaia-hf-cache', create_if_missing=True)
# Secret facultatif « fitaia-caricature » : FITAIA_CARICATURE_TOKEN (l'app l'envoie en Authorization: Bearer) et HF_TOKEN
# (seulement si le dépôt du modèle le demande).
secrets = [modal.Secret.from_name('fitaia-caricature', required_keys=[])] if os.environ.get('FITAIA_MODAL_SECRET', '1') == '1' else []


@app.cls(gpu='L4', volumes={CACHE: volume}, secrets=secrets, timeout=600, scaledown_window=300)
class CaricatureModel:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import Flux2KleinPipeline

        self.torch = torch
        self.pipe = Flux2KleinPipeline.from_pretrained(MODELE_HF, torch_dtype=torch.bfloat16, token=os.environ.get('HF_TOKEN') or None).to('cuda')
        volume.commit()

    def generate_all(self, selfie, sex, sheet):
        import recette

        torch = self.torch
        p_portrait, p_corps = recette.prompts(sex, sheet)
        gen = lambda: torch.Generator(device='cuda').manual_seed(recette.SEED)
        common = dict(height=recette.SIZE, width=recette.SIZE, guidance_scale=recette.GUIDANCE, num_inference_steps=recette.STEPS)
        portrait = self.pipe(prompt=p_portrait, image=selfie, generator=gen(), **common).images[0]
        corps = {k: self.pipe(prompt=p_corps[k], image=portrait, generator=gen(), **common).images[0] for k in ('surpoids', 'actuel', 'athletique')}
        return portrait, corps

    @modal.fastapi_endpoint(method='POST')
    async def caricature(self, request: Request):
        body = await request.json()
        if not isinstance(body, dict):
            return {'ok': False, 'error': 'corps JSON attendu'}
        return self._handle(body, request.headers.get('authorization', ''))

    def _handle(self, body, authorization):
        import api

        expected = os.environ.get('FITAIA_CARICATURE_TOKEN', '')
        if expected and authorization != 'Bearer ' + expected:
            return {'ok': False, 'error': 'jeton refusé'}
        return api.caricature_dict(body.get('photo', ''), body.get('sex', 'm'), body.get('sheet'), self.generate_all)


@app.function(image=image, timeout=60)
@modal.fastapi_endpoint(method='GET')
def health():
    import recette

    return {'ok': True, 'modele': recette.MODELE, 'graine': recette.SEED}
