"""
FITAIA Human Engine — générateur du GLB prototype (100 % maison, aucune dépendance, aucune licence tierce).

Produit src/human-engine/assets/prototype-avatar.glb :
  - un humanoïde low-poly (≈ 1,78 m, pieds en y = 0, regard vers +Z), une seule primitive, une seule matière,
    couleurs par sommet (peau, short anthracite, ceinture lime, chaussures) ;
  - 3 morph targets (POSITION + NORMAL relatifs) : body_weight, belly_fat, muscle.

Le corps est construit par « balayage d'anneaux » (sweep) : chaque partie (tronc, jambes, bras, tête…) est une suite
d'anneaux super-elliptiques le long d'une courbe, fermée par deux pôles. Les morphs sont des déplacements le long
de la normale, pondérés par des zones anatomiques (fonctions lisses), ce qui garde le maillage propre.

Usage : python tools/human-engine/build_prototype_avatar.py [--out chemin.glb] [--preview]
Remplacer ce prototype par le vrai mesh FITAIA (Blender) : voir app/docs/HUMAN-ENGINE.md.
"""
import json
import math
import os
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'src', 'human-engine', 'assets', 'prototype-avatar.glb')
MORPHS = ['body_weight', 'belly_fat', 'muscle']

# ---------- petites maths ----------
def add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def mul(a, s): return (a[0] * s, a[1] * s, a[2] * s)
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def norm(a):
    l = math.sqrt(dot(a, a)) or 1.0
    return (a[0] / l, a[1] / l, a[2] / l)
def lerp(a, b, t): return a + (b - a) * t
def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
def bump(x, c, w):
    """Cloche lisse centrée en c, demi-largeur w (0 hors de [c-w, c+w])."""
    d = abs(x - c) / w
    return 0.0 if d >= 1 else (1 - d * d) ** 2

def catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)

def spline(ctrl, n):
    """Échantillonne n points sur une Catmull-Rom passant par les points de contrôle (tuples de floats)."""
    k = len(ctrl)
    pts = []
    for i in range(n):
        u = i / (n - 1) * (k - 1)
        j = min(int(u), k - 2)
        t = u - j
        p0, p1, p2, p3 = ctrl[max(j - 1, 0)], ctrl[j], ctrl[j + 1], ctrl[min(j + 2, k - 1)]
        pts.append(tuple(catmull(p0[d], p1[d], p2[d], p3[d], t) for d in range(len(p1))))
    return pts

def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def lin_u8(hexcol):
    r, g, b = int(hexcol[1:3], 16), int(hexcol[3:5], 16), int(hexcol[5:7], 16)
    return tuple(int(round(srgb_to_linear(c) * 255)) for c in (r, g, b))

SKIN = lin_u8('#C9967A')
SHORTS = lin_u8('#2A2C30')
LIME = lin_u8('#C8F03C')
SHOE = lin_u8('#1E1F22')
SOLE = lin_u8('#E8E6E1')

# ---------- maillage ----------
class Part:
    def __init__(self, name):
        self.name = name
        self.pos = []      # positions
        self.meta = []     # infos par sommet pour les morphs : dict(t=paramètre le long de la partie, ang=angle, side=±1)
        self.tris = []

