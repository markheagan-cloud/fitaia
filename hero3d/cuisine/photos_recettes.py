"""
Photos des recettes FITAIA : une image originale par recette, générée UNE fois (jamais à l'ouverture de l'app) avec
FLUX.2 klein 4B (Apache 2.0, usage commercial permis) sur le service Modal déjà en ligne (méthode `essai`, texte seul).
Les images sont ensuite relues à l'œil (ingrédients absents = refaite) puis rangées dans app/assets/recipes/<id>.jpg.

    MODAL_TOKEN_ID=... MODAL_TOKEN_SECRET=... python hero3d/cuisine/photos_recettes.py [sortie] [id1,id2,...] [graine]

Coût : 27 images à 1024 px, 4 étapes, ≈ 2 à 4 s chacune sur L4 : quelques centimes sur les 30 $ offerts par mois.
"""
import base64
import io
import json
import os
import sys

import modal
from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))


def main():
    sortie = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ICI, 'photos')
    seuls = set(sys.argv[2].split(',')) if len(sys.argv) > 2 and sys.argv[2] else None
    graine = int(sys.argv[3]) if len(sys.argv) > 3 else 7
    os.makedirs(sortie, exist_ok=True)
    data = json.load(open(os.path.join(ICI, 'prompts_recettes.json'), encoding='utf-8'))
    ids = [k for k in data['photos'] if not seuls or k in seuls]
    prompts = [f"{data['photos'][k][1]}. Camera: {data['photos'][k][0]}. {data['style']}" for k in ids]
    model = modal.Cls.from_name('fitaia-caricature', 'CaricatureModel')()
    for i in range(0, len(ids), 6):  # par paquets : une coupure réseau ne perd que le paquet en cours
        lot = ids[i:i + 6]
        imgs = model.essai.remote([], prompts[i:i + 6], size=1024, steps=4, seed=graine)
        for k, b64 in zip(lot, imgs):
            im = Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGB')
            im.save(os.path.join(sortie, k + '.png'))
            print('ok', k, flush=True)


if __name__ == '__main__':
    main()
