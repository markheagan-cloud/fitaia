"""
FITAIA — planches du corps paramétrique (BodyMorphService) : même tête maître, corps qui varie.

  python pipeline/body_grid.py --src <assets-src> --blender <blender> --out <dossier> [--part grid|strip|params|all]
                               [--samples 96] [--scale 1.5]

  grid   : bodyFat 0 / 0,5 / 1 × muscleMass 0 / 0,5 / 1 (9 corps, tous les autres paramètres neutres)
  strip  : continuité — bodyFat 0 → 1 en 5 pas (interpolation continue, aucune forme « cassée » entre deux états)
  params : chaque paramètre local seul à 1,0 (indépendance : un seul curseur bouge à la fois)
  states : Surpoids / Actuel / Objectif du héros (states-hero.json) exprimés en paramètres, puis interpolés (t = 0,5)
Corps sans t-shirt ni jogging (short ajusté peint) pour juger l'anatomie ; pose et studio du héros.
"""
import argparse
import copy
import json
import os
import sys

PIPE = os.path.dirname(os.path.abspath(__file__))
HERE = os.path.dirname(PIPE)
sys.path.insert(0, HERE)
sys.path.insert(0, PIPE)
import body_morph as BM  # noqa: E402
import render_qa as RQ  # noqa: E402


def anatomy_config():
    import persons as PS
    cfg = PS.hero_config()
    # baskets complètes (avec la chaussette : sans jogging, la cheville doit rester couverte), short ajusté peint
    cfg['clothes'] = [{k: v for k, v in c.items() if k != 'cut_above'} for c in cfg['clothes'] if 'shoes' in c['mhclo']]
    cfg['qa_shorts'] = (0.16, 0.17, 0.19)
    cfg['collider'] = False
    cfg['id'] = 'premium-male-01-anatomie'
    return cfg


def sets(part):
    out = []
    if part in ('grid', 'all'):
        for mm in (0.0, 0.5, 1.0):
            for bf in (0.0, 0.5, 1.0):
                out.append((f'grid_bf{bf:.1f}_mm{mm:.1f}', {'bodyFat': bf, 'muscleMass': mm}, f'bodyFat {bf:.1f} · muscleMass {mm:.1f}'))
    if part in ('strip', 'all'):
        for bf in (0.0, 0.25, 0.5, 0.75, 1.0):
            out.append((f'strip_bf{bf:.2f}', {'bodyFat': bf}, f'bodyFat {bf:.2f}'))
    if part in ('params', 'all'):
        for p in BM.PARAMS:
            if p in ('bodyFat', 'muscleMass'):
                continue
            out.append((f'param_{p}', {p: 1.0}, f'{p} = 1,0'))
    if part in ('states', 'all'):
        st = BM.hero_states()
        out.append(('state_surpoids', st['surpoids'], 'Surpoids'))
        out.append(('state_mi', BM.lerp(st['surpoids'], st['athletique'], 0.5), 'Surpoids → Objectif (t = 0,5)'))
        out.append(('state_actuel', st['actuel'], 'Actuel'))
        out.append(('state_objectif', st['athletique'], 'Objectif'))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--blender', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--part', default='grid')
    ap.add_argument('--samples', type=int, default=96)
    ap.add_argument('--scale', type=float, default=1.5)
    ap.add_argument('--skip-build', action='store_true')
    a = ap.parse_args()
    import build_premium_avatar as B
    os.makedirs(a.out, exist_ok=True)
    glb = os.path.join(a.out, 'anatomie', 'avatar.glb')
    if not a.skip_build or not os.path.exists(glb):
        os.makedirs(os.path.dirname(glb), exist_ok=True)
        B.build(a.src, glb, cfg=anatomy_config())
    base = os.path.splitext(glb)[0]
    cfg = B.CONFIG
    items = []
    todo = sets(a.part)
    for key, prm, cap in todo:
        items.append({'key': key, 'glb': glb, 'hair': base + '.hair.npz', 'meta': base + '.portrait.json',
                      'state': BM.to_morphs(prm), 'out': os.path.join(a.out, key), 'yaw': 15.0, 'fine': True, 'cloth': False,
                      'hair_render': cfg['groom']['render'], 'framings': ['full:full:15']})
    RQ.render(a.blender, items, os.path.join(a.out, f'job-{a.part}.json'), a.samples, a.scale,
              {'skin_hd': True, 'subdiv': 1, 'catcher_size': 3.0})
    json.dump({k: {'params': p, 'morphs': BM.to_morphs(p), 'caption': c} for k, p, c in todo},
              open(os.path.join(a.out, f'{a.part}.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print('BODY GRID OK', a.part, len(items))


if __name__ == '__main__':
    main()
