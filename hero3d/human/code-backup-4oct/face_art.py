"""
FITAIA — direction artistique du visage (texture de peau), 100 % procédural, sans logiciel externe.

Les zones sont définies sur la surface 3D du corps (coordonnées MakeHuman au repos, en dm) puis projetées dans
la texture par les UV du mesh. Ce qu'on peint :
  - barbe de trois jours (moustache, menton, joues basses, favoris, dessous de mâchoire) : grain de poils réel ;
  - dégradé « fade » sur les côtés et la nuque (coupe moderne) : les cheveux courts sont peints sur le crâne ;
  - sourcils plus denses sous les sourcils 3D ;
  - lèvres plus définies, rougeurs naturelles (nez, pommettes, oreilles), cernes très légers ;
  - variations de teint basse fréquence (casse l'effet « peau en plastique »).
"""
import numpy as np
from PIL import Image, ImageFilter


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def ellipse(P, c, r, soft=0.35):
    d = np.sqrt((((P - np.array(c)) / np.array(r)) ** 2).sum(1))
    return 1 - smooth(1 - soft, 1 + soft, d)


# repères du visage de référence (yeux, menton, bout du nez) : les zones sont dessinées dans ce repère,
# puis suivent automatiquement toute nouvelle forme de visage
REF = {'eye_y': 8.16, 'eye_x': 0.295, 'chin_y': 7.21, 'nose_z': 1.73}


def canonical(P, lm):
    """Ramène les positions dans le repère du visage de référence (mise à l'échelle par repères)."""
    Q = P.copy()
    sy = (REF['eye_y'] - REF['chin_y']) / max(lm['eye_y'] - lm['chin_y'], 1e-6)
    sx = REF['eye_x'] / max(lm['eye_x'], 1e-6)
    Q[:, 1] = REF['eye_y'] + (P[:, 1] - lm['eye_y']) * sy
    Q[:, 0] = P[:, 0] * sx
    Q[:, 2] = P[:, 2] + (REF['nose_z'] - lm['nose_z'])
    return Q


def landmarks(obj, shape, group_verts):
    le = shape[group_verts(obj, 'joint-l-eye')].mean(0)
    re = shape[group_verts(obj, 'joint-r-eye')].mean(0)
    ch = shape[group_verts(obj, 'joint-jaw')].mean(0)
    body = np.array(group_verts(obj, 'body'))
    hb = body[shape[body, 1] > le[1] - 1.2]
    return {'eye_y': float((le[1] + re[1]) / 2), 'eye_x': float(abs(le[0] - re[0]) / 2), 'chin_y': float(ch[1]),
            'nose_z': float(shape[hb, 2].max())}


