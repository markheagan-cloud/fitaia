"""
FITAIA — repères du visage sur une photo (MediaPipe Face Landmarker, Apache 2.0, local, sans compte).
S'exécute dans l'environnement Python séparé (FITAIA/tools/pyenv), pas dans celui de Blender.

  python landmarks.py <modèle face_landmarker.task> [<selfie_multiclass.tflite>] <image> [<image> ...]
→ écrit <image>.landmarks.json : 478 points (x, y normalisés à l'image, z relatif), taille, blendshapes (expression).
"""
import json
import sys

import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision


def segment(seg_model, path):
    """Segmentation multi-classes (0 fond, 1 cheveux, 2 peau du corps, 3 peau du visage, 4 vêtements, 5 accessoires)."""
    import numpy as np
    from PIL import Image
    opts = vision.ImageSegmenterOptions(base_options=mpt.BaseOptions(model_asset_path=seg_model),
                                        output_category_mask=True)
    with vision.ImageSegmenter.create_from_options(opts) as seg:
        res = seg.segment(mp.Image.create_from_file(path))
        m = res.category_mask.numpy_view().astype(np.uint8)
        Image.fromarray(m.squeeze()).save(path + '.seg.png')


def main():
    model, images = sys.argv[1], sys.argv[2:]
    seg_model = None
    if images and images[0].endswith('.tflite'):
        seg_model, images = images[0], images[1:]
    opts = vision.FaceLandmarkerOptions(base_options=mpt.BaseOptions(model_asset_path=model),
                                        output_face_blendshapes=True, output_facial_transformation_matrixes=True,
                                        num_faces=1)
    missing = []
    with vision.FaceLandmarker.create_from_options(opts) as det:
        for path in images:
            img = mp.Image.create_from_file(path)
            res = det.detect(img)
            out = {'image': path, 'width': img.width, 'height': img.height, 'found': bool(res.face_landmarks)}
            if res.face_landmarks:
                out['landmarks'] = [[p.x, p.y, p.z] for p in res.face_landmarks[0]]
                if res.face_blendshapes:
                    out['blendshapes'] = {b.category_name: round(b.score, 4) for b in res.face_blendshapes[0]}
                if res.facial_transformation_matrixes:
                    out['matrix'] = [list(map(float, r)) for r in res.facial_transformation_matrixes[0]]
            json.dump(out, open(path + '.landmarks.json', 'w'))
            if seg_model:
                try:
                    segment(seg_model, path)
                except Exception as e:  # la segmentation est un plus : jamais bloquante
                    print('segmentation impossible', path, e)
            print(path, 'visage' if out['found'] else 'AUCUN VISAGE')
            if not out['found']:
                missing.append(path)
    if missing:
        # un appelant qui ne lit pas le JSON (usine, check=True) ne doit pas continuer comme si tout allait bien
        sys.exit(4)


if __name__ == '__main__':
    main()