def sweep(name, ctrl, segs, rings, expo=2.0, side=1, up_hint=(0.0, 0.0, 1.0)):
    """
    ctrl : liste de (x, y, z, rx, rz, cz) — centre, demi-largeurs selon les axes N et B de l'anneau, décalage avant/arrière.
    Retourne une Part fermée par deux pôles.
    """
    p = Part(name)
    samp = spline(ctrl, rings)
    centers = [(s[0], s[1], s[2] + s[5]) for s in samp]
    # repère de chaque anneau
    frames = []
    for i in range(rings):
        a = centers[max(i - 1, 0)]
        b = centers[min(i + 1, rings - 1)]
        T = norm(sub(b, a))
        B = sub(up_hint, mul(T, dot(up_hint, T)))
        if dot(B, B) < 1e-6:
            B = (1.0, 0.0, 0.0)
        B = norm(B)
        N = norm(cross(B, T))
        frames.append((T, N, B))
    e = 2.0 / expo
    for i in range(rings):
        c = centers[i]
        T, N, B = frames[i]
        rx, rz = samp[i][3], samp[i][4]
        for j in range(segs):
            th = 2 * math.pi * j / segs
            cs, sn = math.cos(th), math.sin(th)
            x = rx * math.copysign(abs(cs) ** e, cs)
            z = rz * math.copysign(abs(sn) ** e, sn)
            v = add(c, add(mul(N, x), mul(B, z)))
            p.pos.append(v)
            p.meta.append({'t': i / (rings - 1), 'ang': th, 'side': side, 'ring': i})
        if i > 0:
            o0, o1 = (i - 1) * segs, i * segs
            for j in range(segs):
                j2 = (j + 1) % segs
                p.tris.append((o0 + j, o1 + j, o1 + j2))
                p.tris.append((o0 + j, o1 + j2, o0 + j2))
    # pôles
    T0 = frames[0][0]
    T1 = frames[-1][0]
    r0 = min(samp[0][3], samp[0][4])
    r1 = min(samp[-1][3], samp[-1][4])
    s_pole = len(p.pos)
    p.pos.append(sub(centers[0], mul(T0, r0 * 0.6)))
    p.meta.append({'t': 0.0, 'ang': 0.0, 'side': side, 'ring': -1})
    e_pole = len(p.pos)
    p.pos.append(add(centers[-1], mul(T1, r1 * 0.6)))
    p.meta.append({'t': 1.0, 'ang': 0.0, 'side': side, 'ring': rings})
    last = (rings - 1) * segs
    for j in range(segs):
        j2 = (j + 1) % segs
        p.tris.append((s_pole, j2, j))
        p.tris.append((e_pole, last + j, last + j2))
    return p

def ellipsoid(name, center, rx, ry, rz, segs, rings, side=1, profile=None):
    """Ellipsoïde vertical (axe Y), avec profil optionnel f(t)->(kx, kz) pour sculpter (mâchoire, etc.)."""
    ctrl = []
    n = 9
    for k in range(n):
        t = k / (n - 1)
        a = -math.pi / 2 + math.pi * (0.04 + 0.92 * t)
        y = center[1] + ry * math.sin(a)
        r = math.cos(a)
        kx, kz, cz = profile(t) if profile else (1.0, 1.0, 0.0)
        ctrl.append((center[0], y, center[2], max(rx * r * kx, 0.004), max(rz * r * kz, 0.004), cz))
    return sweep(name, ctrl, segs, rings, 2.0, side, up_hint=(0.0, 0.0, 1.0))