def zones(P):
    """Valeurs par sommet (0..1) pour chaque zone, à partir des positions au repos (dm, z vers l'avant)."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)
    head = (y > 6.6)
    # ---- barbe de trois jours
    top = 7.63 + 0.52 * smooth(0.22, 0.74, ax)              # limite haute : sous le nez → pommettes → favoris
    beard = smooth(top + 0.04, top - 0.08, y)                # sous la limite
    beard *= smooth(-0.05, 0.35, z)                          # pas derrière l'oreille
    # limite basse : ligne de mâchoire sur les côtés, un peu sous le menton devant (cou dégagé)
    lo = 6.98 + 0.32 * smooth(0.22, 0.62, ax) * smooth(1.1, 0.6, z)
    beard *= smooth(lo - 0.05, lo + 0.1, y)
    beard *= 1 - ellipse(P[:, :2], (0, 7.485), (0.255, 0.085), 0.3) * smooth(1.0, 1.25, z)   # pas sur les lèvres
    nose = smooth(1.45, 1.6, z) * smooth(7.6, 7.66, y)
    beard *= 1 - nose
    # moustache moins dense au milieu des joues (aspect naturel)
    cheek_fade = 1 - 0.45 * ellipse(np.c_[ax, y], (0.5, 7.78), (0.22, 0.16), 0.6)
    beard *= cheek_fade
    beard *= head | (y > 6.75)
    beard *= 1 - smooth(0.45, 0.65, ax) * smooth(0.8, 0.6, z) * smooth(7.6, 7.8, y)   # pas sur les oreilles (favoris devant)
    # ---- coupe fade : côtés et nuque (le dessus est couvert par la mèche 3D)
    side = smooth(0.62, 0.78, ax) * smooth(8.05, 8.3, y) * smooth(0.75, 0.45, z)
    nape = smooth(0.35, 0.05, z) * smooth(7.25, 7.6, y)
    crown = smooth(8.55, 8.8, y) * smooth(1.05, 0.75, z)
    scalp = np.clip(np.maximum(np.maximum(side, nape), crown), 0, 1)
    scalp *= 1 - smooth(0.66, 0.8, ax) * smooth(8.42, 8.28, y) * smooth(0.1, 0.35, z) * smooth(0.95, 0.75, z)   # oreille dégagée
    # dégradé : plus dense en haut, s'efface vers le bas (tondeuse)
    fade = smooth(7.25, 8.35, y)
    # ---- sourcils (sous la carte 3D) : arc légèrement tombant vers l'extérieur
    brow = np.zeros(len(P))
    for s in (1, -1):
        c = (0.33 * s, 8.29, 1.22)
        e = ellipse(np.c_[x, y + 0.06 * smooth(0.25, 0.55, ax)], (c[0], c[1]), (0.23, 0.05), 0.5)
        brow = np.maximum(brow, e * smooth(0.95, 1.15, z))
    # ---- lèvres
    lips = ellipse(P[:, :2], (0, 7.485), (0.24, 0.072), 0.4) * smooth(1.2, 1.38, z)
    # ---- rougeurs
    red = np.maximum.reduce([
        ellipse(P, (0, 7.72, 1.7), (0.16, 0.14, 0.2), 0.6),            # bout du nez
        ellipse(np.c_[ax, y, z], (0.5, 7.86, 1.1), (0.2, 0.15, 0.3), 0.7) * 0.7,   # pommettes
        smooth(0.74, 0.86, ax) * smooth(7.7, 7.85, y) * smooth(8.45, 8.3, y) * 0.8,  # oreilles
    ])
    # ---- ligne de cils (paupière supérieure) : donne de la profondeur au regard
    lash = np.zeros(len(P))
    for s_ in (1, -1):
        e = ellipse(np.c_[x, y], (0.3 * s_, 8.20), (0.15, 0.022), 0.6) * smooth(1.0, 1.2, z)
        lash = np.maximum(lash, e)
    # ---- cernes très légers
    under = np.zeros(len(P))
    for s in (1, -1):
        under = np.maximum(under, ellipse(P[:, :2], (0.3 * s, 8.07), (0.16, 0.05), 0.6) * smooth(1.1, 1.25, z))
    # zone des cheveux de la coupe générée (peinte dessous → ligne de cheveux douce, sans bord de polygones)
    from hair_shell import hair_profile
    hz, _ = hair_profile(P)
    # zone T (front, arête et bout du nez, menton) : peau plus brillante ; joues plus mates
    tz = np.maximum.reduce([
        ellipse(np.c_[x, y, z], (0, 8.62, 1.05), (0.42, 0.28, 0.5), 0.6),          # front
        ellipse(np.c_[x, y, z], (0, 7.95, 1.6), (0.12, 0.32, 0.35), 0.6),          # arête du nez
        ellipse(np.c_[x, y, z], (0, 7.18, 1.25), (0.22, 0.14, 0.35), 0.6) * 0.6,   # menton
    ])
    # ---- pores (densité / profondeur du micro-relief) : nez > joues > menton, front > reste du visage > corps ;
    # aucun sur les lèvres, très peu sur les paupières (là : ridules fines)
    pores = np.maximum.reduce([
        np.full(len(P), 0.22) + 0.13 * head,
        ellipse(np.c_[x, y, z], (0, 7.82, 1.6), (0.26, 0.32, 0.45), 0.6),                     # nez
        ellipse(np.c_[ax, y, z], (0.45, 7.78, 1.15), (0.3, 0.26, 0.45), 0.7) * 0.8,          # joues
        ellipse(np.c_[x, y, z], (0, 8.62, 1.05), (0.5, 0.3, 0.5), 0.6) * 0.55,               # front
        ellipse(np.c_[x, y, z], (0, 7.2, 1.2), (0.26, 0.16, 0.4), 0.6) * 0.6,                # menton
    ])
    lids = np.zeros(len(P))
    for s_ in (1, -1):
        lids = np.maximum(lids, ellipse(np.c_[x, y], (0.3 * s_, 8.17), (0.2, 0.1), 0.5) * smooth(0.95, 1.15, z))
    pores = pores * (1 - lips) * (1 - 0.7 * lids)
    return {'hair': hz * head, 'beard': beard * head, 'scalp': scalp * fade * head, 'brow': brow, 'lips': lips, 'red': red * head,
            'under': under, 'lash': lash, 'tzone': tz * head, 'crown': crown * fade * head, 'pores': pores, 'lids': lids * head}


def sculpt(obj, shape, group_verts, brow=0.035, jaw=0.03):
    """Retouches de sculpture absentes des cibles MakeHuman (dm) : arcade sourcilière avancée (ombre sur les yeux),
    angle de mâchoire plus net. Renvoie un delta à ajouter à la forme de base."""
    lm = landmarks(obj, shape, group_verts)
    Q = canonical(shape, lm)
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    ax = np.abs(x)
    d = np.zeros_like(shape)
    face = (y > 6.8).astype(float)
    # arcade : bande au-dessus des yeux, vers l'avant
    arc = np.exp(-((y - 8.34) / 0.09) ** 2) * smooth(0.62, 0.15, ax) * smooth(0.9, 1.15, z)
    d[:, 2] += brow * arc * face
    # angle de mâchoire : vers l'extérieur et un peu vers le bas
    ang = np.exp(-(((y - 7.32) / 0.14) ** 2 + ((z - 0.75) / 0.25) ** 2)) * smooth(0.45, 0.7, ax)
    d[:, 0] += jaw * ang * np.sign(x) * face
    return d


def rasterize(values, faces, vt, size):
    """Peint des valeurs par sommet dans l'espace UV (interpolation barycentrique)."""
    img = np.zeros((size, size), np.float32)
    hit = np.zeros((size, size), np.float32)
    for f in faces:
        vi = [a for a, _ in f]
        if max(values[vi]) <= 1e-3:
            continue
        ti = [b for _, b in f]
        for k in range(1, len(f) - 1):
            ids = [0, k, k + 1]
            uv = np.array([vt[ti[i]] for i in ids]) * (size - 1)
            uv[:, 1] = (size - 1) - uv[:, 1]
            val = np.array([values[vi[i]] for i in ids])
            x0, y0 = np.floor(uv.min(0)).astype(int)
            x1, y1 = np.ceil(uv.max(0)).astype(int) + 1
            x0, y0 = max(x0, 0), max(y0, 0)
            x1, y1 = min(x1, size), min(y1, size)
            if x1 <= x0 or y1 <= y0:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
            a, b, c = uv
            den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(den) < 1e-9:
                continue
            l1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / den
            l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / den
            l3 = 1 - l1 - l2
            m = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
            v = l1 * val[0] + l2 * val[1] + l3 * val[2]
            sub = img[y0:y1, x0:x1]
            sub[m] = np.maximum(sub[m], v[m])
            hit[y0:y1, x0:x1][m] = 1
    return img


