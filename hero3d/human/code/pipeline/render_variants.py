"""
FITAIA — rendus de variantes (réglages de rendu / de peau / d'état du corps) d'un même avatar, pour les planches QA.

  python pipeline/render_variants.py --blender <blender> --glb <avatar.glb> --out <dossier> --variants '<json>'
                                     [--framings close:close:0,head_face:head:0] [--samples 64] [--scale 1.0] [--hair]

variants : {"nom": {options du job (skin_hd, subdiv, skin_params, view…) + "state": {morph: poids} facultatif}}
Sortie : <out>/<nom>/<cadrage>.png
"""
import argparse
import json
import os
import sys

PIPE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PIPE)
import render_qa as RQ  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--blender', required=True)
    ap.add_argument('--glb', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--variants', required=True)
    ap.add_argument('--framings', default='close:close:0')
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--scale', type=float, default=1.0)
    ap.add_argument('--hair', action='store_true')
    ap.add_argument('--hair-render', dest='hair_render', default='{"melanin": 0.94, "redness": 0.12}')
    ap.add_argument('--cloth', action='store_true')
    a = ap.parse_args()
    var = json.loads(open(a.variants, encoding='utf-8').read() if os.path.exists(a.variants) else a.variants)
    base = os.path.splitext(a.glb)[0]
    os.makedirs(a.out, exist_ok=True)
    for name, extra in var.items():
        extra = dict(extra)
        state = extra.pop('state', {})
        yaw = extra.pop('yaw', 12.0)
        item = {'key': name, 'glb': a.glb, 'hair': base + '.hair.npz' if a.hair and os.path.exists(base + '.hair.npz') else None,
                'meta': base + '.portrait.json', 'state': state, 'out': os.path.join(a.out, name), 'yaw': yaw, 'fine': True,
                'cloth': a.cloth, 'hair_render': json.loads(a.hair_render), 'framings': a.framings.split(',')}
        RQ.render(a.blender, [item], os.path.join(a.out, f'job-{name}.json'), a.samples, a.scale, extra)
        print('VARIANTE', name, 'OK', flush=True)


if __name__ == '__main__':
    main()
