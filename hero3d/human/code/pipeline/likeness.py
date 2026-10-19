"""
FITAIA — module de ressemblance du visage (Facial Likeness) : mesures photo ↔ rendu et rapport d'erreurs par mesure.

Les mêmes repères MediaPipe (478 points) sont relevés sur la photo et sur le rendu de l'avatar AU MÊME ANGLE.
Chaque mesure est un rapport sans unité, normalisé par la distance entre les coins externes des yeux (repère osseux,
indépendant de l'échelle, de la lumière et de la direction du regard).

Rapport (likeness.json) :
  errors : { jaw_width_error, chin_height_error, nose_width_error, nose_projection_error, eye_spacing_error,
             mouth_position_error, hairline_error, expression_neutrality_error, + les autres mesures du visage }
           chaque erreur = (avatar − photo) / photo, signée (+ = trop grand sur l'avatar), avec son seuil et son statut
           OK | ÉCHEC | NON MESURÉ (mesure faussée par l'expression de la PHOTO : jamais comptée comme réussie)
  automated_similarity : score géométrique 0–100 (signal de test, PAS la vérité)
  visual_quality_gate  : FAIL | REVIEW_REQUIRED | PASS — PASS uniquement avec un verdict humain explicite
  reasons              : pourquoi (« jaw too wide », « smile baked into texture »…)

Utilisé par identity_fitting.py (boucle de correction automatique) et par la planche QA (render_qa.py).
"""
import json
import os

import numpy as np
from PIL import Image

# ---------------------------------------------------------------------------------------------------------------
# Mesures (points 2D en pixels, z MediaPipe converti en pixels ; normalisation : coins externes des yeux 33–263)
# ---------------------------------------------------------------------------------------------------------------


def _d(p, a, b):
    return float(np.linalg.norm(p[a, :2] - p[b, :2]))


def _mid(p, *ix):
    return p[list(ix), :2].mean(0)


def _nose_projection(p):
    # profondeur du bout du nez (1) devant le plan des yeux (coins internes et externes) — z MediaPipe : négatif = proche
    return float(np.mean(p[[33, 133, 263, 362], 2]) - p[1, 2])


def _mouth_position(p):
    # base du nez (2) → haut de la lèvre supérieure (0), verticale du visage (axe yeux → menton)
    up = _mid(p, 33, 263) - p[152, :2]
    up = up / max(np.linalg.norm(up), 1e-6)
    return float(np.dot(p[2, :2] - p[0, :2], up))


def _chin_height(p):
    up = _mid(p, 33, 263) - p[152, :2]
    up = up / max(np.linalg.norm(up), 1e-6)
    return float(np.dot(p[17, :2] - p[152, :2], up))


# nom : (fonction, seuil |écart relatif|, libellé FR, raison EN si trop grand, raison EN si trop petit, sensible à l'expression)
MEASURES = {
    'face_width': (lambda p: _d(p, 234, 454), 0.06, 'largeur du visage', 'face too wide', 'face too narrow', False),
    'face_height': (lambda p: _d(p, 10, 152), 0.07, 'hauteur du visage', 'face too long', 'face too short', True),
    'forehead_width': (lambda p: _d(p, 54, 284), 0.08, 'largeur du front', 'forehead too wide', 'forehead too narrow', False),
    'eye_spacing': (lambda p: _d(p, 133, 362), 0.07, 'distance inter-oculaire (coins internes)', 'eyes too far apart', 'eyes too close', False),
    'eye_width': (lambda p: (_d(p, 33, 133) + _d(p, 362, 263)) / 2, 0.08, 'largeur des yeux', 'eyes too wide', 'eyes too small', False),
    'eye_height': (lambda p: (_d(p, 159, 145) + _d(p, 386, 374)) / 2, 0.25, 'ouverture des yeux', 'eyes too open', 'eyes too closed', True),
    'nose_width': (lambda p: _d(p, 64, 294), 0.08, 'largeur du nez (ailes)', 'nose too wide', 'nose too narrow', False),
    'nose_length': (lambda p: _d(p, 168, 2), 0.08, 'longueur du nez', 'nose too long', 'nose too short', False),
    'nose_projection': (_nose_projection, 0.20, 'projection du nez (profondeur MediaPipe, estimée)', 'nose projects too much', 'nose too flat', False),
    'mouth_width': (lambda p: _d(p, 61, 291), 0.08, 'largeur de la bouche', 'mouth too wide', 'mouth too narrow', True),
    'lip_height': (lambda p: _d(p, 0, 17), 0.15, 'hauteur des lèvres', 'lips too thick', 'lips too thin', True),
    'mouth_position': (_mouth_position, 0.15, 'position de la bouche (nez → lèvre supérieure)', 'mouth too low', 'mouth too high', False),
    'jaw_width': (lambda p: _d(p, 172, 397), 0.07, 'largeur mandibulaire', 'jaw too wide', 'jaw too narrow', False),
    'chin_height': (_chin_height, 0.12, 'hauteur du menton', 'chin too long', 'chin too short', True),
    'cheekbones': (lambda p: _d(p, 116, 345), 0.06, 'largeur des pommettes', 'cheekbones too wide', 'cheekbones too narrow', False),
}
# erreurs exigées par la spécification (toujours présentes dans le rapport)
SPEC_ERRORS = ['jaw_width_error', 'chin_height_error', 'nose_width_error', 'nose_projection_error', 'eye_spacing_error',
               'mouth_position_error', 'hairline_error', 'expression_neutrality_error']
