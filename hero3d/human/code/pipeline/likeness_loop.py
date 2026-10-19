"""
FITAIA — usine PHOTO → AVATAR avec boucle de ressemblance automatique (une commande, 100 % gratuit).

  python pipeline/likeness_loop.py --src <assets-src> --blender <blender> --pyenv <python MediaPipe> --model <face_landmarker.task>
                                   --seg <selfie_multiclass.tflite> --photo <photo.jpg> [--photo ...] --out <dossier>
                                   [--iters 3] [--samples 48] [--final-samples 96]

Pour chaque photo :
  PhotoAnalysisService    repères MediaPipe (478 points, blendshapes) + segmentation (cheveux / peau / fond)
  IdentityFittingService  tête maître NEUTRE (cibles d'identité + résidu RBF) ; sourire de la photo → variables d'expression
                          (séparées), texture projetée avec l'expression puis portée par la tête neutre
  HairPipeline            mèches (cuir chevelu, masse, dégradé, ligne frontale, sourcils) aux longueurs mesurées sur la photo,
                          couleur = mélanine + part de cheveux blancs (gris) lues sur la photo
  GLBExportService        build_premium_avatar.build : 15 morphs du corps + expressions en shape keys
  RenderQAService         rendu Cycles à l'angle de la photo → repères → rapport d'erreurs (likeness.py)
  boucle                  chaque erreur hors tolérance corrige SES repères (mâchoire, menton, nez, yeux, bouche…), on
                          refabrique et on re-rend ; on garde la meilleure itération
  Quality Gate            FAIL / REVIEW_REQUIRED / PASS (PASS seulement avec verdict humain), planche + likeness.json
"""
import argparse
import copy
import json
import os
import shutil
import sys
import time

import numpy as np

PIPE = os.path.dirname(os.path.abspath(__file__))
HERE = os.path.dirname(PIPE)
sys.path.insert(0, HERE)
sys.path.insert(0, PIPE)
import build_premium_avatar as B  # noqa: E402
import identity_fitting as IF  # noqa: E402
import likeness as LK  # noqa: E402
import render_qa as RQ  # noqa: E402

# mesures corrigées par la boucle (le nom = clé de identity_fitting.apply_corrections) ; gain proportionnel
CORRECTABLE = ['jaw_width', 'face_width', 'cheekbones', 'forehead_width', 'nose_width', 'nose_length', 'mouth_position',
               'chin_height', 'eye_spacing', 'eye_width', 'mouth_width', 'face_height', 'nose_projection']
# (les oreilles sont mesurées et rapportées, mais pas corrigées automatiquement : les cheveux / favoris qui les
#  recouvrent faussent la largeur de peau lue sur la segmentation)
GAIN = 0.9
# studio des rendus de ressemblance : transformation de vue fidèle aux couleurs (teint de la photo), même lumière que les
# portraits de l'usine
STUDIO = {'view': 'Khronos PBR Neutral', 'look': 'None', 'exposure': -1.0, 'skin_hd': True, 'subdiv': 1,
          'skin_params': {'mottle_amt': 0.1, 'mel_amt': 0.03}}      # la photo apporte déjà le teint réel


def step(t):
    print(f'=== {t} ({time.strftime("%H:%M:%S")})', flush=True)


def identity_config(id_dir):
    """Configuration de l'avatar d'une personne : la tête maître ajustée + coiffure en mèches de la photo."""
    idj = json.load(open(os.path.join(id_dir, 'identity.json')))
    idj['_dir'] = os.path.abspath(id_dir)
    cfg = copy.deepcopy(B.CONFIG)
    cfg['id'] = 'identity-' + os.path.basename(os.path.normpath(id_dir))
    cfg['identity'] = idj
    cfg['portrait'] = True
    cfg['groom_save'] = True
    col = idj.get('colors', {})
    groom = {'seed': 5, 'brows': {'count': 2200, 'length': 0.07},
             # couches fines : ligne frontale douce et favoris (la barbe rasée vient de la photo)
             'layers': {'hairline': {'count': 5000, 'length': 0.035}, 'sideburns': {'count': 2500, 'length': 0.04}}}
    if not col.get('bald') and col.get('hair_thickness', 0.6) >= 0.25:
        groom['hair'] = {'style': 'crop', 'identity': True, 'forward': -0.35, 'sweep': 0.35, 'mess': 0.2, 'count': 110000,
                         'lift': 1.0, 'scalp_paint': 0.6, 'smooth_iters': 2, 'max_out': 0.35, 'split_sides': 0.12,
                         'side_factor': 2.0, 'top_factor': 3.0}
    groom['scalp_color'] = tuple(np.clip(np.array(col.get('hair', [0.3, 0.25, 0.2])) * 0.9, 0.02, 0.8))
    cfg['groom'] = groom
    return cfg


