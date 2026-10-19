"""
Aperçu d'un GLB FITAIA sans moteur 3D : relit le fichier (accessors denses et sparse, morphs, textures)
et rastérise en logiciel (numpy) avec un éclairage studio simple. Sert à valider le fichier, pas le rendu final.
Usage : python tools/premium-avatar/preview_glb.py <fichier.glb> <sortie.png> [poids=0.5 ventre=0.2 ...]
"""
import io
import json
import math
import struct
import sys

import numpy as np
from PIL import Image

CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def load(path):
    b = open(path, 'rb').read()
    jl = struct.unpack_from('<I', b, 12)[0]
    js = json.loads(b[20:20 + jl])
    bin_ = b[20 + jl + 8:]
    return js, bin_


def view(js, bin_, i):
    v = js['bufferViews'][i]
    return bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]


def accessor(js, bin_, i):
    a = js['accessors'][i]
    n, c = a['count'], NC[a['type']]
    if 'bufferView' in a:
        arr = np.frombuffer(view(js, bin_, a['bufferView']), dtype=CT[a['componentType']])[:n * c].reshape(n, c).astype(np.float64)
    else:
        arr = np.zeros((n, c))
    if 'sparse' in a:
        s = a['sparse']
        idx = np.frombuffer(view(js, bin_, s['indices']['bufferView']), dtype=CT[s['indices']['componentType']])[:s['count']]
        val = np.frombuffer(view(js, bin_, s['values']['bufferView']), dtype=np.float32)[:s['count'] * c].reshape(-1, c)
        arr = arr.copy()
        arr[idx] = val
    if a.get('normalized') and a['componentType'] == 5121:
        arr /= 255
    return arr