# seuils des mesures lues sur la segmentation
SEG_LIMITS = {'hairline': 0.12, 'ears': 0.10}
LIMITS = {'expression_neutrality': 0.25, 'hair_iou': 0.60, 'hair_is_hair': 0.6, 'head_silhouette_iou': 0.80, 'face_contour': 0.06}
SCORE_MIN = 85.0


def expression_level(bs):
    """Intensité d'expression (0 = neutre) à partir des blendshapes MediaPipe."""
    if not bs:
        return 0.0
    keys = ['mouthSmileLeft', 'mouthSmileRight', 'jawOpen', 'mouthStretchLeft', 'mouthStretchRight', 'mouthPucker',
            'mouthFrownLeft', 'mouthFrownRight', 'mouthPressLeft', 'mouthPressRight', 'cheekSquintLeft', 'cheekSquintRight',
            'browInnerUp', 'mouthShrugUpper']
    return float(max(bs.get(k, 0.0) for k in keys))


def load(path):
    """Repères + segmentation d'une image (sorties de landmarks.py) → points (n×3 pixels), méta, segmentation."""
    lmj = path + '.landmarks.json'
    if not os.path.exists(lmj):
        return None, None, None
    lm = json.load(open(lmj))
    if not lm.get('found'):
        return None, lm, None
    W, H = lm['width'], lm['height']
    p = np.array(lm['landmarks'], float) * np.array([W, H, W])
    seg = None
    if os.path.exists(path + '.seg.png'):
        seg = np.asarray(Image.open(path + '.seg.png').resize((W, H), Image.NEAREST))
    return p, lm, seg


def _row_extent(row_mask, x):
    x = int(round(x))
    if not (0 <= x < len(row_mask)) or not row_mask[x]:
        return None
    l_ = x
    while l_ > 0 and row_mask[l_ - 1]:
        l_ -= 1
    r_ = x
    while r_ < len(row_mask) - 1 and row_mask[r_ + 1]:
        r_ += 1
    return l_, r_


def seg_measures(p, seg):
    """Mesures lues sur la segmentation : ligne de cheveux (glabelle → premier cheveu) et oreilles (dépassement)."""
    out = {}
    if seg is None:
        return out
    iod = _d(p, 33, 263)
    H, W = seg.shape
    cx, cy = p[9, :2]
    col = seg[:int(max(cy, 0)), int(np.clip(cx, 0, W - 1))]
    hl = np.where(col == 1)[0]
    if len(hl):
        out['hairline'] = float(cy - hl.max()) / iod
    # oreilles : largeur de peau (visage + corps) à hauteur du tragus, moins la largeur du visage aux repères 234/454
    y = int(round((p[234, 1] + p[454, 1]) / 2))
    if 0 <= y < H:
        ext = _row_extent(np.isin(seg[y], (2, 3)), (p[234, 0] + p[454, 0]) / 2)
        if ext:
            out['ears'] = (ext[1] - ext[0]) / iod
    return out


