"""
Lecture des formats MakeHuman / MPFB2 (assets CC0) : mesh de base (.obj), targets (.target / .target.gz),
proxies (.mhclo : vêtements, cheveux, yeux, sourcils, cils), matières (.mhmat).
Aucune dépendance hors numpy. Unités MakeHuman = décimètres ; conversion en mètres au moment de l'export.
"""
import gzip
import os
import numpy as np


class Obj:
    def __init__(self, path):
        self.v, self.vt, self.faces, self.groups = [], [], [], []  # faces: list of [(vi, ti)], groups: nom par face
        group = None
        with open(path, encoding='utf-8', errors='ignore') as f:
            for line in f:
                if line.startswith('v '):
                    self.v.append([float(x) for x in line.split()[1:4]])
                elif line.startswith('vt '):
                    self.vt.append([float(x) for x in line.split()[1:3]])
                elif line.startswith('g '):
                    group = line.split(None, 1)[1].strip()
                elif line.startswith('f '):
                    poly = []
                    for tok in line.split()[1:]:
                        parts = tok.split('/')
                        vi = int(parts[0]) - 1
                        ti = int(parts[1]) - 1 if len(parts) > 1 and parts[1] else -1
                        poly.append((vi, ti))
                    self.faces.append(poly)
                    self.groups.append(group)
        self.v = np.array(self.v, dtype=np.float64)
        self.vt = np.array(self.vt, dtype=np.float64) if self.vt else np.zeros((0, 2))


def load_target(path, nverts):
    d = np.zeros((nverts, 3), dtype=np.float64)
    opener = gzip.open if path.endswith('.gz') else open
    with opener(path, 'rt', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            p = line.split()
            if len(p) < 4:
                continue
            i = int(p[0])
            if i < nverts:
                d[i] = (float(p[1]), float(p[2]), float(p[3]))
    return d


class Mhclo:
    """Proxy MakeHuman : chaque sommet = combinaison de 3 sommets du corps + décalage mis à l'échelle."""

    def __init__(self, path):
        self.dir = os.path.dirname(path)
        self.obj_file = None
        self.material = None
        self.scales = {}
        self.refs, self.weights, self.offsets = [], [], []
        self.delete_verts = []
        self.z_depth = 0
        mode = None
        with open(path, encoding='utf-8', errors='ignore') as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith('#'):
                    continue
                key = line.split()[0]
                if mode == 'verts' and (key[0].isdigit() or key[0] == '-'):
                    p = line.split()
                    if len(p) == 1:
                        self.refs.append((int(p[0]), int(p[0]), int(p[0])))
                        self.weights.append((1.0, 0.0, 0.0))
                        self.offsets.append((0.0, 0.0, 0.0))
                    else:
                        self.refs.append((int(p[0]), int(p[1]), int(p[2])))
                        self.weights.append((float(p[3]), float(p[4]), float(p[5])))
                        self.offsets.append((float(p[6]), float(p[7]), float(p[8])) if len(p) >= 9 else (0.0, 0.0, 0.0))
                    continue
                if mode == 'delete' and key[0].isdigit():
                    toks = line.split()
                    i = 0
                    while i < len(toks):
                        if i + 2 < len(toks) and toks[i + 1] == '-':
                            self.delete_verts.extend(range(int(toks[i]), int(toks[i + 2]) + 1))
                            i += 3
                        elif '-' in toks[i][1:]:
                            a, b = toks[i].split('-')
                            self.delete_verts.extend(range(int(a), int(b) + 1))
                            i += 1
                        else:
                            self.delete_verts.append(int(toks[i]))
                            i += 1
                    continue
                if key == 'obj_file':
                    self.obj_file = os.path.join(self.dir, line.split(None, 1)[1].strip())
                elif key == 'material':
                    self.material = os.path.join(self.dir, line.split(None, 1)[1].strip())
                elif key in ('x_scale', 'y_scale', 'z_scale'):
                    p = line.split()
                    self.scales[key[0]] = (int(p[1]), int(p[2]), float(p[3]))
                elif key == 'z_depth':
                    self.z_depth = int(line.split()[1])
                elif key == 'verts':
                    mode = 'verts'
                elif key == 'delete_verts':
                    mode = 'delete'
        self.refs = np.array(self.refs, dtype=np.int64)
        self.weights = np.array(self.weights, dtype=np.float64)
        self.offsets = np.array(self.offsets, dtype=np.float64)
        self.obj = Obj(self.obj_file) if self.obj_file else None

    def fit(self, body):
        """Positions du proxy pour une forme de corps donnée (n × 3, unités MakeHuman)."""
        s = np.ones(3)
        for k, axis in (('x', 0), ('y', 1), ('z', 2)):
            if k in self.scales:
                a, b, den = self.scales[k]
                s[axis] = abs(body[a, axis] - body[b, axis]) / den
        r, w = self.refs, self.weights
        return body[r[:, 0]] * w[:, 0:1] + body[r[:, 1]] * w[:, 1:2] + body[r[:, 2]] * w[:, 2:3] + self.offsets * s


def read_mhmat(path):
    out = {}
    if not path or not os.path.exists(path):
        return out
    with open(path, encoding='utf-8', errors='ignore') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            p = line.split(None, 1)
            if len(p) == 2:
                out[p[0]] = p[1]
    out['_dir'] = os.path.dirname(path)
    return out
