"""
FITAIA — coiffure « en mèches » (strands) pour les rendus hors temps réel (portraits sociaux, planches).

Pourquoi : une coiffure en cartes ou en coquilles se lit comme un « casque » en gros plan. Ici chaque cheveu est une
courbe (40 000 à 90 000 courbes) qui pousse sur le cuir chevelu de l'avatar, suit le crâne puis tombe sous la gravité,
avec collisions sur la tête, le cou, les épaules et le buste, mèches (clumping), frisure et désordre naturels.
Blender (Cycles, Principled Hair BSDF) les rend comme de vrais cheveux.

Le GLB temps réel garde sa coiffure (cartes / coquilles) ; le rendu hors ligne utilise ce fichier de mèches du MÊME avatar
(même coupe, même couleur, même tête) : <avatar>.hair.npz, coordonnées du GLB (mètres, y vers le haut).

Styles : crop (court / dégradé / coupe du héros), long, milong, ponytail, curly ; barbes : stubble (peinte), short, full.
Repère : MakeHuman en dm. Le « canonique » (face_art.canonical) normalise la tête (yeux y=8,16, menton 7,21, nez z=1,73).
"""
import os

import numpy as np
from scipy.spatial import cKDTree

from face_art import smooth, canonical, landmarks


def _norm(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


def _tri_faces(obj, group_verts, mask_fn=None):
    faces = [[vi for vi, _ in f] for f, g in zip(obj.faces, obj.groups) if g == 'body']
    tris = []
    for f in faces:
        for k in range(1, len(f) - 1):
            tris.append((f[0], f[k], f[k + 1]))
    return np.array(tris, dtype=np.int64)


def _vnormals(P, tris):
    n = np.zeros_like(P)
    fn = np.cross(P[tris[:, 1]] - P[tris[:, 0]], P[tris[:, 2]] - P[tris[:, 0]])
    for k in range(3):
        np.add.at(n, tris[:, k], fn)
    return _norm(n)


class Body:
    """Corps posé (dm) : positions, normales, repère canonique de la tête, distance signée approchée."""

    def __init__(self, obj, shape, skel, group_verts):
        self.obj, self.shape, self.skel = obj, shape, skel
        self.tris = _tri_faces(obj, group_verts)
        used = np.unique(self.tris)
        self.posed = skel.apply(shape)
        self.nrm = _vnormals(self.posed, self.tris)
        self.lm = landmarks(obj, shape, group_verts)
        self.Q = canonical(shape, self.lm)                     # canonique au repos (par sommet)
        hi = skel.bones.index('head')
        self.Gh = skel.G[hi]
        self.Rh = self.Gh[:3, :3]
        self.Gh_inv = np.linalg.inv(self.Gh)
        lm = self.lm
        self.sy = (8.16 - 7.21) / max(lm['eye_y'] - lm['chin_y'], 1e-6)
        self.sx = 0.295 / max(lm['eye_x'], 1e-6)
        self.dz = 1.73 - lm['nose_z']
        # obstacle : haut du corps (tête, cou, buste, bras) — les cheveux longs reposent sur les épaules et le dos
        ytop = self.posed[used, 1].max()
        keep = used[self.posed[used, 1] > ytop - 7.5]
        self.cv = keep
        self.tree = cKDTree(self.posed[keep])
        Qk = self.Q[keep]
        self.is_head = (Qk[:, 1] > 7.05)
        self.chin_posed = self.posed[group_verts(obj, 'joint-jaw')].mean(0)

    def to_canon(self, P):
        """positions posées → repère canonique de la tête (au repos)."""
        R = (P - self.Gh[:3, 3]) @ np.linalg.inv(self.Rh).T
        Q = R.copy()
        Q[:, 1] = 8.16 + (R[:, 1] - self.lm['eye_y']) * self.sy
        Q[:, 0] = R[:, 0] * self.sx
        Q[:, 2] = R[:, 2] + self.dz
        return Q

    def hdir(self, v):
        """direction exprimée dans le repère de la tête → monde posé."""
        return v @ self.Rh.T

    def sdist(self, P):
        d, i = self.tree.query(P)
        v = self.cv[i]
        n = self.nrm[v]
        sd = ((P - self.posed[v]) * n).sum(1)
        return sd, n, self.is_head[i]

    def collide(self, P, off_head, off_body=0.14):
        """repousse les points à l'extérieur du corps (décalage : volume des cheveux sur la tête, épaisseur du t-shirt ailleurs)."""
        for _ in range(2):
            sd, n, hd = self.sdist(P)
            off = np.where(hd, off_head, off_body)
            push = np.maximum(off - sd, 0.0)
            # seulement si on est réellement près de la surface (évite les sauts à travers le corps)
            push = np.where(sd > -0.6, push, 0.0)
            P = P + n * push[:, None]
        return P


def sample_roots(body, weight, n, rng, gamma=1.0):
    """Racines sur la surface (au repos) proportionnellement à aire × poids(sommet) → (indices tri, barycentriques)."""
    t = body.tris
    S = body.shape
    a = 0.5 * np.linalg.norm(np.cross(S[t[:, 1]] - S[t[:, 0]], S[t[:, 2]] - S[t[:, 0]]), axis=1)
    w = weight[t].mean(1) ** gamma
    p = a * w
    keep = p > 1e-9
    idx = np.where(keep)[0]
    p = p[idx] / p[idx].sum()
    ti = idx[rng.choice(len(idx), size=n, p=p)]
    r1, r2 = rng.random(n), rng.random(n)
    s1 = np.sqrt(r1)
    bary = np.stack([1 - s1, s1 * (1 - r2), s1 * r2], 1)
    # rejet doux selon le poids exact au point (bord de la zone : densité qui diminue → ligne de cheveux naturelle)
    wv = (weight[t[ti]] * bary).sum(1)
    ok = rng.random(n) < np.clip(wv, 0, 1) ** 0.7
    return ti[ok], bary[ok]


def at(body, ti, bary, X):
    return (X[body.tris[ti]] * bary[..., None]).sum(1)


# ---------------------------------------------------------------------------------------------
# Zones (canonique)
# ---------------------------------------------------------------------------------------------
def scalp_zone(Q, hairline=8.64, temple=0.10, nape_y=7.45, side_y=8.05, ear_clear=True, widows=0.0):
    """Cuir chevelu complet (pour cheveux longs / coupe) : ligne frontale, tempes, nuque, oreilles dégagées."""
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    ax = np.abs(x)
    front = hairline + 0.05 * smooth(0.0, 0.25, ax) - temple * smooth(0.3, 0.55, ax) + 0.02 * np.sin(x * 23.0) * np.cos(x * 9.0) - widows * np.exp(-(x / 0.08) ** 2)
    fz = smooth(0.55, 0.95, z)
    top = (fz * smooth(front - 0.03, front + 0.05, y) + (1 - fz) * smooth(side_y, side_y + 0.2, y)) * smooth(1.75, 1.5, z)
    sides = smooth(0.56, 0.68, ax) * smooth(side_y - 0.05, side_y + 0.2, y) * smooth(1.08, 0.88, z)
    nape = smooth(0.3, 0.0, z) * smooth(nape_y, nape_y + 0.3, y)
    zone = np.clip(np.maximum.reduce([top, sides, nape]), 0, 1)
    if ear_clear:
        zone *= 1 - smooth(0.66, 0.8, ax) * smooth(8.42, 8.28, y) * smooth(0.1, 0.35, z) * smooth(0.95, 0.75, z)
    zone *= (y > 7.0)
    return zone


def beard_zone(Q, kind='full'):
    """Zone de barbe (moustache, menton, joues basses, favoris, dessous de mâchoire)."""
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    ax = np.abs(x)
    top = 7.63 + (0.42 if kind == 'full' else 0.36) * smooth(0.22, 0.74, ax) - (0.06 if kind == 'full' else 0.0) * np.exp(-((ax - 0.5) / 0.15) ** 2)
    b = smooth(top + 0.06, top - 0.14, y) * smooth(-0.05, 0.35, z)
    lo = 6.98 + 0.32 * smooth(0.22, 0.62, ax) * smooth(1.1, 0.6, z)
    b *= smooth(lo - 0.05, lo + 0.1, y)
    lip = np.exp(-((x / 0.27) ** 2 + ((y - 7.485) / 0.075) ** 2) ** 2) * smooth(1.0, 1.25, z)
    b *= 1 - lip
    b *= 1 - smooth(1.45, 1.6, z) * smooth(7.6, 7.66, y)                     # pas sur le nez
    b *= 1 - 0.55 * np.exp(-(((ax - 0.5) / 0.2) ** 2 + ((y - 7.8) / 0.14) ** 2))   # joues hautes plus clairsemées
    b *= 1 - smooth(0.45, 0.65, ax) * smooth(0.8, 0.6, z) * smooth(7.6, 7.8, y)   # pas sur les oreilles
    b *= (y > 6.75) & (y < 8.3)
    return np.clip(b, 0, 1)


# ---------------------------------------------------------------------------------------------
# Croissance (intégration vectorisée de toutes les mèches)
# ---------------------------------------------------------------------------------------------
def grow(body, roots, nrm, length, nseg, field, off_head, inertia=0.55, lift=0.35, guard=None, rng=None):
    """roots, nrm (N×3, posé), length (N,) dm. field(P, i, D) → direction désirée (N×3). Retourne (N, nseg+1, 3)."""
    N = len(roots)
    h = (length / nseg)[:, None]
    P = roots + nrm * 0.01
    lift = np.asarray(lift, float)
    D = _norm(nrm * (lift[:, None] if lift.ndim else lift) + field(P, 0, nrm))
    out = np.empty((N, nseg + 1, 3))
    out[:, 0] = roots
    for i in range(1, nseg + 1):
        a = field(P, i, D)
        D = _norm(D * inertia + a * (1 - inertia))
        Pn = P + D * h
        Pn = body.collide(Pn, off_head if np.ndim(off_head) == 0 else off_head)
        if guard is not None:
            Pn = guard(Pn)
        D = _norm(Pn - P + 1e-9)
        # longueur de segment conservée après collision
        Pn = P + D * h
        out[:, i] = Pn
        P = Pn
    return out


def clump(S, roots_canon, k, strength, rng, power=1.6):
    """Mèches : chaque cheveu est attiré vers le cheveu « guide » de sa mèche, de plus en plus vers la pointe."""
    N, M, _ = S.shape
    gi = rng.choice(N, size=min(k, N), replace=False)
    _, lab = cKDTree(roots_canon[gi]).query(roots_canon)
    G = S[gi[lab]]
    t = (np.arange(M) / (M - 1)) ** power
    st = strength * (0.7 + 0.6 * rng.random(N))
    return S + (G - S) * (t[None, :, None] * st[:, None, None])


def frizz(S, amp, rng, scale=1.0):
    N, M, _ = S.shape
    t = np.arange(M) / (M - 1)
    noise = rng.normal(0, 1, (N, M, 3))
    # bruit lissé le long de la mèche
    for _ in range(3):
        noise[:, 1:-1] = 0.25 * noise[:, :-2] + 0.5 * noise[:, 1:-1] + 0.25 * noise[:, 2:]
    return S + noise * amp * (t ** 1.5)[None, :, None] * scale


def curl(S, radius, period, rng, phase=None, start=0.15):
    """Frisure hélicoïdale autour du trajet de chaque mèche (période en dm de longueur de mèche)."""
    N, M, _ = S.shape
    T = _norm(np.gradient(S, axis=1))
    ref = np.array([0.0, 0.0, 1.0])
    B1 = _norm(np.cross(T, ref[None, None, :]) + 1e-6)
    B2 = np.cross(T, B1)
    seg = np.linalg.norm(np.diff(S, axis=1), axis=-1)
    s = np.concatenate([np.zeros((N, 1)), np.cumsum(seg, 1)], 1)
    L = s[:, -1:]
    ph = rng.random(N) * 2 * np.pi if phase is None else phase
    ang = 2 * np.pi * s / period[:, None] + ph[:, None]
    ramp = smooth(0.0, start, s / np.maximum(L, 1e-6))
    r = radius[:, None] * ramp
    return S + (np.cos(ang)[..., None] * B1 + np.sin(ang)[..., None] * B2) * r[..., None]


# ---------------------------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------------------------
def _common(body, zone, n, rng, gamma=1.0):
    ti, bary = sample_roots(body, zone, n, rng, gamma)
    R = at(body, ti, bary, body.posed)
    Nn = _norm(at(body, ti, bary, body.nrm))
    Qr = at(body, ti, bary, body.Q)
    return R, Nn, Qr


def style_crop(body, o, rng):
    """Coupe courte : dessus texturé (2–5 cm), côtés courts ou dégradés, nuque nette.
    o['length_map'](Q) → longueur (dm) ; o['zone'] (par sommet) facultatif."""
    zone = o.get('zone')
    if zone is None:
        zone = scalp_zone(body.Q, hairline=o.get('hairline', 8.64))
    R, Nn, Qr = _common(body, zone, o.get('count', 90000), rng)
    if o.get('side_density', 1.0) < 1.0:
        # côtés dégradés moins denses que le dessus : la peau transparaît (pas d'aplat sombre « casque »)
        # pleine densité partout où les mèches sont longues (dessus et haut des côtés), dégradé en dessous
        tq = smooth(8.2, 8.5, Qr[:, 1]) * (1 - smooth(0.6, 0.8, np.abs(Qr[:, 0]))) + smooth(8.35, 8.6, Qr[:, 1])
        dens = o['side_density'] + (1 - o['side_density']) * np.clip(np.maximum(tq, smooth(7.6, 8.4, Qr[:, 1]) * 0.6), 0, 1)
        k = rng.random(len(R)) < dens
        R, Nn, Qr = R[k], Nn[k], Qr[k]
    L = o['length_map'](Qr) * (0.75 + 0.5 * rng.random(len(R)))
    keep = L > 0.012
    for c_, r_ in o.get('exclude', []):
        # épi (tourbillon) : à cet endroit le balayage du dessus rencontre le dégradé et les mèches, vues en bout, font
        # une tache grise ; on n'y fait pas pousser de mèche (les voisines le recouvrent)
        keep &= np.linalg.norm((Qr - np.array(c_)) / np.array(r_), axis=1) > 1.0
    R, Nn, Qr, L = R[keep], Nn[keep], Qr[keep], L[keep]
    ex, ey, ez = body.hdir(np.eye(3))
    fwd = o.get('forward', 0.6)        # dessus : poussé vers l'avant (crop) ou vers l'arrière (< 0)
    sweep = o.get('sweep', 0.0)        # mèche balayée sur le côté (+ = vers la gauche de l'avatar)
    te = o.get('top_edge', (0.5, 0.75))       # bord latéral du dessus (volume et cheveux dressés en deçà)
    top = smooth(8.45, 8.8, Qr[:, 1]) * (1 - smooth(te[0], te[1], np.abs(Qr[:, 0])))
    if o.get('top_by_normal'):
        # volume et cheveux dressés seulement là où le crâne regarde vers le haut : sur les flancs, une mèche dressée
        # pointe vers l'objectif (touffe grise vue en bout)
        # dessus du crâne, ou frange au milieu du front ; pas les coins des tempes (mèches dressées vers l'objectif)
        front = smooth(0.6, 0.9, Nn @ ez) * (1 - smooth(0.22, 0.42, np.abs(Qr[:, 0])))
        nu = o.get('normal_up', (0.25, 0.7))
        top = top * np.maximum(smooth(nu[0], nu[1], Nn @ ey), front)
    side_sign = np.sign(Qr[:, 0] + 1e-6)
    # raie sur le côté : à droite de la raie, les cheveux sont peignés vers le bas du côté (sinon un « épi » se forme
    # là où le balayage change de sens, mèches vues en bout = touffe grise)
    if o.get('part') is not None:
        pm = smooth(o['part'] + 0.02, o['part'] - 0.02, Qr[:, 0])          # 1 du côté de la raie (peigné vers le bas)
        # sur la raie même, pas de cheveux indécis (ni d'un côté ni de l'autre : ils se dressent et brillent en gris)
        kp = (pm < 0.15) | (pm > 0.85)
        R, Nn, Qr, L, pm, top = R[kp], Nn[kp], Qr[kp], L[kp], pm[kp], top[kp]
        side_sign = side_sign[kp]
        sweep_s = sweep * (1 - pm) - abs(o.get('part_sweep', 0.6)) * pm
        L = L * (1 - 0.3 * pm)
    else:
        pm = np.zeros(len(Qr))
        sweep_s = np.full(len(Qr), sweep)
    lie = top * pm                                                             # couchés à plat (pas d'aile)

    def field(P, i, D):
        # dessus : vers l'avant (ou balayé) et un peu dressé ; côtés : couchés vers le bas et l'arrière (tondeuse)
        sd, n, hd = body.sdist(P)
        a_top = ez[None, :] * (fwd * (1 - pm) + 0.15 * pm)[:, None] + ex[None, :] * sweep_s[:, None] + ey[None, :] * (0.15 - 0.6 * pm)[:, None]
        a_side = -ey[None, :] * 0.85 - ez[None, :] * 0.4 + ex[None, :] * side_sign[:, None] * 0.05
        a = a_top * top[:, None] + a_side * (1 - top[:, None])
        a = a + rng.normal(0, 1, a.shape) * (o.get('mess', 0.3) * (o.get('side_mess', 0.35) + (1 - o.get('side_mess', 0.35)) * top))[:, None]
        tang = a - n * (a * n).sum(1, keepdims=True)
        # le dessus garde un peu de volume (s'écarte du crâne), les côtés restent plaqués
        return _norm(_norm(tang) + n * (o.get('volume', 0.18) * top * (1 - pm) - o.get('side_flat', 0.12) * (1 - top) - 0.12 * lie)[:, None])

    off = 0.012
    lift = o.get('lift', 0.9) * top * (1 - 0.75 * pm) + o.get('side_lift', 0.25) * (1 - top)
    S = grow(body, R, Nn, L, o.get('segments', 7), field, off, inertia=0.45, lift=lift)
    # mèches marquées sur le dessus, cheveux courts des côtés à peine regroupés (sinon « rubans » plats)
    S = clump(S, Qr, int(len(S) / 18), o.get('clump', 0.55) * (o.get('side_clump', 1.0) + (1 - o.get('side_clump', 1.0)) * top), rng)
    S = frizz(S, o.get('frizz', 0.004), rng)
    if o.get('smooth_iters'):
        # mèches lissées le long du cheveu (les collisions répétées sur les tempes les rendaient « en zigzag » : reflets
        # dans tous les sens = touffe grise), puis repoussées hors du crâne
        for _ in range(o['smooth_iters']):
            S[:, 1:-1] = 0.5 * S[:, 1:-1] + 0.25 * (S[:, :-2] + S[:, 2:])
        S = body.collide(S.reshape(-1, 3), 0.01).reshape(S.shape)
    if o.get('max_out'):
        # mèches dressées (pointe loin du crâne, vue en bout = reflets gris en « épi ») retirées
        Dt = _norm(S[:, -1] - S[:, 0])
        keep = (Dt * Nn).sum(1) < o['max_out']
        S, Qr, Nn = S[keep], Qr[keep], Nn[keep]
    if o.get('max_turn'):
        T = np.diff(S, axis=1)
        c = (T[:, 1:] * T[:, :-1]).sum(-1) / np.maximum(np.linalg.norm(T[:, 1:], axis=-1) * np.linalg.norm(T[:, :-1], axis=-1), 1e-9)
        turn = np.arccos(np.clip(c, -1, 1)).sum(1)
        ok = turn < o['max_turn']
        S, Qr = S[ok], Qr[ok]
    return S, Qr, zone


def _face_guard(body, xclear=0.8):
    """Les mèches ne passent jamais devant le visage : écartées latéralement de l'ovale du visage."""
    def g(P):
        Q = body.to_canon(P)
        x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
        inside = (z > 0.2) & (y > 6.95) & (y < 8.62)
        need = xclear * (0.85 + 0.15 * smooth(7.0, 7.9, y))
        bad = inside & (np.abs(x) < need)
        if bad.any():
            Q2 = Q.copy()
            sgn = np.sign(x[bad] + 1e-6)
            Q2[bad, 0] = sgn * need[bad]
            # reconversion vers le monde (inverse de to_canon)
            Rr = Q2.copy()
            Rr[:, 0] = Q2[:, 0] / body.sx
            Rr[:, 1] = body.lm['eye_y'] + (Q2[:, 1] - 8.16) / body.sy
            Rr[:, 2] = Q2[:, 2] - body.dz
            W = Rr @ body.Rh.T + body.Gh[:3, 3]
            P = P.copy()
            P[bad] = W[bad]
        return P
    return g


def style_long(body, o, rng):
    """Cheveux longs / mi-longs, raie au milieu ou sur le côté : suivent le crâne (champ projeté sur la surface),
    se détachent sous la ligne des oreilles, tombent sous la gravité et reposent sur les épaules / le dos."""
    zone = scalp_zone(body.Q, hairline=o.get('hairline', 8.68), temple=0.06, nape_y=7.3, side_y=7.95)
    R, Nn, Qr = _common(body, zone, o.get('count', 80000), rng)
    N = len(R)
    part = o.get('part', 0.0)
    s = np.sign(Qr[:, 0] - part + rng.normal(0, 0.02, N))
    ex, ey, ez = body.hdir(np.eye(3))
    g = np.array([0.0, -1.0, 0.0])
    L = o['length'] * (0.85 + 0.25 * rng.random(N))
    # le dessus et l'avant forment la couche extérieure (volume) ; la nuque reste dessous
    layer = smooth(7.6, 9.0, Qr[:, 1])
    off = o.get('volume', 0.10) * (0.3 + 0.8 * layer) + 0.015 * rng.random(N)
    front_side = (Qr[:, 2] > o.get('front_z', 0.55)) & (np.abs(Qr[:, 0]) > 0.25) & (rng.random(N) < o.get('front_frac', 0.5))
    bias = np.where(front_side, 1.0, -1.0) * o.get('fb_bias', 0.6)
    frontroot = smooth(0.6, 1.2, Qr[:, 2])
    k_sh = body.skel.bones.index('upperarm_l')
    shoulder_y = (body.skel.G[k_sh] @ np.append(body.skel.heads['upperarm_l'], 1))[1]
    release = o.get('release', 7.9)          # sous cette hauteur (canonique), la mèche quitte le crâne
    neck_x = (body.skel.G[body.skel.bones.index('neck_01')] @ np.append(body.skel.heads['neck_01'], 1))[0]

    clear = o.get('face_clear', 0.8) + rng.random(N) * 0.12      # dégagement du visage propre à chaque mèche (pas de « visière »)

    def field(P, i, D):
        Q = body.to_canon(P)
        sd, n, hd = body.sdist(P)
        onhead = smooth(release - 0.25, release + 0.15, Q[:, 1]) * hd
        # répulsion douce de l'ovale du visage : la mèche contourne la joue au lieu d'être plaquée sur un plan
        face = (Q[:, 2] > 0.15) * smooth(6.9, 7.1, Q[:, 1]) * smooth(8.7, 8.5, Q[:, 1])
        need = clear * (0.85 + 0.15 * smooth(7.0, 7.9, Q[:, 1]))
        push = face * np.clip((need - np.abs(Q[:, 0])) / 0.12, 0, 1)
        lat = ex[None, :] * (np.sign(Q[:, 0] + 1e-6) * push * 1.5)[:, None]
        # sur le crâne : direction voulue projetée sur la surface (la mèche épouse la tête) + légère adhérence
        # raie : la mèche part sur le côté depuis la raie, descend ; les mèches du front contournent la tempe (pas vers l'arrière)
        want = ex[None, :] * (s * (0.35 + 0.85 * smooth(8.5, 9.2, Q[:, 1])) * (0.6 + 0.6 * frontroot))[:, None] - ey[None, :] * 1.0 \
            - ez[None, :] * (0.12 + 0.1 * (1 - frontroot))[:, None]
        tang = want - n * (want * n).sum(1, keepdims=True)
        a_head = _norm(tang) - n * 0.25
        # chute : gravité ; à hauteur des épaules, la mèche passe devant ou derrière l'épaule
        band = np.exp(-((P[:, 1] - shoulder_y - 0.25) / 0.6) ** 2)
        inward = -np.sign(P[:, 0] - neck_x) * smooth(0.6, 1.1, np.abs(P[:, 0] - neck_x))
        a_fall = g[None, :] + ez[None, :] * (bias * band)[:, None] + np.array([1.0, 0, 0])[None, :] * (0.45 * inward * band)[:, None]
        a = a_head * onhead[:, None] + a_fall * (1 - onhead[:, None]) + lat
        return _norm(a)

    S = grow(body, R, Nn, L, o.get('segments', 42), field, off, inertia=0.5, lift=0.3, guard=_face_guard(body, o.get('face_clear', 0.8) * 0.9))
    S = clump(S, Qr, int(N / o.get('per_clump', 60)), o.get('clump', 0.22), rng)
    if o.get('wave'):
        S = curl(S, np.full(N, o['wave'] * (0.6 + 0.8 * rng.random(N))), np.full(N, o.get('wave_period', 1.0)) * (0.8 + 0.4 * rng.random(N)), rng, start=0.35)
    S = frizz(S, o.get('frizz', 0.01), rng)
    # repasse de collision (les étapes ci-dessus peuvent replonger dans le corps)
    flat = S.reshape(-1, 3)
    offs = np.repeat(off, S.shape[1])
    flat = body.collide(flat, offs * 0.8)
    S = flat.reshape(S.shape)
    S = _face_guard(body, o.get('face_clear', 0.8) * 0.9)(S.reshape(-1, 3)).reshape(S.shape)
    return S, Qr, zone


def style_ponytail(body, o, rng):
    """Queue de cheval : cheveux tirés vers l'élastique (près du crâne), puis queue qui tombe derrière la tête."""
    zone = scalp_zone(body.Q, hairline=o.get('hairline', 8.7), temple=0.05, nape_y=7.35, side_y=7.95)
    R, Nn, Qr = _common(body, zone, o.get('count', 55000), rng)
    N = len(R)
    ex, ey, ez = body.hdir(np.eye(3))
    # point d'attache (canonique) → monde
    tq = np.array(o.get('tie', [0.0, 8.66, -0.5]))
    def c2w(q):
        r = np.array([q[0] / body.sx, body.lm['eye_y'] + (q[1] - 8.16) / body.sy, q[2] - body.dz])
        return r @ body.Rh.T + body.Gh[:3, 3]
    T = c2w(tq)
    # 1) du cuir chevelu à l'élastique : plaqué sur le crâne (décalage faible)
    nseg1 = 18
    def f1(P, i, D):
        # tirés vers l'élastique EN GLISSANT sur le crâne (direction projetée sur la surface + adhérence)
        sd, n, hd = body.sdist(P)
        v = _norm(T[None, :] - P)
        tang = v - n * (v * n).sum(1, keepdims=True)
        near = smooth(0.35, 0.1, np.linalg.norm(T[None, :] - P, axis=1))      # près de l'élastique : on vise le point
        return _norm(_norm(tang) * (1 - near)[:, None] + v * near[:, None] - n * 0.15)
    # longueur du trajet ≈ arc sur le crâne (≈ 1,35 × la corde)
    dist = np.linalg.norm(R - T[None, :], axis=1)
    L1 = dist * 1.35
    S1 = grow(body, R, Nn, L1, nseg1, f1, 0.03, inertia=0.35, lift=0.1)
    # chaque mèche arrive sur l'anneau de l'élastique (rayon r_tie) à un angle qui dépend de sa racine
    r_tie = o.get('tie_radius', 0.13)
    axis = _norm(ez * -0.6 + ey * -0.8)       # axe de la queue à la sortie de l'élastique (vers l'arrière, puis tombe)
    b1 = _norm(np.cross(axis, ex)); b2 = np.cross(axis, b1)
    rel = R - T[None, :]
    ang = np.arctan2(rel @ b2, rel @ b1)
    rad = r_tie * np.sqrt(rng.random(N))
    ring = T[None, :] + (np.cos(ang)[:, None] * b1 + np.sin(ang)[:, None] * b2) * rad[:, None]
    # on recale la fin du tronçon 1 sur l'anneau (dernier tiers, progressivement)
    w = smooth(0.55, 1.0, np.linspace(0, 1, nseg1 + 1))[None, :, None]
    S1 = S1 * (1 - w) + ring[:, None, :] * w
    # 2) la queue : ligne centrale qui part vers l'arrière puis tombe (collisions avec la nuque et le dos)
    Lt = o.get('tail_length', 3.2)
    nseg2 = o.get('segments', 34)
    C = [T]
    d = axis.copy()
    h = Lt / nseg2
    for i in range(nseg2):
        d = _norm(d * 0.75 + np.array([0.0, -1.0, 0.0]) * 0.25)
        p = C[-1] + d * h
        p = body.collide(p[None, :], 0.25, 0.25)[0]
        d = _norm(p - C[-1])
        C.append(C[-1] + d * h)
    C = np.array(C)
    # section : s'évase juste après l'élastique, puis s'affine vers la pointe
    t = np.linspace(0, 1, nseg2 + 1)
    width = r_tie * (1 + 2.0 * np.sin(np.pi * np.clip(t * 1.5, 0, 1)) * (1 - 0.6 * t)) * (1 - 0.5 * t ** 2)
    Lmine = (0.75 + 0.3 * rng.random(N))          # chaque cheveu n'a pas la même longueur
    S2 = np.empty((N, nseg2 + 1, 3))
    for k in range(nseg2 + 1):
        Tk = _norm(C[min(k + 1, nseg2)] - C[max(k - 1, 0)])
        u1 = _norm(np.cross(Tk, ex)); u2 = np.cross(Tk, u1)
        S2[:, k] = C[k][None, :] + (np.cos(ang)[:, None] * u1 + np.sin(ang)[:, None] * u2) * (rad / r_tie * width[k])[:, None]
    # longueurs individuelles : on « coupe » en ramenant la fin vers l'avant (rééchantillonnage)
    S2 = _truncate(S2, Lmine)
    S2 = clump(S2, Qr, int(N / 50), o.get('clump', 0.5), rng)
    if o.get('wave'):
        S2 = curl(S2, np.full(N, o['wave']), np.full(N, 1.3), rng, start=0.3)
    S2 = frizz(S2, o.get('frizz', 0.015), rng)
    S = np.concatenate([S1, S2[:, 1:]], 1)
    S1f = frizz(S1, 0.002, rng)
    S[:, :nseg1 + 1] = S1f
    extra = {'tie': (T, axis, r_tie)}
    return S, Qr, zone, extra


def _truncate(S, frac):
    """Raccourcit chaque mèche à une fraction de sa longueur (même nombre de points)."""
    N, M, _ = S.shape
    seg = np.linalg.norm(np.diff(S, axis=1), axis=-1)
    s = np.concatenate([np.zeros((N, 1)), np.cumsum(seg, 1)], 1)
    target = s[:, -1:] * frac[:, None] * np.linspace(0, 1, M)[None, :]
    out = np.empty_like(S)
    for k in range(3):
        out[..., k] = np.array([np.interp(target[j], s[j], S[j, :, k]) for j in range(N)])
    return out


def style_curly(body, o, rng):
    """Cheveux bouclés mi-longs : volume, anglaises regroupées, frisure hélicoïdale."""
    zone = scalp_zone(body.Q, hairline=o.get('hairline', 8.7), temple=0.05, nape_y=7.35, side_y=7.95)
    R, Nn, Qr = _common(body, zone, o.get('count', 45000), rng)
    N = len(R)
    ex, ey, ez = body.hdir(np.eye(3))
    L = o['length'] * (0.75 + 0.45 * rng.random(N))
    layer = smooth(7.6, 9.0, Qr[:, 1])
    off = o.get('volume', 0.25) * (0.35 + 0.75 * layer) + 0.04 * rng.random(N)
    s = np.sign(Qr[:, 0] + rng.normal(0, 0.05, N))
    frontroot = smooth(0.7, 1.2, Qr[:, 2])

    def field(P, i, D):
        Q = body.to_canon(P)
        onhead = smooth(7.6, 8.3, Q[:, 1])
        a_head = ex[None, :] * (s * 0.5)[:, None] - ey[None, :] * 0.8 - ez[None, :] * (0.6 * frontroot + 0.1)[:, None]
        a_fall = np.array([0.0, -1.0, 0.0])[None, :] - ez[None, :] * 0.2
        a = a_head * onhead[:, None] + a_fall * (1 - onhead[:, None])
        return _norm(a)

    S = grow(body, R, Nn, L, o.get('segments', 30), field, off, inertia=0.55, lift=1.0, guard=_face_guard(body, o.get('face_clear', 0.84)))
    # anglaises : une phase et un rayon communs par boucle
    k = int(N / o.get('per_curl', 28))
    gi = rng.choice(N, size=k, replace=False)
    _, lab = cKDTree(Qr[gi]).query(Qr)
    phase = (rng.random(k) * 2 * np.pi)[lab] + rng.normal(0, 0.35, N)
    rad = (o.get('curl_radius', 0.09) * (0.7 + 0.6 * rng.random(k)))[lab] * (0.85 + 0.3 * rng.random(N))
    per = (o.get('curl_period', 0.32) * (0.8 + 0.4 * rng.random(k)))[lab]
    S = _resample(S, o.get('points', 72))
    S = curl(S, rad, per, rng, phase=phase, start=0.08)
    S = clump(S, Qr, k, 0.25, rng, power=1.0)
    S = frizz(S, o.get('frizz', 0.02), rng)
    flat = body.collide(S.reshape(-1, 3), np.repeat(off * 0.7, S.shape[1]))
    S = _face_guard(body, o.get('face_clear', 0.84))(flat).reshape(S.shape)
    return S, Qr, zone


def _resample(S, M):
    N, M0, _ = S.shape
    seg = np.linalg.norm(np.diff(S, axis=1), axis=-1)
    s = np.concatenate([np.zeros((N, 1)), np.cumsum(seg, 1)], 1)
    t = s / np.maximum(s[:, -1:], 1e-9)
    u = np.linspace(0, 1, M)
    out = np.empty((N, M, 3))
    for k in range(3):
        out[..., k] = np.array([np.interp(u, t[j], S[j, :, k]) for j in range(N)])
    return out


def style_beard(body, o, rng):
    """Barbe en poils : courte (6–12 mm) ou pleine (15–30 mm), poussée vers le bas le long du visage."""
    kind = o.get('kind', 'short')
    zone = beard_zone(body.Q, 'full' if kind == 'full' else 'short')
    R, Nn, Qr = _common(body, zone, o.get('count', 26000 if kind == 'full' else 30000), rng, gamma=2.0)
    N = len(R)
    ex, ey, ez = body.hdir(np.eye(3))
    base = o.get('length', 0.16 if kind == 'full' else 0.04)
    # plus long au menton, plus court sur les joues (taillée) et la moustache
    chin = smooth(7.4, 7.0, Qr[:, 1]) * smooth(0.55, 0.15, np.abs(Qr[:, 0]))
    mous = smooth(7.45, 7.55, Qr[:, 1]) * smooth(0.4, 0.2, np.abs(Qr[:, 0])) * smooth(1.1, 1.3, Qr[:, 2])
    cheek = smooth(7.45, 7.8, Qr[:, 1]) * (1 - mous)
    L = base * (0.65 + 0.7 * chin - 0.35 * mous - 0.35 * cheek) * (0.75 + 0.5 * rng.random(N))
    sx = np.sign(Qr[:, 0] + 1e-6)

    def field(P, i, D):
        sd, n, hd = body.sdist(P)
        a = -ey[None, :] * 1.0 + ez[None, :] * 0.1 + ex[None, :] * (sx * 0.3 * mous)[:, None]
        a = a + rng.normal(0, 0.22, a.shape)
        tang = a - n * (a * n).sum(1, keepdims=True)
        return _norm(_norm(tang) + n * o.get('puff', 0.25 if kind == 'full' else 0.08))

    S = grow(body, R, Nn, L, o.get('segments', 6 if kind == 'short' else 12), field, 0.005, inertia=0.4,
             lift=o.get('lift', 0.7 if kind == 'full' else 0.3))
    if kind == 'full':
        cr = o.get('curl', 0.025)
        S = curl(S, np.full(N, cr) * (0.5 + rng.random(N)), np.full(N, 0.18) * (0.8 + 0.4 * rng.random(N)), rng, start=0.2)
    S = clump(S, Qr, int(N / 10), 0.3, rng)
    S = frizz(S, 0.004 if kind == 'short' else 0.008, rng)
    return S, Qr, zone


def style_cards(body, o, rng):
    """Coiffure dessinée par un artiste (cartes MakeHuman CC0) convertie en VRAIES mèches : sur chaque carte, les cheveux
    peints suivent l'axe vertical de la texture → chaque ligne verticale de l'espace UV (là où la texture est opaque)
    devient une mèche 3D posée sur la carte, puis épaissie (décalage le long de la normale), regroupée en mèches,
    ébouriffée et coupée à la longueur voulue. On garde la silhouette de l'artiste, sans l'aspect « carton » des cartes."""
    from mh import Mhclo, read_mhmat
    from PIL import Image as _I
    clo = Mhclo(o['mhclo_path'])
    Wp = body.skel.proxy_weights(clo)
    P = body.skel.apply(clo.fit(body.shape), Wp)                       # cartes posées (dm)
    tris, tuv = [], []
    for f in clo.obj.faces:
        for k in range(1, len(f) - 1):
            ids = (0, k, k + 1)
            tris.append([f[i][0] for i in ids])
            tuv.append([f[i][1] for i in ids])
    tris, tuv = np.array(tris), np.array(tuv)
    UV = clo.obj.vt[tuv]                                               # (T, 3, 2)
    mat = read_mhmat(clo.material)
    alpha = np.asarray(_I.open(os.path.join(mat['_dir'], mat['diffuseTexture'])).convert('RGBA'))[..., 3].astype(np.float32) / 255
    G = 1024
    A = np.asarray(_I.fromarray((alpha * 255).astype(np.uint8)).resize((G, G), _I.BILINEAR)).astype(np.float32) / 255
    # index des triangles dans l'espace UV (grille G×G)
    tri_id = np.full((G, G), -1, np.int32)
    for t in range(len(tris)):
        uv = UV[t] * G
        x0, x1 = int(max(np.floor(uv[:, 0].min()), 0)), int(min(np.ceil(uv[:, 0].max()), G - 1))
        y0, y1 = int(max(np.floor(uv[:, 1].min()), 0)), int(min(np.ceil(uv[:, 1].max()), G - 1))
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        a_, b_, c_ = uv
        den = (b_[1] - c_[1]) * (a_[0] - c_[0]) + (c_[0] - b_[0]) * (a_[1] - c_[1])
        if abs(den) < 1e-12:
            continue
        l1 = ((b_[1] - c_[1]) * (gx - c_[0]) + (c_[0] - b_[0]) * (gy - c_[1])) / den
        l2 = ((c_[1] - a_[1]) * (gx - c_[0]) + (a_[0] - c_[0]) * (gy - c_[1])) / den
        m = (l1 >= -1e-3) & (l2 >= -1e-3) & (1 - l1 - l2 >= -1e-3)
        sub = tri_id[y0:y1 + 1, x0:x1 + 1]
        sub[m] = t
    # grille v vers le haut : ligne j ↔ v = (j + 0.5) / G ; la texture (image) a v = 1 en haut
    alpha_v = A[::-1]                                                  # alpha_v[j, i] = alpha à (u = i/G, v = j/G)
    valid = (tri_id >= 0) & (alpha_v > o.get('alpha_min', 0.35))
    # petits trous de la texture le long d'une mèche refermés (sinon une mèche s'arrête au milieu de la carte → marche)
    from scipy import ndimage as _nd
    valid = _nd.binary_closing(valid, structure=np.ones((int(o.get('gap_px', 15)), 1), bool)) & (tri_id >= 0)
    cols = valid.sum(0).astype(float)
    N = o.get('count', 60000)
    M = o.get('points', 36)
    pc = cols / cols.sum()
    ucol = rng.choice(G, size=N, p=pc)
    out, cards = [], []
    for i, ci in enumerate(ucol):
        col = valid[:, ci]
        # segments continus (du haut = racine vers le bas = pointe)
        d = np.diff(np.concatenate([[0], col.astype(np.int8), [0]]))
        starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
        lens = ends - starts
        okr = lens > 6
        if not okr.any():
            continue
        r = rng.choice(np.where(okr)[0], p=lens[okr] ** 2 / (lens[okr] ** 2).sum())     # de préférence le plus long
        j0, j1 = starts[r], ends[r] - 1
        u = (ci + rng.random()) / G
        vs = (np.linspace(j1, j0, M) + 0.5) / G                         # du haut (racine) vers le bas (pointe)
        jj = np.clip((vs * G).astype(int), 0, G - 1)
        ts = tri_id[jj, ci]
        if (ts < 0).any():
            continue
        uv = UV[ts]
        a_, b_, c_ = uv[:, 0], uv[:, 1], uv[:, 2]
        den = (b_[:, 1] - c_[:, 1]) * (a_[:, 0] - c_[:, 0]) + (c_[:, 0] - b_[:, 0]) * (a_[:, 1] - c_[:, 1])
        l1 = ((b_[:, 1] - c_[:, 1]) * (u - c_[:, 0]) + (c_[:, 0] - b_[:, 0]) * (vs - c_[:, 1])) / den
        l2 = ((c_[:, 1] - a_[:, 1]) * (u - c_[:, 0]) + (a_[:, 0] - c_[:, 0]) * (vs - c_[:, 1])) / den
        l3 = 1 - l1 - l2
        X = P[tris[ts, 0]] * l1[:, None] + P[tris[ts, 1]] * l2[:, None] + P[tris[ts, 2]] * l3[:, None]
        out.append(X)
        cards.append(ts[0])
    S = np.array(out)
    cards = np.array(cards)
    # sens racine → pointe : la racine est l'extrémité collée au crâne (certaines cartes ont l'espace UV retourné)
    sd0, _, _ = body.sdist(S[:, 0])
    sd1, _, _ = body.sdist(S[:, -1])
    flip = (sd1 < sd0 - 0.02) & (S[:, -1, 1] > S[:, 0, 1])
    S[flip] = S[flip, ::-1]
    if o.get('clear_face'):
        # visage dégagé : on retire les mèches de frange qui passent devant les yeux / le front bas (portrait social)
        Qs = body.to_canon(S.reshape(-1, 3)).reshape(S.shape)
        fx, fy0, fy1, fz = o['clear_face'] if isinstance(o['clear_face'], (list, tuple)) else (0.62, 7.3, 8.5, 0.85)
        bad = ((np.abs(Qs[..., 0]) < fx) & (Qs[..., 1] > fy0) & (Qs[..., 1] < fy1) & (Qs[..., 2] > fz)).any(1)
        S, cards = S[~bad], cards[~bad]
    N = len(S)
    # normale de la carte (pour l'épaisseur) et regroupement par carte
    tn = np.cross(P[tris[:, 1]] - P[tris[:, 0]], P[tris[:, 2]] - P[tris[:, 0]])
    tn /= np.maximum(np.linalg.norm(tn, axis=1, keepdims=True), 1e-9)
    nS = tn[cards]
    thick = o.get('thickness', 0.06)
    S = S + nS[:, None, :] * (rng.normal(0, thick / 2, N)[:, None, None] * np.linspace(0.6, 1.0, S.shape[1])[None, :, None])
    # longueur : coupe sous une hauteur donnée (mi-long = épaules) et pointes irrégulières
    cut_y = o.get('cut_y')
    if o.get('cut_below_chin') is not None:                          # longueur relative au menton (indépendante de la taille)
        cut_y = body.chin_posed[1] - o['cut_below_chin']
    if cut_y is not None:
        cy = cut_y + rng.normal(0, o.get('cut_jitter', 0.12), N)
        frac = np.ones(N)
        for k in range(N):
            below = np.where(S[k, :, 1] < cy[k])[0]
            if len(below):
                frac[k] = max(below[0] / (S.shape[1] - 1), 0.15)
        S = _truncate(S, frac)
    roots = S[:, 0]
    Qr = body.to_canon(roots)
    S = clump(S, Qr, int(N / 35), o.get('clump', 0.3), rng, power=1.3)
    if o.get('wave'):
        # ondulation douce et cohérente : la phase dépend de la position de la racine (les voisines ondulent ensemble)
        n_ = len(S)
        ph = (Qr[:, 0] * 2.2 + Qr[:, 2] * 1.6) % (2 * np.pi) + rng.normal(0, 0.35, n_)
        S = curl(S, o['wave'] * (0.75 + 0.5 * rng.random(n_)), np.full(n_, o.get('wave_period', 0.9)), rng, phase=ph,
                 start=o.get('wave_start', 0.35))
    S = frizz(S, o.get('frizz', 0.01), rng)
    # le haut des cartes ne s'enfonce jamais dans le crâne
    flat = body.collide(S.reshape(-1, 3), 0.03, 0.12)
    S = flat.reshape(S.shape)
    # cuir chevelu à teinter = là où les mèches couvrent réellement le crâne (pas au-delà : sinon bande « rasée » sur le front)
    P_ = S[:, :max(2, S.shape[1] // 3)].reshape(-1, 3)              # partie racine des mèches (pas une frange posée sur le front)
    sd, _, _ = body.sdist(P_)
    near = P_[sd < 0.06]
    zone = np.zeros(len(body.posed))
    if len(near):
        _, vi = cKDTree(body.posed[body.cv]).query(near)
        np.add.at(zone, body.cv[vi], 1.0)
    # densité lissée sur la surface (voisins à 0,15 dm), puis seuil doux, bord rentré
    tree = cKDTree(body.posed[body.cv])
    nb = tree.query_ball_point(body.posed[body.cv], 0.08)
    zc = zone[body.cv]
    zs = np.array([zc[n].mean() for n in nb])
    zone = np.zeros(len(body.posed))
    zone[body.cv] = np.clip(zs / max(np.percentile(zs[zs > 0], 60), 1e-6) if (zs > 0).any() else zs, 0, 1)
    zone = np.clip((zone - 0.5) / 0.4, 0, 1) * (body.Q[:, 1] > 7.6)
    # front et tempes : la teinte s'arrête SOUS la ligne avant des mèches (sinon bande « rasée » visible sur le front)
    if len(near):
        Qn = body.to_canon(near)
        fr = Qn[:, 2] > 0.4
        xs = np.arange(-1.0, 1.01, 0.1)
        fe = np.array([np.percentile(Qn[fr & (np.abs(Qn[:, 0] - x) < 0.07), 1], 2) if (fr & (np.abs(Qn[:, 0] - x) < 0.07)).sum() > 20 else np.nan
                       for x in xs])
        ok = ~np.isnan(fe)
        if ok.sum() > 3:
            fev = np.interp(body.Q[:, 0], xs[ok], fe[ok])
            front = body.Q[:, 2] > 0.4
            zone = np.where(front, zone * smooth(fev + 0.03, fev + 0.12, body.Q[:, 1]), zone)
    return S, Qr, zone


def brow_zone(Q, width=0.25, height=0.055, y0=8.29, x0=0.33):
    """Sourcils (canonique) : arc qui monte légèrement puis redescend vers la tempe, plus épais côté nez."""
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    ax = np.abs(x)
    t = (ax - (x0 - width)) / (2 * width)                      # 0 côté nez → 1 côté tempe
    yc = y0 + 0.035 * np.sin(np.clip(t, 0, 1) * np.pi * 0.9) - 0.05 * smooth(0.55, 1.0, t)
    hh = height * (1.15 - 0.55 * smooth(0.3, 1.0, t))          # tête du sourcil plus épaisse, queue fine
    v = smooth(1.0, 0.75, np.abs(y - yc) / hh) * smooth(-0.08, 0.06, t) * smooth(1.08, 0.92, t)
    v *= smooth(0.9, 1.1, z) * (y > 7.9) * (y < 8.6)
    return np.clip(v, 0, 1), np.clip(t, 0, 1)


def style_brows(body, o, rng):
    """Sourcils en poils (6–10 mm) couchés sur la peau : côté nez ils montent, puis s'inclinent vers la tempe."""
    zone, _ = brow_zone(body.Q, o.get('width', 0.25), o.get('height', 0.055), o.get('y0', 8.29), o.get('x0', 0.33))
    R, Nn, Qr = _common(body, zone, o.get('count', 2400), rng, gamma=1.5)
    N = len(R)
    _, t = brow_zone(Qr, o.get('width', 0.25), o.get('height', 0.055), o.get('y0', 8.29), o.get('x0', 0.33))
    ex, ey, ez = body.hdir(np.eye(3))
    sx = np.sign(Qr[:, 0] + 1e-6)
    # tête du sourcil (côté nez) : poils courts et dressés ; corps et queue : poils plus longs, couchés vers la tempe
    L = o.get('length', 0.075) * (0.8 + 0.35 * rng.random(N)) * (0.55 + 0.45 * smooth(0.0, 0.4, t)) * (1.0 - 0.25 * smooth(0.7, 1.0, t))
    up = 1.0 - smooth(0.0, 0.35, t)                              # tête : poils dressés vers le haut
    jitter = rng.normal(0, 0.18, (N, 3))

    def field(P, i, D):
        sd, n, hd = body.sdist(P)
        a = ex[None, :] * (sx * (0.35 + 0.75 * (1 - up)))[:, None] + ey[None, :] * (0.95 * up + 0.12 - 0.35 * smooth(0.6, 1.0, t))[:, None]
        a = a + jitter
        tang = a - n * (a * n).sum(1, keepdims=True)
        return _norm(_norm(tang) - n * 0.15)

    S = grow(body, R, Nn, L, o.get('segments', 5), field, 0.004, inertia=0.5, lift=0.25)
    S = clump(S, Qr, int(N / 6), 0.25, rng)
    S = frizz(S, 0.0015, rng)
    return S, Qr, zone


STYLES = {'crop': style_crop, 'long': style_long, 'milong': style_long, 'ponytail': style_ponytail, 'curly': style_curly,
          'cards': style_cards}


# ---------------------------------------------------------------------------------------------
# Couches fines (HairPipeline) : ligne frontale, favoris, barbe de quelques jours
# ---------------------------------------------------------------------------------------------
def layer_hairline(body, scalp, o, rng, flow=-0.3):
    """Cheveux fins et courts au bord de la zone (front, tempes) : la ligne de cheveux n'est plus un bord net.
    Densité maximale là où la zone passe de 0 à 1 (bord), surtout devant ; orientés comme la masse (flow < 0 : vers
    l'arrière, > 0 : vers l'avant)."""
    Q = body.Q
    edge = np.clip(4.0 * scalp * (1 - scalp), 0, 1) * smooth(0.25, 0.6, Q[:, 2]) * (Q[:, 1] > 7.9)
    R, Nn, Qr = _common(body, edge, o.get('count', 7000), rng)
    N = len(R)
    ex, ey, ez = body.hdir(np.eye(3))
    L = o.get('length', 0.045) * (0.5 + 0.8 * rng.random(N))
    jit = rng.normal(0, 0.35, (N, 3))
    sx = np.sign(Qr[:, 0] + 1e-6)

    def field(P, i, D):
        sd, n, hd = body.sdist(P)
        a = ez[None, :] * flow + ey[None, :] * 0.25 + ex[None, :] * (sx * 0.15)[:, None] + jit
        tang = a - n * (a * n).sum(1, keepdims=True)
        return _norm(_norm(tang) - n * 0.1)

    S = grow(body, R, Nn, L, 4, field, 0.004, inertia=0.5, lift=0.35)
    return frizz(S, 0.002, rng)


def layer_sideburns(body, o, rng):
    """Favoris : devant l'oreille, de la tempe à mi-oreille, poils courts peignés vers le bas."""
    Q = body.Q
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    ax = np.abs(x)
    bottom = o.get('bottom', 7.98)
    zone = smooth(0.6, 0.66, ax) * smooth(bottom - 0.03, bottom + 0.06, y) * smooth(8.45, 8.3, y) * smooth(0.2, 0.32, z) * smooth(0.8, 0.62, z)
    R, Nn, Qr = _common(body, zone, o.get('count', 3500), rng)
    N = len(R)
    ex, ey, ez = body.hdir(np.eye(3))
    L = o.get('length', 0.05) * (0.6 + 0.6 * rng.random(N))
    jit = rng.normal(0, 0.2, (N, 3))

    def field(P, i, D):
        sd, n, hd = body.sdist(P)
        a = -ey[None, :] * 0.9 - ez[None, :] * 0.25 + jit
        tang = a - n * (a * n).sum(1, keepdims=True)
        return _norm(_norm(tang) - n * 0.15)

    S = grow(body, R, Nn, L, 4, field, 0.005, inertia=0.5, lift=0.2)
    return frizz(S, 0.0015, rng), zone


def layer_stubble(body, o, rng):
    """Barbe de quelques jours en vrais poils (0,5–2 mm) : moustache, menton, joues basses, sous la mâchoire."""
    zone = beard_zone(body.Q, o.get('kind', 'full')) * o.get('density', 1.0)
    R, Nn, Qr = _common(body, np.clip(zone, 0, 1), o.get('count', 45000), rng)
    N = len(R)
    ex, ey, ez = body.hdir(np.eye(3))
    L = o.get('length', 0.012) * (0.5 + 0.9 * rng.random(N))
    jit = rng.normal(0, 0.4, (N, 3))

    def field(P, i, D):
        sd, n, hd = body.sdist(P)
        a = -ey[None, :] * 0.8 + jit
        tang = a - n * (a * n).sum(1, keepdims=True)
        return _norm(_norm(tang) + n * 0.6)

    S = grow(body, R, Nn, L, 2, field, 0.001, inertia=0.3, lift=0.6)
    return S


def hero_length_map(thickness_fn):
    """Coupe du héros : la longueur des mèches suit l'épaisseur de la coupe en coquilles (même coupe)."""
    def f(Q):
        _, t = thickness_fn(Q)
        return np.clip(t * 2.4, 0.02, 0.42)
    return f


def drop_jumpers(S, factor=2.6):
    """Écarte les rares mèches « sautées » par une collision (segment anormalement long ou retour en arrière brutal)."""
    seg = np.linalg.norm(np.diff(S, axis=1), axis=-1)
    med = np.median(seg, axis=1, keepdims=True)
    T = np.diff(S, axis=1)
    cosang = (T[:, 1:] * T[:, :-1]).sum(-1) / np.maximum(np.linalg.norm(T[:, 1:], axis=-1) * np.linalg.norm(T[:, :-1], axis=-1), 1e-9)
    bad = (seg > factor * np.maximum(med, 1e-6)).any(1) | (cosang < -0.2).any(1)
    return S[~bad], ~bad


def make(gcfg, obj, shape, skel, group_verts):
    """gcfg : {'hair': {...style...}, 'beard': {...}, 'seed': n}. Retourne mèches (dm, posé) + zones à peindre."""
    rng = np.random.default_rng(gcfg.get('seed', 11))
    body = Body(obj, shape, skel, group_verts)
    groups, paint = [], []
    h = gcfg.get('hair')
    if h:
        st = h['style']
        o = dict(h)
        if st == 'crop' and o.get('identity'):
            # identité (photo) : même zone que la coupe en coquilles (ligne de cheveux de la personne), longueur des mèches
            # tirée de l'épaisseur des cheveux mesurée sur la photo (dessus / côtés) → contour de coiffure de la photo
            import hair_shell as _hs
            zone, t0 = _hs.hair_profile(body.Q)
            o['zone'] = zone * (body.Q[:, 1] > 7.0)
            vol = _hs.VOLUME or {}
            def lmap(Q, vol=vol):
                _, t = _hs.hair_profile(Q)
                if vol.get('hair_top'):
                    tp = np.array(vol['hair_top'])
                    # cheveux plaqués (peu de volume mesuré sur la photo) : jamais un crâne nu là où la photo a des cheveux
                    t_top = np.maximum(np.interp(Q[:, 0], tp[:, 0], tp[:, 1]), 0.04)
                    if vol.get('hair_side'):
                        sd_ = np.array(vol['hair_side'])
                        t_side = np.where(Q[:, 0] > 0, np.interp(Q[:, 1], sd_[:, 0], sd_[:, 2]), np.interp(Q[:, 1], sd_[:, 0], sd_[:, 1]))
                    else:
                        t_side = t
                    up = smooth(8.2, 9.0, Q[:, 1])
                    sf, tf = o.get('side_factor', 3.0), o.get('top_factor', 3.0)
                    # côtés : mèches couchées et plaquées → longueur ≈ side_factor × épaisseur (2 pour une coupe courte)
                    t = 0.85 * (up * t_top * tf + (1 - up) * np.minimum(t_side, t_top + 0.05) * sf) / 3.0
                # épaisseur visible ≈ 1/3 de la longueur d'une mèche couchée → longueur ≈ 3 × épaisseur mesurée
                return np.clip(t * 3.0, 0.02, 1.2)
            o['length_map'] = lmap
        elif st == 'crop' and o.get('hero') and o.get('cut'):
            # coupe du héros (rendus) : « textured crop » — dessus 4–5 cm travaillé vers l'avant, côtés dégradés courts
            # (≈ 1 cm en haut → 3 mm en bas), nuque nette ; même zone que la coupe en coquilles du GLB
            from hair_shell import hair_profile
            zone, _ = hair_profile(body.Q)
            o['zone'] = zone * (body.Q[:, 1] > 7.0)
            c = o['cut']

            def lmap(Q, c=c):
                x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
                ax = np.abs(x)
                top = smooth(8.42, 8.78, y) * (1 - smooth(0.48, 0.72, ax))
                fringe = smooth(0.7, 1.15, z) * top                       # devant : un peu plus court
                crown = smooth(0.2, -0.4, z) * top                        # sommet arrière : plus court
                fade = smooth(7.55, 8.45, y)                              # dégradé : plus court vers le bas
                side = c['side_lo'] + (c['side_hi'] - c['side_lo']) * fade
                L = c['top'] * top * (1 - 0.18 * fringe - 0.3 * crown) + side * (1 - top)
                return L
            o['length_map'] = lmap
        elif st == 'crop' and o.get('hero'):
            from hair_shell import hair_profile
            zone, _ = hair_profile(body.Q)
            o['zone'] = zone * (body.Q[:, 1] > 7.0)
            o['length_map'] = hero_length_map(hair_profile)
        elif st == 'crop':
            top_len, side_len, nape_len = o.get('top', 0.35), o.get('side', 0.06), o.get('nape', 0.04)
            def lmap(Q, a=top_len, b=side_len, c=nape_len):
                top = smooth(8.4, 8.85, Q[:, 1]) * (1 - smooth(0.5, 0.75, np.abs(Q[:, 0])))
                fade = smooth(7.6, 8.45, Q[:, 1])          # dégradé : plus court vers le bas
                return a * top + (b * fade + c * (1 - fade)) * (1 - top)
            o['length_map'] = lmap
        res = STYLES[st](body, o, rng)
        S, Qr, zone = res[:3]
        S, ok = drop_jumpers(S)
        # mèches « explosées » par une collision (trop longues, droites) retirées
        Ls_ = np.linalg.norm(np.diff(S, axis=1), axis=-1).sum(1)
        S = S[Ls_ < np.percentile(Ls_, 99.5) * 1.3]
        if o.get('split_sides'):
            # cheveux courts des côtés (dégradé) dans leur propre groupe : rendus plus mats (pas de « plaque » brillante)
            Ls = np.linalg.norm(np.diff(S, axis=1), axis=-1).sum(1)
            short = Ls < o['split_sides']
            groups.append({'name': 'hair_sides', 'strands': S[short], 'radius': o.get('radius', 0.00085) * 0.9, 'tip': 0.4})
            S = S[~short]
        groups.append({'name': 'hair', 'strands': S, 'radius': o.get('radius', 0.00085), 'tip': o.get('tip', 0.25)})
        layers = gcfg.get('layers', {})
        if layers.get('hairline'):
            # couche « ligne frontale » : cheveux fins au bord de la zone (pas de bord net de perruque)
            hl = layer_hairline(body, zone, layers['hairline'], rng, flow=float(np.sign(o.get('forward', 0.3)) * 0.3))
            hl, _ = drop_jumpers(hl, 3.5)
            groups.append({'name': 'hairline', 'strands': hl, 'radius': o.get('radius', 0.00085) * 0.6, 'tip': 0.2})
        if layers.get('sideburns'):
            sb, _z = layer_sideburns(body, layers['sideburns'], rng)
            sb, _ = drop_jumpers(sb, 3.5)
            groups.append({'name': 'sideburns', 'strands': sb, 'radius': o.get('radius', 0.00085) * 0.8, 'tip': 0.3})
        if len(res) > 3 and 'tie' in res[3]:
            groups[-1]['tie'] = res[3]['tie']
        # cheveux longs : cuir chevelu peint seulement À L'INTÉRIEUR de la zone (pas de bande sombre sur la ligne frontale) ;
        # coupe courte : toute la zone (le dégradé des côtés EST de la peinture, comme une tondeuse)
        pz = np.clip(zone * 1.1, 0, 1) if st == 'crop' else zone if st == 'cards' else np.clip((zone - 0.55) / 0.45, 0, 1) ** 1.5
        if o.get('paint_top'):
            # cuir chevelu teinté sous le dessus et la ligne frontale seulement (les côtés gardent le dégradé peint)
            pz = pz * smooth(o.get('paint_from', 8.0), o.get('paint_from', 8.0) + 0.3, body.Q[:, 1])
        paint.append(('scalp', pz, o.get('scalp_paint', 0.85)))
    br = gcfg.get('brows')
    if br:
        S, Qr, zone = style_brows(body, br, rng)
        S, _ = drop_jumpers(S, 3.5)
        groups.append({'name': 'brows', 'strands': S, 'radius': br.get('radius', 0.0007), 'tip': 0.3})
        paint.append(('brows', zone, 0.0))
    st_ = (gcfg.get('layers') or {}).get('stubble')
    if st_:
        # barbe de quelques jours en vrais poils (couche « barbe » / « moustache » des rendus)
        S = layer_stubble(body, st_, rng)
        groups.append({'name': 'stubble', 'strands': S, 'radius': st_.get('radius', 0.0005), 'tip': 0.5})
    b = gcfg.get('beard')
    if b and b.get('kind') in ('short', 'full'):
        S, Qr, zone = style_beard(body, b, rng)
        S, _ = drop_jumpers(S, 3.5)
        groups.append({'name': 'beard', 'strands': S, 'radius': b.get('radius', 0.0009), 'tip': 0.35})
    return {'groups': groups, 'paint': paint, 'body': body}


def save(path, res, to_m):
    """Écrit les mèches dans les coordonnées du GLB (mètres) : <avatar>.hair.npz."""
    out = {}
    names = []
    for g in res['groups']:
        S = g['strands']
        N, M, _ = S.shape
        P = to_m(S.reshape(-1, 3)).reshape(N, M, 3).astype(np.float32)
        out[g['name'] + '_points'] = P
        r = (g['radius'] * 0.1) * (1 - (1 - g['tip']) * np.linspace(0, 1, M) ** 1.5)
        out[g['name'] + '_radius'] = r.astype(np.float32)
        if 'tie' in g:
            T, axis, r_tie = g['tie']
            out[g['name'] + '_tie'] = np.concatenate([to_m(T[None, :])[0], axis, [r_tie * 0.1]]).astype(np.float32)
        names.append(g['name'])
    out['groups'] = np.array(names)
    np.savez_compressed(path, **out)
    return path
