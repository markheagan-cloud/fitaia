"""
FITAIA — usine PHOTO → AVATAR PERSONNALISÉ → ÉVOLUTION DU CORPS (une commande).

  python factory_photo.py --src <assets-src> --blender <blender.exe> --pyenv <python de l'environnement MediaPipe>
                          --photo <photo.jpg> [--photo ...] --out <dossier>

Pour chaque photo :
  1. repères du visage + segmentation (MediaPipe, local)                         → <photo>.landmarks.json / .seg.png
  2. identité : la base neutre est déformée pour ressembler à la personne        → identity.json + face.png
  3. avatar GLB : même moteur, mêmes 15 morphs du corps, visage et peau de la personne → avatar.glb
  4. rendus studio : visage (face, 3/4, profil) et la même tête en surpoids / actuel / athlétique
  5. planche « photo | avatar » pour juger la ressemblance                       → ressemblance.jpg
La base neutre (rendu + repères) est préparée une seule fois (dossier <src>/photo-id-base).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def step(t):
    print(f'\n=== {t} ({time.strftime("%H:%M:%S")})', flush=True)


def hair_melanin(rgb):
    """Couleur moyenne des cheveux sur la photo (sRGB 0..1) → (mélanine, rougeur) du shader de cheveux.
    Ancrages : noir 0,99 · brun 0,86 · châtain 0,68 · châtain clair 0,45 · blond 0,2 · blanc 0,03 (luminance linéaire)."""
    lin = np.array(rgb, float) ** 2.2
    L = float(lin @ np.array([0.2126, 0.7152, 0.0722]))
    xs = np.log([0.035, 0.055, 0.11, 0.2, 0.4, 0.8])
    ys = [0.99, 0.86, 0.68, 0.45, 0.2, 0.03]
    mel = float(np.interp(np.log(max(L, 1e-4)), xs, ys))
    chroma = (rgb[0] - rgb[2]) / max(sum(rgb), 1e-6)
    red = float(np.clip(0.05 + 1.5 * chroma, 0.03, 0.6))     # cheveux gris / châtain cendré : peu de rougeur
    return round(mel, 3), round(red, 3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--blender', required=True)
    ap.add_argument('--pyenv', required=True)
    ap.add_argument('--model', required=True, help='face_landmarker.task')
    ap.add_argument('--seg', default=None, help='selfie_multiclass_256x256.tflite')
    ap.add_argument('--photo', action='append', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--states', default=os.path.join(HERE, 'states-hero.json'))
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--strands', action='store_true', help='coiffure en mèches pour les rendus (au lieu de la coupe en coquilles)')
    ap.add_argument('--sex', choices=['m', 'f'], default='m', help='base de la personne : homme (héros) ou femme (persons.selfie_config)')
    ap.add_argument('--sheet', default=None, help='fiche du créateur (JSON) : carnation, coupe, carrure (base femme)')
    a = ap.parse_args()
    # chemins absolus : Blender (render_sheet.py) change de dossier courant ; un --out relatif finissait à la racine du disque
    a.out = os.path.abspath(a.out)
    a.src = os.path.abspath(a.src)
    a.photo = [os.path.abspath(p) for p in a.photo]
    import photo_id as P

    cfg, sex_args = None, []
    base = os.path.join(a.out, '_base')
    # la fiche du créateur (carnation, coupe, barbe) s'applique aux deux sexes, comme sur la voie serveur (photo_avatar_job) ;
    # sans fiche, un homme garde la base du héros (CONFIG inchangé)
    if a.sex == 'f' or a.sheet:
        import persons
        cfg = persons.selfie_config(a.src, a.sex, a.sheet)
        base = os.path.join(a.out, '_base-' + ('femme' if a.sex == 'f' else 'homme') + '-'
                            + '-'.join(f'{k[:3]}{int(round(w * 100)):02d}' for k, w in sorted(cfg['base']['race'].items())))
        sex_args = ['--sex', a.sex] + (['--sheet', a.sheet] if a.sheet else [])
    os.makedirs(base, exist_ok=True)
    npng, nnpz = os.path.join(base, 'neutral.png'), os.path.join(base, 'neutral.npz')
    if not os.path.exists(nnpz + '.ok'):
        step('0. Base neutre (une fois)' + (' — fiche ' + ('femme' if a.sex == 'f' else 'homme') if cfg else ''))
        P.render_neutral(a.src, npng, nnpz, cfg=cfg)
        subprocess.run([a.pyenv, os.path.join(HERE, 'landmarks.py'), a.model, npng], check=True)
        open(nnpz + '.ok', 'w').write('ok')

    step('1. Repères du visage (MediaPipe)')
    args = [a.pyenv, os.path.join(HERE, 'landmarks.py'), a.model] + ([a.seg] if a.seg else []) + a.photo
    subprocess.run(args, check=True)

    st = json.load(open(a.states))
    # « actuel » = la personne TELLE QUE SUR LA PHOTO : visage ajusté rendu sans la graisse de visage de l'état du héros
    # (sinon le bas du visage paraît plus large que sur la photo) ; surpoids / athlétique restent des démonstrations
    st['states']['actuel'] = {}
    opt = {'states': st['states'], 'views': {'face': 0, 'trois-quarts': 30, 'profil': 90},
           'only': ['actuel_face', 'actuel_trois-quarts', 'actuel_profil', 'surpoids_face', 'athletique_face'],
           'samples': a.samples, 'res': [800, 980], 'frame': 'portrait'}
    optp = os.path.join(a.out, 'opt-identite.json')
    json.dump(opt, open(optp, 'w'))
    verdicts = []
    for ph in a.photo:
        name = os.path.splitext(os.path.basename(ph))[0]
        d = os.path.join(a.out, name)
        os.makedirs(d, exist_ok=True)
        try:
            verdicts.append(process_photo(a, ph, name, d, cfg, sex_args, nnpz, npng, opt))
        except Exception as e:  # une personne en échec n'empêche pas les suivantes (trace conservée dans le dossier)
            import traceback
            tb = traceback.format_exc()
            open(os.path.join(d, 'ERREUR.txt'), 'w', encoding='utf-8').write(tb)
            print(tb)
            verdicts.append((name, 'ERREUR', False, [f'{type(e).__name__}: {e}'[:300]]))
    report_verdicts(verdicts, a.out)


def process_photo(a, ph, name, d, cfg, sex_args, nnpz, npng, opt):
    """Une personne : identité, avatar, rendus, contrôle (2 passes), planche. Renvoie (nom, verdict, valide, raisons)."""
    import photo_id as P
    if True:
        step(f'2. Identité : {name}')
        idn = P.make_identity(a.src, ph, ph + '.landmarks.json', nnpz, npng + '.landmarks.json', d, cfg=cfg)
        import math
        R = idn['pose']['R']
        yaw = math.degrees(math.atan2(R[0][2], R[2][2]))
        o2 = dict(opt)
        o2['views'] = dict(opt['views'], photo=yaw)
        o2['hair_color'] = [round(float(c) ** 2.2, 4) for c in idn['colors'].get('hair', [0.3, 0.22, 0.15])]
        hrgb = idn['colors'].get('hair', [0.3, 0.22, 0.15])
        if (max(hrgb) - min(hrgb)) / max(max(hrgb), 1e-6) > 0.12:
            o2['hair_melanin'], o2['hair_redness'] = hair_melanin(hrgb)
        # cheveux sans teinte (gris, blancs, noirs) : une mélanine moyenne rend du blond-roux, pas du gris ;
        # le shader est alors piloté par la couleur linéaire mesurée (o2['hair_color'])
        o2['only'] = opt['only'] + ['actuel_photo']
        optp = os.path.join(d, 'opt-identite.json')
        json.dump(o2, open(optp, 'w'))
        idp = os.path.join(d, 'identity.json')
        for passe in (1, 2):
            step(f'3. Avatar : {name} (passe {passe})')
            subprocess.run([sys.executable, os.path.join(HERE, 'build_premium_avatar.py'), '--src', a.src,
                            '--out', os.path.join(d, 'avatar.glb'), '--identity', idp] + sex_args + (['--strands'] if a.strands else []), check=True)
            step(f'4. Rendus : {name} (passe {passe})')
            o3 = dict(o2)
            if passe == 1:
                o3['only'] = ['actuel_photo']           # passe de mesure : seulement l'angle de la photo
            json.dump(o3, open(optp, 'w'))
            subprocess.run([a.blender, '-b', '--factory-startup', '--python', os.path.join(HERE, 'blender', 'render_sheet.py'), '--',
                            os.path.join(d, 'avatar.glb'), os.path.join(d, 'rendus'), optp], check=True)
            step(f'5. Contrôle de ressemblance : {name} (passe {passe})')
            rp = os.path.join(d, 'rendus', 'actuel_photo.png')
            subprocess.run([a.pyenv, os.path.join(HERE, 'landmarks.py'), a.model] + ([a.seg] if a.seg else []) + [rp], check=True)
            subprocess.run([sys.executable, os.path.join(HERE, 'biometrie.py'), ph, rp, os.path.join(d, 'controle.json'),
                            os.path.join(d, 'superposition.png')], check=True)
            ctrl = json.load(open(os.path.join(d, 'controle.json'), encoding='utf-8'))
            if passe == 1 and ctrl:
                # correction géométrique : chaque écart mesuré pilote sa cible (contrôleur proportionnel), puis l'identité
                # est recalculée (forme + texture) avec ces corrections
                GAIN = {'longueur_nez': ('nose/nose-scale-vert', 3.0), 'largeur_nez': ('nose/nose-scale-horiz', 3.0),
                        'largeur_visage': ('head/head-scale-horiz', 4.0), 'hauteur_visage': ('head/head-scale-vert', 4.0),
                        'largeur_machoire': ('chin/chin-width', 3.0), 'largeur_oeil': ('eyes/l-eye-scale', 2.0),
                        # mesures strictes du contrôle visuel : nez trop haut (yeux → nez trop court) → nez abaissé ;
                        # bas du visage trop large sur la SILHOUETTE alors que la mâchoire (repères) est juste → graisse
                        # des joues / bajoues (invisible aux repères) réduite
                        'yeux_nez': ('nose/nose-trans-down', -3.0),
                        'silhouette_bas_visage_menton': ('head/head-fat', 2.5)}
                adj = {}
                meas = [(m['mesure'], m['ecart_pct'], m['ignore']) for m in ctrl['mesures']]
                meas += [(r['mesure'], 100 * r['ecart'], r['statut'] == 'NON MESURÉ') for r in ctrl.get('mesures_strictes', [])
                         if r['type'] == 'rel' and r['mesure'] in GAIN]
                for nm, e, ign in meas:
                    if ign or nm not in GAIN or abs(e) < 3:
                        continue
                    key, g = GAIN[nm]
                    adj[key] = float(np.clip(-e / 100 * g, -0.4, 0.4))
                if 'eyes/l-eye-scale' in adj:
                    adj['eyes/r-eye-scale'] = adj['eyes/l-eye-scale']
                # les rapports sont normalisés par l'écart des yeux : si TOUTES les proportions du visage sont trop
                # petites (ou grandes) du même côté, c'est l'écart des yeux qui est faux → on déplace les yeux
                mm = {m['mesure']: m['ecart_pct'] for m in ctrl['mesures'] if not m['ignore']}
                common = [mm[k] for k in ('largeur_visage', 'hauteur_visage', 'largeur_machoire') if k in mm]
                if len(common) >= 2 and (all(e < -3 for e in common) or all(e > 3 for e in common)):
                    bias = float(np.mean(common))
                    for k in ('largeur_visage', 'hauteur_visage', 'largeur_machoire', 'longueur_nez'):
                        if k in GAIN and GAIN[k][0] in adj and k in mm:
                            adj[GAIN[k][0]] = float(np.clip(-(mm[k] - bias) / 100 * GAIN[k][1], -0.4, 0.4))
                    adj.pop('head/head-scale-horiz', None)
                    adj.pop('head/head-scale-vert', None)
                    ev = float(np.clip(bias / 100 * 5.0, -0.6, 0.6))   # négatif → yeux rapprochés
                    adj['eyes/l-eye-trans-in'] = ev
                    adj['eyes/r-eye-trans-in'] = ev
                if adj:
                    keep_colors = json.load(open(idp))['colors']
                    P.make_identity(a.src, ph, ph + '.landmarks.json', nnpz, npng + '.landmarks.json', d, adjust=adj, cfg=cfg)
                    idn2 = json.load(open(idp))
                    idn2['colors']['hairline_y'] = keep_colors.get('hairline_y', idn2['colors'].get('hairline_y'))
                    json.dump(idn2, open(idp, 'w'), indent=1)
                # correction automatique : ligne de cheveux (écart de hauteur de front mesuré photo ↔ rendu)
                idn = json.load(open(idp))
                fr = {m['mesure']: m for m in ctrl['mesures']}.get('front')
                hv = {m['mesure']: m for m in ctrl['mesures']}.get('hauteur_visage')
                if fr and idn['colors'].get('hairline_y') and hv:
                    # front en unités « coins externes des yeux » → dm canonique (≈ 0,9 dm)
                    dy = (fr['photo'] - fr['avatar']) * 0.9
                    idn['colors']['hairline_y'] = round(idn['colors']['hairline_y'] + float(np.clip(dy, -0.4, 0.4)), 3)
                    idn.setdefault('corrections', []).append({'ligne_cheveux_dm': round(float(dy), 3)})
                    json.dump(idn, open(idp, 'w'), indent=1)
        step(f'6. Planche de ressemblance : {name}')
        subprocess.run([sys.executable, os.path.join(HERE, 'compose_identity.py'), ph, ph + '.landmarks.json',
                        os.path.join(d, 'rendus'), os.path.join(d, 'ressemblance.jpg')], check=True)
        ctrl = json.load(open(os.path.join(d, 'controle.json'), encoding='utf-8'))
        return (name, ctrl.get('visual_quality_gate'), bool(ctrl.get('valid_output')), ctrl.get('raisons', []))


def report_verdicts(verdicts, out):
    # verdict de l'usine = celui du contrôle visuel (biometrie.py), jamais « OK » quand une sortie est refusée
    refused = [v for v in verdicts if not v[2]]
    print()
    for name, gate, ok, raisons in verdicts:
        print(f"{'ACCEPTÉ' if ok else 'REFUSÉ '} {name} : contrôle visuel {gate}" + (' — ' + ' ; '.join(raisons) if raisons and not ok else ''))
    print(f'USINE PHOTO {"OK" if not refused else "REFUSÉE (" + str(len(refused)) + "/" + str(len(verdicts)) + " sorties non valides)"} ->', out)
    sys.exit(0 if not refused else 1)


if __name__ == '__main__':
    main()
