"""
FITAIA — mesure biométrique du visage et contrôle de ressemblance (photo ↔ rendu de l'avatar).

Les mêmes repères MediaPipe sont relevés sur la photo et sur le rendu de l'avatar (même angle).
On compare des RAPPORTS (indépendants de l'échelle et de la lumière), normalisés par la distance entre les pupilles :
largeur / hauteur du visage, largeur de mâchoire, nez (largeur, longueur), bouche (largeur, position), menton,
yeux (largeur), front (hauteur jusqu'à la ligne de cheveux, via la segmentation).
Sortie : écart par mesure, score global de ressemblance géométrique, superposition 50 % photo / avatar.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

MEASURES = {
    # nom : (fonction des points 2D, libellé)
    'largeur_visage': (lambda p: d(p, 234, 454), 'largeur du visage'),
    'hauteur_visage': (lambda p: d(p, 10, 152), 'hauteur du visage'),
    'largeur_machoire': (lambda p: d(p, 172, 397), 'largeur de mâchoire'),
    'largeur_nez': (lambda p: d(p, 64, 294), 'largeur du nez'),
    'longueur_nez': (lambda p: d(p, 168, 2), 'longueur du nez'),
    'largeur_bouche': (lambda p: d(p, 61, 291), 'largeur de la bouche'),
    'yeux_bouche': (lambda p: np.linalg.norm((p[33] + p[263]) / 2 - p[13]), 'distance yeux–bouche'),
    'nez_bouche': (lambda p: d(p, 2, 13), 'distance nez–bouche'),
    'menton': (lambda p: d(p, 17, 152), 'hauteur du menton'),
    'largeur_oeil': (lambda p: (d(p, 33, 133) + d(p, 362, 263)) / 2, 'largeur des yeux'),
}
# mesures perturbées par un sourire (exclues si la photo sourit)
SMILE_SENSITIVE = {'largeur_bouche', 'nez_bouche', 'menton', 'yeux_bouche'}


def d(p, a, b):
    return float(np.linalg.norm(p[a] - p[b]))


def points(lmj):
    lm = json.load(open(lmj))
    if not lm.get('found'):
        return None, lm
    return np.array(lm['landmarks'])[:, :2] * np.array([lm['width'], lm['height']]), lm


def measures(p, segp=None, size=None):
    # référence : coins externes des yeux (squelette), pas les pupilles (la direction du regard varie)
    iod = d(p, 33, 263)
    out = {k: f(p) / iod for k, (f, _) in MEASURES.items()}
    if segp and os.path.exists(segp):
        seg = np.asarray(Image.open(segp).resize(size, Image.NEAREST))
        cx, cy = p[9]
        col = seg[:int(cy), int(cx)]
        hl = np.where(col == 1)[0]
        if len(hl):
            out['front'] = (cy - hl.max()) / iod
    return out


def compare(photo, render, out_png=None):
    pp, lp = points(photo + '.landmarks.json')
    pr, lr = points(render + '.landmarks.json')
    if pp is None or pr is None:
        return None
    mp_ = measures(pp, photo + '.seg.png', (lp['width'], lp['height']))
    mr_ = measures(pr, render + '.seg.png', (lr['width'], lr['height']))
    bs = lp.get('blendshapes', {})
    smile = max(bs.get('mouthSmileLeft', 0), bs.get('mouthSmileRight', 0), bs.get('jawOpen', 0)) > 0.25
    rows = []
    for k in mp_:
        if k not in mr_:
            continue
        e = (mr_[k] - mp_[k]) / max(mp_[k], 1e-6)
        rows.append({'mesure': k, 'photo': round(mp_[k], 3), 'avatar': round(mr_[k], 3), 'ecart_pct': round(100 * e, 1),
                     'ignore': bool(smile and k in SMILE_SENSITIVE)})
    used = [abs(r['ecart_pct']) for r in rows if not r['ignore']]
    score = max(0.0, 100.0 - float(np.mean(used)) * 2.0) if used else 0.0
    res = {'score_geometrie': round(score, 1), 'sourire_photo': smile, 'mesures': rows}
    if out_png:
        overlay(photo, pp, render, pr, out_png)
    return res


def overlay(photo, pp, render, pr, out_png, size=600):
    """Rendu aligné sur la photo (similarité sur les repères stables), mélange 50 %."""
    stable = [33, 133, 263, 362, 168, 6, 2, 1, 152, 234, 454, 10]
    A, Bp = pr[stable], pp[stable]
    ma, mb = A.mean(0), Bp.mean(0)
    A0, B0 = A - ma, Bp - mb
    U, S, Vt = np.linalg.svd(B0.T @ A0)
    R = U @ Vt
    if np.linalg.det(R) < 0:
        U[:, -1] *= -1
        R = U @ Vt
    s = S.sum() / (A0 ** 2).sum()
    t = mb - s * R @ ma
    M = np.linalg.inv(np.vstack([np.c_[s * R, t], [0, 0, 1]]))
    ph = Image.open(photo).convert('RGB')
    rn = Image.open(render).convert('RGB').transform(ph.size, Image.AFFINE, tuple(M[:2].reshape(-1)), Image.BICUBIC)
    mix = Image.blend(ph, rn, 0.5)
    fh = np.linalg.norm(pp[10] - pp[152])
    cx, cy = pp[:, 0].mean(), pp[:, 1].mean()
    box = (int(cx - fh * 0.85), int(cy - fh * 1.05), int(cx + fh * 0.85), int(cy + fh * 0.95))
    mix.crop(box).resize((size, int(size * (box[3] - box[1]) / (box[2] - box[0]))), Image.LANCZOS).save(out_png)


# ---------------------------------------------------------------------------------------------
# Contrôle visuel strict (« un score algorithmique est un signal de test, pas la vérité »)
# ---------------------------------------------------------------------------------------------
# Chaque mesure stricte a un seuil : au-delà, la sortie est REFUSÉE (visual_quality_gate = FAIL) quel que soit le score.
# Les seuils sont choisis pour la perception d'un visage (≈ 8 % sur une largeur du bas du visage se voit), pas pour
# « faire passer » ou « faire échouer » une photo donnée.
STRICT = {
    # nom : (fonction des points, seuil |écart relatif|, libellé, sensible au sourire de la PHOTO)
    'largeur_machoire': (lambda p: d(p, 172, 397), 0.08, 'largeur de mâchoire', False),
    'largeur_bas_visage_bouche': (lambda p: d(p, 58, 288), 0.08, 'largeur du bas du visage (niveau bouche)', False),
    'largeur_bas_visage_menton': (lambda p: d(p, 136, 365), 0.08, 'largeur du bas du visage (niveau menton)', False),
    'hauteur_bas_visage': (lambda p: d(p, 2, 152), 0.08, 'hauteur du bas du visage (nez → menton)', True),
    'yeux_nez': (lambda p: abs(((p[33] + p[263]) / 2 - p[2])[1]), 0.08, 'distance verticale yeux → nez', False),
    'nez_bouche': (lambda p: d(p, 2, 13), 0.12, 'distance nez → bouche', True),
    'bouche_menton': (lambda p: d(p, 14, 152), 0.10, 'distance bouche → menton', True),
    'proportion_bas_visage': (lambda p: d(p, 58, 288) / max(d(p, 168, 152), 1e-6) * d(p, 33, 263), 0.08,
                              'proportion du bas du visage (largeur / hauteur)', False),
    'largeur_nez': (lambda p: d(p, 64, 294), 0.10, 'largeur du nez', False),
    'longueur_nez': (lambda p: d(p, 168, 2), 0.10, 'longueur du nez', False),
    'largeur_oeil': (lambda p: (d(p, 33, 133) + d(p, 362, 263)) / 2, 0.08, 'largeur des yeux', False),
    'ouverture_oeil': (lambda p: (d(p, 159, 145) + d(p, 386, 374)) / 2, 0.25, 'ouverture des yeux', True),
}
OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150,
        136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
STABLE = [33, 133, 263, 362, 168, 6, 2, 1, 152, 234, 454, 10]
LIMITS = {'contour_visage': 0.06, 'iou_cheveux': 0.60, 'cheveux_reconnus': 0.6, 'iou_silhouette_tete': 0.80, 'sourire_rendu': 0.25,
          'coins_bouche_rendu': 0.035, 'ouverture_bouche_rendu': 0.06}
SCORE_MIN = 85.0          # le score automatique doit aussi être acceptable (« la sortie n'est valide que si les deux le sont »)


def _sim(A, Bp):
    """similarité 2D (s, R, t) qui amène A sur Bp."""
    ma, mb = A.mean(0), Bp.mean(0)
    A0, B0 = A - ma, Bp - mb
    U, S, Vt = np.linalg.svd(B0.T @ A0)
    R = U @ Vt
    if np.linalg.det(R) < 0:
        U[:, -1] *= -1
        R = U @ Vt
    s = S.sum() / (A0 ** 2).sum()
    return s, R, mb - s * R @ ma


def _seg(path, size):
    if not os.path.exists(path):
        return None
    return np.asarray(Image.open(path).resize(size, Image.NEAREST))


def strict_control(photo, render, review=None):
    """Mesures strictes photo ↔ rendu (même angle) + verdict humain → statut du contrôle visuel."""
    pp, lp = points(photo + '.landmarks.json')
    pr, lr = points(render + '.landmarks.json')
    rows, reasons = [], []
    if pp is None or pr is None:
        return {'visual_quality_gate': 'FAIL', 'raisons': ['visage non détecté sur la photo ou le rendu'], 'mesures_strictes': []}
    bs_p, bs_r = lp.get('blendshapes', {}), lr.get('blendshapes', {})
    smile_p = max(bs_p.get('mouthSmileLeft', 0), bs_p.get('mouthSmileRight', 0), bs_p.get('jawOpen', 0)) > 0.25
    iod_p, iod_r = d(pp, 33, 263), d(pr, 33, 263)

    def add(name, label, vp, vr, seuil, kind='rel', mesurable=True):
        if kind == 'rel':
            e = (vr - vp) / max(abs(vp), 1e-6)
            bad = abs(e) > seuil
        elif kind == 'min':
            e = vr
            bad = vr < seuil
        else:
            e = vr
            bad = vr > seuil
        st = 'NON MESURÉ' if not mesurable else ('ÉCHEC' if bad else 'OK')
        rows.append({'mesure': name, 'libelle': label, 'photo': None if vp is None else round(float(vp), 3), 'avatar': round(float(vr), 3),
                     'ecart': round(float(e), 3), 'seuil': seuil, 'type': kind, 'statut': st})
        if st == 'ÉCHEC':
            reasons.append(f'{label} : ' + (f'{100 * e:+.0f} % (seuil ±{100 * seuil:.0f} %)' if kind == 'rel' else f'{e:.2f} (seuil {seuil})'))

    for k, (f, seuil, label, smile_sens) in STRICT.items():
        add(k, label, f(pp) / iod_p, f(pr) / iod_r, seuil, 'rel', not (smile_p and smile_sens))
    # forme du contour du visage : ovales alignés (similarité sur les points stables), écart moyen en écarts d'yeux
    s, R, t = _sim(pr[STABLE], pp[STABLE])
    ov = (s * (R @ pr[OVAL].T)).T + t
    dev = float(np.mean(np.linalg.norm(ov - pp[OVAL], axis=1)) / iod_p)
    add('contour_visage', 'forme du contour du visage (écart moyen)', None, dev, LIMITS['contour_visage'], 'max')
    # cheveux : masques de segmentation (classe 1) du rendu ramené sur la photo, dans la zone de la tête
    W, H = lp['width'], lp['height']
    sp = _seg(photo + '.seg.png', (W, H))
    sr = _seg(render + '.seg.png', (lr['width'], lr['height']))
    if sp is not None and sr is not None:
        M = np.linalg.inv(np.vstack([np.c_[s * R, t], [0, 0, 1]]))
        srw = np.asarray(Image.fromarray(sr).transform((W, H), Image.AFFINE, tuple(M[:2].reshape(-1)), Image.NEAREST))
        fh = d(pp, 10, 152)
        cx = pp[OVAL, 0].mean()
        ey = (pp[33, 1] + pp[263, 1]) / 2
        x0, x1 = int(max(cx - fh * 0.95, 0)), int(min(cx + fh * 0.95, W))
        y0, y1 = int(max(pp[10, 1] - fh * 0.75, 0)), int(min(ey, H))
        # forme : cheveux de l'avatar = classe « cheveux » OU « accessoire » (une coiffure en casque est vue comme un chapeau)
        hp, hr = sp[y0:y1, x0:x1] == 1, np.isin(srw[y0:y1, x0:x1], (1, 5))
        un = (hp | hr).sum()
        iou = float((hp & hr).sum() / un) if un else 1.0
        add('iou_cheveux', 'contour des cheveux (IoU photo ↔ avatar)', None, iou, LIMITS['iou_cheveux'], 'min', bool(hp.sum() > 50))
        # nature : part de la coiffure de l'avatar reconnue comme des CHEVEUX (et non un casque / chapeau)
        nh = hr.sum()
        frac = float((srw[y0:y1, x0:x1] == 1).sum() / nh) if nh else 1.0
        add('cheveux_reconnus', 'coiffure reconnue comme des cheveux (pas un casque)', None, frac, LIMITS['cheveux_reconnus'], 'min', bool(nh > 50))
        # largeur RÉELLE du bas du visage (silhouette de la peau du visage à hauteur de bouche et de menton)
        def width_at(seg, y, x):
            row = seg[int(round(y))] == 3
            x = int(round(x))
            if not (0 <= x < len(row)) or not row[x]:
                return None
            l_ = x
            while l_ > 0 and row[l_ - 1]:
                l_ -= 1
            r_ = x
            while r_ < len(row) - 1 and row[r_ + 1]:
                r_ += 1
            return (r_ - l_) / iod_p
        for nm, yy, lab in (('silhouette_bas_visage_bouche', (pp[13, 1] + pp[14, 1]) / 2, 'largeur réelle du bas du visage (silhouette, bouche)'),
                            ('silhouette_bas_visage_menton', pp[13, 1] * 0.4 + pp[152, 1] * 0.6, 'largeur réelle du bas du visage (silhouette, menton)')):
            wp, wr = width_at(sp, yy, pp[13, 0]), width_at(srw, yy, pp[13, 0])
            if wp and wr:
                add(nm, lab, wp, wr, 0.08, 'rel')
        tp = np.isin(sp[y0:y1, x0:x1], (1, 3, 5))
        tr = np.isin(srw[y0:y1, x0:x1], (1, 3, 5))
        un = (tp | tr).sum()
        add('iou_silhouette_tete', 'silhouette du haut de la tête (IoU)', None, float((tp & tr).sum() / un) if un else 1.0,
            LIMITS['iou_silhouette_tete'], 'min')
    # sourire « imprimé » : le modèle 3D a la bouche neutre, le rendu ne doit pas sourire
    add('sourire_rendu', 'sourire visible sur l\'avatar (MediaPipe)', None, max(bs_r.get('mouthSmileLeft', 0), bs_r.get('mouthSmileRight', 0)),
        LIMITS['sourire_rendu'], 'max')
    lift = float(((pr[13, 1] + pr[14, 1]) / 2 - (pr[61, 1] + pr[291, 1]) / 2) / iod_r)
    add('coins_bouche_rendu', 'coins de la bouche relevés sur l\'avatar', None, lift, LIMITS['coins_bouche_rendu'], 'max')
    add('ouverture_bouche_rendu', 'bouche entrouverte sur l\'avatar', None, d(pr, 13, 14) / iod_r, LIMITS['ouverture_bouche_rendu'], 'max')
    auto_fail = any(r['statut'] == 'ÉCHEC' for r in rows)
    hv = (review or {}).get('verdict')
    if hv == 'FAIL':
        gate = 'FAIL'
        reasons.insert(0, 'verdict humain : FAIL' + (f" ({review.get('by')})" if review.get('by') else '') + (f" — {review.get('note')}" if review.get('note') else ''))
    elif auto_fail:
        gate = 'FAIL'
    elif hv == 'PASS':
        gate = 'PASS'
    else:
        gate = 'REVIEW_REQUIRED'
        reasons.append('aucune mesure stricte hors seuil : vérification humaine obligatoire (human_review.json)')
    return {'visual_quality_gate': gate, 'raisons': reasons, 'mesures_strictes': rows, 'human_review': review}


def report(photo, render, out_json, out_png=None):
    """controle.json : score automatique (signal de test) + contrôle visuel strict + verdict humain éventuel."""
    r = compare(photo, render, out_png) or {'score_geometrie': 0.0, 'mesures': []}
    d = os.path.dirname(os.path.abspath(out_json))
    rv_path = os.path.join(d, 'human_review.json')
    review = json.load(open(rv_path, encoding='utf-8-sig')) if os.path.exists(rv_path) else None
    stale = None
    if review and review.get('avatar_md5'):
        # un verdict humain porte sur UNE version de l'avatar : s'il a été refabriqué depuis, le verdict ne s'applique plus
        import hashlib
        glb = os.path.join(d, 'avatar.glb')
        cur = hashlib.md5(open(glb, 'rb').read()).hexdigest() if os.path.exists(glb) else None
        if cur != review['avatar_md5']:
            stale, review = review, None
    g = strict_control(photo, render, review)
    if stale:
        g['verdict_humain_precedent'] = stale
        g['raisons'].append(f"verdict humain précédent ({stale.get('verdict')}, {stale.get('by', '?')}) : portait sur une version antérieure de l'avatar")
    r['automated_similarity_score'] = r['score_geometrie']
    r.update(g)
    r['valid_output'] = bool(g['visual_quality_gate'] == 'PASS' and r['automated_similarity_score'] >= SCORE_MIN)
    json.dump(r, open(out_json, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    return r


if __name__ == '__main__':
    photo, render, out_json, out_png = sys.argv[1:5]
    r = report(photo, render, out_json, out_png)
    print('score géométrie', r['score_geometrie'], '| écarts :',
          ', '.join(f"{m['mesure']} {m['ecart_pct']:+.0f}%" for m in r['mesures'] if not m['ignore']))
    print('automated_similarity_score', r['automated_similarity_score'], '| visual_quality_gate', r['visual_quality_gate'],
          '| sortie valide :', r['valid_output'])
    for x in r['raisons']:
        print('  -', x)
