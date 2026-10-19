"""
FITAIA — IdentityFittingService : photo → tête maître personnalisée, NEUTRE, + expressions en shape keys.

Une seule tête maître (la base MakeHuman CC0 neutre) est ajustée à la personne en trois couches :
  1. cibles d'identité MakeHuman (≈ 120 variables signées, moindres carrés bornés) ET, dans le même ajustement,
     cibles d'EXPRESSION (unités MakeHuman : sourire, élévation, rétraction, plissement / fermeture des yeux).
     → le sourire de la photo est expliqué par les variables d'expression, pas absorbé par la forme du visage ;
  2. résidu des repères (ce que les cibles n'expliquent pas : nez, mâchoire, pommettes de LA personne) interpolé sur la
     tête par fonctions de base radiale (RBF gaussiennes régularisées), dans le plan de l'image, masqué hors du visage ;
  3. corrections de la boucle de contrôle (likeness.py) : chaque erreur mesurée sur le rendu déplace les repères
     concernés (mâchoire, menton, nez, yeux, bouche…), puis on recalcule.
Sorties (dossier de la personne) :
  identity.json   — compatible build_premium_avatar.py (--identity) : cibles, couleurs, pose, + 'offsets', 'expressions'
  offsets.npz     — neutral (déplacements de la tête neutre, dm) ; photo_expr (expression de la photo, pour la texture)
  face.png        — peau personnalisée : photo projetée sur la tête AVEC l'expression de la photo (les lèvres et les
                    plis tombent au bon endroit), puis portée par la tête NEUTRE → le sourire disparaît de la texture.
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import build_premium_avatar as B  # noqa: E402
import photo_id as P  # noqa: E402
from face_art import canonical, landmarks as face_lm, smooth  # noqa: E402

EXPR_UNITS = ['mouth-corner-puller', 'mouth-elevation', 'mouth-upward-retraction', 'eye-left-slit', 'eye-right-slit',
              'eye-left-closure', 'eye-right-closure']
# expressions exportées en shape keys (GLB) : combinaisons d'unités (poids)
EXPRESSIONS = {
    'expr_smile': {'mouth-corner-puller': 0.9, 'mouth-elevation': 0.25, 'eye-left-slit': 0.25, 'eye-right-slit': 0.25},
    'expr_smile_soft': {'mouth-corner-puller': 0.4, 'eye-left-slit': 0.1, 'eye-right-slit': 0.1},
    'expr_blink_l': {'eye-left-closure': 1.0},
    'expr_blink_r': {'eye-right-closure': 1.0},
    'expr_squint': {'eye-left-slit': 0.8, 'eye-right-slit': 0.8},
    'expr_effort': {'mouth-upward-retraction': 0.6, 'eye-left-slit': 0.5, 'eye-right-slit': 0.5},
}

MOUTH = P.MOUTH
INNER_LIPS = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]
CHEEKS = P.CHEEKS + [205, 425, 207, 427, 187, 411, 36, 266, 142, 371, 203, 423]
LOWER_LIDS = [145, 153, 144, 163, 7, 374, 380, 373, 390, 249, 23, 253, 24, 254, 110, 339]
CHIN = [152, 148, 176, 149, 150, 377, 400, 378, 379, 175, 171, 396, 199, 200, 208, 428, 140, 369, 32, 262]
JAW = [172, 397, 58, 288, 136, 365, 150, 379, 149, 378, 176, 400, 148, 377, 132, 361]
FACE_SIDES = [234, 454, 93, 323, 127, 356, 132, 361, 162, 389]
CHEEKBONES = [116, 345, 123, 352, 117, 346, 50, 280, 111, 340, 147, 376]
FOREHEAD = [54, 284, 21, 251, 103, 332, 67, 297, 109, 338, 10, 151, 108, 337, 69, 299]
NOSE_WIDTH = [64, 294, 48, 278, 98, 327, 129, 358, 49, 279, 102, 331, 219, 439, 235, 455, 240, 460, 75, 305, 166, 392]
NOSE_LOWER = [1, 2, 4, 5, 19, 94, 97, 326, 98, 327, 64, 294, 240, 460, 141, 370, 125, 354, 44, 274, 45, 275, 220, 440,
              79, 309, 99, 328, 60, 290, 20, 250, 242, 462, 241, 461, 218, 438]
MOUTH_ALL = sorted(set(MOUTH + [61, 291, 0, 17, 37, 267, 39, 269, 40, 270, 185, 409, 84, 314, 181, 405, 91, 321, 146, 375, 164, 167, 393]))
LEFT_EYE, RIGHT_EYE = P.LEFT_EYE, P.RIGHT_EYE


def expr_files(src, race='caucasian'):
    return [f'expression/units/{race}/{u}.target.gz' for u in EXPR_UNITS]


def rbf(ctrl, val, pts, sigma=0.30, lam=0.02):
    """Champ de déplacement interpolé (RBF gaussiennes régularisées) : ctrl (n×3), val (n×3) → pts (m×3)."""
    d2 = ((ctrl[:, None, :] - ctrl[None, :, :]) ** 2).sum(-1)
    K = np.exp(-d2 / (2 * sigma ** 2))
    a = np.linalg.solve(K + lam * np.eye(len(ctrl)), val)
    out = np.zeros((len(pts), 3))
    for i in range(0, len(pts), 4096):
        q = pts[i:i + 4096]
        Kq = np.exp(-((q[:, None, :] - ctrl[None, :, :]) ** 2).sum(-1) / (2 * sigma ** 2))
        out[i:i + 4096] = Kq @ a
    return out


def face_mask(Q):
    """Zone de la tête où le résidu des repères s'applique (1 = visage ; 0 = crâne arrière, oreilles, cou)."""
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    m = smooth(6.95, 7.2, y) * smooth(-0.1, 0.55, z) * smooth(9.2, 8.9, y)
    m *= 1 - smooth(0.7, 0.82, np.abs(x)) * smooth(0.9, 0.6, z)      # oreilles
    return m


