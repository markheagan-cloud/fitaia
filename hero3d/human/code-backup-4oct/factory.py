"""
FITAIA — usine à avatars : une commande, du corps de base CC0 jusqu'au GLB de l'app et à la planche de validation.

  python factory.py --src <assets-src> --blender <blender.exe> [--out <dossier>] [--skip-sim] [--skip-render]

Étapes (chaque étape écrit ses fichiers dans <out>, on peut relancer à partir de n'importe laquelle) :
  1. Vêtements : découpe sur notre corps + aisance + bords  (garments.py)            → garments_in.json
  2. Tissu     : simulation Blender, jogging puis t-shirt     (blender/cloth_sim.py)   → garments_out.json
  3. Avatar    : corps + visage + peau + cheveux + vêtements + 15 morphs (build_premium_avatar.py) → avatar.glb
  4. Rendu     : studio Cycles, 3 états × 4 vues             (blender/render_sheet.py) → rendus/*.png
  5. Planche   : assemblage pour validation                   (compose_sheet.py)       → planche.jpg

Python requis : numpy + Pillow (le Python intégré à Blender convient, Pillow s'y installe avec pip).
Une nouvelle base (femme, autre carnation, autre tenue) = une nouvelle CONFIG dans build_premium_avatar.py, même usine.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def step(name):
    print(f'\n=== {name} ({time.strftime("%H:%M:%S")})', flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='dossier assets-src (MakeHuman / MPFB2 CC0)')
    ap.add_argument('--blender', required=True)
    ap.add_argument('--out', default=os.path.join(HERE, 'out'))
    ap.add_argument('--states', default=os.path.join(HERE, 'states-hero.json'))
    ap.add_argument('--frames', type=int, default=72)
    ap.add_argument('--skip-sim', action='store_true')
    ap.add_argument('--skip-render', action='store_true')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    gdir = os.path.join(a.src, 'garments')
    gin, gout = os.path.join(a.out, 'garments_in.json'), os.path.join(a.out, 'garments_out.json')
    bl = os.path.join(HERE, 'blender')

    import build_premium_avatar as B
    if not B.CONFIG.get('generated_clothes'):
        a.skip_sim = True          # tenue MakeHuman recoupée (pas de vêtements générés à simuler)
    if not a.skip_sim:
        step('1. Vêtements générés sur le corps')
        import garments
        garments.main(a.src, gin)
        step('2. Simulation du tissu (Blender)')
        subprocess.run([a.blender, '-b', '--factory-startup', '--python', os.path.join(bl, 'cloth_sim.py'), '--', gin, gout, str(a.frames)], check=True)
    if B.CONFIG.get('generated_clothes') and os.path.exists(gout):
        os.makedirs(gdir, exist_ok=True)
        shutil.copy(gin, os.path.join(gdir, 'garments_in.json'))
        shutil.copy(gout, os.path.join(gdir, 'garments_out.json'))

    step('3. Construction de l\'avatar (GLB + morphs)')
    glb = os.path.join(a.out, 'avatar.glb')
    B.build(a.src, glb)

    if not a.skip_render:
        step('4. Rendu studio (Blender Cycles)')
        renders = os.path.join(a.out, 'rendus')
        subprocess.run([a.blender, '-b', '--factory-startup', '--python', os.path.join(bl, 'render_sheet.py'), '--', glb, renders, a.states], check=True)
        # gros plans visage (contrôle DA) : état actuel, face et 3/4
        st = json.load(open(a.states))
        popt = {'states': {'actuel': st['states']['actuel']}, 'views': {'face': 0, 'trois-quarts': 30},
                'samples': st.get('samples', 128), 'res': [1080, 1350], 'frame': 'portrait'}
        pj = os.path.join(a.out, 'opt-portrait.json')
        json.dump(popt, open(pj, 'w'))
        subprocess.run([a.blender, '-b', '--factory-startup', '--python', os.path.join(bl, 'render_sheet.py'), '--', glb, os.path.join(a.out, 'portrait'), pj], check=True)
        step('5. Planche de validation')
        subprocess.run([sys.executable, os.path.join(HERE, 'compose_sheet.py'), renders, os.path.join(a.out, 'planche.jpg')], check=True)
    print('\nUSINE OK ->', a.out)
    json.dump({'glb': glb, 'time': time.strftime('%Y-%m-%d %H:%M:%S')}, open(os.path.join(a.out, 'usine.json'), 'w'))


if __name__ == '__main__':
    main()