def build():
    parts = []
    # --- tronc : de l'entrejambe à la base du cou (anneaux super-elliptiques) ---
    torso = [
        # x, y, z, demi-largeur, demi-profondeur, décalage avant
        (0, 0.86, 0, 0.060, 0.050, 0.000),
        (0, 0.90, 0, 0.150, 0.095, 0.000),
        (0, 0.95, 0, 0.172, 0.108, 0.000),
        (0, 1.01, 0, 0.165, 0.104, 0.002),
        (0, 1.08, 0, 0.142, 0.098, 0.006),
        (0, 1.16, 0, 0.150, 0.104, 0.008),
        (0, 1.25, 0, 0.165, 0.114, 0.010),
        (0, 1.33, 0, 0.176, 0.118, 0.008),
        (0, 1.40, 0, 0.188, 0.106, 0.000),
        (0, 1.45, 0, 0.165, 0.086, -0.006),
        (0, 1.49, 0, 0.090, 0.064, -0.008),
        (0, 1.51, 0, 0.055, 0.050, -0.008),
    ]
    parts.append(sweep('torso', torso, 28, 34, expo=2.4, up_hint=(0.0, 0.0, 1.0)))
    # --- cou ---
    neck = [(0, 1.47, -0.01, 0.050, 0.048, 0), (0, 1.53, -0.008, 0.046, 0.045, 0), (0, 1.60, 0.0, 0.044, 0.044, 0)]
    parts.append(sweep('neck', neck, 16, 6))

    # --- tête : ellipsoïde sculpté (mâchoire plus étroite, crâne un peu plus large) ---
    def head_profile(t):
        jaw = 0.72 + 0.28 * smooth(0.0, 0.42, t)
        crown = 1.0 - 0.05 * smooth(0.75, 1.0, t)
        return (jaw * crown, (0.86 + 0.14 * smooth(0.0, 0.45, t)), 0.008 * (1 - t))
    head = ellipsoid('head', (0.0, 1.685, 0.012), 0.078, 0.112, 0.098, 26, 22, profile=head_profile)
    # nez et arcades : petites bosses vers l'avant
    for i, v in enumerate(head.pos):
        x, y, z = v
        if z > 0.06:
            nose = bump(x, 0.0, 0.02) * bump(y, 1.665, 0.03) * 0.022
            brow = bump(y, 1.705, 0.012) * (1 - min(1, abs(x) / 0.06)) * 0.006
            head.pos[i] = (x, y, z + nose + brow)
    parts.append(head)

    # --- jambes ---
    for s in (-1, 1):
        leg = [
            (s * 0.088, 0.95, 0.000, 0.088, 0.092, 0.004),
            (s * 0.092, 0.82, 0.004, 0.080, 0.084, 0.006),
            (s * 0.095, 0.66, 0.006, 0.066, 0.070, 0.004),
            (s * 0.096, 0.52, 0.010, 0.050, 0.052, 0.002),
            (s * 0.097, 0.44, 0.006, 0.054, 0.058, -0.010),
            (s * 0.098, 0.33, 0.000, 0.058, 0.062, -0.018),
            (s * 0.100, 0.20, 0.000, 0.042, 0.044, -0.008),
            (s * 0.102, 0.10, 0.000, 0.032, 0.034, 0.000),
            (s * 0.103, 0.065, 0.000, 0.034, 0.036, 0.000),
        ]
        parts.append(sweep('leg', leg, 18, 30, side=s, up_hint=(0.0, 0.0, 1.0)))
        # pied : ellipsoïde allongé vers l'avant
        foot = [
            (s * 0.104, 0.045, -0.045, 0.030, 0.035, 0),
            (s * 0.106, 0.042, 0.000, 0.040, 0.040, 0),
            (s * 0.108, 0.036, 0.060, 0.042, 0.032, 0),
            (s * 0.110, 0.030, 0.110, 0.034, 0.024, 0),
            (s * 0.111, 0.026, 0.130, 0.020, 0.016, 0),
        ]
        parts.append(sweep('foot', foot, 14, 10, side=s, up_hint=(0.0, 1.0, 0.0)))

    # --- bras (légère pose en A) ---
    for s in (-1, 1):
        arm = [
            (s * 0.150, 1.405, -0.004, 0.058, 0.060, 0),
            (s * 0.204, 1.37, -0.008, 0.050, 0.052, 0),
            (s * 0.222, 1.26, -0.014, 0.044, 0.046, 0),
            (s * 0.236, 1.14, -0.018, 0.036, 0.038, 0),
            (s * 0.246, 1.06, -0.012, 0.039, 0.040, 0),
            (s * 0.258, 0.95, -0.002, 0.032, 0.034, 0),
            (s * 0.266, 0.875, 0.004, 0.025, 0.028, 0),
        ]
        parts.append(sweep('arm', arm, 14, 26, side=s, up_hint=(0.0, 0.0, 1.0)))
        hand = ellipsoid('hand', (s * 0.271, 0.812, 0.008), 0.022, 0.072, 0.040, 12, 10, side=s,
                         profile=lambda t: (1.0, 1.0 - 0.25 * smooth(0.6, 1.0, t), 0.0))
        parts.append(hand)
    return parts

def compute_normals(pos, tris):
    acc = [[0.0, 0.0, 0.0] for _ in pos]
    for a, b, c in tris:
        n = cross(sub(pos[b], pos[a]), sub(pos[c], pos[a]))
        for k in (a, b, c):
            acc[k][0] += n[0]; acc[k][1] += n[1]; acc[k][2] += n[2]
    return [norm(tuple(v)) for v in acc]

def orient_outward(part):
    """Assure des normales sortantes (inverse l'ordre des triangles si nécessaire)."""
    n = compute_normals(part.pos, part.tris)
    cx = sum(p[0] for p in part.pos) / len(part.pos)
    cy = sum(p[1] for p in part.pos) / len(part.pos)
    cz = sum(p[2] for p in part.pos) / len(part.pos)
    score = sum(dot(n[i], sub(part.pos[i], (cx, cy, cz))) for i in range(len(part.pos)))
    if score < 0:
        part.tris = [(a, c, b) for a, b, c in part.tris]