def silhouette_rows(lm_photo, seg_path, obj, shape, refs, wts):
    """Largeurs de la tête lues sur la segmentation de la photo (repris de photo_id.fit_identity)."""
    from PIL import Image
    sil = []
    if not (seg_path and os.path.exists(seg_path)):
        return sil
    Wp, Hp = lm_photo['width'], lm_photo['height']
    seg = np.asarray(Image.open(seg_path).resize((Wp, Hp), Image.NEAREST))
    P2 = np.array(lm_photo['landmarks'])[:, :2] * np.array([Wp, Hp])
    allref = (shape[refs] * wts[..., None]).sum(1)
    head = np.array([v for v in set(B.group_verts(obj, 'body')) if shape[v, 1] > 6.7])
    fh = float(np.linalg.norm(P2[10] - P2[152]))
    rows = {'front': (P2[10] * 0.55 + P2[168] * 0.45), 'yeux': (P2[33] + P2[263]) / 2, 'nez': P2[2], 'bouche': P2[13],
            'machoire': P2[13] * 0.5 + P2[152] * 0.5}
    for key, q in rows.items():
        yr = int(round(q[1]))
        if not (0 <= yr < Hp):
            continue
        line = (seg[yr] == 1) | (seg[yr] == 3)
        cx = int(round(q[0]))
        if not line[min(max(cx, 0), Wp - 1)]:
            continue
        l_ = cx
        while l_ > 0 and line[l_ - 1]:
            l_ -= 1
        r_ = cx
        while r_ < Wp - 1 and line[r_ + 1]:
            r_ += 1
        wpx = r_ - l_
        if wpx < fh * 0.3:
            continue
        lid = {'front': (10, 168), 'yeux': (33, 263), 'nez': (2, 2), 'bouche': (13, 13), 'machoire': (13, 152)}[key]
        ym = float(np.mean([allref[i, 1] for i in lid]))
        band = head[np.abs(shape[head, 1] - ym) < 0.06]
        if len(band) < 4:
            continue
        sil.append((key, wpx, band[shape[band, 0].argmax()], band[shape[band, 0].argmin()]))
    return sil


