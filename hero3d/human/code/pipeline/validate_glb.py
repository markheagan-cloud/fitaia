"""
FITAIA — contrôle technique d'un GLB d'avatar (lecture seule, aucune dépendance hors numpy).

  python pipeline/validate_glb.py <avatar.glb> [--states states-hero.json] [--out rapport.json]

Vérifie : fichier lisible, images embarquées (aucune dépendance externe), matériaux, morph targets présents sur chaque
mesh avec les MÊMES noms, deltas non nuls, triangles retournés (normales inversées) dans les états Surpoids / Actuel /
Objectif et le long de l'interpolation Surpoids → Objectif à 0 / 25 / 50 / 75 / 100 %.
Code de sortie 1 si un contrôle bloquant échoue.
"""
import argparse
import json
import os
import struct
import sys

import numpy as np

CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def load(path):
    b = open(path, 'rb').read()
    magic, ver, length = struct.unpack('<III', b[:12])
    assert magic == 0x46546C67, 'pas un GLB'
    assert length == len(b), 'longueur annoncée %d ≠ fichier %d (corrompu)' % (length, len(b))
    jl, = struct.unpack('<I', b[12:16])
    js = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl, = struct.unpack('<I', b[off:off + 4])
    return js, b[off + 8:off + 8 + bl]


def accessor(js, binb, i):
    a = js['accessors'][i]
    n, k = a['count'], NC[a['type']]
    dt = CT[a['componentType']]
    out = np.zeros((n, k), np.float32)
    if 'bufferView' in a:
        v = js['bufferViews'][a['bufferView']]
        o = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        out = np.frombuffer(binb, dt, n * k, o).reshape(n, k).astype(np.float32)
    if 'sparse' in a:
        s = a['sparse']
        iv = js['bufferViews'][s['indices']['bufferView']]
        idx = np.frombuffer(binb, CT[s['indices']['componentType']], s['count'], iv.get('byteOffset', 0) + s['indices'].get('byteOffset', 0))
        vv = js['bufferViews'][s['values']['bufferView']]
        val = np.frombuffer(binb, dt, s['count'] * k, vv.get('byteOffset', 0) + s['values'].get('byteOffset', 0)).reshape(-1, k)
        out = out.copy()
        out[idx.astype(np.int64)] = val
    return out


def tri_normals(P, T):
    return np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('glb')
    ap.add_argument('--states', default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'states-hero.json'))
    ap.add_argument('--out', default=None)
    a = ap.parse_args()
    rep = {'file': os.path.abspath(a.glb), 'bytes': os.path.getsize(a.glb), 'checks': [], 'meshes': {}}
    fail = []

    def check(name, ok, detail=''):
        rep['checks'].append({'check': name, 'ok': bool(ok), 'detail': detail})
        if not ok:
            fail.append(name)

    js, binb = load(a.glb)
    check('GLB lisible', True, 'glTF %s' % js.get('asset', {}).get('version'))
    ext = [im for im in js.get('images', []) if 'uri' in im and not im['uri'].startswith('data:')]
    check('Images embarquées (aucun fichier externe)', not ext, '%d images' % len(js.get('images', [])))
    check('Matériaux présents', len(js.get('materials', [])) > 0, '%d matériaux' % len(js.get('materials', [])))
    states = json.load(open(a.states))['states']
    names_ref = None
    tris_total = 0
    for m in js['meshes']:
        nm = m.get('name', '?')
        names = (m.get('extras') or {}).get('targetNames', [])
        info = {'targets': len(names)}
        for p in m['primitives']:
            P = accessor(js, binb, p['attributes']['POSITION'])
            T = accessor(js, binb, p['indices']).astype(np.int64).reshape(-1, 3) if 'indices' in p else np.arange(len(P)).reshape(-1, 3)
            tris_total += len(T)
            info['vertices'] = int(len(P))
            info['triangles'] = int(len(T))
            D = [accessor(js, binb, t['POSITION']) for t in p.get('targets', [])]
            info['max_delta_cm'] = {n: round(float(np.abs(d).max()) * 100, 2) for n, d in zip(names, D)}
            if not D:
                continue
            if names_ref is None:
                names_ref = names
            check('Noms de morphs identiques (%s)' % nm, names == names_ref, ', '.join(names))
            check('Nombre de deltas = nombre de noms (%s)' % nm, len(D) == len(names), '%d / %d' % (len(D), len(names)))
            n0 = tri_normals(P, T)
            area0 = np.linalg.norm(n0, axis=1)
            good = area0 > 1e-12

            def shape(w):
                Q = P.copy()
                for n, d in zip(names, D):
                    Q = Q + d * float(w.get(n, 0.0))
                return Q

            flips = {}
            for sn, w in states.items():
                n1 = tri_normals(shape(w), T)
                flips[sn] = int(((n0 * n1).sum(1) < 0)[good].sum())
            s0, s1 = states.get('surpoids', {}), states.get('athletique', {})
            for t in (0.0, 0.25, 0.5, 0.75, 1.0):
                w = {k: (1 - t) * s0.get(k, 0) + t * s1.get(k, 0) for k in set(s0) | set(s1)}
                n1 = tri_normals(shape(w), T)
                flips['interp_%d' % int(t * 100)] = int(((n0 * n1).sum(1) < 0)[good].sum())
            info['flipped_triangles'] = flips
        rep['meshes'][nm] = info
    # un morph peut être nul sur la peau visible (ventre, taille, cuisses : la peau sous les vêtements est retirée du
    # GLB) mais il doit déformer au moins un mesh
    allmax = {}
    for v in rep['meshes'].values():
        for n, d in v.get('max_delta_cm', {}).items():
            allmax[n] = max(allmax.get(n, 0.0), d)
    dz = [n for n, v in allmax.items() if v < 0.05]
    check('Deltas non nuls (chaque morph déforme au moins un mesh)', bool(allmax) and not dz,
          'nuls : ' + ', '.join(dz) if dz else '%d morphs actifs, max %s cm' % (len(allmax), ', '.join('%s %.1f' % kv for kv in allmax.items())))
    worst = max((max(v.get('flipped_triangles', {0: 0}).values()) for v in rep['meshes'].values()), default=0)
    rep['triangles_total'] = tris_total
    check('Triangles retournés sur tout le parcours (≤ 0,1 % du total)', worst <= tris_total * 0.001, 'pire cas %d sur %d' % (worst, tris_total))
    rep['ok'] = not fail
    txt = json.dumps(rep, indent=1, ensure_ascii=False)
    if a.out:
        open(a.out, 'w', encoding='utf-8').write(txt)
    for c in rep['checks']:
        print(('OK   ' if c['ok'] else 'ÉCHEC') + ' ' + c['check'] + (' — ' + c['detail'] if c['detail'] else ''))
    print('taille %.2f Mo, %d triangles' % (rep['bytes'] / 1e6, tris_total))
    for nm, v in rep['meshes'].items():
        if v.get('flipped_triangles'):
            print(' ', nm, 'triangles retournés', v['flipped_triangles'])
    print('GLB VALIDE' if rep['ok'] else 'GLB REFUSÉ : ' + ', '.join(fail))
    sys.exit(0 if rep['ok'] else 1)


if __name__ == '__main__':
    main()
