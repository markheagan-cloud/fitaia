"""
Réponse JSON « selfie → caricature », partagée par le Space Hugging Face (app.py) et le service Modal (modal_app.py).
Aucun modèle ici : `generate_all(selfie, sex, sheet)` est fourni par l'hébergeur (diffusers sur GPU, ou aplats en stub).

Entrée  : selfie JPEG en base64, sexe 'm' | 'f', fiche JSON facultative (hairColor, skin).
Sortie  : {"ok": true, "portrait": "<png base64>", "corps": {"surpoids", "actuel", "athletique"}, "report": {...}}
          ou {"ok": false, "error": "<message lisible>"} ; jamais de résultat partiel.
"""
import base64
import io
import json
import time

from PIL import Image

import recette

MAX_PHOTO = 6 * 1024 * 1024
CORPS = ('surpoids', 'actuel', 'athletique')


def to_b64(img):
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode('ascii')


def stub_generate_all(selfie, sex, sheet):
    """Sans modèle (tests du protocole) : des aplats de couleur, signalés dans « limites »."""
    colours = {'portrait': (230, 90, 70), 'surpoids': (200, 140, 60), 'actuel': (120, 160, 90), 'athletique': (70, 120, 200)}
    imgs = {k: Image.new('RGB', (recette.SIZE, recette.SIZE), c) for k, c in colours.items()}
    time.sleep(0.2)
    return imgs['portrait'], {k: imgs[k] for k in CORPS}


def caricature_dict(selfie_b64, sex, sheet_json, generate_all, stub=False):
    """Toute la logique d'une requête ; renvoie un dict prêt à sérialiser."""
    t = time.time()
    try:
        if sex not in ('m', 'f'):
            raise ValueError('sex doit valoir "m" ou "f"')
        raw = base64.b64decode(selfie_b64 or '', validate=True)
        if not raw or len(raw) > MAX_PHOTO:
            raise ValueError('photo absente ou trop lourde')
        selfie = Image.open(io.BytesIO(raw)).convert('RGB')
        selfie.thumbnail((768, 768))
        if isinstance(sheet_json, dict):
            sheet = sheet_json
        else:
            try:
                sheet = json.loads(sheet_json) if sheet_json else None
            except ValueError:
                sheet = None
        portrait, corps = generate_all(selfie, sex, sheet)
        limites = list(recette.LIMITES) + (['SIMULATION : aplats de couleur, aucun modèle chargé.'] if stub else [])
        return {'ok': True, 'portrait': to_b64(portrait), 'corps': {k: to_b64(corps[k]) for k in CORPS},
                'report': {'limites': limites, 'duree_s': round(time.time() - t), 'modele': recette.MODELE, 'graine': recette.SEED}}
    except Exception as e:  # message lisible pour l'app, jamais de trace
        return {'ok': False, 'error': str(e)[:200]}
