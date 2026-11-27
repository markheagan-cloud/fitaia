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
      POST <url>  {"portrait": "<png base64>", "sex": "m"|"f"}  → {"ok", "tenues": {origine, cargo, olive, creme, titane, atelier}}.
Le selfie reste en mémoire le temps de la requête, rien n'est écrit sur disque.
"""
import os

import modal
from fastapi import Request

MODELE_HF = 'black-forest-labs/FLUX.2-klein-4B'
CACHE = '/cache'

base = (
    modal.Image.debian_slim(python_version='3.12')
    .apt_install('git')
    .pip_install('torch==2.8.0', 'git+https://github.com/huggingface/diffusers.git', 'transformers>=4.57', 'accelerate',
                 'sentencepiece', 'pillow', 'fastapi[standard]', 'huggingface_hub')
    .env({'HF_HOME': CACHE, 'HF_HUB_ENABLE_HF_TRANSFER': '0'})
)
image = base.add_local_python_source('recette', 'api')
app = modal.App('fitaia-caricature', image=image)
volume = modal.Volume.from_name('fitaia-hf-cache', create_if_missing=True)
# Secret facultatif « fitaia-caricature » : FITAIA_CARICATURE_TOKEN (l'app l'envoie en Authorization: Bearer) et HF_TOKEN
# (seulement si le dépôt du modèle le demande).
secrets = [modal.Secret.from_name('fitaia-caricature', required_keys=[])] if os.environ.get('FITAIA_MODAL_SECRET', '1') == '1' else []


@app.cls(gpu=['L4', 'A10G'], volumes={CACHE: volume}, secrets=secrets, timeout=600, scaledown_window=60)
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

    def generate_tenues(self, portrait, sex, sheet=None, only=None):
        import recette

        torch = self.torch
        common = dict(height=recette.SIZE, width=recette.SIZE, guidance_scale=recette.GUIDANCE, num_inference_steps=recette.STEPS)
        return {k: self.pipe(prompt=p, image=portrait, generator=torch.Generator(device='cuda').manual_seed(recette.SEED), **common).images[0]
                for k, p in recette.prompts_tenues(sex, sheet, only).items()}

    def generate_melange(self, portrait, prompt):
        import recette

        common = dict(height=recette.SIZE, width=recette.SIZE, guidance_scale=recette.GUIDANCE, num_inference_steps=recette.STEPS)
        return self.pipe(prompt=prompt, image=portrait, generator=self.torch.Generator(device='cuda').manual_seed(recette.SEED), **common).images[0]

    @modal.fastapi_endpoint(method='POST')
    async def caricature(self, request: Request):
        body = await request.json()
        if not isinstance(body, dict):
            return {'ok': False, 'error': 'corps JSON attendu'}
        return self._handle(body, request.headers.get('authorization', ''))

    @modal.method()
    def direct(self, body: dict, authorization: str = ''):
        """Même traitement que l'adresse web, appelable par le client Modal (tests sans accès à *.modal.run)."""
        return self._handle(body, authorization)

    @modal.method()
    def essai(self, photos_b64: list, prompts: list, size: int = 512, steps: int = 4, seed: int = 11):
        """Mise au point de la recette : une image par prompt, à partir des photos de référence données."""
        import base64, io
        from PIL import Image
        refs = [Image.open(io.BytesIO(base64.b64decode(p))).convert('RGB') for p in photos_b64]
        ref_arg = None if not refs else refs if len(refs) > 1 else refs[0]
        out = []
        for p in prompts:
            g = self.torch.Generator(device='cuda').manual_seed(seed)
            im = self.pipe(prompt=p, image=ref_arg, generator=g, height=size, width=size, guidance_scale=1.0, num_inference_steps=steps).images[0]
            b = io.BytesIO(); im.save(b, format='PNG'); out.append(base64.b64encode(b.getvalue()).decode())
        return out

    def _handle(self, body, authorization):
        import api

        expected = os.environ.get('FITAIA_CARICATURE_TOKEN', '')
        if expected and authorization != 'Bearer ' + expected:
            return {'ok': False, 'error': 'jeton refusé'}
        if body.get('portrait') and body.get('mix'):  # s'habiller pièce par pièce : une image pour ce mélange
            return api.melange_dict(body.get('portrait', ''), body.get('sex', 'm'), self.generate_melange, body.get('mix'), body.get('sheet'))
        if body.get('portrait'):  # second appel de l'app : les tenues de la boutique sur le perso déjà dessiné
            return api.tenues_dict(body.get('portrait', ''), body.get('sex', 'm'), self.generate_tenues, body.get('sheet'), body.get('only'))
        return api.caricature_dict(body.get('photo', ''), body.get('sex', 'm'), body.get('sheet'), self.generate_all)


@app.function(image=image, timeout=60)
@modal.fastapi_endpoint(method='GET')
def health():
    import recette

    return {'ok': True, 'modele': recette.MODELE, 'graine': recette.SEED}


