"""
FITAIA — tâche « selfie → avatar GLB » rapide (sans rendu Blender), appelée par serve_avatar.py.

  python photo_avatar_job.py --src <assets-src> --pyenv <python MediaPipe> --model face_landmarker.task
                             [--seg selfie_multiclass.tflite] --base <dossier base neutre> --photo <selfie.jpg>
                             --sex m|f --out <dossier>

Étapes : repères du visage (MediaPipe) → identité (cibles de visage MakeHuman + texture du visage) → GLB avec les mêmes
15 morphs du corps que le héros. Écrit <out>/avatar.glb et <out>/report.json :
  - traits lus sur la photo (teint, cheveux, mesures du visage) ;
  - traits impossibles à déduire d'un seul selfie (taille, poids, masse grasse, musculature) : pris dans le profil ;
  - limites honnêtes (report['limites'] : ex. base féminine, la coiffure vient de la fiche, pas de la photo).
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


def neutral_base_for(cfg, base_root, src, pyenv, model):
    """Base neutre (rendu + repères MediaPipe) de la configuration cfg, mise en cache sous <base_root>/<id>-<carnation>.
    Renvoie (dossier, créée_maintenant)."""
    import photo_id as P
    race = '-'.join(f'{k[:3]}{int(round(w * 100)):02d}' for k, w in sorted(cfg['base']['race'].items()))
    d = os.path.join(base_root, f"{cfg['id']}-{race}")
    npng, nnpz = os.path.join(d, 'neutral.png'), os.path.join(d, 'neutral.npz')
    if os.path.exists(nnpz + '.ok'):
        return d, False
    os.makedirs(d, exist_ok=True)
    P.render_neutral(src, npng, nnpz, cfg=cfg)
    subprocess.run([pyenv, os.path.join(HERE, 'landmarks.py'), model, npng], check=True)
    open(nnpz + '.ok', 'w').write('ok')
    return d, True


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
    ap.add_argument('--sheet', default=None, help='fiche du créateur (JSON) : carnation, cheveux, carrure pour la base féminine')
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
    cfg, base_dir = None, a.base
    if a.sex == 'f':
        # base FEMME : même ajustement du visage depuis la photo que pour la base homme, sur la base neutre féminine
        # (persons.selfie_config : macros femme, carnation / coupe / carrure de la fiche). La base neutre est rendue une
        # fois par carnation (les macros d'origine changent la forme du crâne) et réutilisée.
        import persons
        cfg = persons.selfie_config(a.src, 'f', a.sheet)
        base_dir, created = neutral_base_for(cfg, a.base, a.src, a.pyenv, a.model)
        if created:
            report['etapes']['base_neutre_s'] = round(time.time() - t, 1)
            t = time.time()
    npng = os.path.join(base_dir, 'neutral.png')
    idn = P.make_identity(a.src, a.photo, lmp, os.path.join(base_dir, 'neutral.npz'), npng + '.landmarks.json', a.out, cfg=cfg)
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
        report['limites'].append('Base femme : la coiffure vient de ta fiche du créateur (couleur lue sur la photo), pas de la photo.')

    t = time.time()
    idp = os.path.join(a.out, 'identity.json')
    idj = json.load(open(idp))
    idj['_dir'] = a.out
    if cfg is not None:
        cfg['identity'] = idj
        cfg['groom_save'] = True
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
