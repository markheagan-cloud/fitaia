"""
FITAIA — portraits sociaux de la Communauté, depuis l'usine d'avatars (une commande).

  python portraits.py --src <assets-src> --blender <blender.exe> --out <dossier> [--only moi,demo_demo_sarah] [--skip-build]
                      [--skip-render] [--samples 160] [--persons persons/community-demo.json]

Pour chaque avatar :
  1. avatar maître (GLB) + mèches (.hair.npz) + repères de cadrage (.portrait.json)      build_premium_avatar.py
     - « moi » : le héros premium-male-01 (CONFIG inchangé : même GLB que FABRIQUER-AVATAR) dans son état « actuel » ;
     - membres de démonstration : persons.py (fiche → identité procédurale à graine fixe, femme / homme, tenue, coiffure)
  2. 4 cadrages rendus dans le studio FITAIA (Blender Cycles, fond transparent)          blender/render_portraits.py
  3. réduction, palette PNG ≤ 300 Ko, carte sociale sur fond studio, planche contact     compose_portraits.py
Sorties : <out>/<clé>/avatar.glb… ; <out>/_rendus/<clé>/*.png ; <out>/final/<clé>/{head,bust,full,card}.png ; <out>/planche.png
"""
import argparse
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def step(t):
    print(f'\n=== {t} ({time.strftime("%H:%M:%S")})', flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--blender', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--persons', default=os.path.join(HERE, 'persons', 'community-demo.json'))
    ap.add_argument('--states', default=os.path.join(HERE, 'states-hero.json'))
    ap.add_argument('--only', default=None)
    ap.add_argument('--framings', default='head,bust,full,card')
    ap.add_argument('--samples', type=int, default=160)
    ap.add_argument('--scale', type=float, default=1.5)
    ap.add_argument('--skip-build', action='store_true')
    ap.add_argument('--skip-render', action='store_true')
    a = ap.parse_args()
    import build_premium_avatar as B
    import persons as PS

    people = PS.load(a.persons)
    entries = [{'key': 'moi', 'name': 'Moi (héros)'}] + people
    only = set(a.only.split(',')) if a.only else None
    entries = [e for e in entries if not only or e['key'] in only]
    hero_state = json.load(open(a.states))['states']['actuel']
    items = []
    for e in entries:
        k = e['key']
        d = os.path.join(a.out, k)
        os.makedirs(d, exist_ok=True)
        glb = os.path.join(d, 'avatar.glb')
        if k == 'moi':
            cfg = PS.hero_config()
            state = hero_state
            hr = cfg['groom']['render']
        else:
            cfg = PS.config_for(e, a.src)
            state = {}
            hr = cfg['groom']['render']
        if not a.skip_build:
            step(f'1. Avatar : {k}')
            B.build(a.src, glb, cfg=cfg)
            json.dump({'id': cfg['id'], 'label': cfg['label'], 'sheet': e.get('sheet'), 'groom': {kk: vv for kk, vv in cfg.get('groom', {}).items() if kk != 'render'}},
                      open(os.path.join(d, 'person.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
        # rendu « fin » pour tous (peau par zones et pores, cornée, maille du tissu) ; le héros a en plus son tissu simulé
        # (corps complet fourni par l'usine)
        items.append({'key': k, 'glb': glb, 'hair': os.path.join(d, 'avatar.hair.npz'), 'meta': os.path.join(d, 'avatar.portrait.json'),
                      'state': state, 'out': os.path.join(a.out, '_rendus', k), 'yaw': e.get('yaw', 12.0), 'hair_render': hr,
                      'framings': a.framings.split(','), 'fine': True, 'cloth': bool(cfg.get('collider')) and k != 'moi'})   # héros : tenue du GLB (ajustée, épaules justes) ; la simulation regonflait les épaules
    if not a.skip_render:
        step('2. Rendus studio (Blender Cycles)')
        job = os.path.join(a.out, 'job-portraits.json')
        json.dump({'samples': a.samples, 'scale': a.scale, 'items': items}, open(job, 'w', encoding='utf-8'), indent=1)
        subprocess.run([a.blender, '-b', '--factory-startup', '--python', os.path.join(HERE, 'blender', 'render_portraits.py'), '--', job], check=True)
    step('3. Portraits finaux + planche')
    import compose_portraits as C
    keys = [it['key'] for it in items]
    C.compose(os.path.join(a.out, '_rendus'), os.path.join(a.out, 'final'), keys)
    labels = {e['key']: e.get('name', e['key']) for e in entries}
    allk = [k for k in ['moi'] + [p['key'] for p in people] if os.path.isdir(os.path.join(a.out, 'final', k))]
    print(C.contact_sheet(os.path.join(a.out, 'final'), allk, os.path.join(a.out, 'planche.png'), labels))
    print('\nPORTRAITS OK ->', a.out)


if __name__ == '__main__':
    main()
