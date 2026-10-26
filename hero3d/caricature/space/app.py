"""
FITAIA — Space Hugging Face « selfie → caricature » (FLUX.2 klein 4B, Apache 2.0) sur ZeroGPU.

Même recette que hero3d/caricature/serve_caricature.py (graine 11, 4 étapes, 512 px), même résultat : un portrait de
face puis le même personnage en surpoids / actuel / athlétique. L'app appelle l'API Gradio du Space
(POST /gradio_api/call/caricature puis GET …/<event_id>) : voir app/src/avatar/gradioCall.ts.

Entrée  : selfie JPEG en base64, sexe 'm' | 'f', fiche JSON facultative (hairColor, skin).
Sortie  : JSON {"ok": true, "portrait": "<png base64>", "corps": {"surpoids": …, "actuel": …, "athletique": …},
                "report": {"limites": [...], "duree_s": 32, "modele": "FLUX.2 klein 4B", "graine": 11}}
Le selfie n'est jamais écrit sur disque : il reste en mémoire le temps de la génération.

FITAIA_STUB=1 : pas de modèle (tests du protocole en local) ; les images sont des aplats de couleur, signalés dans "limites".
"""
import base64
import io
import json
import os
import time

import gradio as gr
from PIL import Image

import recette

STUB = os.environ.get('FITAIA_STUB') == '1'
MAX_PHOTO = 6 * 1024 * 1024

if not STUB:
    import spaces
    import torch
    from diffusers import Flux2KleinPipeline

    # ZeroGPU : le modèle est placé sur cuda au chargement du module (émulation hors @spaces.GPU), ~13 Go en bf16
    pipe = Flux2KleinPipeline.from_pretrained('black-forest-labs/FLUX.2-klein-4B', torch_dtype=torch.bfloat16).to('cuda')

    @spaces.GPU(duration=120)
    def generate_all(selfie, sex, sheet):
        """Les 4 images dans une seule réservation GPU (≈ quelques secondes par image sur RTX Pro 6000)."""
        p_portrait, p_corps = recette.prompts(sex, sheet)
        gen = lambda: torch.Generator(device='cuda').manual_seed(recette.SEED)
        common = dict(height=recette.SIZE, width=recette.SIZE, guidance_scale=recette.GUIDANCE, num_inference_steps=recette.STEPS)
        portrait = pipe(prompt=p_portrait, image=selfie, generator=gen(), **common).images[0]
        corps = {k: pipe(prompt=p_corps[k], image=portrait, generator=gen(), **common).images[0] for k in ('surpoids', 'actuel', 'athletique')}
        return portrait, corps
else:
    def generate_all(selfie, sex, sheet):
        colours = {'portrait': (230, 90, 70), 'surpoids': (200, 140, 60), 'actuel': (120, 160, 90), 'athletique': (70, 120, 200)}
        imgs = {k: Image.new('RGB', (recette.SIZE, recette.SIZE), c) for k, c in colours.items()}
        time.sleep(0.2)
        return imgs['portrait'], {k: imgs[k] for k in ('surpoids', 'actuel', 'athletique')}


def to_b64(img):
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode('ascii')


def caricature(selfie_b64, sex='m', sheet_json=''):
    """Point d'entrée de l'API (api_name « caricature »). Retourne une chaîne JSON, jamais de résultat partiel."""
    t = time.time()
    try:
        if sex not in ('m', 'f'):
            raise ValueError('sex doit valoir "m" ou "f"')
        raw = base64.b64decode(selfie_b64 or '', validate=True)
        if not raw or len(raw) > MAX_PHOTO:
            raise ValueError('photo absente ou trop lourde')
        selfie = Image.open(io.BytesIO(raw)).convert('RGB')
        selfie.thumbnail((768, 768))
        try:
            sheet = json.loads(sheet_json) if sheet_json else None
        except ValueError:
            sheet = None
        portrait, corps = generate_all(selfie, sex, sheet)
        limites = list(recette.LIMITES) + (['SIMULATION : aplats de couleur, aucun modèle chargé.'] if STUB else [])
        return json.dumps({'ok': True, 'portrait': to_b64(portrait), 'corps': {k: to_b64(v) for k, v in corps.items()},
                           'report': {'limites': limites, 'duree_s': round(time.time() - t), 'modele': recette.MODELE, 'graine': recette.SEED}})
    except Exception as e:  # message lisible pour l'app, jamais de trace
        return json.dumps({'ok': False, 'error': str(e)[:200]})


def caricature_ui(selfie, sex):
    """Même recette, pour l'aperçu dans le navigateur du Space (image → 4 images)."""
    if selfie is None:
        raise gr.Error('Ajoute un selfie.')
    buf = io.BytesIO()
    selfie.convert('RGB').save(buf, format='JPEG', quality=90)
    r = json.loads(caricature(base64.b64encode(buf.getvalue()).decode('ascii'), sex))
    if not r.get('ok'):
        raise gr.Error(r.get('error', 'échec'))
    dec = lambda s: Image.open(io.BytesIO(base64.b64decode(s)))
    return [dec(r['portrait'])] + [dec(r['corps'][k]) for k in ('surpoids', 'actuel', 'athletique')]


with gr.Blocks(title='FITAIA — caricature') as demo:
    gr.Markdown('# FITAIA — ton perso caricature\nUn selfie de face → portrait + surpoids / actuel / athlétique. '
                f'Modèle {recette.MODELE} (Apache 2.0). Le selfie n’est pas conservé.')
    with gr.Row():
        inp = gr.Image(type='pil', label='Selfie (de face, bien éclairé)')
        sex = gr.Radio(['m', 'f'], value='m', label='Base')
    btn = gr.Button('Dessiner mon perso')
    out = gr.Gallery(label='Portrait, surpoids, actuel, athlétique', columns=4)
    btn.click(caricature_ui, [inp, sex], out, api_name=False)
    # API appelée par l'app (chaînes seulement : pas de fichier à téléverser)
    api_in = [gr.Textbox(label='selfie_b64', visible=False), gr.Textbox(label='sex', value='m', visible=False), gr.Textbox(label='sheet_json', visible=False)]
    api_out = gr.Textbox(label='json', visible=False)
    gr.Button('api', visible=False).click(caricature, api_in, api_out, api_name='caricature')

if __name__ == '__main__':
    demo.queue(default_concurrency_limit=1).launch(server_name=os.environ.get('GRADIO_SERVER_NAME', '0.0.0.0'),
                                                     server_port=int(os.environ.get('GRADIO_SERVER_PORT', '7860')))