def apply_corrections(Y, idx, corr):
    """Boucle de contrôle : déplace les repères cibles (repère du modèle, dm) selon les corrections cumulées.
    corr[mesure] = facteur relatif signé (ex. jaw_width −0,05 → mâchoire 5 % plus étroite)."""
    if not corr:
        return Y
    Y = Y.copy()
    pos = {int(i): k for k, i in enumerate(idx)}

    def sel(ids):
        return np.array([pos[i] for i in ids if i in pos], dtype=int)

    def xscale(ids, f, cx=0.0):
        s = sel(ids)
        if len(s):
            Y[s, 0] = cx + (Y[s, 0] - cx) * (1 + f)

    def yshift(ids, dy):
        s = sel(ids)
        if len(s):
            Y[s, 1] += dy

    def get(i):
        return Y[pos[i]] if i in pos else None

    cx = float(np.mean([Y[pos[i], 0] for i in (168, 6, 1, 152) if i in pos]))
    for k, f in corr.items():
        if abs(f) < 1e-4:
            continue
        if k == 'jaw_width':
            xscale(JAW, f, cx)
        elif k == 'face_width':
            xscale(FACE_SIDES, f, cx)
        elif k == 'cheekbones':
            xscale(CHEEKBONES, f, cx)
        elif k == 'forehead_width':
            xscale(FOREHEAD, f, cx)
        elif k == 'nose_width':
            xscale(NOSE_WIDTH, f, cx)
        elif k == 'mouth_width':
            xscale(MOUTH_ALL, f, cx)
        elif k == 'eye_width':
            for eye in (LEFT_EYE, RIGHT_EYE):
                s = sel(eye)
                if len(s):
                    c = Y[s, 0].mean()
                    Y[s, 0] = c + (Y[s, 0] - c) * (1 + f)
        elif k == 'eye_spacing' and get(133) is not None and get(362) is not None:
            d = abs(get(133)[0] - get(362)[0])
            for eye, sg in ((LEFT_EYE + [130, 243, 190, 56, 28, 27, 29, 30], -1), (RIGHT_EYE + [359, 463, 414, 286, 258, 257, 259, 260], 1)):
                s = sel(eye)
                side = np.sign(np.mean(Y[s, 0] - cx)) if len(s) else sg
                Y[s, 0] += side * f * d / 2
        elif k == 'nose_length' and get(168) is not None and get(2) is not None:
            L = get(168)[1] - get(2)[1]
            yshift(NOSE_LOWER, -f * L)
        elif k == 'mouth_position' and get(2) is not None and get(0) is not None:
            D = get(2)[1] - get(0)[1]
            yshift(MOUTH_ALL, -f * D)
        elif k == 'chin_height' and get(17) is not None and get(152) is not None:
            D = get(17)[1] - get(152)[1]          # > 0 (lèvre inférieure au-dessus du menton) ; f > 0 → menton plus long
            yshift(CHIN, -f * D)
        elif k == 'face_height' and get(10) is not None and get(152) is not None:
            D = get(10)[1] - get(152)[1]
            yshift([10, 338, 109, 297, 67, 151, 108, 337], f * D * 0.5)
    return Y


