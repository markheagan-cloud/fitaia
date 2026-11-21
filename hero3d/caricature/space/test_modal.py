"""
Premier vrai test du service Modal : python test_modal.py <url> <dossier_sortie> photo1.jpg [photo2.jpg ...]
Jeton facultatif dans la variable FITAIA_CARICATURE_TOKEN.

Pour chaque photo : une requête POST chronométrée, les 4 images enregistrées, et une planche
« photo | portrait | surpoids | actuel | athlétique » pour juger à l'œil. La première photo est envoyée deux fois
pour mesurer le temps à froid (démarrage de la carte) et à chaud. Sort 1 si une requête échoue.
Aucun score automatique : la seule note est l'œil de la personne.
"""
import base64
import io
import json
import os
import sys
import time
import urllib.request

from PIL import Image, ImageDraw

url, out = sys.argv[1], sys.argv[2]
photos = sys.argv[3:]
token = os.environ.get('FITAIA_CARICATURE_TOKEN', '')
os.makedirs(out, exist_ok=True)


def call(path, sex):
    with open(path, 'rb') as f:
        img = Image.open(f).convert('RGB')
    img.thumbnail((768, 768))
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=90)
    body = json.dumps({'photo': base64.b64encode(buf.getvalue()).decode('ascii'), 'sex': sex}).encode()
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    t = time.time()
    with urllib.request.urlopen(urllib.request.Request(url, body, headers), timeout=900) as r:
        res = json.load(r)
    return img, res, time.time() - t


def planche(photo, res, titre):
    w = 384
    tiles = [photo] + [Image.open(io.BytesIO(base64.b64decode(b))).convert('RGB')
                       for b in [res['portrait']] + [res['corps'][k] for k in ('surpoids', 'actuel', 'athletique')]]
    sheet = Image.new('RGB', (w * 5, w + 40), (245, 240, 230))
    d = ImageDraw.Draw(sheet)
    for i, (tile, lab) in enumerate(zip(tiles, ['photo', 'portrait', 'surpoids', 'actuel', 'athletique'])):
        tile = tile.copy()
        tile.thumbnail((w, w))
        sheet.paste(tile, (i * w + (w - tile.width) // 2, 40 + (w - tile.height) // 2))
        d.text((i * w + 8, 12), lab, fill=(30, 30, 30))
    d.text((w * 5 - 360, 12), titre, fill=(30, 30, 30))
    return sheet


report, ok = [], True
for i, p in enumerate(photos):
    name = os.path.splitext(os.path.basename(p))[0]
    sex = 'f' if name.startswith('f_') else 'm'
    passes = 2 if i == 0 else 1
    for n in range(passes):
        try:
            photo, res, dt = call(p, sex)
        except Exception as e:  # réseau, délai
            res, dt = {'ok': False, 'error': str(e)[:200]}, 0.0
        etat = 'à froid' if (i == 0 and n == 0) else 'à chaud'
        line = {'photo': name, 'passage': etat, 'secondes': round(dt, 1), 'ok': bool(res.get('ok')),
                'erreur': res.get('error'), 'duree_serveur_s': (res.get('report') or {}).get('duree_s')}
        report.append(line)
        print(json.dumps(line, ensure_ascii=False), flush=True)
        if not res.get('ok'):
            ok = False
            break
        if n == passes - 1:
            planche(photo, res, f'{name} - {dt:.0f} s ({etat})').save(os.path.join(out, f'planche-{name}.jpg'), quality=92)
with open(os.path.join(out, 'chronos.json'), 'w', encoding='utf-8') as f:
    json.dump(report, f, ensure_ascii=False, indent=1)
sys.exit(0 if ok else 1)