def _blur(a, r):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255


def paint_skin(skin_im, obj, shape, body_faces, opts=None, group_verts=None):
    o = {'hair': 0.0, 'beard': 0.3, 'scalp': 0.7, 'brow': 0.5, 'lips': 0.35, 'red': 0.14, 'under': 0.07, 'mottle': 0.035,
         'beard_color': (0.10, 0.085, 0.08), 'seed': 7}
    o.update(opts or {})
    W = skin_im.size[0]
    base = np.asarray(skin_im.convert('RGB')).astype(np.float32) / 255
    zs = zones(canonical(shape, landmarks(obj, shape, group_verts)) if group_verts else shape)
    M = {}
    for k, v in zs.items():
        m = rasterize(v.astype(np.float32), body_faces, obj.vt, W // 2)
        m = _blur(m, 3.0)
        M[k] = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((W, W), Image.BILINEAR)).astype(np.float32) / 255
    rng = np.random.default_rng(o['seed'])
    # grain de poils très fin (1 px à 2048 ≈ 0,2 mm) : la barbe de 3 jours se lit comme une ombre, pas comme des taches
    grain = rng.random((W, W)).astype(np.float32)
    dots = _blur((grain > 0.5).astype(np.float32), 0.45)
    if o.get('stubble_soft'):
        # barbe de 3 jours vue en photo : ombre douce, grain fin et peu contrasté (pas de « sable » sur les joues)
        dots = np.clip(0.55 + 0.45 * _blur((grain > 0.62).astype(np.float32), 0.7) * 1.6, 0, 1)
    hair_col = np.array(o['beard_color'], np.float32)
    out = base.copy()

    def lay(mask, strength, color, tex=None):
        nonlocal out
        a = np.clip(mask * strength * (tex if tex is not None else 1.0), 0, 1)[..., None]
        out = out * (1 - a) + color * a

    # teint : désaturé un peu, moins orangé ; marbrures basse fréquence
    lum = out.mean(2, keepdims=True)
    out = out * 0.88 + lum * 0.12
    low = _blur(rng.random((W // 16, W // 16)).astype(np.float32), 1.5)
    low = np.asarray(Image.fromarray((low * 255).astype(np.uint8)).resize((W, W), Image.BICUBIC)).astype(np.float32) / 255
    out = out * (1 + (low[..., None] - 0.5) * o['mottle'] * np.array([1.2, 0.8, 0.8]))
    # rougeurs, cernes
    lay(M['red'], o['red'], np.array([0.72, 0.36, 0.33]))
    lay(M['under'], o['under'], np.array([0.42, 0.30, 0.32]))
    # lèvres : teinte plus profonde, légère texture
    lay(M['lips'], o['lips'], np.array(o.get('lips_color', (0.55, 0.37, 0.34))))   # lèvres moins roses (−30 % de saturation)
    # ombre bleutée de la barbe rasée (sous-couche) + poils
    lay(M['beard'], o['beard'] * 0.55, np.array([0.36, 0.33, 0.34]))   # ombre gris-bleu de la peau rasée
    lay(M['beard'], o['beard'], hair_col, dots)
    if o.get('scalp_crown', 1.0) < 1.0:
        # sommet du crâne non peint en « tondeuse » (il est sous la coiffure ; visible seulement à la raie)
        M['scalp'] = np.clip(M['scalp'] - (1 - o['scalp_crown']) * M['crown'], 0, 1)
    # coupe fade
    lay(M['scalp'], o['scalp'] * o.get('scalp_tone', 0.55), np.array([0.30, 0.24, 0.20]))
    lay(M['scalp'], o['scalp'], hair_col * 0.9, np.clip(dots * 1.4, 0, 1))
    # cuir chevelu sous la coupe : cheveux peints, bord progressif
    if o.get('hair', 0):
        lay(M['hair'], o['hair'] * 0.8, np.array(o.get('hair_color', (0.15, 0.105, 0.07)), np.float32))
        lay(M['hair'], o['hair'], np.array(o.get('hair_color', (0.15, 0.105, 0.07)), np.float32) * 0.7, np.clip(dots * 1.3, 0, 1))
    # zones supplémentaires (ex. cuir chevelu sous une coiffure en mèches) : valeurs par sommet, force, couleur
    for vals, k, col in o.get('extra', []):
        m = rasterize(np.asarray(vals, np.float32), body_faces, obj.vt, W // 2)
        m = _blur(m, 3.0)
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((W, W), Image.BILINEAR)).astype(np.float32) / 255
        c = np.array(col, np.float32)
        lay(m, k * 0.8, c)
        lay(m, k, c * 0.75, np.clip(dots * 1.3, 0, 1))
    # ligne de cils : trait sombre et doux au ras de la paupière
    lay(M['lash'], o.get('lash', 0.55), np.array([0.12, 0.08, 0.07]))
    # sourcils
    lay(M['brow'], o['brow'], hair_col * 0.9, np.clip(0.4 + dots, 0, 1))
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)), M


def roughness_map(M, size=1024, body=0.56):
    """Carte de rugosité de la peau (niveaux de gris = rugosité) à partir des zones peintes : zone T et lèvres plus
    brillantes, joues et barbe plus mates. Utilisée par les rendus Cycles (et lisible par n'importe quel moteur PBR)."""
    W = M['tzone'].shape[0]
    r = np.full((W, W), body, np.float32)
    r = r - 0.13 * M['tzone']
    r = r - 0.16 * M['lips']
    r = r + 0.06 * M['beard']
    r = r + 0.08 * M['scalp']
    r = r + 0.04 * M['red']
    rng = np.random.default_rng(3)
    low = _blur(rng.random((W // 32, W // 32)).astype(np.float32), 1.0)
    low = np.asarray(Image.fromarray((low * 255).astype(np.uint8)).resize((W, W), Image.BICUBIC)).astype(np.float32) / 255
    r = r + (low - 0.5) * 0.08
    im = Image.fromarray((np.clip(r, 0, 1) * 255).astype(np.uint8), 'L')
    return im.resize((size, size), Image.BILINEAR)


def detail_map(M, size=1024):
    """Carte des zones de détail de la peau pour le rendu (blender/skin_hd.py) : R = pores (densité / profondeur),
    G = lèvres, B = rougeurs (nez, pommettes, oreilles) ; A = paupières (ridules fines)."""
    ch = [np.clip(M[k], 0, 1) for k in ('pores', 'lips', 'red', 'lids')]
    im = Image.fromarray((np.stack(ch, -1) * 255).astype(np.uint8), 'RGBA')
    return im.resize((size, size), Image.BILINEAR)


def weight_lock(obj, shape, group_verts):
    """Masque (0..1) par sommet : là où la graisse / le muscle ont le droit de déformer la tête.
    Verrouillés (0) : nez, yeux et paupières, front, crâne, oreilles, lèvres. Libres (1) : joues, bajoues, contour
    mandibulaire, sous-menton, cou. → les morphs de poids ne changent jamais l'identité."""
    Q = canonical(shape, landmarks(obj, shape, group_verts))
    x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    ax = np.abs(x)
    head = smooth(6.85, 7.15, y)                      # au-dessous : cou et corps, libres
    lower = smooth(8.0, 7.75, y)                      # bas du visage (sous les pommettes)
    nose = smooth(0.32, 0.18, ax) * smooth(1.15, 1.3, z) * smooth(7.5, 7.62, y)
    lips = ellipse(np.c_[x, y], (0, 7.49), (0.3, 0.1), 0.5) * smooth(1.05, 1.2, z)
    ears = smooth(0.66, 0.76, ax) * smooth(7.55, 7.7, y) * smooth(0.95, 0.75, z)
    free = lower * (1 - nose) * (1 - 0.8 * lips) * (1 - ears)
    return (1 - head) + head * free
