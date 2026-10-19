"""
FITAIA — accessoires générés sur l'avatar posé (dm) : lunettes fines, petites créoles, montre de sport.

Chaque accessoire est dessiné dans le repère canonique de la tête (face_art.canonical) ou autour des os du bras,
puis placé sur l'avatar posé. Sortie : {nom: (sommets, triangles, normales, matière)}.
"""
import numpy as np

from face_art import smooth  # noqa: F401  (même famille d'outils)


def _norm(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


def tube(path, radius, sides=10, closed=False, up=None):
    """Tube de section circulaire le long d'une polyligne (N×3) → (V, F)."""
    path = np.asarray(path, float)
    n = len(path)
    if closed:
        T = _norm(np.roll(path, -1, 0) - np.roll(path, 1, 0))
    else:
        T = _norm(np.gradient(path, axis=0))
    ref = np.array([0.0, 1.0, 0.0]) if up is None else np.asarray(up, float)
    B1 = _norm(np.cross(T, ref) + 1e-9)
    # transport parallèle simple pour éviter les torsions
    for i in range(1, n):
        b = B1[i - 1] - T[i] * (B1[i - 1] @ T[i])
        B1[i] = b / max(np.linalg.norm(b), 1e-9)
    B2 = np.cross(T, B1)
    a = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    r = np.broadcast_to(np.asarray(radius, float), (n,))
    V = path[:, None, :] + (np.cos(a)[None, :, None] * B1[:, None, :] + np.sin(a)[None, :, None] * B2[:, None, :]) * r[:, None, None]
    V = V.reshape(-1, 3)
    F = []
    segs = n if closed else n - 1
    for i in range(segs):
        j = (i + 1) % n
        for k in range(sides):
            k2 = (k + 1) % sides
            a0, a1, b0, b1 = i * sides + k, i * sides + k2, j * sides + k, j * sides + k2
            F += [[a0, b0, b1], [a0, b1, a1]]
    if not closed:   # bouchons
        c0 = len(V)
        V = np.vstack([V, path[0], path[-1]])
        for k in range(sides):
            k2 = (k + 1) % sides
            F.append([c0, k2, k])
            F.append([c0 + 1, (n - 1) * sides + k, (n - 1) * sides + k2])
    return V, np.array(F, dtype=np.int64)


def vnormals(V, F):
    n = np.zeros_like(V)
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    for k in range(3):
        np.add.at(n, F[:, k], fn)
    return _norm(n)


def merge(parts):
    V, F, off = [], [], 0
    for v, f in parts:
        V.append(v)
        F.append(f + off)
        off += len(v)
    return np.vstack(V), np.vstack(F)


def rounded_rect(cx, cy, w, h, r, n=64):
    """Contour d'un rectangle arrondi (2D), sens trigonométrique."""
    pts = []
    corners = [(cx + w / 2 - r, cy + h / 2 - r, 0), (cx - w / 2 + r, cy + h / 2 - r, 90), (cx - w / 2 + r, cy - h / 2 + r, 180), (cx + w / 2 - r, cy - h / 2 + r, 270)]
    per = n // 4
    for (x, y, a0) in corners:
        for t in np.linspace(0, 90, per, endpoint=False):
            a = np.radians(a0 + t)
            pts.append((x + r * np.cos(a), y + r * np.sin(a)))
    return np.array(pts)


class HeadFrame:
    def __init__(self, obj, shape, skel, group_verts):
        import groom
        self.b = groom.Body(obj, shape, skel, group_verts)

    def c2w(self, Q):
        b = self.b
        Q = np.atleast_2d(Q)
        R = np.empty_like(Q)
        R[:, 0] = Q[:, 0] / b.sx
        R[:, 1] = b.lm['eye_y'] + (Q[:, 1] - 8.16) / b.sy
        R[:, 2] = Q[:, 2] - b.dz
        return R @ b.Rh.T + b.Gh[:3, 3]


def glasses(obj, shape, skel, group_verts, o):
    hf = HeadFrame(obj, shape, skel, group_verts)
    Q = hf.b.Q
    body = np.array(group_verts(obj, 'body'))
    Qb = Q[body]
    # repères canoniques : arête du nez, yeux, largeur aux tempes, haut de l'oreille
    le = Q[group_verts(obj, 'joint-l-eye')].mean(0)
    bridge = Qb[(np.abs(Qb[:, 0]) < 0.06) & (Qb[:, 1] > 8.08) & (Qb[:, 1] < 8.2)]
    zb = bridge[:, 2].max() if len(bridge) else 1.35
    # largeur aux tempes DEVANT l'oreille (l'oreille dépasse : ne pas la compter) et du crâne au-dessus de l'oreille
    temple = Qb[(Qb[:, 1] > 8.1) & (Qb[:, 1] < 8.3) & (Qb[:, 2] > 0.65) & (Qb[:, 2] < 0.95)]
    hw = np.abs(temple[:, 0]).max() if len(temple) else 0.72
    skull = Qb[(Qb[:, 1] > 8.1) & (Qb[:, 1] < 8.3) & (Qb[:, 2] > 0.1) & (Qb[:, 2] < 0.25)]
    sw = np.abs(skull[:, 0]).max() if len(skull) else hw + 0.03
    ear = Qb[(np.abs(Qb[:, 0]) > hw - 0.12) & (Qb[:, 1] > 7.95) & (Qb[:, 1] < 8.3) & (Qb[:, 2] < 0.45) & (Qb[:, 2] > -0.1)]
    ear_z = float(np.median(ear[:, 2])) if len(ear) else 0.15
    ex = abs(le[0])
    w, h = o.get('lens_w', 0.46), o.get('lens_h', 0.30)
    cy = le[1] + 0.015
    zf = zb + 0.03                                             # plan de la face avant (posée sur l'arête du nez)
    wrap = 0.06                                                # légère courbure de la face (verres un peu inclinés)
    parts = []
    lens_parts = []
    for s in (1, -1):
        cx = s * (ex + 0.025)
        ring = rounded_rect(cx, cy, w, h, o.get('corner', 0.13))
        z = zf - wrap * ((ring[:, 0] - 0.0) / (ex + w / 2)) ** 2
        rim = np.c_[ring, z]
        parts.append(tube(hf.c2w(rim), o.get('rim', 0.013), 8, closed=True))
        # verre : disque plat (triangles en éventail)
        cen = np.array([[cx, cy, z.mean()]])
        Vl = hf.c2w(np.vstack([cen, rim]))
        Fl = np.array([[0, 1 + k, 1 + (k + 1) % len(rim)] for k in range(len(rim))])
        lens_parts.append((Vl, Fl))
        # tenon : du bord du cercle jusqu'à la largeur du visage (la monture a la largeur de la tête, pas plus)
        edge = np.array([s * (ex + 0.025 + w / 2 - 0.01), cy + 0.06, zf - wrap])
        hx = max(ex + 0.025 + w / 2, hw - 0.01)
        hinge = np.array([s * hx, cy + 0.06, zf - wrap - 0.05])
        parts.append(tube(hf.c2w(np.linspace(edge, hinge, 8)), o.get('rim', 0.013), 6))
        # branche : de la charnière vers l'oreille, droite et plaquée contre la tempe, posée sur la racine de l'oreille
        mid = np.array([s * (hw + 0.02), cy + 0.05, 0.65])
        earp = np.array([s * (sw + 0.015), cy + 0.05, 0.28])
        tip = np.array([s * (sw - 0.01), cy - 0.14, 0.02])
        arm = np.array([hinge, hinge * 0.6 + mid * 0.4, mid, earp, earp * 0.6 + tip * 0.4, tip])
        t = np.linspace(0, 1, 30)
        # Catmull-Rom grossier : interpolation linéaire puis lissage
        P = np.array([np.interp(t * (len(arm) - 1), np.arange(len(arm)), arm[:, k]) for k in range(3)]).T
        for _ in range(4):
            P[1:-1] = 0.25 * P[:-2] + 0.5 * P[1:-1] + 0.25 * P[2:]
        parts.append(tube(hf.c2w(P), o.get('arm', 0.011), 6))
    # pont : arc au-dessus de l'arête du nez
    t = np.linspace(-1, 1, 16)
    bx = (ex + 0.025 - w / 2 + 0.01) * t
    by = cy + 0.07 + 0.03 * (1 - t ** 2)
    bz = zf + 0.005 * (1 - t ** 2)
    parts.append(tube(hf.c2w(np.c_[bx, by, bz]), o.get('rim', 0.013) * 0.9, 6))
    V, F = merge(parts)
    Vl, Fl = merge(lens_parts)
    frame = {'color': o.get('color', [0.025, 0.025, 0.028]), 'rough': 0.32, 'metal': 0.0}
    lens = {'color': [0.92, 0.94, 0.95], 'rough': 0.03, 'metal': 0.0, 'lens': True}
    return {'glasses': (V, F, vnormals(V, F), frame), 'glasses_lens': (Vl, Fl, vnormals(Vl, Fl), lens)}


def earrings(obj, shape, skel, group_verts, o):
    hf = HeadFrame(obj, shape, skel, group_verts)
    Q = hf.b.Q
    body = np.array(group_verts(obj, 'body'))
    Qb = Q[body]
    parts = []
    for s in (1, -1):
        e = Qb[(Qb[:, 0] * s > 0.62) & (Qb[:, 1] > 7.5) & (Qb[:, 1] < 8.0) & (Qb[:, 2] > -0.15) & (Qb[:, 2] < 0.5)]
        if not len(e):
            continue
        lobe = e[np.argmin(e[:, 1])].copy()
        lobe[1] += 0.035
        lobe[0] += s * 0.005
        r = o.get('radius', 0.075)
        a = np.linspace(0, 2 * np.pi, 40, endpoint=False)
        # anneau dans le plan (bas, avant) qui traverse le lobe
        ring = np.c_[np.full_like(a, lobe[0] + s * 0.012), lobe[1] - r + r * np.cos(a), lobe[2] + 0.01 + r * np.sin(a)]
        parts.append(tube(hf.c2w(ring), o.get('wire', 0.009), 8, closed=True))
    V, F = merge(parts)
    return {'earrings': (V, F, vnormals(V, F), {'color': [0.93, 0.74, 0.40], 'rough': 0.22, 'metal': 1.0})}


def watch(obj, shape, skel, group_verts, posed0, o):
    side = o.get('side', 'l')
    k1, k2 = skel.bones.index(f'lowerarm_{side}'), skel.bones.index(f'hand_{side}')
    a = (skel.G[k1] @ np.append(skel.heads[f'lowerarm_{side}'], 1))[:3]
    b = (skel.G[k2] @ np.append(skel.heads[f'hand_{side}'], 1))[:3]
    ax = _norm(b - a)
    c = b - ax * 0.32                                          # 3 cm au-dessus du poignet
    body = np.array(group_verts(obj, 'body'))
    P = posed0[body]
    rel = P - c
    along = rel @ ax
    perp = rel - along[:, None] * ax
    rr = np.linalg.norm(perp, axis=1)
    m = (np.abs(along) < 0.12) & (rr < 0.6)
    rad = np.percentile(rr[m], 90) + 0.025 if m.any() else 0.3
    # dessus du poignet : direction perpendiculaire à l'axe, vers le dos de la main (≈ extérieur du bras)
    up = np.array([1.0 if side == 'l' else -1.0, 0.0, 0.0])
    up = _norm(up - ax * (up @ ax))
    side_v = np.cross(ax, up)
    t = np.linspace(0, 2 * np.pi, 48, endpoint=False)
    bandw = 0.2
    parts = []
    for off in np.linspace(-bandw / 2, bandw / 2, 3):
        ring = c + ax * off + (np.cos(t)[:, None] * up + np.sin(t)[:, None] * side_v) * (rad * (1.03 if off == 0 else 1.0))
        parts.append(tube(ring, 0.03, 6, closed=True))
    band = merge(parts)
    # boîtier : disque épais sur le dessus
    cc = c + up * (rad + 0.03)
    t2 = np.linspace(0, 2 * np.pi, 32, endpoint=False)
    rim = cc + (np.cos(t2)[:, None] * ax + np.sin(t2)[:, None] * side_v) * 0.17
    case = tube(rim, 0.035, 8, closed=True)
    top = np.vstack([cc + up * 0.03, rim + up * 0.03])
    Ft = np.array([[0, 1 + k, 1 + (k + 1) % len(rim)] for k in range(len(rim))])
    V, F = merge([band, case, (top, Ft)])
    return {'watch': (V, F, vnormals(V, F), {'color': [0.03, 0.03, 0.035], 'rough': 0.45, 'metal': 0.0})}


def make(acc, obj, shape, skel, posed0, group_verts):
    kind = acc['kind'] if isinstance(acc, dict) else acc
    o = acc if isinstance(acc, dict) else {}
    if kind == 'glasses':
        return glasses(obj, shape, skel, group_verts, o)
    if kind == 'earrings':
        return earrings(obj, shape, skel, group_verts, o)
    if kind == 'watch':
        return watch(obj, shape, skel, group_verts, posed0, o)
    return {}