def fit(src, lm_photo, binding, seg_path=None, corr=None, reg=0.08, reg_e=0.01, iters=6, zw=0.2, sil_w=3.0, race='caucasian'):
    """Ajustement conjoint identité + expression. Renvoie un dict (poids, pose, formes, résidus)."""
    from scipy.optimize import lsq_linear
    obj, shape, T = P.neutral_shape(src)
    refs, wts, ok = binding
    pairs = P.target_files(src)
    D = []
    for _, fneg, fpos in pairs:
        D.append(T(fneg))
        D.append(T(fpos))
    E = [T(f) for f in expr_files(src, race)]
    nid, ne = len(D), len(E)
    allD = D + E
    idx = np.where(ok)[0]
    X = P.photo_points(lm_photo)[idx]

    def at(S_):
        return (S_[refs[idx]] * wts[idx][..., None]).sum(1)

    M0 = at(shape)
    J = np.stack([at(d) for d in allD], -1)
    bs = lm_photo.get('blendshapes', {})
    jaw_open = bs.get('jawOpen', 0.0)
    smile = max(bs.get('mouthSmileLeft', 0), bs.get('mouthSmileRight', 0))
    c = np.ones(len(idx))
    c[np.isin(idx, INNER_LIPS)] = 0.15 if jaw_open > 0.15 else 0.6     # bouche ouverte (dents) : non modélisée
    if jaw_open > 0.15:
        c[np.isin(idx, CHIN)] = 0.3
    sil = silhouette_rows(lm_photo, seg_path, obj, shape, refs, wts)
    w = np.zeros(nid + ne)
    lo = np.zeros(nid + ne)
    hi = np.ones(nid + ne)
    if smile < 0.15 and jaw_open < 0.15:
        hi[nid:] = 0.25            # photo neutre : l'expression ne doit pas « expliquer » la forme du visage
    for _ in range(iters):
        M = M0 + J @ w
        s, R, t = P.similarity(M, X, c)
        Y = ((X - t) @ R) / s
        Y = apply_corrections(Y, idx, corr)
        r = Y - M0
        A = (J * np.array([1, 1, zw])[None, :, None]) * np.sqrt(c)[:, None, None]
        b = (r * np.array([1, 1, zw])[None, :]) * np.sqrt(c)[:, None]
        A = A.reshape(-1, nid + ne)
        b = b.reshape(-1)
        rA, rb = [], []
        for key, wpx, vr, vl in sil:
            rA.append(sil_w * np.array([d[vr, 0] - d[vl, 0] for d in allD]))
            rb.append(sil_w * (wpx / s - (shape[vr, 0] - shape[vl, 0])))
        if rA:
            A = np.vstack([A, np.array(rA)])
            b = np.concatenate([b, np.array(rb)])
        regv = np.r_[np.full(nid, np.sqrt(reg)), np.full(ne, np.sqrt(reg_e))]
        A = np.vstack([A, np.diag(regv)])
        b = np.concatenate([b, np.zeros(nid + ne)])
        w = lsq_linear(A, b, bounds=(lo, hi), lsmr_tol='auto').x
    wid, we = w[:nid], w[nid:]
    S_id = shape + sum(wk * d for wk, d in zip(wid, D))
    dE = sum(wk * d for wk, d in zip(we, E))
    M = M0 + J @ w
    s, R, t = P.similarity(M, X, c)
    Y = apply_corrections(((X - t) @ R) / s, idx, corr)
    P2 = np.array(lm_photo['landmarks'])[:, :2] * np.array([lm_photo['width'], lm_photo['height']])
    return {'obj': obj, 'shape': shape, 'S_id': S_id, 'dE': dE, 'wid': wid, 'we': we, 'pairs': pairs, 'pose': (s, R, t), 'P2': P2,
            'idx': idx, 'Y': Y, 'M_full': M, 'M_id': at(S_id), 'weights': c, 'sil': sil, 'smile': smile, 'jaw_open': jaw_open}


