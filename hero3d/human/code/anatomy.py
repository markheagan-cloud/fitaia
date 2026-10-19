"""
FITAIA — corrections d'anatomie absentes des cibles MakeHuman (sculpture procédurale, dm, repos).

  trapezius(...) : pente du trapèze (cou → acromion). Le mesh de base a des épaules « plates » qui font un cou de girafe
                   et des épaulettes sous le t-shirt ; le trapèze relie le cou à l'épaule en pente douce.
  sterno(...)    : relief discret des sterno-cléido-mastoïdiens (cou plus anatomique, moins « tube »).
Chaque fonction renvoie un delta (n × 3) à ajouter à la forme de base AVANT les morphs → les morphs du corps
(poids, muscle…) restent exacts, les vêtements suivent (proxies recalculés sur la forme corrigée).
"""
import numpy as np

from face_art import smooth


def _joint(obj, shape, group_verts, name):
    v = group_verts(obj, name)
    return shape[v].mean(0) if v else None


def _normals(obj, shape, group_verts):
    from build_premium_avatar import tri_from_quads, vertex_normals
    tris = np.array([[c[0] for c in t] for t in tri_from_quads([f for f, g in zip(obj.faces, obj.groups) if g == 'body'])])
    return vertex_normals(shape, tris)


def trapezius(obj, shape, group_verts, amount=0.12, back=0.04):
    """Élève la ligne cou → épaule (le haut du trapèze) : pic à ~40 % de la distance cou → acromion."""
    neck = _joint(obj, shape, group_verts, 'joint-neck')
    head = _joint(obj, shape, group_verts, 'joint-head')
    shl = _joint(obj, shape, group_verts, 'joint-l-shoulder')
    if neck is None or shl is None or head is None:
        return np.zeros_like(shape)
    body = np.zeros(len(shape), bool)
    body[group_verts(obj, 'body')] = True
    N = _normals(obj, shape, group_verts)
    x, y, z = shape[:, 0], shape[:, 1], shape[:, 2]
    ax = np.abs(x)
    half = abs(shl[0])                         # demi-largeur des épaules (centre de l'articulation)
    neck_r = 0.42 * (head[1] - neck[1]) / 1.1  # rayon du cou ≈ (dm), proportionnel à la hauteur du cou
    t = (ax - neck_r) / max(half - neck_r, 1e-6)          # 0 au bord du cou, 1 à l'épaule
    prof = smooth(-0.05, 0.25, t) * (1 - smooth(0.45, 1.0, t))
    # hauteur : du haut des épaules jusqu'à mi-cou ; surtout le dessus et l'arrière (le trapèze est dorsal)
    band = smooth(shl[1] - 0.15, shl[1] + 0.35, y) * (1 - smooth(neck[1] + 0.25, neck[1] + 0.7, y))
    up = np.clip(N[:, 1] + 0.35 * np.clip(-N[:, 2], 0, 1), 0, 1)
    front = smooth(neck[2] + 0.55, neck[2] + 0.2, z)                       # pas devant (clavicules libres)
    w = prof * band * up * front * body
    d = np.zeros_like(shape)
    d[:, 1] = amount * w
    d[:, 2] = -back * w                                                    # masse dorsale
    return d


def sterno(obj, shape, group_verts, amount=0.035):
    """Relief des sterno-cléido-mastoïdiens : de derrière l'oreille vers le haut du sternum (deux colonnes discrètes)."""
    neck = _joint(obj, shape, group_verts, 'joint-neck')
    head = _joint(obj, shape, group_verts, 'joint-head')
    if neck is None or head is None:
        return np.zeros_like(shape)
    body = np.zeros(len(shape), bool)
    body[group_verts(obj, 'body')] = True
    N = _normals(obj, shape, group_verts)
    x, y, z = shape[:, 0], shape[:, 1], shape[:, 2]
    s = np.clip((y - neck[1] + 0.2) / max(head[1] - neck[1] + 0.2, 1e-6), 0, 1)     # 0 bas du cou → 1 sous l'oreille
    # ligne du muscle : x de 0,12 (sternum) à 0,42 (mastoïde), z de l'avant vers le côté
    cx = 0.12 + 0.30 * s
    cz = neck[2] + 0.55 - 0.55 * s
    dist = np.hypot(np.abs(x) - cx, (z - cz) * 0.8)
    w = np.exp(-(dist / 0.12) ** 2) * smooth(0.0, 0.15, s) * (1 - smooth(0.8, 1.0, s)) * body
    return N * (amount * w)[:, None]


def apply(obj, shape, group_verts, cfg):
    """cfg = {'trapezius': 0.12, 'sterno': 0.035}"""
    d = np.zeros_like(shape)
    if cfg.get('trapezius'):
        d += trapezius(obj, shape, group_verts, cfg['trapezius'], cfg.get('trapezius_back', 0.04))
    if cfg.get('sterno'):
        d += sterno(obj, shape, group_verts, cfg['sterno'])
    return d
