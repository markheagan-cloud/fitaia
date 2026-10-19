"""
FITAIA — vêtements générés sur NOTRE corps (pas d'asset de générateur) : t-shirt oversize et jogging technique.

Étape 1 (ici) : découpe des zones du corps au repos (poids du squelette + hauteurs), décalage vers l'extérieur,
                bords (col, ourlet, manches, taille, chevilles) marqués pour l'épinglage → garments_in.json
Étape 2 (PC, Blender) : simulation de tissu (gravité, collision avec le corps) → plis réels → garments_out.json
Étape 3 (build_premium_avatar.py) : chaque sommet du vêtement est lié au sommet du corps le plus proche ;
                les morphs du corps (poids, ventre, muscle…) entraînent donc le vêtement.

Unités : décimètres MakeHuman ici ; mètres dans les fichiers échangés avec Blender.
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_premium_avatar as B  # noqa: E402
from mh import Obj, load_target  # noqa: E402

LOWER_ARM = ('lowerarm', 'hand', 'thumb', 'index', 'middle', 'ring', 'pinky')

GARMENTS = {
    'tee': {
        'y': (0.62, 6.9),             # ourlet droit au niveau des hanches (le tissu retombe plus bas à la simulation) → épaules
        'collar_y': 5.7, 'collar_r': 0.78,   # col rond (pas de V)
        'sleeve_t': 0.58,             # manche oversize : 58 % du bras
        'offset': lambda y, part: 0.10 + (0.05 if part == 'sleeve' else 0.0) * np.clip((5.9 - y) / 0.5, 0, 1) + 0.09 * np.clip((y - 5.5) / 0.4, 0, 1) + 0.10 * np.clip((3.6 - y) / 3.0, 0, 1),
        'pin_top': 5.3,               # col épinglé
        'ease': 1.06,                 # aisance : +6 % de tour (coupe ajustée : épaules, pectoraux, taille lisibles)
        'smooth': 14,                 # le tissu ne suit pas les creux du corps
        'pre_smooth': 8,
    },
    'jogger': {
        'y': (-6.95, 1.40),           # chevilles → taille
        'offset': lambda y, part: 0.07 + 0.13 * np.clip((1.0 - y) / 2.0, 0, 1) - 0.05 * np.clip((-5.6 - y) / 1.3, 0, 1)
                                  + 0.08 * np.exp(-((y + 0.3) / 0.8) ** 2)    # entrejambe : du tissu en plus, fourche plus basse
                                  + 0.05 * np.clip((y - 0.6) / 0.6, 0, 1),     # ceinture : jamais de peau qui dépasse
        'pin_top': 1.15,              # ceinture élastique
        'pin_bottom': -6.75,          # chevilles élastiques
        'ease': 1.24,                 # coupe jogging (pas un legging)
        'smooth': 8,
    },
}


def vertex_normals_quads(v, faces):
    n = np.zeros_like(v)
    for f in faces:
        a, b, c = v[f[0]], v[f[1]], v[f[2]]
        fn = np.cross(b - a, c - a)
        for i in f:
            n[i] += fn
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    ln[ln == 0] = 1
    return n / ln


def main(src, out):
    cfg = B.CONFIG
    obj = Obj(B.find_base_obj(src) if hasattr(B, 'find_base_obj') else os.path.join(src, 'mpfb2/mpfb2-master/src/mpfb/data/3dobjs/base.obj'))
    nv = len(obj.v)
    T = lambda rel: load_target(os.path.join(src, 'mh/targets', rel), nv)  # noqa: E731
    shape = obj.v.copy()
    for race, w in cfg['base']['race'].items():
        shape += w * T(f'macrodetails/{race}-male-young.target.gz')
    shape += cfg['base']['proportions'] * T('macrodetails/proportions/male-young-averagemuscle-averageweight-idealproportions.target.gz')
    for rel, k in cfg['base'].get('shape', []):
        shape += k * T(rel)
    skel = B.Skeleton(src, cfg['skeleton'], obj, shape)
    arg = np.array(skel.bones)[skel.W.argmax(1)]

    body_faces = [[vi for vi, _ in f] for f, g in zip(obj.faces, obj.groups) if g == 'body']
    body_uv = [[ti for _, ti in f] for f, g in zip(obj.faces, obj.groups) if g == 'body']
    nrm = vertex_normals_quads(shape, body_faces)
    y = shape[:, 1]

    sh = {s: skel.heads[f'upperarm_{s}'] for s in 'lr'}
    el = {s: skel.heads[f'lowerarm_{s}'] for s in 'lr'}

    def region(name):
        g = GARMENTS[name]
        m = (y >= g['y'][0]) & (y <= g['y'][1])
        m &= ~np.array([a.startswith(LOWER_ARM) for a in arg])
        m &= ~(arg == 'head')
        # encolure ronde : on retire le cou au-dessus de la base (rayon autour de l'axe du cou)
        nk = skel.heads['neck_01']
        r = np.hypot(shape[:, 0] - nk[0], (shape[:, 2] - nk[2]) * 1.15)
        # encolure : creusée devant, montante dans le dos (comme un vrai t-shirt)
        cy = np.where(shape[:, 2] < nk[2] - 0.1, g.get('collar_y', 99) + 0.7, g.get('collar_y', 99))
        m &= ~((shape[:, 1] > cy) & (r < g.get('collar_r', 0)))
        m &= ~((y > 6.2) & (np.abs(shape[:, 0] - nk[0]) < 0.75) & (shape[:, 2] > nk[2]))   # gorge au-dessus du col (le dos reste montant)
        part = np.array(['torso'] * nv, dtype=object)
        if name == 'tee':
            for s in 'lr':
                isarm = arg == f'upperarm_{s}'
                d = el[s] - sh[s]
                t = ((shape - sh[s]) @ d) / (d @ d)
                m &= ~(isarm & (t > g['sleeve_t']))
                part[isarm] = 'sleeve'
        else:
            m &= ~np.array([a.startswith(('upperarm', 'clavicle', 'spine_03', 'spine_02')) for a in arg])
        return m, part

    out_data = {'units': 'm', 'body': {}, 'garments': {}}
    keep_body = np.ones(nv, bool)
    used_body = sorted({i for f in body_faces for i in f})
    # obstacle de simulation : tronc lissé (tétons, nombril aplanis) pour que le tissu ne s'y accroche pas
    from scipy.spatial import cKDTree
    coll = shape.copy()
    tor = np.where(np.array([a.startswith(('spine', 'pelvis', 'clavicle')) for a in arg]))[0]
    tr = cKDTree(shape[tor])
    for _ in range(2):
        avg = np.array([coll[tor][nn].mean(0) for nn in tr.query_ball_point(coll[tor], 0.3)])
        nt = nrm[tor]
        coll[tor] = coll[tor] + nt * np.maximum(((avg - coll[tor]) * nt).sum(1), -0.05)[:, None]
    posed_body = skel.apply(coll)  # simulation dans la pose finale (bras le long du corps, contrapposto)
    out_data['body'] = {
        'verts': (posed_body[used_body] * B.DM_TO_M).round(5).tolist(),
        'faces': [[used_body.index(i) for i in f] for f in body_faces] if False else None,
    }
    remap = {v: i for i, v in enumerate(used_body)}
    out_data['body']['faces'] = [[remap[i] for i in f] for f in body_faces]

    for name in GARMENTS:
        g = GARMENTS[name]
        m, part = region(name)
        # sélection par centre de face (bords plus réguliers qu'un test sommet par sommet)
        faces = [(f, uv) for f, uv in zip(body_faces, body_uv) if sum(m[i] for i in f) >= 3]
        vids = sorted({i for f, _ in faces for i in f})
        idx = {v: i for i, v in enumerate(vids)}
        off = np.array([g['offset'](y[v], part[v]) for v in vids])
        P = shape[vids] + nrm[vids] * off[:, None]
        # le tissu ignore les petits reliefs (tétons, nombril, clavicules) : surface de départ lissée avant l'enveloppe
        _nb = [[] for _ in vids]
        for f, _ in faces:
            for k in range(len(f)):
                a_, b_ = idx[f[k]], idx[f[(k + 1) % len(f)]]
                _nb[a_].append(b_)
                _nb[b_].append(a_)
        if g.get('pre_smooth', 0):
            # lissage géométrique (rayon fixe, indépendant de la densité du maillage MakeHuman, très dense aux tétons)
            from scipy.spatial import cKDTree
            tr = cKDTree(P)
            nn_all = tr.query_ball_point(P, g.get('pre_radius', 0.3))
            nv_ = nrm[vids]
            for _ in range(2):
                avg = np.array([P[nn].mean(0) for nn in nn_all])
                # seulement le long de la normale : on aplanit les bosses sans faire glisser le maillage
                P = P + nv_ * ((avg - P) * nv_).sum(1)[:, None]
        # aisance : on élargit autour de l'axe local (tronc : axe vertical ; manches : axe du bras ; jambes : axe de la jambe)
        axis_c = np.zeros_like(P)
        axial = shape[vids, 1].copy()   # tronc : hauteur ; bras / jambes : position le long de l'os
        for k, v in enumerate(vids):
            a = arg[v]
            if a.startswith(('upperarm', 'thigh', 'calf')):
                h0 = skel.heads[a]
                child = {'upperarm': 'lowerarm', 'thigh': 'calf', 'calf': 'foot'}[a.split('_')[0]] + a[a.index('_'):]
                h1 = skel.heads[child]
                d = (h1 - h0) / np.linalg.norm(h1 - h0)
                axis_c[k] = h0 + d * ((shape[v] - h0) @ d)
                axial[k] = (shape[v] - h0) @ d + {'upperarm': 100, 'thigh': 200, 'calf': 300}[a.split('_')[0]]
            else:
                axis_c[k] = np.array([0.0, shape[v, 1], 0.15])
        # enveloppe : le tissu passe par-dessus les creux (pectoraux, nombril, colonne) → rayon max local autour de l'axe
        rel = P - axis_c
        r = np.linalg.norm(rel, axis=1)
        # repère angulaire local : pour le tronc, angle autour de Y ; pour bras/jambes, angle autour de l'axe du segment
        ang = np.arctan2(rel[:, 2], rel[:, 0])
        hb = np.round(axial / 0.25).astype(int)  # tranches perpendiculaires au segment (pas horizontales sur un bras en A)
        ab = np.round((ang + np.pi) / (2 * np.pi) * 40).astype(int) % 40
        seg = np.array([arg[v] if arg[v].startswith(('upperarm', 'thigh', 'calf')) else 'torso' for v in vids])
        env = {}
        for k in range(len(vids)):
            key = (seg[k], hb[k], ab[k])
            env[key] = max(env.get(key, 0.0), r[k])
        R = np.empty(len(vids))
        for k in range(len(vids)):
            best = 0.0
            for dh in (-2, -1, 0, 1, 2):
                for da in (-3, -2, -1, 0, 1, 2, 3):
                    best = max(best, env.get((seg[k], hb[k] + dh, (ab[k] + da) % 40), 0.0))
            R[k] = best
        e = g.get('ease', 1.0)
        yy = shape[vids, 1]
        if name == 'tee':
            # le t-shirt repose sur les épaules (peu d'aisance) et s'évase vers le bas ; manches amples
            ease = np.where(seg == 'torso', 1 + (e - 1) * np.clip((4.9 - yy) / 1.6, 0.05, 1), 1.06)
        else:
            ease = np.full(len(vids), e)
        if name == 'tee':
            # dessus des épaules : le tissu repose sur l'épaule (pas d'enveloppe ni d'aisance) → pas d'« épaulette »
            top = np.clip((yy - 5.5) / 0.4, 0, 1)
            R = R * (1 - top) + r * top
            ease = ease * (1 - top) + top
        P = axis_c + rel / np.maximum(r[:, None], 1e-6) * (R * ease)[:, None]
        Rt = R * ease   # rayon cible (enveloppe) : le lissage ci-dessous ne doit pas le réduire

        # bords = arêtes qui n'appartiennent qu'à une face
        edges = {}
        for f, _ in faces:
            for k in range(len(f)):
                e = tuple(sorted((f[k], f[(k + 1) % len(f)])))
                edges[e] = edges.get(e, 0) + 1
        border = sorted({i for e, c in edges.items() if c == 1 for i in e})
        # lissage laplacien (bords fixes) : le tissu enjambe les creux au lieu de coller à la peau
        nb = {}
        for (a_, b_) in edges:
            nb.setdefault(idx[a_], []).append(idx[b_])
            nb.setdefault(idx[b_], []).append(idx[a_])
        bset = {idx[v] for v in border}
        for _ in range(g.get('smooth', 0)):
            Q = P.copy()
            for i, ns in nb.items():
                if i not in bset:
                    Q[i] = 0.5 * P[i] + 0.5 * P[ns].mean(0)
            P = Q
        # le lissage uniforme rétrécit davantage les zones à grandes mailles que les zones denses (tétons, nombril)
        # → bosses parasites. On garde la direction lissée mais on rend au tronc son rayon d'enveloppe lissé.
        tor = seg == 'torso'
        Rs = Rt.copy()
        for _ in range(10):
            Rn = Rs.copy()
            for i, ns in nb.items():
                Rn[i] = 0.5 * Rs[i] + 0.5 * Rs[ns].mean()
            Rs = Rn
        rel2 = P - axis_c
        r2 = np.linalg.norm(rel2, axis=1)
        P[tor] = (axis_c + rel2 / np.maximum(r2[:, None], 1e-6) * Rs[:, None])[tor]
        # raccord tronc / manches (et jambes / bassin) : on lisse la jonction entre les deux enveloppes (sinon pli
        # qui se retourne à l'épaule)
        junction = np.zeros(len(vids), bool)
        for i, ns in nb.items():
            if any(seg[j] != seg[i] for j in ns):
                junction[i] = True
        for _ in range(4):
            junction = junction | np.array([any(junction[j] for j in nb.get(i, [])) for i in range(len(vids))])
        for _ in range(12):
            Q = P.copy()
            for i, ns in nb.items():
                if junction[i] and i not in bset:
                    Q[i] = 0.5 * P[i] + 0.5 * P[ns].mean(0)
            P = Q
        # bords : lissage le long du contour (col, ourlet, manches réguliers)
        bnb = {}
        for (a_, b_), c in edges.items():
            if c == 1:
                bnb.setdefault(idx[a_], []).append(idx[b_])
                bnb.setdefault(idx[b_], []).append(idx[a_])
        for _ in range(6):
            Q = P.copy()
            for i, ns in bnb.items():
                Q[i] = 0.5 * P[i] + 0.5 * P[ns].mean(0)
            P = Q
        pins = [idx[v] for v in border if y[v] > g['pin_top'] or ('pin_bottom' in g and y[v] < g['pin_bottom'])]
        # passepoil citron : bande d'une face le long de la couture extérieure de chaque jambe (jogging)
        stripe = []
        if name == 'jogger':
            # angle autour de l'axe osseux de la jambe (continu du genou à la hanche) → bande régulière, sans escaliers
            rel2 = P - axis_c
            for k, (f, _) in enumerate(faces):
                ii = [idx[i] for i in f]
                c_ = rel2[ii].mean(0)
                cy = P[ii, 1].mean()
                sd = np.sign(P[ii, 0].mean())
                ang = np.degrees(np.arctan2(c_[2], c_[0] * sd))
                if abs(ang) < 11 and -6.6 < cy < 0.9:
                    stripe.append(k)
        Pp = skel.apply(P, skel.W[vids])  # vêtement mis dans la pose finale avec les poids de sa zone de peau
        out_data['garments'][name] = {
            'stripe': stripe,
            'posed': True,
            'verts': (Pp * B.DM_TO_M).round(5).tolist(),
            'faces': [[idx[i] for i in f] for f, _ in faces],
            'uv_index': [uv for _, uv in faces],
            'source': vids,
            'pins': pins,
            'border': [idx[v] for v in border],
        }
        print(name, 'sommets', len(vids), 'faces', len(faces), 'épinglés', len(pins))
    json.dump(out_data, open(out, 'w'))
    print('écrit', out, os.path.getsize(out) // 1024, 'Ko')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])


# ---------------------------------------------------------------------------------------------
# Étape 3 : vêtement simulé → « proxy » lié au corps (même interface que Mhclo pour le constructeur)
# ---------------------------------------------------------------------------------------------
DRAPE = {'tee': 0.0, 'jogger': 0.35}


class _ObjView:
    def __init__(self, faces, vt):
        self.faces, self.vt = faces, vt


class GenProxy:
    def __init__(self, name, gin, gout, shape, body_ids, body_vt, skel=None):
        g = gin['garments'][name]
        self.name = name
        self.posed = bool(g.get('posed'))
        if self.posed:
            shape = skel.apply(shape)
        P = np.array(gout['garments'][name]['verts']) / B.DM_TO_M          # → décimètres
        # lissage léger du résultat de simulation : retire les pincements (tissu accroché à un détail du corps)
        nb = [[] for _ in range(len(P))]
        for f in g['faces']:
            for k in range(len(f)):
                a_, b_ = f[k], f[(k + 1) % len(f)]
                nb[a_].append(b_)
                nb[b_].append(a_)
        border = set(g['border'])
        self.nb = nb
        self.border_set = border
        # ourlet, col et bas de manches nets : lissage le long du bord après simulation (le tissu peut s'y froisser)
        ecount = {}
        for f in g['faces']:
            for k in range(len(f)):
                e = tuple(sorted((f[k], f[(k + 1) % len(f)])))
                ecount[e] = ecount.get(e, 0) + 1
        bn = {}
        for (a_, b_), c_ in ecount.items():
            if c_ == 1:
                bn.setdefault(a_, []).append(b_)
                bn.setdefault(b_, []).append(a_)
        for _ in range(8):   # hauteur seulement : lisser la boucle en x/z la rétrécirait (ourlet qui rentre)
            Q = P.copy()
            for i, ns in bn.items():
                Q[i, 1] = 0.5 * P[i, 1] + 0.5 * P[ns, 1].mean()
            P = Q
        # boucle du col (bord le plus haut), ordonnée : sert au bord côte (bande de col)
        self.collar = []
        seen = set()
        loops = []
        for s0 in bn:
            if s0 in seen:
                continue
            loop, prev, cur = [s0], None, s0
            seen.add(s0)
            while True:
                nxt = [n for n in bn[cur] if n != prev and n not in seen]
                if not nxt:
                    break
                prev, cur = cur, nxt[0]
                loop.append(cur)
                seen.add(cur)
            loops.append(loop)
        if loops and name == 'tee':
            self.collar = max(loops, key=lambda L: P[L, 1].mean())
        src = np.array(g['source'], dtype=np.int64)
        bsrc = shape[src]
        G = np.array(g['verts']) / B.DM_TO_M if self.posed else None   # enveloppe avant simulation (lisse, à l'extérieur du corps)
        P = self._smooth(P, 10, 0.4)
        if G is not None and len(G) == len(P):
            # direction artistique « pub 3D premium » : vêtement net. On part de l'enveloppe ajustée (propre, posée sur
            # les épaules) et on n'ajoute qu'une part du tombé simulé (drape = 0 → aucun pli parasite).
            drape = DRAPE.get(name, 0.0)
            P = G + drape * (P - G)
            out_dir = G - bsrc
            out_dir /= np.maximum(np.linalg.norm(out_dir, axis=1, keepdims=True), 1e-6)
            self.out_dir = out_dir
            self._gap0 = None
            # creux : le tissu ne s'enfonce pas dans les petits reliefs (tétons, nombril) ; les plis vers l'extérieur restent
            Ps = self._smooth(P, 30, 0.5)
            dn = ((P - Ps) * out_dir).sum(1)
            P = P - np.minimum(dn + 0.005, 0)[:, None] * out_dir
            # jamais dans la peau : 7 mm au minimum au-dessus du sommet de corps d'origine
            # zones à maillage très dense (tétons, nombril dans le maillage MakeHuman) : lissage local renforcé,
            # sinon le tissu y garde une petite bosse visible
            from scipy.spatial import cKDTree
            cnt = np.array([len(x) for x in cKDTree(P).query_ball_point(P, 0.18)])
            dense = cnt > np.percentile(cnt, 97)
            for _ in range(2):
                dense = dense | np.array([any(dense[j] for j in ns) if ns else False for ns in nb])
            Pd = P.copy()
            on = out_dir
            for nn_i, i in zip(cKDTree(P).query_ball_point(P[dense], 0.3), np.where(dense)[0]):
                Pd[i] = P[i] + on[i] * ((P[nn_i].mean(0) - P[i]) @ on[i])
            P = Pd
            self._dense = dense
            # corps lissé géométriquement (moyenne dans un rayon de 2,5 cm, indépendante de la densité du maillage) :
            # le tissu ne marque pas les tétons
            tree = cKDTree(bsrc)
            bsm = np.array([bsrc[nn].mean(0) for nn in tree.query_ball_point(bsrc, 0.25)])
            # zones convexes (épaules) : le corps lissé passe sous la vraie peau → on garde le plus extérieur des deux
            lift = np.maximum(((bsrc - bsm) * out_dir).sum(1), 0)
            bsm = bsm + lift[:, None] * out_dir
            gap = ((P - bsm) * out_dir).sum(1)
            P = P + np.maximum(0.07 - gap, 0)[:, None] * out_dir
            self._gap0 = np.maximum(((P - bsm) * out_dir).sum(1), 0.07)
        # chaque sommet reste attaché au sommet du corps dont il est issu (même zone de peau, mêmes poids de squelette)
        self.refs = np.stack([src, src, src], 1)
        self.weights = np.tile(np.array([1.0, 0.0, 0.0]), (len(P), 1))
        self.offsets = P - shape[src]
        self.base_src = shape[src].copy()
        # UV propres au vêtement (cylindriques, densité constante) : le grain du tissu ne « tourbillonne » plus
        # là où le maillage du corps est dense (tétons, nombril)
        c = P.mean(0)
        th = np.arctan2(P[:, 0] - c[0], P[:, 2] - c[2])
        R = np.median(np.hypot(P[:, 0] - c[0], P[:, 2] - c[2]))
        # une coordonnée par sommet (UV partagées → normales/tangentes continues) ; doublons seulement sur la couture du dos
        vt = [(th[i] * R / 0.6, P[i, 1] / 0.6) for i in range(len(P))]   # 1 motif = 6 cm
        faces = []
        for f in g['faces']:
            t = th[f]
            if t.max() - t.min() > np.pi:
                corner = []
                for k, vi in enumerate(f):
                    if t[k] < 0:
                        corner.append((vi, len(vt)))
                        vt.append(((t[k] + 2 * np.pi) * R / 0.6, P[vi, 1] / 0.6))
                    else:
                        corner.append((vi, vi))
                faces.append(corner)
            else:
                faces.append([(vi, vi) for vi in f])
        self.obj = _ObjView(faces, np.array(vt))
        # on ne cache le corps que loin des bords (3 rangées de marge) : pas de trou visible à l'ourlet ou au col
        src_ids = g['source']
        adj = {}
        for f in g['faces']:
            for k in range(len(f)):
                a_, b_ = f[k], f[(k + 1) % len(f)]
                adj.setdefault(a_, set()).add(b_)
                adj.setdefault(b_, set()).add(a_)
        # col : une seule rangée (sinon l'épaule, très proche du tissu, transparaît) ; ourlet et manches : trois
        ring = set(g['border'])
        low = {i for i in g['border'] if P[i, 1] < P[:, 1].max() - 1.2}
        for _ in range(2):
            ring |= {n for i in ring for n in adj.get(i, ())}
        for _ in range(2):
            low |= {n for i in low for n in adj.get(i, ())}
        ring |= low
        self.delete_verts = sorted(src_ids[i] for i in range(len(src_ids)) if i not in ring)
        self.material = None
        self.stripe = g.get('stripe') or []
        if skel is not None:
            argb = np.array(skel.bones)[skel.W[src].argmax(1)]
            self._torso = np.array([a.startswith(('spine', 'pelvis', 'clavicle')) for a in argb])
        self.max_offset_cm = float(np.linalg.norm(self.offsets, axis=1).max() * 10)

    def _smooth(self, X, iters, lam, fix_border=True):
        if not hasattr(self, '_ea'):
            a = np.array([i for i, ns in enumerate(self.nb) for _ in ns], dtype=np.int64)
            b = np.array([n for ns in self.nb for n in ns], dtype=np.int64)
            cnt = np.bincount(a, minlength=len(self.nb)).astype(float)
            self._ea, self._eb, self._cnt = a, b, np.maximum(cnt, 1)[:, None]
            self._has = (cnt > 0)
            self._bmask = np.zeros(len(self.nb), bool)
            self._bmask[list(self.border_set)] = True
        move = self._has & ~(self._bmask if fix_border else np.zeros_like(self._bmask))
        for _ in range(iters):
            m = np.zeros_like(X)
            np.add.at(m, self._ea, X[self._eb])
            m /= self._cnt
            X = np.where(move[:, None], (1 - lam) * X + lam * m, X)
        return X

    def fit(self, body):
        # le tissu suit les grands volumes du corps (ventre, épaules, cuisses) mais pas ses détails
        # (nombril, tétons, abdos) : le déplacement du corps est lissé sur la surface du vêtement
        d = body[self.refs[:, 0]] - self.base_src
        if np.abs(d).max() > 1e-6:
            ds = self._smooth(d, 15, 0.5, fix_border=False)
            od = getattr(self, 'out_dir', None)
            if od is not None:
                # mais si la peau gonfle localement plus que la moyenne, le tissu suit (jamais de peau qui traverse)
                # (au-delà du jeu déjà présent entre peau et tissu : un téton ou un muscle qui gonfle sous un tissu
                # ample ne marque pas le t-shirt)
                room = np.maximum(self._gap0 - 0.09, 0) if self._gap0 is not None else 0.0
                ds = ds + np.maximum(((d - ds) * od).sum(1) - room, 0)[:, None] * od
            d = ds
            dz = getattr(self, '_dense', None)
            if dz is not None and dz.any():
                for _ in range(40):
                    m_ = np.array([d[self.nb[i]].mean(0) if self.nb[i] else d[i] for i in np.where(dz)[0]])
                    d[dz] = 0.5 * d[dz] + 0.5 * m_
        out = self.base_src + self.offsets + d
        out = self._iron(out)
        return self._tent(out) if self.name == 'tee' else out

    def _iron(self, P, radius=0.3, passes=3):
        """« Repassage » : lissage géométrique le long de la normale (rayon fixe 2,5 cm), bords exclus.
        Retire les étoiles de plis autour des zones de maillage dense (tétons, nombril) sans faire glisser le tissu."""
        od = getattr(self, 'out_dir', None)
        if od is None:
            return P
        from scipy.spatial import cKDTree
        if not hasattr(self, '_iron_free'):
            free = np.ones(len(P), bool)
            free[list(self.border_set)] = False
            for _ in range(2):
                free = free & np.array([all(free[j] for j in ns) if ns else True for ns in self.nb])
            tor = getattr(self, '_torso', None)
            self._iron_free = free & (tor if tor is not None else True)
        P = P.copy()
        f = self._iron_free
        if not hasattr(self, '_iron_w'):
            # poids inverses de la densité locale : la zone très maillée (tétons) ne tire pas la moyenne vers elle
            cnt = np.array([len(n) for n in cKDTree(P).query_ball_point(P, 0.1)], float)
            self._iron_w = 1.0 / np.maximum(cnt, 1)
        wts = self._iron_w
        for _ in range(passes):
            nn = cKDTree(P).query_ball_point(P[f], radius)
            avg = np.array([(P[n] * wts[n, None]).sum(0) / wts[n].sum() for n in nn])
            o = od[f]
            P[f] = P[f] + o * np.maximum(((avg - P[f]) * o).sum(1), -0.03)[:, None]   # jamais plus de 3 mm vers la peau
        return P

    def _tent(self, P, slope=0.3, bw=0.12):
        """Le t-shirt tombe des pectoraux (et du ventre) au lieu d'épouser leur dessous : effet « tente » vertical."""
        P = P.copy()
        cz = P[:, 2].mean()
        for side, sgn in (('front', 1.0), ('back', -1.0)):
            m = np.where((P[:, 2] - cz) * sgn > 0.2)[0]
            if not len(m):
                continue
            xb = np.round(P[m, 0] / bw).astype(int)
            for b in np.unique(xb):
                ids = m[xb == b]
                ids = ids[np.argsort(-P[ids, 1])]
                y = P[ids, 1]
                z = P[ids, 2] * sgn
                env = z.copy()
                for k in range(1, len(ids)):
                    env[k] = max(z[k], env[k - 1] - slope * (y[k - 1] - y[k]))
                P[ids, 2] = env * sgn
        return P