# ---------------------------------------------------------------------------------------------------------------
# Repas en photo → estimation (Qwen2.5-VL-7B-Instruct, Apache 2.0). Même app, même jeton, carte séparée du dessin.
# POST <url repas>  {"photo": "<jpeg base64>"}  → {"ok", "name", "items": [{"name","grams","kcal","p","g","l"}], "kcal","p","g","l"}
# C'est une ESTIMATION à partir d'une photo : l'app l'affiche comme telle et la personne ajuste la portion.
# ---------------------------------------------------------------------------------------------------------------
MODELE_VISION = 'Qwen/Qwen2.5-VL-7B-Instruct'
CONSIGNE_REPAS = (
    'You are a nutrition assistant. Look at this meal photo. List each food you can see with an estimated portion in '
    'grams and its nutrition for that portion. Answer ONLY with JSON, no text around it, in this exact shape: '
    '{"name": "<short French name of the meal>", "items": [{"name": "<French food name>", "grams": 0, "kcal": 0, '
    '"p": 0, "g": 0, "l": 0}]} where p = protein grams, g = carbohydrate grams, l = fat grams. If there is no food in '
    'the photo, answer {"name": "", "items": []}. Write every name in French (for example "Poulet grillé", "Riz blanc", '
    '"Brocoli"), never in English. Use standard nutrition tables (cooked white rice is about 130 kcal per 100 g).'
)


def lire_reponse_repas(answer):
    """JSON du modèle ; si la réponse est coupée ou entourée de texte, on garde les aliments complets."""
    import json
    import re

    m = re.search(r'\{.*\}', answer, re.S)
    if m:
        try:
            data = json.loads(m.group(0))
            if isinstance(data, dict):
                return data
        except ValueError:
            pass
    items = []
    for bloc in re.findall(r'\{[^{}]*"kcal"[^{}]*\}', answer):
        try:
            items.append(json.loads(bloc))
        except ValueError:
            continue
    nom = re.search(r'"name"\s*:\s*"([^"]*)"\s*,\s*"items"', answer)
    return {'name': nom.group(1) if nom else '', 'items': items}


vision_image = base.pip_install('torchvision==0.23.0').add_local_python_source('recette', 'api')


@app.cls(image=vision_image, gpu=['L4', 'A10G'], volumes={CACHE: volume}, secrets=secrets, timeout=300, scaledown_window=120)
class MealVision:
    @modal.enter()
    def load(self):
        import torch
        from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

        self.torch = torch
        self.model = Qwen2_5_VLForConditionalGeneration.from_pretrained(MODELE_VISION, torch_dtype=torch.bfloat16).to('cuda')
        self.proc = AutoProcessor.from_pretrained(MODELE_VISION, min_pixels=256 * 28 * 28, max_pixels=640 * 28 * 28)
        volume.commit()

    def analyse(self, photo_b64):
        import base64
        import io
        import json
        import re

        from PIL import Image

        raw = base64.b64decode(photo_b64 or '', validate=True)
        if not raw or len(raw) > 6 * 1024 * 1024:
            raise ValueError('photo absente ou trop lourde')
        img = Image.open(io.BytesIO(raw)).convert('RGB')
        img.thumbnail((896, 896))
        msgs = [{'role': 'user', 'content': [{'type': 'image'}, {'type': 'text', 'text': CONSIGNE_REPAS}]}]
        text = self.proc.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
        inputs = self.proc(text=[text], images=[img], return_tensors='pt').to('cuda')
        with self.torch.inference_mode():
            out = self.model.generate(**inputs, max_new_tokens=700, do_sample=False)
        answer = self.proc.batch_decode(out[:, inputs['input_ids'].shape[1]:], skip_special_tokens=True)[0]
        data = lire_reponse_repas(answer)
        items = []
        for it in (data.get('items') or [])[:10]:
            if not isinstance(it, dict):
                continue
            try:
                row = {'name': str(it['name'])[:60], 'grams': max(0, round(float(it.get('grams', 0)))),
                       'kcal': max(0, round(float(it['kcal']))), 'p': max(0, round(float(it.get('p', 0)))),
                       'g': max(0, round(float(it.get('g', 0)))), 'l': max(0, round(float(it.get('l', 0))))}
            except (KeyError, TypeError, ValueError):
                continue
            # calories incohérentes avec les macros (4/4/9) : on reprend le calcul des macros
            calc = 4 * row['p'] + 4 * row['g'] + 9 * row['l']
            if calc > 0 and (row['kcal'] == 0 or not 0.6 <= row['kcal'] / calc <= 1.6):
                row['kcal'] = calc
            if 0 < row['kcal'] <= 3000 and row['name'].strip():
                items.append(row)
        if not items:
            return {'ok': False, 'error': 'Aucun aliment reconnu sur la photo. Rapproche-toi du plat, en pleine lumière.'}
        tot = {k: sum(i[k] for i in items) for k in ('kcal', 'p', 'g', 'l')}
        return {'ok': True, 'name': str(data.get('name') or items[0]['name'])[:60], 'items': items, **tot, 'modele': MODELE_VISION}

    @modal.method()
    def direct(self, body: dict, authorization: str = ''):
        return self._handle(body, authorization)

    def _handle(self, body, authorization):
        expected = os.environ.get('FITAIA_CARICATURE_TOKEN', '')
        if expected and authorization != 'Bearer ' + expected:
            return {'ok': False, 'error': 'jeton refusé'}
        if body.get('warm'):  # l'app réveille le service pendant que la personne cadre son assiette
            return {'ok': True, 'warm': True}
        try:
            return self.analyse(body.get('photo', ''))
        except Exception as e:  # jamais de message technique à l'écran
            print('repas: erreur', repr(e)[:300])
            return {'ok': False, 'error': 'Photo illisible. Reprends-la bien cadrée sur le plat, en pleine lumière.'}

    @modal.fastapi_endpoint(method='POST')
    async def repas(self, request: Request):
        body = await request.json()
        if not isinstance(body, dict):
            return {'ok': False, 'error': 'corps JSON attendu'}
        return self._handle(body, request.headers.get('authorization', ''))