# ---------- couleurs ----------
def color_for(part, v, m):
    x, y, z = v
    if part.name == 'foot':
        return SOLE if y < 0.012 else SHOE
    if part.name == 'leg':
        if y < 0.085:
            return SHOE
        if y > 0.70:
            return SHORTS
        return SKIN
    if part.name == 'torso':
        if 1.035 <= y <= 1.06:
            return LIME
        if y < 1.035:
            return SHORTS
        return SKIN
    return SKIN

# ---------- morphs (déplacements le long de la normale, en mètres) ----------
def morph_amounts(part, v, m, n):
    x, y, z = v
    t = m['t']
    front = max(0.0, n[2])          # 1 face avant
    lateral = abs(n[0])             # 1 sur les côtés
    back = max(0.0, -n[2])
    cap = smooth(0.0, 0.12, t) * smooth(1.0, 0.88, t) if m['ring'] >= 0 else 0.0
    W = B = M = 0.0
    if part.name == 'torso':
        cap = smooth(0.86, 0.90, y) * smooth(1.51, 1.47, y)
        hips = bump(y, 0.97, 0.10)
        waist = bump(y, 1.10, 0.10)
        chest = bump(y, 1.28, 0.10)
        shoulder = bump(y, 1.41, 0.06)
        # masse globale : plateau lisse (pas de bourrelets en escalier), un peu plus aux hanches et au ventre
        plateau = smooth(0.88, 0.99, y) * smooth(1.44, 1.30, y)
        W = (0.040 * plateau + 0.010 * hips + 0.014 * shoulder * lateral) * cap
        W += 0.020 * waist * front * cap
        # ventre : avant surtout, poignées d'amour sur les côtés
        belly = bump(y, 1.07, 0.11)
        B = (0.078 * belly * (front ** 1.3) + 0.030 * bump(y, 1.02, 0.07) * lateral + 0.010 * belly * back) * cap
        # muscle : épaules, pectoraux, dorsaux, taille légèrement affinée (V)
        M = (0.034 * shoulder * (0.4 + 0.6 * lateral)
             + 0.024 * bump(y, 1.30, 0.07) * front
             + 0.016 * bump(y, 1.27, 0.08) * lateral
             + 0.012 * bump(y, 1.46, 0.04) * (1 - front)
             - 0.007 * waist) * cap
    elif part.name == 'leg':
        thigh = smooth(0.70, 0.88, y)
        W = (0.040 * thigh + 0.016 * bump(y, 0.58, 0.10) + 0.012 * bump(y, 0.33, 0.10) + 0.004 * smooth(0.25, 0.10, y)) * cap
        B = 0.012 * smooth(0.82, 0.93, y) * cap
        M = (0.013 * bump(y, 0.74, 0.14) * (0.5 + 0.5 * front) + 0.011 * bump(y, 0.33, 0.07) * (0.4 + 0.6 * back)) * cap
    elif part.name == 'arm':
        upper = 1 - smooth(0.30, 0.55, t)
        W = (0.022 * upper + 0.010 * (1 - upper)) * cap
        M = (0.022 * bump(t, 0.10, 0.14) + 0.020 * bump(t, 0.30, 0.15) * (0.5 + 0.5 * front) + 0.009 * bump(t, 0.70, 0.18)) * cap
    elif part.name == 'neck':
        W = 0.018 * cap
        M = 0.010 * cap
    elif part.name == 'head':
        lower = smooth(1.70, 1.60, y)          # bas du visage : joues, mâchoire, menton
        W = 0.012 * lower * (0.5 + 0.5 * (front + lateral) / 1.5)
    elif part.name == 'hand':
        W = 0.004
    return W, B, M

# ---------- glTF binaire ----------
def pad4(b, fill=b'\x00'):
    return b + fill * ((4 - len(b) % 4) % 4)