def fabric_textures(kind, size=512, seed=3):
    """Tuiles de tissu : couleur (grain très léger) + carte de normales (côtes du jersey / molleton)."""
    from PIL import Image
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size] / size
    if kind == 'jersey':
        h = 0.5 + 0.5 * np.sin(2 * np.pi * 48 * xx) * (0.85 + 0.15 * np.sin(2 * np.pi * 96 * yy))
    else:
        h = 0.5 + 0.35 * np.sin(2 * np.pi * 64 * (xx + yy * 0.02)) + 0.15 * np.sin(2 * np.pi * 128 * yy)
    noise = rng.normal(0, 1, (size // 8, size // 8))
    noise = np.kron(noise, np.ones((8, 8)))
    h = h + 0.12 * noise
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    k = 2.2
    n = np.stack([-gx * k, gy * k, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    nim = Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8))
    grain = 1.0 + 0.035 * (h - h.mean()) / (h.std() + 1e-6) * 0.5
    return nim, grain


def side_ribbon(P0, width=0.11, lift=0.04, step=0.12):
    """Passepoil : un ruban continu le long de la couture extérieure de chaque jambe, posé sur le tissu.
    Calculé sur la surface du jogging (pas sur ses facettes) → bord net, sans escaliers.
    Retourne (sommets, triangles, ancre) : ancre = sommet du jogging qui porte chaque sommet du ruban."""
    y0, y1 = P0[:, 1].min(), P0[:, 1].max()
    verts, tris, anchor = [], [], []
    for s in (1.0, -1.0):
        leg = P0[:, 0] * s > 0.05
        Q = P0[leg]
        ids = np.where(leg)[0]
        path = []
        for y in np.arange(y0 + 0.35, y1 - 0.55, step):
            sl = np.abs(Q[:, 1] - y) < 0.12
            if sl.sum() < 8:
                continue
            c = Q[sl].mean(0)
            rel = Q[sl] - c
            ang = np.arctan2(rel[:, 2], rel[:, 0] * s)
            r = np.hypot(rel[:, 0], rel[:, 2])
            w = np.exp(-(ang / 0.18) ** 2)
            if w.sum() < 1e-3:
                continue
            rr = (w * r).sum() / w.sum()
            path.append([c[0] + s * rr, y, c[2]])
        path = np.array(path)
        if len(path) < 4:
            continue
        for _ in range(12):  # tracé lissé (couture droite, pas de vague au genou)
            path[1:-1] = 0.25 * path[:-2] + 0.5 * path[1:-1] + 0.25 * path[2:]
        out = np.array([s, 0.0, 0.0])
        base = len(verts)
        for k, p in enumerate(path):
            t = path[min(k + 1, len(path) - 1)] - path[max(k - 1, 0)]
            t /= np.linalg.norm(t)
            across = np.cross(t, out)
            across /= np.linalg.norm(across)
            p = p + out * lift
            for q in (p - across * width / 2, p + across * width / 2):
                verts.append(q)
                anchor.append(int(ids[np.argmin(((Q - q) ** 2).sum(1))]))
        n = len(path)
        for k in range(n - 1):
            a, b, c_, d = base + 2 * k, base + 2 * k + 1, base + 2 * k + 2, base + 2 * k + 3
            tris += [[a, c_, b], [b, c_, d]] if s > 0 else [[a, b, c_], [b, d, c_]]
    return np.array(verts), np.array(tris, dtype=np.int64), np.array(anchor, dtype=np.int64)


def collar_band(P, gp, width=0.13, lift=0.025):
    """Col côte : bande de 1,3 cm repliée sur le bord du col (cache le bord brut et l'intérieur du t-shirt).
    Calculée à partir des positions du t-shirt dans un état donné → suit les morphs."""
    L = gp.collar
    if len(L) < 8:
        return None, None
    n = len(L)
    bset = gp.border_set
    rows = [[], [], []]
    for k, i in enumerate(L):
        a, b = P[L[(k - 1) % n]], P[L[(k + 1) % n]]
        t = b - a
        t /= max(np.linalg.norm(t), 1e-9)
        inner = [j for j in gp.nb[i] if j not in bset]
        d = (P[inner].mean(0) - P[i]) if inner else np.array([0.0, -1.0, 0.0])
        d -= t * (d @ t)
        d /= max(np.linalg.norm(d), 1e-9)
        nrm = np.cross(t, d)
        if nrm @ gp.out_dir[i] < 0:
            nrm = -nrm
        rows[0].append(P[i] - nrm * 0.004 + d * 0.01)           # départ du col (au ras du bord)
        rows[1].append(P[i] + nrm * lift * 0.6 - d * 0.015)     # arête du col
        rows[2].append(P[i] + nrm * lift + d * width)           # bas de la bande, sur le t-shirt
    R = [np.array(r_) for r_ in rows]
    for _ in range(6):   # bande régulière (pas d'escaliers aux épaules)
        R = [0.5 * r_ + 0.25 * (np.roll(r_, 1, 0) + np.roll(r_, -1, 0)) for r_ in R]
    V = np.concatenate(R)
    F = []
    for r in range(2):
        for k in range(n):
            a, b = r * n + k, r * n + (k + 1) % n
            c, d_ = (r + 1) * n + (k + 1) % n, (r + 1) * n + k
            F += [[a, b, c], [a, c, d_]]
    F = np.array(F)
    # orientation : normales vers l'extérieur (comparées à la direction du tissu)
    tri = V[F]
    fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    ref = np.array([gp.out_dir[L[k % n]] for k in F[:, 0] % n])
    if (np.einsum('ij,ij->i', fn, ref) < 0).mean() > 0.5:
        F = F[:, [0, 2, 1]]
    return V, np.array(F, dtype=np.int64)