def render(path, weights, yaw=0.0, size=(520, 880), out=None, crop=None):
    js, bin_ = load(path)
    texs = {}
    for ti, t in enumerate(js.get('textures', [])):
        im = Image.open(io.BytesIO(view(js, bin_, js['images'][t['source']]['bufferView']))).convert('RGBA')
        texs[ti] = np.asarray(im).astype(np.float64) / 255
    W, H = size
    img = np.zeros((H, W, 3)) + np.array([0.11, 0.115, 0.125])
    zb = np.full((H, W), -1e9)
    cy, sy = math.cos(yaw), math.sin(yaw)
    R = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    L1 = np.array([-0.45, 0.55, 0.7]); L1 /= np.linalg.norm(L1)
    L2 = np.array([0.6, 0.25, 0.5]); L2 /= np.linalg.norm(L2)
    L3 = np.array([0.3, 0.6, -0.75]); L3 /= np.linalg.norm(L3)
    meshes = list(enumerate(js['meshes']))
    # opaque d'abord, transparents ensuite
    order = sorted(meshes, key=lambda m: 1 if js['materials'][m[1]['primitives'][0]['material']].get('alphaMode') == 'BLEND' else 0)
    if crop:
        y0, y1 = crop
    for mi, mesh in order:
        p = mesh['primitives'][0]
        pos = accessor(js, bin_, p['attributes']['POSITION'])
        nrm = accessor(js, bin_, p['attributes']['NORMAL'])
        uv = accessor(js, bin_, p['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in p['attributes'] else None
        names = mesh.get('extras', {}).get('targetNames', [])
        for k, tgt in enumerate(p.get('targets', [])):
            wgt = weights.get(names[k], 0.0)
            if wgt:
                pos = pos + wgt * accessor(js, bin_, tgt['POSITION'])
                nrm = nrm + wgt * accessor(js, bin_, tgt['NORMAL'])
        nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
        idx = accessor(js, bin_, p['indices']).astype(np.int64).reshape(-1, 3)
        mat = js['materials'][p['material']]
        pbr = mat.get('pbrMetallicRoughness', {})
        tex = texs.get(pbr.get('baseColorTexture', {}).get('index'))
        mode = mat.get('alphaMode', 'OPAQUE')
        rough = pbr.get('roughnessFactor', 0.6)
        P = pos @ R.T
        N = nrm @ R.T
        if crop:
            scale = H / (y1 - y0)
            sx = W / 2 + P[:, 0] * scale
            syy = H - (P[:, 1] - y0) * scale
        else:
            scale = H / 1.95
            sx = W / 2 + P[:, 0] * scale
            syy = H - 25 - P[:, 1] * scale
        diff = np.clip(N @ L1, 0, 1) * 0.85 + np.clip(N @ L2, 0, 1) * 0.3
        rim = np.clip(N @ L3, 0, 1) ** 2 * 0.5
        spec = np.clip(N @ ((L1 + np.array([0, 0, 1])) / np.linalg.norm(L1 + np.array([0, 0, 1]))), 0, 1) ** (8 + 60 * (1 - rough)) * (1 - rough) * 0.6
        shade = 0.28 + diff
        for t in idx:
            a, b, c = t
            x0, y0_, x1, y1_, x2, y2_ = sx[a], syy[a], sx[b], syy[b], sx[c], syy[c]
            area = (x1 - x0) * (y2_ - y0_) - (x2 - x0) * (y1_ - y0_)
            if abs(area) < 1e-9:
                continue
            if area > 0 and not mat.get('doubleSided'):
                continue
            minx, maxx = int(max(min(x0, x1, x2), 0)), int(min(max(x0, x1, x2) + 1, W))
            miny, maxy = int(max(min(y0_, y1_, y2_), 0)), int(min(max(y0_, y1_, y2_) + 1, H))
            if minx >= maxx or miny >= maxy:
                continue
            xs, ys = np.meshgrid(np.arange(minx, maxx) + 0.5, np.arange(miny, maxy) + 0.5)
            w0 = ((x1 - xs) * (y2_ - ys) - (x2 - xs) * (y1_ - ys)) / area
            w1 = ((x2 - xs) * (y0_ - ys) - (x0 - xs) * (y2_ - ys)) / area
            w2 = 1 - w0 - w1
            m = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
            if not m.any():
                continue
            z = w0 * P[a, 2] + w1 * P[b, 2] + w2 * P[c, 2]
            sub = zb[miny:maxy, minx:maxx]
            upd = m & (z > sub)
            if not upd.any():
                continue
            if tex is not None and uv is not None:
                u = w0 * uv[a, 0] + w1 * uv[b, 0] + w2 * uv[c, 0]
                v = w0 * uv[a, 1] + w1 * uv[b, 1] + w2 * uv[c, 1]
                th, tw = tex.shape[:2]
                col = tex[np.clip((v % 1) * th, 0, th - 1).astype(int), np.clip((u % 1) * tw, 0, tw - 1).astype(int)]
                rgb, alpha = col[..., :3] ** 2.2, col[..., 3]
            else:
                rgb = np.ones(m.shape + (3,)) * 0.7
                alpha = np.ones(m.shape)
            if mode == 'MASK':
                upd &= alpha >= mat.get('alphaCutoff', 0.5)
            s = (w0 * shade[a] + w1 * shade[b] + w2 * shade[c])[..., None]
            sp = (w0 * spec[a] + w1 * spec[b] + w2 * spec[c])[..., None]
            rr = (w0 * rim[a] + w1 * rim[b] + w2 * rim[c])[..., None]
            lit = np.clip((rgb * s + sp + rr * np.array([0.78, 0.94, 0.24]) * 0.35) ** (1 / 2.2), 0, 1)
            if mode == 'BLEND':
                al = alpha[..., None]
                tgt = img[miny:maxy, minx:maxx]
                tgt[upd] = (lit * al + tgt * (1 - al))[upd]
            else:
                sub[upd] = z[upd]
                img[miny:maxy, minx:maxx][upd] = lit[upd]
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    if out:
        im.save(out)
    return im


if __name__ == '__main__':
    path, out = sys.argv[1], sys.argv[2]
    wts = {}
    for kv in sys.argv[3:]:
        k, v = kv.split('=')
        wts[k] = float(v)
    render(path, wts, out=out)