def residual_fields(F, sigma=0.12, lam=0.002, clamp=0.35):
    """Résidus des repères (plan de l'image) → déplacements de la tête : neutre (identité) et photo (expression)."""
    obj, S_id, dE = F['obj'], F['S_id'], F['dE']
    s, R, t = F['pose']
    view = R.T @ np.array([0.0, 0.0, 1.0])
    idx, Y = F['idx'], F['Y']

    def plane(v):
        return v - np.outer(v @ view, view)

    r_full = plane(Y - F['M_full'])
    n = np.linalg.norm(r_full, axis=1, keepdims=True)
    r_full = r_full * np.minimum(1.0, clamp / np.maximum(n, 1e-9))
    # neutre : on retire du résidu tout ce qui vient de l'expression de la photo
    expressive = MOUTH_ALL + INNER_LIPS + (CHEEKS + LOWER_LIDS if F['smile'] > 0.3 else []) + (CHIN if F['jaw_open'] > 0.15 else [])
    keep_n = ~np.isin(idx, expressive) if (F['smile'] > 0.15 or F['jaw_open'] > 0.15) else ~np.isin(idx, INNER_LIPS)
    if F['smile'] > 0.3 and 'P2' in F:
        # sourire : toute la région péri-buccale de la photo est déformée (plis, joues, commissures) → exclue du neutre
        P2 = F['P2']
        c = P2[[61, 291, 0, 17]].mean(0)
        rad = 0.85 * np.linalg.norm(P2[61] - P2[291])
        keep_n &= np.linalg.norm(P2[idx] - c, axis=1) > rad
    keep_f = ~np.isin(idx, INNER_LIPS) if F['jaw_open'] <= 0.15 else np.ones(len(idx), bool)
    body = np.array(sorted(set(B.group_verts(obj, 'body'))))
    Q = canonical(S_id, face_lm(obj, S_id, B.group_verts))
    hv = body[Q[body, 1] > 6.7]
    mask = face_mask(Q[hv])[:, None]
    ctrl_n = F['M_id'][keep_n]
    off_n = np.zeros_like(S_id)
    off_n[hv] = rbf(ctrl_n, r_full[keep_n], S_id[hv], sigma, lam) * mask
    off_f = np.zeros_like(S_id)
    off_f[hv] = rbf(F['M_full'][keep_f], r_full[keep_f], (S_id + dE)[hv], sigma, lam) * mask
    return off_n, off_f, {'n_ctrl_neutral': int(keep_n.sum()), 'n_ctrl_photo': int(keep_f.sum()),
                          'residual_mm_mean': round(float(np.linalg.norm(r_full[keep_n], axis=1).mean() * 100), 2)}


