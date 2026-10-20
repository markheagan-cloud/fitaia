"""
FITAIA — tâche « selfie → avatar GLB » rapide (sans rendu Blender), appelée par serve_avatar.py.

  python photo_avatar_job.py --src <assets-src> --pyenv <python MediaPipe> --model face_landmarker.task
                             [--seg selfie_multiclass.tflite] --base <dossier base neutre> --photo <selfie.jpg>
                             --sex m|f --out <dossier>

Étapes : repères du visage (MediaPipe) → identité (cibles de visage MakeHuman + texture du visage) → GLB avec les mêmes
15 morphs du corps que le héros. Écrit <out>/avatar.glb et <out>/report.json :
  - traits lus sur la photo (teint, cheveux, mesures du visage) ;
  - traits impossibles à déduire d'un seul selfie (taille, poids, masse grasse, musculature) : pris dans le profil ;
  - limites honnêtes (ex. base féminine : visage non ajusté, voir report['limites']).
Le contrôle de ressemblance complet (rendus + biométrie) reste dans factory_photo.py : il prend plusieurs minutes.
"""
import argparse
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

NOT_FROM_PHOTO = [
    {'trait': 'taille', 'raison': 'une photo ne donne pas d’échelle', 'source': 'profil'},
    {'trait': 'poids', 'raison': 'le selfie ne montre que le visage', 'source': 'profil'},
    {'trait': 'masse grasse et ventre', 'raison': 'le corps n’est pas visible', 'source': 'profil (IMC)'},
    {'trait': 'musculature', 'raison': 'le corps n’est pas visible', 'source': 'profil (activité)'},
    {'trait': 'profondeur du visage (profil)', 'raison': 'une photo de face ne montre pas le profil', 'source': 'base neutre'},
    {'trait': 'âge', 'raison': 'non estimé volontairement', 'source': 'profil'},
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--pyenv', required=True)
    ap.add_argument('--model', required=True)
    ap.add_argument('--seg', default=None)
    ap.add_argument('--base', required=True, help='dossier contenant neutral.png(.landmarks.json) et neutral.npz')
    ap.add_argument('--photo', required=True)
    ap.add_argument('--sex', choices=['m', 'f'], default='m')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    report = {'ok': False, 'sex': a.sex, 'non_deductible': NOT_FROM_PHOTO, 'limites': [], 'etapes': {}}
    rp = os.path.join(a.out, 'report.json')

    def done(code=0):
        report['secondes'] = round(time.time() - t0, 1)
        json.dump(report, open(rp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        sys.exit(code)

    t = time.time()
    r = subprocess.run([a.pyenv, os.path.join(HERE, 'landmarks.py'), a.model] + ([a.seg] if a.seg else []) + [a.photo],
                       capture_output=True, text=True)
    report['etapes']['reperes_s'] = round(time.time() - t, 1)
    lmp = a.photo + '.landmarks.json'
    if r.returncode != 0 or not os.path.exists(lmp):
        report['erreur'] = 'analyse du visage impossible'
        report['detail'] = (r.stderr or '')[-400:]
        done(2)
    lm = json.load(open(lmp))
    if not lm.get('found'):
        report['erreur'] = 'aucun visage détecté : prends le selfie de face, visage entier dans l’ovale, bonne lumière'
        done(3)

    import build_premium_avatar as B
    import photo_id as P
    t = time.time()
    npng = os.path.join(a.base, 'neutral.png')
    idn = P.make_identity(a.src, a.photo, lmp, os.path.join(a.base, 'neutral.npz'), npng + '.landmarks.json', a.out)
    report['etapes']['identite_s'] = round(time.time() - t, 1)
    colors = idn.get('colors', {})
    report['traits_photo'] = {
        'teint_rgb': colors.get('skin'),
        'cheveux_rgb': colors.get('hair'),
        'chauve': bool(colors.get('bald')),
        'iris_rgb': colors.get('iris'),
        'cibles_visage': len(idn.get('targets') or []),
        'erreur_moyenne_mm': idn.get('err_mm'),
    }
    if a.sex == 'f':
        # l'ajustement du visage est calibré sur la base neutre masculine : il n'est pas encore validé sur la base féminine
        report['limites'].append('base féminine : la forme du visage n’est pas encore ajustée à la photo (teint et cheveux seulement)')

    t = time.time()
    idp = os.path.join(a.out, 'identity.json')
    idj = json.load(open(idp))
    idj['_dir'] = a.out
    cfg = None
    if a.sex == 'f':
        import persons
        sheet = {'appearance': 'fem', 'body': 'moyen', 'skin': 's3', 'hairStyle': 'long', 'hairColor': 'brun', 'face': 'ovale',
                 'eyes': 'brun', 'beard': 'aucune', 'extras': []}
        cfg = persons.config_for({'key': 'selfie', 'seed': 7, 'sheet': sheet}, a.src)
    else:
        B.CONFIG['identity'] = idj
        B.CONFIG['groom'] = None
        B.CONFIG['groom_save'] = True
    out = os.path.join(a.out, 'avatar.glb')
    B.build(a.src, out, False, cfg=cfg)
    report['etapes']['glb_s'] = round(time.time() - t, 1)
    st = json.load(open(os.path.splitext(out)[0] + '.stats.json', encoding='utf-8'))
    report['glb'] = {'octets': st['bytes'], 'triangles': st['triangles'], 'morphs': st['morphs']}
    report['ok'] = True
    done(0)


if __name__ == '__main__':
    main()
