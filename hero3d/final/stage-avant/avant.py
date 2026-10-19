# « Avant » : le héros tel que le fondateur l'a vu (code de l'usine AVANT la passe finale = app\tools\premium-avatar),
# rendu aux mêmes cadrages que les rendus finaux (tête face, tête 3/4, corps entier).
import json, os, subprocess, sys
F = os.environ['FITAIA']
OLD = os.path.join(F, 'app', 'tools', 'premium-avatar')
sys.path.insert(0, OLD)
import build_premium_avatar as B, persons as PS
out = os.path.join(F, 'hero3d', 'final', 'avant')
os.makedirs(os.path.join(out, 'moi'), exist_ok=True)
glb = os.path.join(out, 'moi', 'avatar.glb')
cfg = PS.hero_config()
B.build(os.path.join(F, 'assets-src'), glb, cfg=cfg)
state = json.load(open(os.path.join(OLD, 'states-hero.json')))['states']['actuel']
base = {'glb': glb, 'hair': os.path.join(out, 'moi', 'avatar.hair.npz'), 'meta': os.path.join(out, 'moi', 'avatar.portrait.json'),
        'state': state, 'hair_render': cfg['groom']['render']}
items = [dict(base, key='head_face', yaw=0.0, framings=['head'], out=os.path.join(out, '_rendus', 'head_face')),
         dict(base, key='head_34', yaw=32.0, framings=['head'], out=os.path.join(out, '_rendus', 'head_34')),
         dict(base, key='full', yaw=12.0, framings=['full', 'bust'], out=os.path.join(out, '_rendus', 'full'))]
job = os.path.join(out, 'job.json')
json.dump({'samples': 96, 'scale': 1.25, 'items': items}, open(job, 'w'), indent=1)
subprocess.run([os.path.join(F, 'tools', 'blender-4.5.14-windows-x64', 'blender.exe'), '-b', '--factory-startup', '--python',
                os.path.join(OLD, 'blender', 'render_portraits.py'), '--', job], check=True)
print('AVANT OK')