def make_identity(src, photo, out_dir, base_dir, corr=None, project_expressive=True):
    """Photo → identity.json + offsets.npz + face.png (voir l'en-tête)."""
    os.makedirs(out_dir, exist_ok=True)
    lm = json.load(open(photo + '.landmarks.json'))
    if not lm.get('found'):
        raise SystemExit('aucun visage détecté sur ' + photo)
    binding = P.bind_landmarks(os.path.join(base_dir, 'neutral.png.landmarks.json'), os.path.join(base_dir, 'neutral.npz'))
    F = fit(src, lm, binding, photo + '.seg.png', corr)
    extra_targets = []
    npj = float((corr or {}).get('nose_projection', 0.0))
    if abs(npj) > 0.01:
        # projection du nez (profondeur, invisible de face) : cible de profondeur du nez posée telle quelle
        rel = 'nose/nose-scale-depth-%s.target.gz' % ('incr' if npj > 0 else 'decr')
        k = float(min(abs(npj) * 2.5, 1.0))
        from mh import load_target
        F['S_id'] = F['S_id'] + k * load_target(os.path.join(src, 'mh/targets', rel), len(F['S_id']))
        extra_targets.append((rel, round(k, 3)))
    ears = float((corr or {}).get('ears', 0.0))
    if abs(ears) > 0.01:
        # oreilles (largeur tête + oreilles vue de face) : décollement des pavillons, cible MakeHuman posée telle quelle
        from mh import load_target
        for side in ('l', 'r'):
            rel = f'ears/{side}-ear-flap-%s.target.gz' % ('incr' if ears > 0 else 'decr')
            k = float(min(abs(ears) * 6.0, 1.0))
            F['S_id'] = F['S_id'] + k * load_target(os.path.join(src, 'mh/targets', rel), len(F['S_id']))
            extra_targets.append((rel, round(k, 3)))
    if F['smile'] > 0.3:
        # photo souriante : la position des coins de la bouche AU REPOS n'est pas observable → bouche au repos détendue
        # (coins horizontaux), pas la moue tombante de la base MakeHuman ; ce n'est pas un sourire (contrôlé par la
        # neutralité : coins de la bouche relevés sur le rendu neutre)
        from mh import load_target
        rel = 'mouth/mouth-angles-up.target.gz'
        k = 0.08
        F['S_id'] = F['S_id'] + k * load_target(os.path.join(src, 'mh/targets', rel), len(F['S_id']))
        extra_targets.append((rel, k))
    off_n, off_f, rinfo = residual_fields(F)
    S_n = F['S_id'] + off_n
    S_photo = F['S_id'] + F['dE'] + off_f
    s, R, t = F['pose']
    targets = []
    for k, (name, fneg, fpos) in enumerate(F['pairs']):
        a, b2 = F['wid'][2 * k], F['wid'][2 * k + 1]
        if a > 0.02:
            targets.append((fneg, round(float(a), 3)))
        if b2 > 0.02:
            targets.append((fpos, round(float(b2), 3)))
    targets += extra_targets
    ident = {'targets': targets, 'pose': {'s': float(s), 'R': R.tolist(), 't': t.tolist()},
             'expression_photo': {u: round(float(v), 3) for u, v in zip(EXPR_UNITS, F['we'])},
             'residual': rinfo, 'corrections_loop': corr or {}, 'version': 2}
    np.savez_compressed(os.path.join(out_dir, 'offsets.npz'), neutral=off_n.astype(np.float32),
                        photo_expr=(F['dE'] + off_f - off_n).astype(np.float32))
    # texture : projection sur la tête AVEC l'expression de la photo (les lèvres souriantes de la photo tombent sur les
    # lèvres du modèle), portée ensuite par la tête neutre
    cfg = B.CONFIG
    skin = B.read_mhmat(os.path.join(src, cfg['skin']['mhmat']))
    skin_im = B.load_rgb(os.path.join(skin['_dir'], skin['diffuseTexture']), cfg['skin']['size'])
    strong = F['smile'] > 0.4 or F['jaw_open'] > 0.2
    if project_expressive and not strong:
        # expression légère : la bouche de la photo est recalée par l'expression ajustée → projetée telle quelle
        os.environ['FITAIA_NO_NEUTRAL'] = '1'
    # grand sourire / bouche ouverte : lèvres étirées (vermillon trop fin une fois la bouche au repos) → lèvres de la
    # texture neutre, teintées au teint de la personne, plis du sourire adoucis (photo_id.neutralize_mouth)
    try:
        tex, colors = P.bake_face(src, photo, lm, ident, S_photo if project_expressive else S_n, F['obj'], skin_im, binding=binding)
    finally:
        os.environ.pop('FITAIA_NO_NEUTRAL', None)
    tex.save(os.path.join(out_dir, 'face.png'))
    segp = photo + '.seg.png'
    if os.path.exists(segp) and not colors.get('bald'):
        try:
            colors.update(P.hair_volume(lm, segp, ident, S_n, F['obj']))
        except Exception as e:
            print('volume des cheveux non mesuré :', e)
    refs, wts, ok = binding
    Q = canonical(S_n, face_lm(F['obj'], S_n, B.group_verts))
    r_ = colors.get('hairline_r')
    if r_ is not None:
        y9 = float((Q[refs[9], 1] * wts[9]).sum())
        y152 = float((Q[refs[152], 1] * wts[152]).sum())
        colors['hairline_y'] = round(y9 + float(np.clip(r_, 0.3, 1.2)) * (y9 - y152) + float((corr or {}).get('hairline_dm', 0.0)), 3)
    colors.update(hair_tone(photo, lm))
    ic = iris_color(photo, lm)
    if ic is not None:
        colors['iris'] = [round(float(x), 4) for x in ic]
    ident.update({'photo': os.path.abspath(photo), 'colors': colors, 'face_texture': 'face.png', 'offsets': 'offsets.npz',
                  'expressions': EXPRESSIONS,
                  'expression': {k: v for k, v in lm.get('blendshapes', {}).items() if v > 0.3}})
    json.dump(ident, open(os.path.join(out_dir, 'identity.json'), 'w'), indent=1)
    print('identité v2', out_dir, '| cibles', len(targets), '| résidu moyen', rinfo['residual_mm_mean'], 'mm',
          '| expression photo', {k: v for k, v in ident['expression_photo'].items() if v > 0.05})
    return ident