def write_glb(path, positions, normals, colors, indices, targets):
    nverts = len(positions)
    buf = bytearray()
    views, accessors = [], []

    def add_view(data, target=None, stride=None):
        nonlocal buf
        off = len(buf)
        buf += pad4(data)
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target:
            v['target'] = target
        if stride:
            v['byteStride'] = stride
        views.append(v)
        return len(views) - 1

    def add_vec3(vals, with_minmax=True):
        data = b''.join(struct.pack('<3f', *v) for v in vals)
        vi = add_view(data, 34962)
        acc = {'bufferView': vi, 'componentType': 5126, 'count': len(vals), 'type': 'VEC3'}
        if with_minmax:
            acc['min'] = [min(v[d] for v in vals) for d in range(3)]
            acc['max'] = [max(v[d] for v in vals) for d in range(3)]
        accessors.append(acc)
        return len(accessors) - 1

    a_pos = add_vec3(positions)
    a_nrm = add_vec3(normals, with_minmax=False)
    cdata = b''.join(struct.pack('<4B', c[0], c[1], c[2], 255) for c in colors)
    vi = add_view(cdata, 34962)
    accessors.append({'bufferView': vi, 'componentType': 5121, 'normalized': True, 'count': nverts, 'type': 'VEC4'})
    a_col = len(accessors) - 1
    big = nverts > 65535
    idata = b''.join(struct.pack('<I' if big else '<H', i) for tri in indices for i in tri)
    vi = add_view(idata, 34963)
    accessors.append({'bufferView': vi, 'componentType': 5125 if big else 5123, 'count': len(indices) * 3, 'type': 'SCALAR'})
    a_idx = len(accessors) - 1
    tgt = []
    for dp, dn in targets:
        tgt.append({'POSITION': add_vec3(dp), 'NORMAL': add_vec3(dn, with_minmax=False)})

    gltf = {
        'asset': {'version': '2.0', 'generator': 'FITAIA Human Engine prototype builder', 'copyright': 'FITAIA. Tous droits réservés.'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'name': 'FitaiaPrototypeAvatar', 'mesh': 0}],
        'meshes': [{
            'name': 'body',
            'primitives': [{'attributes': {'POSITION': a_pos, 'NORMAL': a_nrm, 'COLOR_0': a_col}, 'indices': a_idx, 'material': 0, 'targets': tgt}],
            'weights': [0.0] * len(targets),
            'extras': {'targetNames': MORPHS},
        }],
        'materials': [{'name': 'fitaia_clay', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.0, 'roughnessFactor': 0.72}}],
        'accessors': accessors,
        'bufferViews': views,
        'buffers': [{'byteLength': len(buf)}],
    }
    js = pad4(json.dumps(gltf, separators=(',', ':'), ensure_ascii=False).encode('utf-8'), b' ')
    bin_ = pad4(bytes(buf))
    total = 12 + 8 + len(js) + 8 + len(bin_)
    out = struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(bin_), b'BIN\x00') + bin_
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(out)
    return total

