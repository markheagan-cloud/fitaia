"""
FITAIA — coupe de cheveux « textured crop + fade », générée (pas de carte MakeHuman).

Technique « coquilles » (fur shells) utilisée dans le jeu vidéo : 4 couches du cuir chevelu, décalées vers l'extérieur,
portant une texture de mèches de plus en plus clairsemée. Dessus : 1 à 1,5 cm de volume texturé ;
côtés et nuque : dégradé à la tondeuse (couches presque à plat + cheveux peints sur la peau, voir face_art.py).
Chaque sommet suit le sommet du crâne dont il est issu → les morphs du visage (face_fat…) déforment la coupe.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from face_art import smooth, canonical, landmarks

LAYERS = 4


HAIRLINE_FRONT = None   # ligne de cheveux de la personne (repère canonique), fixée par le constructeur
VOLUME = None           # {'hair_top': [[x, ép.]...], 'hair_side': [[y, ép. gauche, ép. droite]...]} lus sur la photo


def hair_profile(Q):
    """Q : positions canoniques. Retourne (masque de zone 0..1, épaisseur en dm)."""
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    ax = np.abs(x)
    # ligne de cheveux frontale : 8.86 au centre, golfes temporaux légers, puis tempes à 8.45
    f0 = HAIRLINE_FRONT if HAIRLINE_FRONT is not None else 8.64
    front = f0 + 0.05 * smooth(0.0, 0.25, ax) - 0.10 * smooth(0.3, 0.55, ax) + 0.025 * np.sin(x * 23.0) * np.cos(x * 9.0)   # ligne naturelle, irrégulière
    # la ligne frontale ne vaut que devant (front) ; derrière, toute la calotte au-dessus des oreilles est couverte
    fz = smooth(0.55, 0.95, z)
    on_top = (fz * smooth(front - 0.03, front + 0.05, y) + (1 - fz) * smooth(8.1, 8.3, y)) * smooth(1.75, 1.5, z)
    sides = smooth(0.56, 0.68, ax) * smooth(8.0, 8.25, y) * smooth(1.08, 0.88, z)   # tempes comprises
    nape = smooth(0.3, 0.0, z) * smooth(7.35, 7.7, y)
    zone = np.clip(np.maximum.reduce([on_top, sides, nape]), 0, 1)
    zone *= 1 - smooth(0.66, 0.8, ax) * smooth(8.42, 8.28, y) * smooth(0.1, 0.35, z) * smooth(0.95, 0.75, z)   # oreilles dégagées
    # épaisseur : volume sur le dessus (un peu plus haut à l'avant), presque rien sur les côtés (fade)
    top = smooth(8.45, 8.85, y) * (1 - smooth(0.55, 0.78, ax))
    t = 0.012 + 0.11 * top + 0.03 * smooth(8.75, 9.0, y) * smooth(0.6, 1.1, z)
    return zone, t


class HairShell:
    posed = False

    def __init__(self, obj, shape, group_verts, normals, thickness=1.0):
        lm = landmarks(obj, shape, group_verts)
        Q = canonical(shape, lm)
        zone, t = hair_profile(Q)
        t = t * thickness
        if VOLUME and VOLUME.get('hair_top'):
            # épaisseur mesurée sur la photo : dessus (selon x) et côtés (selon y), mélangés selon l'orientation
            tp = np.array(VOLUME['hair_top'])
            t_top = np.interp(Q[:, 0], tp[:, 0], tp[:, 1])
            if VOLUME.get('hair_side'):
                sd = np.array(VOLUME['hair_side'])
                tl = np.interp(Q[:, 1], sd[:, 0], sd[:, 1])
                tr = np.interp(Q[:, 1], sd[:, 0], sd[:, 2])
                t_side = np.where(Q[:, 0] > 0, tr, tl)
            else:
                t_side = t
            up = np.clip(normals[:, 1], 0, 1)
            t_meas = up * t_top + (1 - up) * np.minimum(t_side, t_top + 0.05)
            t = np.clip(0.85 * t_meas, 0.01, 0.6)
        body = set(group_verts(obj, 'body'))
        faces = [[vi for vi, _ in f] for f, g in zip(obj.faces, obj.groups) if g == 'body']
        # coquilles : dessus et haut des côtés seulement ; le bas du dégradé (favoris, nuque) reste peint
        keep = (zone > 0.5) & ((Q[:, 1] > 8.32) | (np.abs(Q[:, 0]) < 0.45))
        keep = (zone > 0.35)
        sel = [f for f in faces if sum(keep[v] for v in f) >= 2 and all(v in body for v in f)]   # bord fondu (épaisseur → 0)
        vids = sorted({v for f in sel for v in f})
        idx = {v: i for i, v in enumerate(vids)}
        rng = np.random.default_rng(3)
        # légère irrégularité du volume (mèches) : bruit doux sur l'épaisseur
        # mèches : volume irrégulier à grande échelle (pas un casque lisse)
        Pq = Q[vids]
        jitter = 1 + 0.35 * np.sin(Pq[:, 0] * 9.0 + 1.3) * np.cos(Pq[:, 2] * 7.0) + 0.2 * np.sin(Pq[:, 1] * 11.0 + Pq[:, 0] * 5.0)
        n = normals[vids]
        # cheveux coiffés vers l'arrière/le haut : la couche extérieure est légèrement poussée vers l'arrière
        back = np.array([0.0, 0.25, -0.35])
        refs, offs, uvs, fcs = [], [], [], []
        c = shape[vids].mean(0)
        # UV sphériques autour du centre du crâne : mèches dans le sens des méridiens (épi au sommet)
        rel = Q[vids] - np.array([0.0, 8.15, 0.45])
        th = np.arctan2(rel[:, 0], rel[:, 2])
        ph = np.arccos(np.clip(rel[:, 1] / np.linalg.norm(rel, axis=1), -1, 1))
        u = (th / (2 * np.pi) + 0.5)
        v = ph / np.pi
        for k in range(LAYERS):
            f = (k + 1) / LAYERS
            o = n * (0.004 + t[vids] * smooth(0.3, 0.85, zone[vids]) * jitter * f)[:, None] + back * (t[vids] * smooth(0.3, 0.85, zone[vids]) * f * f * 0.25)[:, None]
            base = len(refs)
            refs += vids
            offs.append(o)
            tile = np.array([(k % 2) * 0.5, (k // 2) * 0.5])
            uvs.append(np.c_[u * 0.5, v * 0.5] + tile)
            for fc in sel:
                fcs.append([(base + idx[a], base + idx[a]) for a in fc])
        self.refs = np.stack([np.array(refs)] * 3, 1)
        self.weights = np.tile(np.array([1.0, 0.0, 0.0]), (len(refs), 1))
        self.offsets = np.concatenate(offs)
        self.delete_verts = []
        self.material = None

        class _O:
            pass
        self.obj = _O()
        self.obj.faces = fcs
        self.obj.vt = np.concatenate(uvs)
        self.obj.vt[:, 1] = 1 - self.obj.vt[:, 1]   # le constructeur retourne v
        self.zone = zone

    def fit(self, body):
        return body[self.refs[:, 0]] + self.offsets


def shell_texture(color=(0.12, 0.085, 0.06), size=2048, seed=5):
    """Atlas 2×2 : une tuile par couche, mèches de plus en plus clairsemées vers l'extérieur (alpha)."""
    rng = np.random.default_rng(seed)
    T = size // 2
    rgba = np.zeros((size, size, 4), np.float32)
    col = np.array(color, np.float32)
    for k in range(LAYERS):
        cover = [0.95, 0.6, 0.35, 0.18][k]
        im = Image.new('L', (T, T), 0)
        lum = Image.new('L', (T, T), 0)
        d, dl = ImageDraw.Draw(im), ImageDraw.Draw(lum)
        nstr = int(T * T * cover / 45)
        xs = rng.random(nstr) * T
        ys = rng.random(nstr) * T
        L = rng.uniform(14, 34, nstr) * (1.0 if k < 2 else 0.85)
        ang = rng.normal(0, 0.18, nstr)
        sh = rng.uniform(0.0, 1.0, nstr)
        for i in range(nstr):
            x0, y0 = xs[i], ys[i]
            x1, y1 = x0 + np.sin(ang[i]) * L[i], y0 + np.cos(ang[i]) * L[i]
            d.line([(x0, y0), (x1, y1)], fill=255, width=2)
            dl.line([(x0, y0), (x1, y1)], fill=int(60 + 195 * sh[i]), width=2)
        a = np.asarray(im.filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32) / 255
        if k == 0:
            a = np.maximum(a, 0.9)          # couche intérieure : couvre le cuir chevelu
        lu = np.asarray(lum.filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255
        # mèches : variations de teinte basse fréquence (reflets)
        cl = Image.fromarray((rng.random((T // 32, T // 32)) * 255).astype(np.uint8)).resize((T, T), Image.BICUBIC)
        lu = lu * (0.6 + 0.8 * np.asarray(cl).astype(np.float32) / 255)
        c = col[None, None, :] * (0.7 + 0.6 * lu[..., None]) * (0.85 + 0.15 * k)
        oy, ox = (k // 2) * T, (k % 2) * T
        rgba[oy:oy + T, ox:ox + T, :3] = c
        rgba[oy:oy + T, ox:ox + T, 3] = a
    return Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA')