def measure(p, seg=None):
    iod = _d(p, 33, 263)
    m = {k: f(p) / iod for k, (f, *_r) in MEASURES.items()}
    m.update(seg_measures(p, seg))
    return m


def _sim2(A, Bp):
    ma, mb = A.mean(0), Bp.mean(0)
    A0, B0 = A - ma, Bp - mb
    U, S, Vt = np.linalg.svd(B0.T @ A0)
    R = U @ Vt
    if np.linalg.det(R) < 0:
        U[:, -1] *= -1
        R = U @ Vt
    s = S.sum() / (A0 ** 2).sum()
    return s, R, mb - s * R @ ma


OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150,
        136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
STABLE = [33, 133, 263, 362, 168, 6, 2, 1, 234, 454, 10]


def compare(photo, render, review=None, neutral=None, expressive=None):
    """Rapport de ressemblance photo ↔ rendu (même angle).

    render  : rendu servant aux mesures de FORME. Si `neutral` est fourni, `render` est l'avatar AVEC l'expression de la
              photo (shape key expr_photo = 1) : on compare alors aussi les mesures sensibles au sourire (même expression
              des deux côtés), sauf celles qu'une bouche ouverte (dents) rend impossibles.
    neutral : rendu de l'avatar NEUTRE au même angle → erreur de neutralité (aucun sourire dans la géométrie ni la texture).
    """
    pp, lp, sp = load(photo)
    pr, lr, sr = load(render)
    pn, ln_, _ = load(neutral) if neutral else (None, None, None)
    expressive = (neutral is not None) if expressive is None else bool(expressive)
    if pp is None or pr is None:
        return {'errors': {}, 'automated_similarity': 0.0, 'visual_quality_gate': 'FAIL',
                'reasons': ['face not detected on photo or render'], 'raisons': ['visage non détecté sur la photo ou le rendu']}
    bs_p, bs_r = lp.get('blendshapes', {}), lr.get('blendshapes', {})
    expr_p = expression_level(bs_p)
    smile_p = max(bs_p.get('mouthSmileLeft', 0), bs_p.get('mouthSmileRight', 0)) > 0.25
    jaw_p = bs_p.get('jawOpen', 0) > 0.2
    mp_, mr_ = measure(pp, sp), measure(pr, sr)
    errors, reasons, raisons = {}, [], []

    def add(key, vp, vr, seuil, label, too_big, too_small, measurable=True, kind='rel'):
        if vp is None or vr is None:
            errors[key] = {'photo': None, 'avatar': None, 'error': None, 'threshold': seuil, 'status': 'NON MESURÉ', 'label': label,
                           'why': 'absent sur la photo ou le rendu'}
            return
        e = (vr - vp) / max(abs(vp), 1e-6) if kind == 'rel' else vr
        bad = abs(e) > seuil
        st = 'NON MESURÉ' if not measurable else ('ÉCHEC' if bad else 'OK')
        errors[key] = {'photo': None if vp is None else round(float(vp), 4), 'avatar': round(float(vr), 4), 'error': round(float(e), 4),
                       'threshold': seuil, 'status': st, 'label': label}
        if not measurable:
            errors[key]['why'] = "faussée par l'expression de la photo"
        if st == 'ÉCHEC':
            reasons.append(too_big if e > 0 else too_small)
            raisons.append(f'{label} : {100 * e:+.0f} % (seuil ±{100 * seuil:.0f} %)' if kind == 'rel' else f'{label} : {e:.2f} (seuil {seuil})')

    for k, (f, seuil, label, big, small, expr_sens) in MEASURES.items():
        sens = expr_sens and (smile_p or jaw_p or expr_p > 0.35)
        if k == 'eye_height':
            sens = expr_p > 0.25 or bs_p.get('eyeSquintLeft', 0) > 0.3
        if expressive:
            # même expression des deux côtés : seule une bouche OUVERTE (non modélisée) fausse encore ces mesures
            sens = expr_sens and jaw_p and k in ('chin_height', 'face_height', 'lip_height')
        if k == 'mouth_position' and smile_p and not expressive:
            sens = True                    # le sourire remonte la lèvre supérieure
        add(k + '_error', mp_.get(k), mr_.get(k), seuil, label, big, small, not sens)
    add('hairline_error', mp_.get('hairline'), mr_.get('hairline'), SEG_LIMITS['hairline'], 'ligne des cheveux (hauteur du front)',
        'hairline too high', 'hairline too low')
    add('ears_error', mp_.get('ears'), mr_.get('ears'), SEG_LIMITS['ears'], 'oreilles (largeur tête + oreilles)', 'ears stick out too much',
        'ears too flat')
    # neutralité : l'avatar doit être NEUTRE (l'expression vient des shape keys, jamais de la géométrie / texture)
    pq, bq = (pn, ln_.get('blendshapes', {})) if pn is not None else (pr, bs_r)
    iod_r = _d(pq, 33, 263)
    lift = float(((pq[13, 1] + pq[14, 1]) / 2 - (pq[61, 1] + pq[291, 1]) / 2) / iod_r)
    neutral = max(expression_level(bq), float(np.clip(lift / 0.05, 0, 1)) * 0.5, float(np.clip(_d(pq, 13, 14) / iod_r / 0.12, 0, 1)) * 0.5)
    add('expression_neutrality_error', 0.0, neutral, LIMITS['expression_neutrality'], 'expression résiduelle sur l\'avatar',
        'smile baked into geometry/texture', '', not (expressive and pn is None), kind='abs')
    errors['expression_neutrality_error']['detail'] = {'blendshapes_max': round(expression_level(bq), 3), 'mouth_corner_lift': round(lift, 4),
                                                      'mouth_open': round(_d(pq, 13, 14) / iod_r, 4),
                                                      'measured_on': 'neutral render' if pn is not None else 'shape render'}
    # contour du visage, cheveux, silhouette (segmentation ramenée sur la photo)
    s, R, t = _sim2(pr[STABLE, :2], pp[STABLE, :2])
    ov = (s * (R @ pr[OVAL, :2].T)).T + t
    dev = float(np.mean(np.linalg.norm(ov - pp[OVAL, :2], axis=1)) / _d(pp, 33, 263))
    add('face_contour_error', 0.0, dev, LIMITS['face_contour'], 'forme du contour du visage (écart moyen)', 'face outline differs', '', True, 'abs')
    shape_extra = {}
    if sp is not None and sr is not None:
        W, H = lp['width'], lp['height']
        M = np.linalg.inv(np.vstack([np.c_[s * R, t], [0, 0, 1]]))
        srw = np.asarray(Image.fromarray(sr).transform((W, H), Image.AFFINE, tuple(M[:2].reshape(-1)), Image.NEAREST))
        fh = _d(pp, 10, 152)
        cx = pp[OVAL, 0].mean()
        ey = (pp[33, 1] + pp[263, 1]) / 2
        x0, x1 = int(max(cx - fh * 0.95, 0)), int(min(cx + fh * 0.95, W))
        y0, y1 = int(max(pp[10, 1] - fh * 0.75, 0)), int(min(ey, H))
        hp, hr = sp[y0:y1, x0:x1] == 1, np.isin(srw[y0:y1, x0:x1], (1, 5))
        un = (hp | hr).sum()
        iou = float((hp & hr).sum() / un) if un else 1.0
        if hp.sum() > 50:
            shape_extra['hair_iou'] = iou
            if iou < LIMITS['hair_iou']:
                reasons.append('hair silhouette incorrect')
                raisons.append(f'contour des cheveux (IoU) : {iou:.2f} (seuil {LIMITS["hair_iou"]})')
        nh = hr.sum()
        frac = float((srw[y0:y1, x0:x1] == 1).sum() / nh) if nh else 1.0
        if nh > 50:
            shape_extra['hair_is_hair'] = frac
            if frac < LIMITS['hair_is_hair']:
                reasons.append('hair reads as a helmet')
                raisons.append(f'coiffure vue comme un casque : {frac:.2f} (seuil {LIMITS["hair_is_hair"]})')
        tp = np.isin(sp[y0:y1, x0:x1], (1, 3, 5))
        tr = np.isin(srw[y0:y1, x0:x1], (1, 3, 5))
        un = (tp | tr).sum()
        hs = float((tp & tr).sum() / un) if un else 1.0
        shape_extra['head_silhouette_iou'] = hs
        if hs < LIMITS['head_silhouette_iou']:
            reasons.append('head silhouette incorrect')
            raisons.append(f'silhouette du haut de la tête (IoU) : {hs:.2f} (seuil {LIMITS["head_silhouette_iou"]})')
        # largeur réelle du bas du visage (silhouette de la peau) à hauteur de bouche
        yy = int(round(pp[13, 1] * 0.4 + pp[152, 1] * 0.6))
        if 0 <= yy < H:
            a_ = _row_extent(sp[yy] == 3, pp[13, 0])
            b_ = _row_extent(srw[yy] == 3, pp[13, 0])
            if a_ and b_:
                add('lower_face_silhouette_error', (a_[1] - a_[0]), (b_[1] - b_[0]), 0.08, 'largeur réelle du bas du visage (silhouette)',
                    'lower face too wide', 'lower face too narrow')
    used = [abs(v['error']) for k, v in errors.items() if v['status'] in ('OK', 'ÉCHEC') and v.get('error') is not None
            and k not in ('expression_neutrality_error', 'face_contour_error')]
    score = max(0.0, 100.0 - 100.0 * float(np.mean(used)) * 2.0) if used else 0.0
    shape_fail = any(shape_extra.get(k, 1.0) < LIMITS[k] for k in ('hair_iou', 'hair_is_hair', 'head_silhouette_iou'))
    auto_fail = shape_fail or any(v['status'] == 'ÉCHEC' for v in errors.values())
    hv = (review or {}).get('verdict')
    if hv == 'FAIL':
        gate = 'FAIL'
        raisons.insert(0, 'verdict humain : FAIL' + (f" — {review.get('note')}" if review.get('note') else ''))
        reasons.insert(0, 'human verdict FAIL')
    elif auto_fail:
        gate = 'FAIL'
    elif hv == 'PASS':
        gate = 'PASS'
    else:
        gate = 'REVIEW_REQUIRED'
        raisons.append('aucune mesure hors seuil : vérification humaine obligatoire (human_review.json)')
    for k in SPEC_ERRORS:
        errors.setdefault(k, {'error': None, 'status': 'NON MESURÉ'})
    return {'automated_similarity': round(score, 1), 'visual_quality_gate': gate, 'valid_output': gate == 'PASS' and score >= SCORE_MIN,
            'reasons': sorted(set(reasons), key=reasons.index), 'raisons': raisons, 'errors': errors, 'shape': shape_extra,
            'photo_expression': {'level': round(expr_p, 3), 'smile': smile_p, 'jaw_open': jaw_p},
            'shape_measured_on': 'avatar with the photo expression (shape key expr_photo)' if expressive else 'neutral avatar',
            'human_review': review}


def summary_lines(rep):
    """Lignes lisibles (planche, journal) : d'abord les 8 erreurs de la spécification."""
    out = [f"Automated similarity: {rep['automated_similarity']:.0f}/100", f"Visual quality gate: {rep['visual_quality_gate']}"]
    if rep['reasons']:
        out.append('Reason: ' + ', '.join(rep['reasons']))
    for k in SPEC_ERRORS:
        v = rep['errors'].get(k, {})
        e = v.get('error')
        val = '—' if e is None else (f'{100 * e:+.1f} %' if k != 'expression_neutrality_error' else f'{e:.2f}')
        out.append(f"{k}: {val} [{v.get('status', '?')}]")
    return out


def write(rep, path):
    json.dump(rep, open(path, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    import sys
    r = compare(sys.argv[1], sys.argv[2])
    if len(sys.argv) > 3:
        write(r, sys.argv[3])
    print('\n'.join(summary_lines(r)))
