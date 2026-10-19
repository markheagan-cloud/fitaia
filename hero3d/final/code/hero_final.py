"""
FITAIA — rendus « finaux » du héros (premium-male-01, « moi ») : contrôle DA tête + corps et évolution du poids.

  python hero_final.py --src <assets-src> --blender <blender.exe> --out <dossier> [--samples 128] [--scale 1.5]
                       [--states surpoids,actuel,athletique] [--skip-build] [--only-head]

Même avatar maître que les portraits de la Communauté (persons.hero_config : coiffure en mèches, sourcils en poils,
t-shirt + jogging ajustés par l'usine), même studio (blender/render_portraits.py), rendu « fin » (peau par zones et
pores, cornée, maille du tissu). Sorties (fond transparent) :
  <out>/_rendus/actuel/{head_face,head_34,bust,full}.png      état « actuel »
  <out>/_rendus/<état>/{bust,full}.png                        surpoids / athlétique (même identité, même cadrage)
"""
import argparse
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--blender', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--states', default='surpoids,actuel,athletique')
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--scale', type=float, default=1.5)
    ap.add_argument('--skip-build', action='store_true')
    ap.add_argument('--only-head', action='store_true')
    ap.add_argument('--no-cloth', action='store_true')
    a = ap.parse_args()
    import build_premium_avatar as B
    import persons as PS
    d = os.path.join(a.out, 'moi')
    os.makedirs(d, exist_ok=True)
    glb = os.path.join(d, 'avatar.glb')
    cfg = PS.hero_config()
    if not a.skip_build:
        print('=== build', time.strftime('%H:%M:%S'), flush=True)
        B.build(a.src, glb, cfg=cfg)
    states = json.load(open(os.path.join(HERE, 'states-hero.json')))['states']
    items = []
    for st in a.states.split(','):
        if st == 'actuel':
            fr = ['head_face:head:0', 'head_34:head:32'] + ([] if a.only_head else ['bust:bust:14', 'full:full:12'])
        else:
            if a.only_head:
                continue
            fr = ['bust:bust:14', 'full:full:12']
        items.append({'key': 'moi-' + st, 'glb': glb, 'hair': os.path.join(d, 'avatar.hair.npz'), 'meta': os.path.join(d, 'avatar.portrait.json'),
                      'state': states[st], 'out': os.path.join(a.out, '_rendus', st), 'yaw': 12.0, 'fine': True, 'cloth': not a.no_cloth,
                      'hair_render': cfg['groom']['render'], 'framings': fr})
    job = os.path.join(a.out, 'job-hero.json')
    json.dump({'samples': a.samples, 'scale': a.scale, 'catcher_size': 3.0, 'items': items}, open(job, 'w', encoding='utf-8'), indent=1)
    print('=== rendus', time.strftime('%H:%M:%S'), flush=True)
    subprocess.run([a.blender, '-b', '--factory-startup', '--python', os.path.join(HERE, 'blender', 'render_portraits.py'), '--', job], check=True)
    print('HERO OK ->', a.out, time.strftime('%H:%M:%S'))


if __name__ == '__main__':
    main()
