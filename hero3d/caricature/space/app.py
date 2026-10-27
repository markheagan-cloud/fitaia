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

import gradio as gr
from PIL import Image

import api
import recette

STUB = os.environ.get('FITAIA_STUB') == '1'

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
    generate_all = api.stub_generate_all


def caricature(selfie_b64, sex='m', sheet_json=''):
    """Point d'entrée de l'API (api_name « caricature »). Retourne une chaîne JSON, jamais de résultat partiel."""
    return json.dumps(api.caricature_dict(selfie_b64, sex, sheet_json, generate_all, STUB))


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