def iris_color(photo, lm):
    """Couleur de l'iris : pixels VISIBLES de l'anneau de l'iris (dans le contour des paupières), sans la pupille, le
    cercle limbique sombre ni les reflets."""
    from PIL import Image, ImageDraw
    pts = lm['landmarks']
    if len(pts) < 478:
        return None
    im = np.asarray(Image.open(photo).convert('RGB')).astype(np.float32) / 255
    H, W = im.shape[:2]
    P2 = np.array(pts)[:, :2] * np.array([W, H])
    vals = []
    for c0, ring, lid in ((468, range(469, 473), LEFT_EYE), (473, range(474, 478), RIGHT_EYE)):
        c = P2[c0]
        r = float(np.mean([np.linalg.norm(P2[i] - c) for i in ring]))
        if r < 1.5:
            continue
        m = Image.new('L', (W, H), 0)
        ImageDraw.Draw(m).polygon([tuple(q) for q in P2[lid]], fill=255)
        m = np.asarray(m) > 0
        yy, xx = np.mgrid[0:H, 0:W]
        d = np.hypot(xx - c[0], yy - c[1])
        sel = m & (d > 0.38 * r) & (d < 0.92 * r)
        px = im[sel]
        if len(px) < 4:
            continue
        lum = px @ np.array([0.3, 0.59, 0.11])
        keep = (lum > np.percentile(lum, 30)) & (lum < np.percentile(lum, 92))
        vals.append(px[keep] if keep.sum() >= 2 else px)
    if not vals:
        return None
    return np.median(np.concatenate(vals), 0)


def hair_tone(photo, lm):
    """Couleur des cheveux → paramètres du shader de mèches : mélanine des mèches pigmentées, rougeur, part de cheveux
    BLANCS (gris = mélange de cheveux pigmentés et de cheveux blancs ; un seul pigment ne donne jamais du gris)."""
    from PIL import Image
    segp = photo + '.seg.png'
    if not os.path.exists(segp):
        return {}
    im = np.asarray(Image.open(photo).convert('RGB')).astype(np.float32) / 255
    seg = np.asarray(Image.open(segp).resize((im.shape[1], im.shape[0]), Image.NEAREST))
    px = im[seg == 1]
    if len(px) < 200:
        return {}
    lum = px @ np.array([0.2126, 0.7152, 0.0722])
    ok = (lum > np.percentile(lum, 5)) & (lum < np.percentile(lum, 97))
    px, lum = px[ok], lum[ok]
    mx, mn = px.max(1), px.min(1)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    med_sat = float(np.median(sat))
    L50 = float(np.median(lum))
    from factory_photo import hair_melanin
    # sur une photo, les cheveux sont assombris par leurs propres ombres : la couleur du pigment est lue sur la bande
    # 15–45 % de luminance et ré-éclaircie (×1,5) avant la conversion en mélanine
    # (cheveux gris : bande 10–30 %, où les cheveux blancs sont rares)
    band = px[(lum > np.percentile(lum, 10)) & (lum < np.percentile(lum, 30))]
    pig = np.clip(np.median(band, 0) * 1.4, 0, 1)
    mel_p, red_p = hair_melanin(pig)
    # gris / poivre et sel : cheveux peu saturés et assez clairs = mélange de cheveux pigmentés et de cheveux blancs
    gray = float(np.clip((0.30 - med_sat) / 0.15, 0, 1) * np.clip((L50 - 0.18) / 0.3, 0, 1) * 0.8)
    if gray < 0.12:
        mel_a, red_a = hair_melanin(np.clip(np.median(px, 0) * 1.15, 0, 1))
        return {'hair_melanin': mel_a, 'hair_redness': red_a, 'hair_gray': 0.0, 'hair_saturation': round(med_sat, 3)}
    # gris « cendré » : pigment foncé et froid (un pigment clair et chaud mêlé de blanc donne du blond)
    return {'hair_melanin': float(np.clip(mel_p + 0.12, 0.7, 0.93)), 'hair_redness': float(min(red_p, 0.1)), 'hair_gray': round(gray, 3),
            'hair_saturation': round(med_sat, 3)}


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--photo', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--base', required=True)
    a = ap.parse_args()
    make_identity(a.src, a.photo, a.out, a.base)