def main():
    out = OUT
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]
    parts = build()
    positions, normals, colors, tris = [], [], [], []
    deltas = {k: ([], []) for k in MORPHS}
    for p in parts:
        orient_outward(p)
        n = compute_normals(p.pos, p.tris)
        amounts = [morph_amounts(p, p.pos[i], p.meta[i], n[i]) for i in range(len(p.pos))]
        base = len(positions)
        for k, name in enumerate(MORPHS):
            moved = [add(p.pos[i], mul(n[i], amounts[i][k])) for i in range(len(p.pos))]
            mn = compute_normals(moved, p.tris)
            deltas[name][0].extend(sub(moved[i], p.pos[i]) for i in range(len(p.pos)))
            deltas[name][1].extend(sub(mn[i], n[i]) for i in range(len(p.pos)))
        positions.extend(p.pos)
        normals.extend(n)
        colors.extend(color_for(p, p.pos[i], p.meta[i]) for i in range(len(p.pos)))
        tris.extend((a + base, b + base, c + base) for a, b, c in p.tris)
    size = write_glb(out, positions, normals, colors, tris, [deltas[k] for k in MORPHS])
    h = max(v[1] for v in positions) - min(v[1] for v in positions)
    stats = {'fichier': os.path.relpath(out, ROOT), 'octets': size, 'sommets': len(positions), 'triangles': len(tris),
             'morphs': MORPHS, 'hauteur_m': round(h, 3), 'textures': 0, 'materiaux': 1, 'primitives': 1}
    print(json.dumps(stats, ensure_ascii=False))
    with open(os.path.join(os.path.dirname(out), 'prototype-avatar.stats.json'), 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    if '--preview' in sys.argv:
        preview(positions, normals, colors, tris, deltas)

# ---------- aperçu (rastérisation logicielle numpy) ----------
def preview(positions, normals, colors, tris, deltas):
    import numpy as np
    from PIL import Image
    P = np.array(positions, dtype=np.float64)
    N = np.array(normals, dtype=np.float64)
    C = np.array(colors, dtype=np.float64) / 255.0
    T = np.array(tris, dtype=np.int64)
    D = {k: (np.array(v[0]), np.array(v[1])) for k, v in deltas.items()}

    def render(w, yaw, size=(360, 640)):
        pos = P.copy(); nrm = N.copy()
        for k, wk in w.items():
            pos += D[k][0] * wk; nrm += D[k][1] * wk
        nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
        cy, sy = math.cos(yaw), math.sin(yaw)
        R = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
        pos = pos @ R.T; nrm = nrm @ R.T
        W, H = size
        scale = H / 2.0
        sx = W / 2 + pos[:, 0] * scale
        syy = H - 20 - pos[:, 1] * scale * 0.97
        img = np.zeros((H, W, 3)) + np.array([0.90, 0.89, 0.87])
        zb = np.full((H, W), -1e9)
        L = np.array([-0.4, 0.6, 0.7]); L /= np.linalg.norm(L)
        lin = C ** (1 / 2.2)
        shade = np.clip(nrm @ L, 0, 1) * 0.75 + 0.30
        vc = np.clip(lin * shade[:, None], 0, 1)
        for a, b, c in T:
            x0, y0, x1, y1, x2, y2 = sx[a], syy[a], sx[b], syy[b], sx[c], syy[c]
            area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
            if area >= 0:
                continue
            minx, maxx = int(max(min(x0, x1, x2), 0)), int(min(max(x0, x1, x2) + 1, W))
            miny, maxy = int(max(min(y0, y1, y2), 0)), int(min(max(y0, y1, y2) + 1, H))
            if minx >= maxx or miny >= maxy:
                continue
            xs, ys = np.meshgrid(np.arange(minx, maxx) + 0.5, np.arange(miny, maxy) + 0.5)
            w0 = ((x1 - xs) * (y2 - ys) - (x2 - xs) * (y1 - ys)) / area
            w1 = ((x2 - xs) * (y0 - ys) - (x0 - xs) * (y2 - ys)) / area
            w2 = 1 - w0 - w1
            m = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
            if not m.any():
                continue
            z = w0 * pos[a, 2] + w1 * pos[b, 2] + w2 * pos[c, 2]
            sub_z = zb[miny:maxy, minx:maxx]
            upd = m & (z > sub_z)
            sub_z[upd] = z[upd]
            col = w0[..., None] * vc[a] + w1[..., None] * vc[b] + w2[..., None] * vc[c]
            sub_img = img[miny:maxy, minx:maxx]
            sub_img[upd] = col[upd]
        return Image.fromarray((img * 255).astype('uint8'))

    states = [
        ('neutre', {}),
        ('poids 1', {'body_weight': 1.0}),
        ('ventre 1', {'belly_fat': 1.0}),
        ('muscle 1', {'muscle': 1.0}),
        ('actuel', {'body_weight': 0.65, 'belly_fat': 0.45, 'muscle': 0.30}),
        ('objectif', {'body_weight': 0.30, 'belly_fat': 0.20, 'muscle': 0.35}),
    ]
    tiles = []
    for _, w in states:
        tiles.append(render(w, 0.0))
        tiles.append(render(w, math.pi / 2))
    sheet = Image.new('RGB', (360 * 6, 640 * 2), 'white')
    for i in range(6):
        sheet.paste(tiles[2 * i], (i * 360, 0))
        sheet.paste(tiles[2 * i + 1], (i * 360, 640))
    dst = os.path.join(ROOT, 'tools', 'human-engine', 'preview.png')
    sheet.save(dst)
    print('apercu', dst)

if __name__ == '__main__':
    main()
