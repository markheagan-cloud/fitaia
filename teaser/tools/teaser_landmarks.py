"""
FITAIA teaser — maillage du visage de l'AVATAR 3D (rendu de synthèse, pas une vraie personne) pour l'effet « scan ».
  python teaser_landmarks.py <face_landmarker.task> <portrait.png> <sortie.json>
Sortie : 478 points normalisés + arêtes du maillage (tessellation) + contours (yeux, lèvres, ovale).
"""
import json
import sys

import numpy as np
from PIL import Image
import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision

model, src, out = sys.argv[1:4]
im = Image.open(src).convert('RGBA')
bg = Image.new('RGBA', im.size, (120, 118, 114, 255))
bg.alpha_composite(im)
rgb = np.array(bg.convert('RGB'))
img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
opts = vision.FaceLandmarkerOptions(base_options=mpt.BaseOptions(model_asset_path=model), num_faces=1)
with vision.FaceLandmarker.create_from_options(opts) as det:
    res = det.detect(img)
data = {'width': im.width, 'height': im.height, 'found': bool(res.face_landmarks)}
if res.face_landmarks:
    data['points'] = [[round(p.x, 5), round(p.y, 5), round(p.z, 5)] for p in res.face_landmarks[0]]


def conn(name_new, name_old):
    try:
        c = getattr(vision.FaceLandmarksConnections, name_new)
        return sorted({(int(e.start), int(e.end)) for e in c})
    except Exception:
        pass
    try:
        return sorted({(int(a), int(b)) for a, b in getattr(mp.solutions.face_mesh, name_old)})
    except Exception as e:
        print('connexions indisponibles', name_new, e)
        return []


data['tessellation'] = conn('FACE_LANDMARKS_TESSELATION', 'FACEMESH_TESSELATION')
data['contours'] = conn('FACE_LANDMARKS_CONTOURS', 'FACEMESH_CONTOURS')
json.dump(data, open(out, 'w'))
print('visage' if data['found'] else 'AUCUN VISAGE', len(data.get('points', [])), 'points', len(data['tessellation']), 'aretes', len(data['contours']), 'contours')
