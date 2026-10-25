"""
FITAIA — PHOTO → IDENTITÉ → AVATAR.

La tête de la base neutre (MakeHuman CC0) est déformée pour ressembler à la personne de la photo :
  1. repères du visage (MediaPipe Face Landmarker, 478 points 3D) sur la photo  → landmarks.py (environnement pyenv)
  2. correspondance repère ↔ surface de la base neutre (faite une fois, par rendu de la base + MediaPipe)
  3. ajustement : poids des cibles de visage MakeHuman (linéaires) + pose, par moindres carrés bornés
  4. texture : la photo est projetée sur le visage ajusté (vrais traits, teint, barbe) et fondue dans la peau
  5. couleurs : teint du corps, cheveux, yeux lus sur la photo
Le résultat (identity.json + face.png) est lu par build_premium_avatar.py : les 15 morphs du corps restent identiques.

Repère : coordonnées MakeHuman au repos, en dm, y vers le haut, z vers l'avant.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_premium_avatar as B  # noqa: E402
from mh import Mhclo, Obj, load_target  # noqa: E402

FACE_DIRS = ('head/', 'chin/', 'cheek/', 'nose/', 'mouth/', 'eyebrows/', 'eyes/', 'ears/', 'forehead/', 'asym/')   # le cou reste celui du corps (raccord vêtements)

# cibles d'identité ajustées (paires decr/incr → une variable signée). Les oreilles et le cou sont réglés à part.
PAIRS = [
    # (la profondeur, la graisse et l'âge du visage ne se lisent pas sur une photo de face : non ajustés ;
    #  la graisse du visage reste pilotée par le corps — morph face_fat)
    'head/head-scale-horiz', 'head/head-scale-vert', 'head/head-trans', 'forehead/forehead-scale-vert', 'forehead/forehead-trans', 'forehead/forehead-temple',
    'chin/chin-width', 'chin/chin-height', 'chin/chin-prominent', 'chin/chin-bones', 'chin/chin-jaw-drop', 'chin/chin-prognathism',
    'cheek/l-cheek-bones', 'cheek/r-cheek-bones', 'cheek/l-cheek-inner', 'cheek/r-cheek-inner',
    'nose/nose-scale-horiz', 'nose/nose-scale-vert', 'nose/nose-scale-depth', 'nose/nose-trans', 'nose/nose-point-width',
    'nose/nose-width1', 'nose/nose-width2', 'nose/nose-width3', 'nose/nose-nostrils-width', 'nose/nose-base', 'nose/nose-hump',
    'nose/nose-point', 'nose/nose-curve', 'nose/nose-volume', 'nose/nose-flaring',
    'mouth/mouth-scale-horiz', 'mouth/mouth-scale-vert', 'mouth/mouth-trans', 'mouth/mouth-upperlip-volume', 'mouth/mouth-lowerlip-volume',
    'mouth/mouth-upperlip-width', 'mouth/mouth-lowerlip-width', 'mouth/mouth-cupidsbow',
    'mouth/mouth-upperlip-height', 'mouth/mouth-lowerlip-height',
    'eyes/l-eye-scale', 'eyes/r-eye-scale', 'eyes/l-eye-trans', 'eyes/r-eye-trans', 'eyes/l-eye-height2', 'eyes/r-eye-height2',
    'eyes/l-eye-corner1', 'eyes/r-eye-corner1', 'eyes/l-eye-corner2', 'eyes/r-eye-corner2',
    'eyebrows/eyebrows-trans', 'eyebrows/eyebrows-angle',
]
SUFFIX = [('-decr', '-incr'), ('-down', '-up'), ('-in', '-out'), ('-backward', '-forward'), ('-compress', '-uncompress'),
          ('-concave', '-convex')]


def target_files(src):
    """Liste (nom, fichier négatif, fichier positif) des paires disponibles (trans/angle : plusieurs axes)."""
    tdir = os.path.join(src, 'mh/targets')
    out = []
    for p in PAIRS:
        d, base = os.path.split(p)
        files = os.listdir(os.path.join(tdir, d))
        found = False
        for neg, pos in SUFFIX:
            fn, fp = f'{base}{neg}.target.gz', f'{base}{pos}.target.gz'
            if fn in files and fp in files:
                out.append((f'{p}{neg}|{pos}', f'{d}/{fn}', f'{d}/{fp}'))
                found = True
        if base.endswith('-trans') or base.endswith('-angle'):
            # trans : up/down, in/out, forward/backward ; angle : in/out
            for neg, pos in (('-down', '-up'), ('-in', '-out'), ('-backward', '-forward')):
                fn, fp = f'{base}{neg}.target.gz', f'{base}{pos}.target.gz'
                key = f'{p}{neg}|{pos}'
                if fn in files and fp in files and not any(o[0] == key for o in out):
                    out.append((key, f'{d}/{fn}', f'{d}/{fp}'))
        if not found and not (base.endswith('-trans') or base.endswith('-angle')):
            pass
    return out


def neutral_shape(src, cfg=None):
    """Base neutre : macros + cibles de corps de la config, SANS les cibles de visage du héros.
    cfg['base']['gender'] ('male' par défaut, 'female' : persons.selfie_config) choisit les macros MakeHuman du bon sexe,
    exactement comme build_premium_avatar.build — la base ajustée ici est celle qui sera construite."""
    cfg = cfg or B.CONFIG
    gender = cfg['base'].get('gender', 'male')
    obj = Obj(B.find_base_obj(src))
    nv = len(obj.v)
    T = lambda rel: load_target(os.path.join(src, 'mh/targets', rel), nv)  # noqa: E731
    shape = obj.v.copy()
    for race, w in cfg['base']['race'].items():
        shape += w * T(f'macrodetails/{race}-{gender}-young.target.gz')
    shape += cfg['base']['proportions'] * T(f'macrodetails/proportions/{gender}-young-averagemuscle-averageweight-idealproportions.target.gz')
    for rel, k in cfg['base'].get('shape', []):
        if not rel.startswith(FACE_DIRS):
            shape += k * T(rel)
    return obj, shape, T


# ---------------------------------------------------------------------------------------------
# Rendu orthographique (base neutre de face) avec tampon d'indices → correspondance repères ↔ surface
# ---------------------------------------------------------------------------------------------
def raster(meshes, size, view):
    """meshes : liste de (positions n×3, triangles m×3, uv n×2 ou None, texture RGBA float ou None, couleur, tag).
    view : (cx, cy, half) projection orthographique de face. Renvoie image, profondeur, (tag, tri, b0, b1, b2)."""
    cx, cy, half = view
    img = np.zeros((size, size, 3), np.float32) + 0.5
    zb = np.full((size, size), -1e9, np.float32)
    tagb = np.full((size, size), -1, np.int32)
    trib = np.full((size, size), -1, np.int32)
    bary = np.zeros((size, size, 3), np.float32)
    L = np.array([0.25, 0.35, 0.9])
    L /= np.linalg.norm(L)
    for tag, (P, F, UV, tex, col, _) in enumerate(meshes):
        X = (P[:, 0] - cx) / half * (size / 2) + size / 2
        Y = (cy - P[:, 1]) / half * (size / 2) + size / 2
        Z = P[:, 2]
        tri = P[F]
        fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
        fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
        for t, (a, b, c) in enumerate(F):
            if fn[t, 2] <= 0 and tex is None:
                continue
            xs, ys = np.array([X[a], X[b], X[c]]), np.array([Y[a], Y[b], Y[c]])
            x0, x1 = int(max(np.floor(xs.min()), 0)), int(min(np.ceil(xs.max()), size - 1))
            y0, y1 = int(max(np.floor(ys.min()), 0)), int(min(np.ceil(ys.max()), size - 1))
            if x1 < x0 or y1 < y0:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            den = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
            if abs(den) < 1e-12:
                continue
            l0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / den
            l1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / den
            l2 = 1 - l0 - l1
            m = (l0 >= 0) & (l1 >= 0) & (l2 >= 0)
            if not m.any():
                continue
            z = l0 * Z[a] + l1 * Z[b] + l2 * Z[c]
            sub = zb[y0:y1 + 1, x0:x1 + 1]
            m &= z > sub
            if not m.any():
                continue
            if tex is not None and UV is not None:
                u = l0 * UV[a, 0] + l1 * UV[b, 0] + l2 * UV[c, 0]
                v = l0 * UV[a, 1] + l1 * UV[b, 1] + l2 * UV[c, 1]
                th, tw = tex.shape[:2]
                px = np.clip((u % 1.0) * (tw - 1), 0, tw - 1).astype(int)
                py = np.clip((1 - (v % 1.0)) * (th - 1), 0, th - 1).astype(int)
                rgba = tex[py, px]
                if rgba.shape[-1] == 4:
                    m &= rgba[..., 3] > 0.4
                rgb = rgba[..., :3]
            else:
                rgb = np.broadcast_to(np.array(col, np.float32), m.shape + (3,))
            shade = 0.45 + 0.55 * max(float(fn[t] @ L), 0.0)
            sub[m] = z[m]
            img[y0:y1 + 1, x0:x1 + 1][m] = rgb[m] * shade
            tagb[y0:y1 + 1, x0:x1 + 1][m] = tag
            trib[y0:y1 + 1, x0:x1 + 1][m] = t
            bary[y0:y1 + 1, x0:x1 + 1][m] = np.stack([l0, l1, l2], -1)[m]
    return img, zb, tagb, trib, bary


def head_meshes(src, obj, shape, cfg=None):
    cfg = cfg or B.CONFIG
    body = set(B.group_verts(obj, 'body'))
    faces = [[vi for vi, _ in f] for f, g in zip(obj.faces, obj.groups) if g == 'body' and shape[f[0][0], 1] > 6.3]
    uvf = [[ti for _, ti in f] for f, g in zip(obj.faces, obj.groups) if g == 'body' and shape[f[0][0], 1] > 6.3]
    # triangles + UV par sommet de coin (on duplique les coins)
    P, UV, F, src_v = [], [], [], []
    for f, uf in zip(faces, uvf):
        for k in range(1, len(f) - 1):
            ids = [0, k, k + 1]
            base = len(P)
            for i in ids:
                P.append(shape[f[i]])
                UV.append(obj.vt[uf[i]])
                src_v.append(f[i])
            F.append([base, base + 1, base + 2])
    skin = B.read_mhmat(os.path.join(src, cfg['skin']['mhmat']))
    tex = np.asarray(Image.open(os.path.join(skin['_dir'], skin['diffuseTexture'])).convert('RGB').resize((1024, 1024))).astype(np.float32) / 255
    meshes = [(np.array(P), np.array(F), np.array(UV), tex, None, 'body')]
    eyes = Mhclo(os.path.join(src, cfg['face']['eyes'][0]))
    ep = eyes.fit(shape)
    etris = np.array(B.tri_from_quads(eyes.obj.faces))
    EP, EUV, EF = [], [], []
    for tri in etris:
        base = len(EP)
        for (vi, ti) in tri:
            EP.append(ep[vi])
            EUV.append(eyes.obj.vt[ti])
        EF.append([base, base + 1, base + 2])
    emat = B.read_mhmat(os.path.join(src, cfg['face']['eyes'][1]))
    etex = np.asarray(Image.open(os.path.join(emat['_dir'], emat['diffuseTexture'])).convert('RGBA').resize((512, 512))).astype(np.float32) / 255
    meshes.append((np.array(EP), np.array(EF), np.array(EUV), etex, None, 'eyes'))
    return meshes, np.array(src_v)


def render_neutral(src, out_png, out_npz, size=1024, cfg=None):
    obj, shape, _ = neutral_shape(src, cfg)
    meshes, src_v = head_meshes(src, obj, shape, cfg)
    view = (0.0, 8.05, 1.6)
    if (cfg or B.CONFIG)['base'].get('gender', 'male') != 'male':
        # autre base (femme : plus petite) : même cadrage par rapport au sommet du crâne que la base masculine,
        # sinon le visage sort du rendu et les repères ne se lient plus à la surface
        _, shape_m, _ = neutral_shape(src, dict(B.CONFIG, base=dict(B.CONFIG['base'], gender='male')))
        view = (0.0, round(8.05 + float(shape[:, 1].max() - shape_m[:, 1].max()), 3), 1.6)
    img, zb, tagb, trib, bary = raster(meshes, size, view)
    img = np.where((tagb < 0)[..., None], np.array([0.62, 0.62, 0.6], np.float32), img)
    Image.fromarray((np.clip(img, 0, 1) ** (1 / 1.4) * 255).astype(np.uint8)).save(out_png)
    np.savez_compressed(out_npz, tag=tagb, tri=trib, bary=bary, view=np.array(view), size=size,
                        tris=meshes[0][1], src_v=src_v)
    return out_png


def bind_landmarks(lm_json, npz):
    """Repères MediaPipe sur le rendu de la base → (sommets MakeHuman ×3, poids barycentriques) par repère."""
    d = dict(np.load(npz))          # lu une seule fois (un accès à un .npz relit et décompresse le tableau)
    lm = json.load(open(lm_json))
    pts = np.array(lm['landmarks'])
    size = int(d['size'])
    tri_v = d['src_v'][d['tris']]
    refs, wts, ok = [], [], []
    tag = d['tag']
    for x, y, _ in pts[:468]:
        px, py = int(round(x * size)), int(round(y * size))
        if 0 <= px < size and 0 <= py < size and tag[py, px] != 0:
            # repère tombé sur le globe de l'œil (coins des yeux) ou juste hors de la silhouette (contour du visage) :
            # on le lie au pixel de PEAU le plus proche (coin de la paupière, bord du visage) — sinon il n'est jamais contraint
            r = 14
            y0, y1, x0, x1 = max(py - r, 0), min(py + r + 1, size), max(px - r, 0), min(px + r + 1, size)
            yy, xx = np.nonzero(tag[y0:y1, x0:x1] == 0)
            if len(yy):
                k = int(np.argmin((yy + y0 - py) ** 2 + (xx + x0 - px) ** 2))
                py, px = int(yy[k] + y0), int(xx[k] + x0)
        if 0 <= px < size and 0 <= py < size and tag[py, px] == 0:
            t = d['tri'][py, px]
            refs.append(tri_v[t])
            wts.append(d['bary'][py, px])
            ok.append(True)
        else:
            refs.append([0, 0, 0])
            wts.append([1, 0, 0])
            ok.append(False)
    return np.array(refs), np.array(wts), np.array(ok)


# ---------------------------------------------------------------------------------------------
# Ajustement de l'identité
# ---------------------------------------------------------------------------------------------
# zones de repères MediaPipe (indices du maillage 468 points)
MOUTH = [0, 13, 14, 17, 37, 39, 40, 61, 78, 80, 81, 82, 84, 87, 88, 91, 95, 146, 178, 181, 185, 191, 267, 269, 270, 291,
         308, 310, 311, 312, 314, 317, 318, 321, 324, 375, 402, 405, 409, 415]
LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
RIGHT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150,
        136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
CHEEKS = [50, 101, 118, 117, 280, 330, 347, 346]


def photo_points(lm):
    W, H = lm['width'], lm['height']
    p = np.array(lm['landmarks'])
    # pixels ; y vers le haut ; z vers la caméra (MediaPipe : z négatif = plus proche)
    return np.c_[p[:, 0] * W, -p[:, 1] * H, -p[:, 2] * W]


def similarity(A, Bp, w=None):
    """s, R, t minimisant ||s R A + t - B|| (pondéré)."""
    w = np.ones(len(A)) if w is None else w
    w = w / w.sum()
    ma, mb = (A * w[:, None]).sum(0), (Bp * w[:, None]).sum(0)
    A0, B0 = A - ma, Bp - mb
    C = (B0 * w[:, None]).T @ A0
    U, S, Vt = np.linalg.svd(C)
    D = np.eye(3)
    D[2, 2] = np.sign(np.linalg.det(U @ Vt))
    R = U @ D @ Vt
    s = (S * np.diag(D)).sum() / ((A0 ** 2).sum(1) * w).sum()
    t = mb - s * R @ ma
    return s, R, t


def fit_identity(src, lm_photo, binding, reg=0.08, iters=6, zw=0.2, seg_path=None, sil_w=3.0, adjust=None, cfg=None):
    from scipy.optimize import lsq_linear
    obj, shape, T = neutral_shape(src, cfg)
    refs, wts, ok = binding
    pairs = target_files(src)
    D = []
    for name, fneg, fpos in pairs:
        D.append(T(fneg))
        D.append(T(fpos))
    idx = np.where(ok)[0]
    X = photo_points(lm_photo)[idx]

    def at(S):
        return (S[refs[idx]] * wts[idx][..., None]).sum(1)

    M0 = at(shape)
    J = np.stack([at(d) for d in D], -1)          # n × 3 × 2K
    c = np.ones(len(idx))
    bs = lm_photo.get('blendshapes', {})
    if max(bs.get('mouthSmileLeft', 0), bs.get('mouthSmileRight', 0), bs.get('jawOpen', 0)) > 0.25:
        c[np.isin(idx, MOUTH)] = 0.0                   # expression (sourire…) : la bouche n'est pas utilisée
        c[np.isin(idx, [0, 37, 267, 11, 12])] = 1.0     # sauf le haut de la lèvre supérieure (fixe la distance nez–bouche)
        # un sourire remonte aussi les joues et plisse les paupières inférieures : poids réduit
        c[np.isin(idx, CHEEKS + [145, 159, 374, 386, 153, 380, 144, 373, 205, 425, 207, 427, 187, 411])] = 0.3
    # silhouette : largeur de la tête (peau + cheveux, oreilles comprises) à plusieurs hauteurs, mesurée sur la
    # segmentation de la photo → contraint le crâne, les tempes, les joues et la mâchoire (hors des repères MediaPipe)
    sil = []
    if seg_path and os.path.exists(seg_path):
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
            l = cx
            while l > 0 and line[l - 1]:
                l -= 1
            r_ = cx
            while r_ < Wp - 1 and line[r_ + 1]:
                r_ += 1
            wpx = r_ - l
            if wpx < fh * 0.3:
                continue
            # hauteur correspondante dans le modèle : on interpole entre les repères liés
            lid = {'front': (10, 168), 'yeux': (33, 263), 'nez': (2, 2), 'bouche': (13, 13), 'machoire': (13, 152)}[key]
            ym = float(np.mean([allref[i, 1] for i in lid]))
            band = head[np.abs(shape[head, 1] - ym) < 0.06]
            if len(band) < 4:
                continue
            vr, vl = band[shape[band, 0].argmax()], band[shape[band, 0].argmin()]
            sil.append((key, wpx, vr, vl))
    w = np.zeros(len(D))
    for _ in range(iters):
        M = M0 + J @ w
        s, R, t = similarity(M, X, c)
        Y = ((X - t) @ R) / s                          # photo ramenée dans le repère du modèle
        r = (Y - M0)
        A = (J * np.array([1, 1, zw])[None, :, None]) * np.sqrt(c)[:, None, None]
        b = (r * np.array([1, 1, zw])[None, :]) * np.sqrt(c)[:, None]
        A = A.reshape(-1, len(D))
        b = b.reshape(-1)
        rows_A, rows_b = [], []
        for key, wpx, vr, vl in sil:
            target = wpx / s
            base = shape[vr, 0] - shape[vl, 0]
            rows_A.append(sil_w * np.array([d[vr, 0] - d[vl, 0] for d in D]))
            rows_b.append(sil_w * (target - base))
        if rows_A:
            A = np.vstack([A, np.array(rows_A)])
            b = np.concatenate([b, np.array(rows_b)])
        A = np.vstack([A, np.sqrt(reg) * np.eye(len(D))])
        b = np.concatenate([b, np.zeros(len(D))])
        w = lsq_linear(A, b, bounds=(0, 1), lsmr_tol='auto').x
    # corrections issues du contrôle de ressemblance (rendu ↔ photo) : { 'nose/nose-scale-vert': +0.2, ... }
    extra = []                 # cibles hors ajustement (ex. graisse du visage, invisible aux repères) : posées telles quelles
    for key, dv in (adjust or {}).items():
        for k, (name, fneg, fpos) in enumerate(pairs):
            if name.startswith(key + '-') or name.startswith(key + '|'):
                v = w[2 * k + 1] - w[2 * k] + dv
                w[2 * k], w[2 * k + 1] = max(-v, 0.0), max(v, 0.0)
                break
        else:
            d_, base_ = os.path.split(key)
            f_ = f'{d_}/{base_}-{"incr" if dv > 0 else "decr"}.target.gz'
            if abs(dv) > 0.02 and os.path.exists(os.path.join(src, 'mh/targets', f_)):
                extra.append((f_, round(float(min(abs(dv), 1.0)), 3)))
    w = np.clip(w, 0, 1)
    M = M0 + J @ w
    s, R, t = similarity(M, X, c)
    err = np.linalg.norm(((X - t) @ R) / s - M, axis=1)
    targets = []
    for k, (name, fneg, fpos) in enumerate(pairs):
        a, b2 = w[2 * k], w[2 * k + 1]
        if a > 0.02:
            targets.append((fneg, round(float(a), 3)))
        if b2 > 0.02:
            targets.append((fpos, round(float(b2), 3)))
    targets += extra
    S = shape + sum(wk * d for wk, d in zip(w, D)) + sum(wk * T(f) for f, wk in extra)
    silr = {k: [round(float(wpx / s), 3), round(float(S[vr, 0] - S[vl, 0]), 3)] for k, wpx, vr, vl in sil}
    return {'targets': targets, 'pose': {'s': float(s), 'R': R.tolist(), 't': t.tolist()},
            'err_mm': round(float(err.mean() * 100), 2), 'silhouette_photo_modele_dm': silr}, S, obj


# ---------------------------------------------------------------------------------------------
# Texture : photo projetée sur le visage ajusté, fondue dans la peau
# ---------------------------------------------------------------------------------------------
def _sample(img, x, y):
    h, w = img.shape[:2]
    x = np.clip(x, 0, w - 1.001)
    y = np.clip(y, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) +
            img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


def _poly_mask(size_hw, pts, blur):
    from PIL import ImageDraw
    m = Image.new('L', (size_hw[1], size_hw[0]), 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in pts], fill=255)
    if blur:
        m = m.filter(ImageFilter.GaussianBlur(float(blur)))
    return np.asarray(m).astype(np.float32) / 255


NEUTRAL_MOUTH = sorted(set(MOUTH + [61, 291, 0, 17, 37, 267, 39, 269, 40, 270, 185, 409, 84, 314, 181, 405, 91, 321, 146, 375]))
NEUTRAL_ANCHORS = sorted(set(LEFT_EYE + RIGHT_EYE + OVAL + [1, 2, 4, 5, 6, 98, 327, 168, 197, 195, 129, 358, 48, 278, 115, 344, 50, 280]))
NASOLABIAL = [(129, 61), (358, 291)]


def close_mouth(photo, P2, fh):
    """Intérieur de la bouche (dents) recouvert de la couleur des lèvres, fine ligne sombre entre les lèvres."""
    INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]
    H, W = photo.shape[:2]
    gap = float(np.linalg.norm(P2[13] - P2[14]))
    if gap <= fh * 0.015:
        return photo
    inner = _poly_mask((H, W), P2[INNER], fh * 0.004)
    outer = _poly_mask((H, W), P2[[61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]], 0)
    ring = (outer > 0.5) & (inner < 0.1)
    lipc = np.median(photo[ring], 0) if ring.sum() > 20 else np.array([0.55, 0.35, 0.32])
    line = np.clip(1 - np.abs(np.arange(H)[:, None] - (P2[13, 1] + P2[14, 1]) / 2) / max(gap * 0.12, 1), 0, 1)
    fill = lipc[None, None, :] * (1 - 0.35 * line[..., None])
    return photo * (1 - inner[..., None]) + fill * inner[..., None]


def neutralize_mouth(photo, P2, fh):
    """Sourire « effacé » avant projection. La bouche de la photo (étirée, relevée, dents visibles) n'est PAS projetée :
    les lèvres viennent de la texture de base (bouche fermée, neutre, exactement calée sur la géométrie des lèvres du
    modèle), teintées au teint de la personne ; les plis du sourire (ailes du nez → coins de la bouche) sont adoucis.
    Renvoie (photo adoucie, masque de la bouche à exclure de la projection)."""
    from PIL import ImageDraw
    H, W = photo.shape[:2]
    out = close_mouth(photo, P2, fh)
    m = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(m)
    for a_, b_ in NASOLABIAL:
        pa, pb = P2[a_], P2[b_]
        dr.line([tuple(pa), tuple(pb + (pb - pa) * 0.35)], fill=255, width=max(3, int(fh * 0.09)))
    m = np.asarray(m.filter(ImageFilter.GaussianBlur(fh * 0.035))).astype(np.float32)[..., None] / 255
    sm = np.stack([np.asarray(Image.fromarray((out[..., c] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(fh * 0.035))).astype(np.float32) / 255
                   for c in range(3)], -1)
    out = out * (1 - 0.95 * m) + sm * 0.95 * m
    # bouche (lèvres + 6 % de la hauteur du visage autour) : exclue de la projection, fondu doux
    outer = P2[[61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]]
    c = outer.mean(0)
    grown = c + (outer - c) * 1.18
    mm = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mm).polygon([tuple(p) for p in grown], fill=255)
    mm = mm.filter(ImageFilter.MaxFilter(max(3, int(fh * 0.03)) | 1)).filter(ImageFilter.GaussianBlur(fh * 0.025))
    return out, np.asarray(mm).astype(np.float32) / 255


def bake_face(src, photo_path, lm_photo, ident, S, obj, skin_im, cfg=None, binding=None, match_body=True):
    """Renvoie (texture de peau personnalisée, couleurs lues sur la photo)."""
    photo = np.asarray(Image.open(photo_path).convert('RGB')).astype(np.float32) / 255
    H, W = photo.shape[:2]
    P2 = np.array(lm_photo['landmarks'])[:, :2] * np.array([W, H])
    pose = ident['pose']
    s, R, t = pose['s'], np.array(pose['R']), np.array(pose['t'])
    proj = (S @ R.T) * s + t                  # pixels, y vers le haut
    px, py = proj[:, 0], -proj[:, 1]
    # masque visage dans l'image : ovale MediaPipe, sans les yeux ni l'intérieur de la bouche (nos yeux 3D)
    fh = float(np.linalg.norm(P2[10] - P2[152]))
    bs = lm_photo.get('blendshapes', {})
    smiling = max(bs.get('mouthSmileLeft', 0), bs.get('mouthSmileRight', 0), bs.get('jawOpen', 0)) > 0.25
    mouth_out = None
    if smiling and os.environ.get('FITAIA_NO_NEUTRAL') is None:
        photo, mouth_out = neutralize_mouth(photo, P2, fh)
        ident.setdefault('corrections', []).append({'sourire_neutralise': True})
    # ovale étendu vers le haut jusqu'à la ligne de cheveux (tout le front vient de la photo ; la segmentation
    # « peau du visage » coupe ensuite cheveux et fond)
    ov = P2[OVAL].copy()
    eye_y = (P2[33, 1] + P2[263, 1]) / 2
    upv = (P2[10] - P2[152]) / max(fh, 1)
    up_amt = np.clip((eye_y - ov[:, 1]) / (fh * 0.45), 0, 1)
    ov = ov + upv[None, :] * (fh * 0.35 * up_amt)[:, None]
    face = _poly_mask((H, W), ov, fh * 0.02)
    face = np.clip((face - 0.3) * 1.6, 0, 1)
    for eye in (LEFT_EYE, RIGHT_EYE):
        c = P2[eye].mean(0)
        pts = c + (P2[eye] - c) * 1.15
        face *= 1 - _poly_mask((H, W), pts, fh * 0.006)
    if mouth_out is not None:
        face *= 1 - mouth_out          # bouche souriante : lèvres neutres de la texture de base (voir neutralize_mouth)
    # couleurs
    cheek = np.concatenate([_sample(photo, P2[i, 0] + np.random.default_rng(i).normal(0, fh * 0.01, 30),
                                    P2[i, 1] + np.random.default_rng(i + 1).normal(0, fh * 0.01, 30)) for i in CHEEKS])
    skin_rgb = np.median(cheek, 0)
    # iris : entre le centre de la pupille et le bord de l'iris (ni pupille noire, ni blanc de l'œil)
    iris = []
    if len(lm_photo['landmarks']) >= 478:
        for c0, ring in ((468, range(469, 473)), (473, range(474, 478))):
            for r in ring:
                q = P2[c0] + (P2[r] - P2[c0]) * 0.55
                iris.append(_sample(photo, np.array([q[0]]), np.array([q[1]]))[0])
    iris_rgb = np.median(np.array(iris), 0) if iris else np.array([0.3, 0.22, 0.15])
    # cheveux : on remonte depuis le haut du front jusqu'à la première couleur nettement différente de la peau
    top = P2[10]
    up = (P2[10] - P2[152]) / max(fh, 1)
    side = np.array([-up[1], up[0]])
    hairline_k, hair, fref = None, [], None
    for k in np.arange(0.0, 0.7, 0.01):
        cols = np.array([_sample(photo, np.array([q[0]]), np.array([q[1]]))[0]
                         for q in (top + up * fh * k + side * fh * dx for dx in (-0.12, 0.0, 0.12)) if 0 <= q[1] < H - 1])
        if not len(cols):
            break
        c = np.median(cols, 0)
        if fref is None or k < 0.03:
            fref = c if fref is None else (fref + c) / 2      # référence : peau du haut du front
            continue
        if np.abs(c - fref).sum() > 0.3:
            hairline_k = float(k)
            for k2 in np.arange(k + 0.03, k + 0.12, 0.02):
                for dx in (-0.15, 0.0, 0.15):
                    q = top + up * fh * k2 + side * fh * dx
                    if 0 <= q[1] < H - 1:
                        hair.append(_sample(photo, np.array([q[0]]), np.array([q[1]]))[0])
            break
    hair_rgb = np.median(np.array(hair), 0) if hair else np.array([0.12, 0.09, 0.07])
    # exposition : référence = blanc de l'œil (le même pour tout le monde) → le teint réel est conservé
    scl = []
    if len(lm_photo['landmarks']) >= 478:
        for c0, corners in ((468, (33, 133)), (473, (263, 362))):
            for cc in corners:
                q = P2[c0] + (P2[cc] - P2[c0]) * 0.62
                scl.append(_sample(photo, np.array([q[0]]), np.array([q[1]]))[0])
    sl = float(np.median(np.array(scl) @ np.array([0.3, 0.59, 0.11]))) if scl else 0.75
    gain = float(np.clip(0.80 / max(sl, 1e-3), 0.9, 1.05))
    # crâne rasé / chauve : « cheveux » de la couleur de la peau
    hn, sn = hair_rgb / max(hair_rgb.sum(), 1e-3), skin_rgb / max(skin_rgb.sum(), 1e-3)
    bald = bool(np.abs(hn - sn).sum() < 0.06 and hair_rgb.mean() > skin_rgb.mean() * 0.55)
    thick = 0.0 if bald else 0.6
    # segmentation MediaPipe (si disponible) : bien plus fiable pour les cheveux, le teint et le masque du visage
    segp = photo_path + '.seg.png'
    if os.path.exists(segp):
        seg = np.asarray(Image.open(segp).resize((W, H), Image.NEAREST))
        hairpix = photo[seg == 1]
        if len(hairpix) > 200:
            lumh = hairpix @ np.array([0.3, 0.59, 0.11])
            keep = (lumh > np.percentile(lumh, 10)) & (lumh < np.percentile(lumh, 90))
            hair_rgb = np.median(hairpix[keep], 0)
        # cheveux au-dessus du front : bande entre le haut du front et ~45 % de la hauteur du visage au-dessus
        band = np.zeros((H, W), bool)
        cxp, cyp = P2[10]
        x0b, x1b = int(max(cxp - fh * 0.3, 0)), int(min(cxp + fh * 0.3, W))
        y0b, y1b = int(max(cyp - fh * 0.45, 0)), int(max(cyp - fh * 0.02, 0))
        band[y0b:y1b, x0b:x1b] = True
        frac = float((seg[band] == 1).mean()) if band.any() else 0.0
        bald = frac < 0.12
        fsk = photo[(seg == 3)]
        if len(fsk) > 500:
            lf = fsk @ np.array([0.3, 0.59, 0.11])
            skin_rgb = np.median(fsk[(lf > np.percentile(lf, 30)) & (lf < np.percentile(lf, 80))], 0)
        # le visage projeté ne prend que la peau du visage (pas les cheveux sur le front, ni le fond)
        face *= np.asarray(Image.fromarray(((seg == 3) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))
                           .filter(ImageFilter.GaussianBlur(float(fh * 0.01)))).astype(np.float32) / 255
        # ligne de cheveux (pour la coupe 3D) : premier pixel « cheveux » au-dessus du front, au centre
        col = seg[:int(cyp), int(cxp)]
        hl = np.where(col == 1)[0]
        hairline_k = float((cyp - hl.max()) / fh) if len(hl) else None
        # ligne de cheveux relative à la glabelle (repère 9) et au menton : plus robuste que le haut du front
        if len(hl):
            yb, yc = P2[9, 1], P2[152, 1]
            hairline_r = float((yb - hl.max()) / max(yc - yb, 1))
        # volume des cheveux : haut de la zone « cheveux » au-dessus du front (rasé ≈ 0,45 ; coupe courte ≈ 0,55 ;
        # volume ≈ 0,65+ en hauteur de visage). Sert à choisir : cheveux peints seulement, ou coupe 3D.
        hair_top_k = float((cyp - hl.min()) / fh) if len(hl) else 0.0
        # épaisseur de la bande « cheveux » au-dessus du front (mesurée : rasé ≈ 0,08 ; court ≈ 0,15 ; volume ≥ 0,25)
        band_k = hair_top_k - (hairline_k or 0.0)
        thick = float(np.clip((band_k - 0.08) / 0.15, 0, 1))
        if thick < 0.25:
            # cheveux ras : le crâne de la photo (cheveux courts compris) est projeté tel quel → vraie implantation
            scal = ((seg == 1) | (seg == 3)).astype(np.uint8) * 255
            scal = np.asarray(Image.fromarray(scal).filter(ImageFilter.MinFilter(5))
                              .filter(ImageFilter.GaussianBlur(float(fh * 0.015)))).astype(np.float32) / 255
            yy = np.arange(H)[:, None]
            above = np.clip((P2[9, 1] - yy) / (fh * 0.1), 0, 1)
            face = np.maximum(face, scal * above)
    photo = np.clip(photo * gain, 0, 1)
    skin_rgb = np.clip(skin_rgb * gain, 0, 1)
    # bouche ouverte sur la photo (sourire, dents) : l'intérieur de la bouche est refermé avec la couleur des lèvres
    # (le modèle 3D a la bouche fermée ; l'expression sera une animation, pas une texture)
    INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]
    gap = float(np.linalg.norm(P2[13] - P2[14]))
    if gap > fh * 0.015:
        inner = _poly_mask((H, W), P2[INNER], fh * 0.004)
        outer = _poly_mask((H, W), P2[[61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]], 0)
        ring = (outer > 0.5) & (inner < 0.1)
        lipc = np.median(photo[ring], 0) if ring.sum() > 20 else np.array([0.55, 0.35, 0.32])
        line = np.clip(1 - np.abs(np.arange(H)[:, None] - (P2[13, 1] + P2[14, 1]) / 2) / max(gap * 0.12, 1), 0, 1)
        fill = lipc[None, None, :] * (1 - 0.35 * line[..., None])      # fine ligne sombre entre les lèvres
        photo = photo * (1 - inner[..., None]) + fill * inner[..., None]
    # « dé-éclairage » : on retire l'ombrage de la photo (reflet du front, joues dans l'ombre) — le rendu 3D apporte
    # sa propre lumière. Luminance basse fréquence ramenée à une valeur constante, couleurs et détails conservés.
    lumi = photo @ np.array([0.3, 0.59, 0.11], np.float32)
    rad = float(max(fh * 0.12, 3))
    low = np.asarray(Image.fromarray(np.clip(lumi * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(rad))).astype(np.float32) / 255
    target = float(skin_rgb @ np.array([0.3, 0.59, 0.11]))
    photo = np.clip(photo * (target / np.maximum(low, 0.05))[..., None] * 0.97, 0, 1)
    # reflets du flash (front, nez, pommettes) : un albédo n'a pas de reflet → luminance plafonnée à 1,08 × la
    # luminance locale (le rendu ajoute ses propres reflets)
    lum2 = photo @ np.array([0.3, 0.59, 0.11], np.float32)
    loc = np.asarray(Image.fromarray(np.clip(lum2 * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(float(max(fh * 0.035, 2))))).astype(np.float32) / 255
    ex = lum2 / np.maximum(loc, 0.03)
    photo = photo * np.where(ex > 1.08, 1.08 / np.maximum(ex, 1e-3), 1.0)[..., None]
    # peau de base teintée au teint de la photo (corps cohérent avec le visage)
    base = np.asarray(skin_im.convert('RGB')).astype(np.float32) / 255
    Ws = base.shape[0]
    # teint moyen de la texture de base sur les joues : rapport de couleur
    ref = np.median(base.reshape(-1, 3)[np.random.default_rng(0).integers(0, Ws * Ws, 20000)], 0)
    ref = np.array([0.80, 0.62, 0.52]) if ref.mean() < 0.2 else ref
    tint = np.clip(skin_rgb / np.maximum(ref, 1e-3), 0.3, 2.0)
    out = np.clip(base * tint[None, None, :], 0, 1)
    # rasterisation UV des faces de la tête vues de face
    nrm = B.vertex_normals(S, np.array([[c[0] for c in tr] for tr in B.tri_from_quads(
        [f for f, g in zip(obj.faces, obj.groups) if g == 'body'])]))
    view = R.T @ np.array([0, 0, 1.0])
    front = np.clip((nrm @ view - 0.12) / 0.4, 0, 1)   # pas de photo étirée sur les côtés
    if os.environ.get('PID_DEBUG'):
        Image.fromarray((np.clip(photo * (0.4 + 0.6 * face[..., None]), 0, 1) * 255).astype(np.uint8)).save('/tmp/claude-0/pid_debug.png')
    acc = np.zeros((Ws, Ws, 3), np.float32)
    wacc = np.zeros((Ws, Ws), np.float32)
    for f, g in zip(obj.faces, obj.groups):
        if g != 'body':
            continue
        vi = [a for a, _ in f]
        if S[vi[0], 1] < 6.6 or max(front[vi]) <= 0:
            continue
        ti = [b for _, b in f]
        for k in range(1, len(f) - 1):
            ids = [0, k, k + 1]
            uv = np.array([obj.vt[ti[i]] for i in ids]) * (Ws - 1)
            uv[:, 1] = (Ws - 1) - uv[:, 1]
            x0, y0 = np.floor(uv.min(0)).astype(int)
            x1, y1 = np.ceil(uv.max(0)).astype(int) + 1
            x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, Ws), min(y1, Ws)
            if x1 <= x0 or y1 <= y0:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
            a_, b_, c_ = uv
            den = (b_[1] - c_[1]) * (a_[0] - c_[0]) + (c_[0] - b_[0]) * (a_[1] - c_[1])
            if abs(den) < 1e-9:
                continue
            l1 = ((b_[1] - c_[1]) * (gx - c_[0]) + (c_[0] - b_[0]) * (gy - c_[1])) / den
            l2 = ((c_[1] - a_[1]) * (gx - c_[0]) + (a_[0] - c_[0]) * (gy - c_[1])) / den
            l3 = 1 - l1 - l2
            m = (l1 >= -0.01) & (l2 >= -0.01) & (l3 >= -0.01)
            if not m.any():
                continue
            vv = [vi[i] for i in ids]
            X_ = l1 * px[vv[0]] + l2 * px[vv[1]] + l3 * px[vv[2]]
            Y_ = l1 * py[vv[0]] + l2 * py[vv[1]] + l3 * py[vv[2]]
            fr = l1 * front[vv[0]] + l2 * front[vv[1]] + l3 * front[vv[2]]
            col = _sample(photo, X_, Y_)
            fm = _sample(face[..., None], X_, Y_)[..., 0]
            wgt = (fr * fm) * m
            acc[y0:y1, x0:x1] += col * wgt[..., None]
            wacc[y0:y1, x0:x1] += wgt
    has = wacc > 1e-4
    photo_tex = np.where(has[..., None], acc / np.maximum(wacc, 1e-4)[..., None], out)
    alpha = np.clip(wacc, 0, 1)
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(8))).astype(np.float32) / 255
    if match_body:
        # teint du corps (et du reste de la tête) calé sur le visage projeté : même médiane par canal sous le visage →
        # aucune différence de teint entre le visage et le cou / les oreilles / le crâne
        reg_ = alpha > 0.85
        if reg_.sum() > 500:
            ratio = np.median(photo_tex[reg_], 0) / np.maximum(np.median(out[reg_], 0), 1e-3)
            out = np.clip(out * np.clip(ratio, 0.6, 1.6)[None, None, :], 0, 1)
    out = out * (1 - alpha[..., None]) + photo_tex * alpha[..., None]
    # la photo est une image éclairée, pas un albédo : on la ramène au niveau des textures de peau (≈ −15 %),
    # sinon le visage « brûle » sous la lumière du studio
    out = out * 0.85
    # peaux claires : la photo très lumineuse « brûle » au rendu → luminance du visage plafonnée à celle d'une peau
    # claire de référence (0,55), sans toucher aux peaux plus foncées
    reg = alpha > 0.5
    if reg.any():
        lum = float(np.median(out[reg] @ np.array([0.3, 0.59, 0.11])))
        if lum > 0.52:
            out = out * (0.52 / lum)
    colors = {'skin': skin_rgb.round(4).tolist(), 'iris': iris_rgb.round(4).tolist(), 'hair': hair_rgb.round(4).tolist(),
              'hairline_k': hairline_k, 'hairline_r': locals().get('hairline_r'), 'bald': bald, 'hair_thickness': round(thick, 3), 'exposure_gain': round(gain, 3)}
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)), colors


def hair_volume(lm, segp, ident, S, obj):
    from face_art import landmarks as _lmk, canonical as _can
    W, H = lm['width'], lm['height']
    seg = np.asarray(Image.open(segp).resize((W, H), Image.NEAREST))
    hair = seg == 1
    pose = ident['pose']
    s_, R, t = pose['s'], np.array(pose['R']), np.array(pose['t'])
    Q = _can(S, _lmk(obj, S, B.group_verts))
    head = np.array([v for v in set(B.group_verts(obj, 'body')) if Q[v, 1] > 7.6 and Q[v, 2] > -1.2])
    proj = (S[head] @ R.T) * s_ + t
    px, py = proj[:, 0], -proj[:, 1]
    top, side = [], []
    for xc in np.arange(-0.7, 0.71, 0.1):
        m = np.abs(Q[head, 0] - xc) < 0.05
        if m.sum() < 3:
            continue
        sk_y = py[m].min()
        col = int(round(px[m][np.argmin(py[m])]))
        if not (0 <= col < W):
            continue
        rows = np.where(hair[:int(max(sk_y, 0)) + 1, col])[0]
        th = (sk_y - rows.min()) / s_ if len(rows) else 0.0
        top.append([round(float(xc), 2), round(float(np.clip(th, 0, 0.9)), 3)])
    for yc in np.arange(7.9, 8.95, 0.1):
        m = np.abs(Q[head, 1] - yc) < 0.05
        if m.sum() < 3:
            continue
        row = int(round(py[m].mean()))
        if not (0 <= row < H):
            continue
        out = []
        for sgn in (-1, 1):
            sk_x = (px[m].max() if sgn > 0 else px[m].min())
            cols = np.where(hair[row])[0]
            cols = cols[(cols - sk_x) * sgn > -2]
            th = ((cols.max() - sk_x) if sgn > 0 else (sk_x - cols.min())) / s_ if len(cols) else 0.0
            out.append(round(float(np.clip(th, 0, 0.6)), 3))
        side.append([round(float(yc), 2)] + out)
    return {'hair_top': top, 'hair_side': side}


def make_identity(src, photo, lm_photo_json, bind_npz, lm_neutral_json, out_dir, adjust=None, cfg=None):
    """Photo → identity.json + face.png (texture de peau personnalisée).
    cfg : configuration de la base (None = héros masculin B.CONFIG ; femme = persons.selfie_config) — la base neutre
    (bind_npz / lm_neutral_json) doit avoir été rendue avec la MÊME configuration (render_neutral(..., cfg=cfg))."""
    os.makedirs(out_dir, exist_ok=True)
    lm = json.load(open(lm_photo_json))
    if not lm.get('found'):
        raise SystemExit('aucun visage détecté sur ' + photo)
    binding = bind_landmarks(lm_neutral_json, bind_npz)
    ident, S, obj = fit_identity(src, lm, binding, seg_path=photo + '.seg.png', adjust=adjust, cfg=cfg)
    ident['adjust'] = adjust or {}
    cfg = cfg or B.CONFIG
    ident['base'] = {'gender': cfg['base'].get('gender', 'male'), 'race': cfg['base']['race']}
    skin = B.read_mhmat(os.path.join(src, cfg['skin']['mhmat']))
    skin_im = B.load_rgb(os.path.join(skin['_dir'], skin['diffuseTexture']), cfg['skin']['size'])
    tex, colors = bake_face(src, photo, lm, ident, S, obj, skin_im, cfg=cfg, binding=binding)
    tex.save(os.path.join(out_dir, 'face.png'))
    # ligne de cheveux de la personne → repère canonique du visage (utilisé par la coupe 3D et le cuir chevelu peint)
    # volume de la coiffure lu sur la photo : épaisseur des cheveux au-dessus du crâne (par position gauche-droite)
    # et sur les côtés (par hauteur), en dm, dans le repère canonique du visage
    segp = photo + '.seg.png'
    if os.path.exists(segp) and not colors.get('bald'):
        try:
            colors.update(hair_volume(lm, segp, ident, S, obj))
        except Exception as e:
            print('volume des cheveux non mesuré :', e)
    k = colors.get('hairline_k')
    if k is not None:
        from face_art import landmarks as _lmk, canonical as _can
        refs, wts, ok = binding
        Q = _can(S, _lmk(obj, S, B.group_verts))
        y9 = float((Q[refs[9], 1] * wts[9]).sum())
        y152 = float((Q[refs[152], 1] * wts[152]).sum())
        r_ = colors.get('hairline_r')
        if r_ is not None:
            colors['hairline_y'] = round(y9 + float(np.clip(r_, 0.3, 1.2)) * (y9 - y152), 3)
    ident.update({'photo': os.path.abspath(photo), 'colors': colors, 'face_texture': 'face.png',
                  'expression': {k: v for k, v in lm.get('blendshapes', {}).items() if v > 0.3}})
    json.dump(ident, open(os.path.join(out_dir, 'identity.json'), 'w'), indent=1)
    print('identité', out_dir, 'erreur moyenne', ident['err_mm'], 'mm', 'cibles', len(ident['targets']))
    return ident


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'neutral':
        render_neutral(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == 'identity':
        make_identity(*sys.argv[2:8])