def hair_render(colors):
    return {'melanin': colors.get('hair_melanin', 0.7), 'redness': colors.get('hair_redness', 0.2),
            'gray': colors.get('hair_gray', 0.0), 'brow_melanin': min(1.0, colors.get('hair_melanin', 0.7) + 0.08)}


def photo_yaw(ident):
    import math
    R = ident['pose']['R']
    return math.degrees(math.atan2(R[0][2], R[2][2]))


def update_corrections(corr, rep):
    corr = dict(corr)
    changed = []
    sil = rep['errors'].get('lower_face_silhouette_error', {}).get('error')
    for k in CORRECTABLE:
        v = rep['errors'].get(k + '_error', {})
        e, st, thr = v.get('error'), v.get('status'), v.get('threshold', 0.1)
        if e is None or st not in ('OK', 'ÉCHEC') or abs(e) < 0.35 * thr:
            continue
        if k == 'jaw_width' and sil is not None and abs(sil) > 0.03 and np.sign(sil) != np.sign(e):
            # mesures contradictoires (repères MediaPipe : mâchoire étroite ; silhouette réelle : bas du visage large) :
            # on ne corrige pas la mâchoire à l'aveugle
            changed.append(f'{k} ignorée (silhouette {100 * sil:+.0f} %)')
            continue
        corr[k] = float(np.clip(corr.get(k, 0.0) - GAIN * e, -0.35, 0.35))
        changed.append(f'{k} {100 * e:+.1f}%')
    v = rep['errors'].get('hairline_error', {})
    if v.get('error') is not None and v.get('status') in ('OK', 'ÉCHEC') and abs(v['error']) > 0.04:
        corr['hairline_dm'] = float(np.clip(corr.get('hairline_dm', 0.0) - v['error'] * 0.8, -0.5, 0.5))
        changed.append(f"hairline {100 * v['error']:+.1f}%")
    return corr, changed


def rank(rep):
    """Classement des itérations : moins d'échecs, puis meilleur score."""
    fails = sum(1 for v in rep['errors'].values() if v.get('status') == 'ÉCHEC')
    return (fails, -rep['automated_similarity'])


def run_photo(a, photo, base):
    name = os.path.splitext(os.path.basename(photo))[0]
    root = os.path.join(a.out, name)
    os.makedirs(root, exist_ok=True)
    review_p = os.path.join(root, 'human_review.json')
    review = json.load(open(review_p, encoding='utf-8-sig')) if os.path.exists(review_p) else None
    corr, hist, best = {}, [], None
    for it in range(a.iters):
        d = os.path.join(root, f'it{it}')
        os.makedirs(d, exist_ok=True)
        step(f'{name} — itération {it} : identité (corrections {json.dumps({k: round(v, 3) for k, v in corr.items()})})')
        ident = IF.make_identity(a.src, photo, d, base, corr)
        step(f'{name} — itération {it} : avatar')
        cfg = identity_config(d)
        B.build(a.src, os.path.join(d, 'avatar.glb'), cfg=cfg)
        step(f'{name} — itération {it} : rendu à l\'angle de la photo')
        yaw = photo_yaw(ident)
        # mesures de FORME sur l'avatar portant l'expression de la photo (shape key expr_photo) : même expression des deux
        # côtés, la forme du visage est comparée à expression égale
        item = {'key': f'{name}-it{it}', 'glb': os.path.join(d, 'avatar.glb'), 'hair': os.path.join(d, 'avatar.hair.npz'),
                'meta': os.path.join(d, 'avatar.portrait.json'), 'state': {'expr_photo': 1.0}, 'out': os.path.join(d, 'rendus'), 'yaw': yaw,
                'fine': True, 'cloth': False, 'hair_render': hair_render(ident['colors']), 'framings': [f'photo_expr:head:{yaw:.2f}']}
        RQ.render(a.blender, [item], os.path.join(d, 'job.json'), a.samples, 1.25, STUDIO)
        pbg = RQ.flatten(os.path.join(d, 'rendus', 'photo_expr.png'))
        RQ.landmarks(a.pyenv, a.model, a.seg, [pbg])
        rep = LK.compare(photo, pbg, review, expressive=True)
        rep['iteration'] = it
        rep['corrections'] = corr
        LK.write(rep, os.path.join(d, 'likeness.json'))
        print('\n'.join('   ' + l for l in LK.summary_lines(rep)), flush=True)
        hist.append({'iteration': it, 'automated_similarity': rep['automated_similarity'], 'gate': rep['visual_quality_gate'],
                     'fails': [k for k, v in rep['errors'].items() if v.get('status') == 'ÉCHEC'], 'corrections': corr})
        if best is None or rank(rep) < rank(best[1]):
            best = (it, rep, d, ident)
        fails = [k for k, v in rep['errors'].items() if v.get('status') == 'ÉCHEC' and k != 'expression_neutrality_error']
        corr2, changed = update_corrections(corr, rep)
        print('   corrections :', ', '.join(changed) if changed else 'aucune', flush=True)
        if not fails and not changed:
            break
        corr = corr2
    it, rep, d, ident = best
    step(f'{name} — meilleure itération : {it} ; rendus finaux (face, 3/4, profil)')
    yaw = photo_yaw(ident)
    common = {'glb': os.path.join(d, 'avatar.glb'), 'hair': os.path.join(d, 'avatar.hair.npz'), 'meta': os.path.join(d, 'avatar.portrait.json'),
              'out': os.path.join(root, 'final'), 'fine': True, 'cloth': False, 'hair_render': hair_render(ident['colors'])}
    items = [dict(common, key=f'{name}-neutre', state={}, yaw=0.0,
                  framings=[f'photo:head:{yaw:.2f}', 'face:head:0', 'trois-quarts:head:32', 'profil:head:88']),
             dict(common, key=f'{name}-expr', state={'expr_photo': 1.0}, yaw=0.0, framings=[f'photo_expr:head:{yaw:.2f}']),
             dict(common, key=f'{name}-sourire', state={'expr_smile': 1.0}, yaw=0.0, framings=['smile:head:0'])]
    RQ.render(a.blender, items, os.path.join(root, 'job-final.json'), a.final_samples, 1.5, STUDIO)
    pbg = RQ.flatten(os.path.join(root, 'final', 'photo.png'))
    ebg = RQ.flatten(os.path.join(root, 'final', 'photo_expr.png'))
    RQ.landmarks(a.pyenv, a.model, a.seg, [pbg, ebg])
    rep = LK.compare(photo, ebg, review, neutral=pbg)
    rep['iteration'] = it
    rep['history'] = hist
    LK.write(rep, os.path.join(root, 'likeness.json'))
    for f in ('avatar.glb', 'avatar.hair.npz', 'avatar.portrait.json', 'identity.json', 'offsets.npz', 'face.png'):
        if os.path.exists(os.path.join(d, f)):
            shutil.copy(os.path.join(d, f), os.path.join(root, f))
    print('\n'.join('   ' + l for l in LK.summary_lines(rep)), flush=True)
    return rep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--blender', required=True)
    ap.add_argument('--pyenv', required=True)
    ap.add_argument('--model', required=True)
    ap.add_argument('--seg', default=None)
    ap.add_argument('--photo', action='append', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--iters', type=int, default=3)
    ap.add_argument('--samples', type=int, default=48)
    ap.add_argument('--final-samples', dest='final_samples', type=int, default=96)
    a = ap.parse_args()
    import photo_id as P
    base = os.path.join(a.out, '_base')
    os.makedirs(base, exist_ok=True)
    if not os.path.exists(os.path.join(base, 'neutral.png.landmarks.json')):
        step('base neutre (une fois)')
        P.render_neutral(a.src, os.path.join(base, 'neutral.png'), os.path.join(base, 'neutral.npz'))
        RQ.landmarks(a.pyenv, a.model, None, [os.path.join(base, 'neutral.png')])
    step('PhotoAnalysisService : repères + segmentation')
    RQ.landmarks(a.pyenv, a.model, a.seg, a.photo)
    for ph in a.photo:
        run_photo(a, ph, base)
    print('LIKENESS OK ->', a.out)


if __name__ == '__main__':
    main()
