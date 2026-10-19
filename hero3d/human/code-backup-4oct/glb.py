"""
Écriture glTF binaire (.glb) multi-mesh : textures embarquées (JPEG/PNG), morph targets (denses ou « sparse »),
extras par mesh (targetNames) et par image (dimensions, pour le chargement des textures sur iPhone).
"""
import json
import struct
import numpy as np


def _pad(b, fill=b'\x00'):
    return b + fill * ((4 - len(b) % 4) % 4)


class GlbWriter:
    def __init__(self):
        self.buf = bytearray()
        self.views, self.accessors = [], []
        self.images, self.textures, self.samplers, self.materials = [], [], [], []
        self.meshes, self.nodes = [], []

    def view(self, data, target=None):
        off = len(self.buf)
        self.buf += _pad(bytes(data))
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target:
            v['target'] = target
        self.views.append(v)
        return len(self.views) - 1

    def acc_vec(self, arr, ctype='VEC3', minmax=False, target=34962):
        arr = np.ascontiguousarray(arr, dtype=np.float32)
        vi = self.view(arr.tobytes(), target)
        a = {'bufferView': vi, 'componentType': 5126, 'count': int(arr.shape[0]), 'type': ctype}
        if minmax:
            a['min'] = [float(x) for x in arr.min(0)]
            a['max'] = [float(x) for x in arr.max(0)]
        self.accessors.append(a)
        return len(self.accessors) - 1

    def acc_morph(self, delta, sparse_ratio=0.6, minmax=True):
        """Delta de morph : sparse si peu de sommets bougent (gain de taille énorme pour les morphs régionaux)."""
        delta = np.ascontiguousarray(delta, dtype=np.float32)
        n = delta.shape[0]
        moving = np.where(np.abs(delta).max(1) > 1e-7)[0]
        if len(moving) == 0:
            moving = np.array([0])
        if len(moving) < n * sparse_ratio:
            idx = moving.astype(np.uint32)
            vals = delta[moving]
            iv = self.view(idx.tobytes())
            vv = self.view(vals.tobytes())
            a = {'componentType': 5126, 'count': n, 'type': 'VEC3',
                 'sparse': {'count': int(len(idx)), 'indices': {'bufferView': iv, 'componentType': 5125}, 'values': {'bufferView': vv}}}
        else:
            vi = self.view(delta.tobytes(), 34962)
            a = {'bufferView': vi, 'componentType': 5126, 'count': n, 'type': 'VEC3'}
        if minmax:
            a['min'] = [float(x) for x in delta.min(0)]
            a['max'] = [float(x) for x in delta.max(0)]
        self.accessors.append(a)
        return len(self.accessors) - 1

    def acc_indices(self, tris):
        tris = np.asarray(tris)
        big = tris.max() > 65535
        arr = tris.astype(np.uint32 if big else np.uint16).ravel()
        vi = self.view(arr.tobytes(), 34963)
        self.accessors.append({'bufferView': vi, 'componentType': 5125 if big else 5123, 'count': int(arr.size), 'type': 'SCALAR'})
        return len(self.accessors) - 1

    def image(self, data, mime, width, height, name):
        vi = self.view(data)
        self.images.append({'bufferView': vi, 'mimeType': mime, 'name': name, 'extras': {'width': width, 'height': height}})
        if not self.samplers:
            self.samplers.append({'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497})
        self.textures.append({'source': len(self.images) - 1, 'sampler': 0})
        return len(self.textures) - 1

    def material(self, m):
        self.materials.append(m)
        return len(self.materials) - 1

    def mesh(self, name, pos, nrm, uv, tris, material, morphs, extras=None):
        """morphs : liste ordonnée de (nom, delta_pos, delta_nrm)."""
        attrs = {'POSITION': self.acc_vec(pos, minmax=True), 'NORMAL': self.acc_vec(nrm)}
        if uv is not None:
            attrs['TEXCOORD_0'] = self.acc_vec(uv, 'VEC2')
        prim = {'attributes': attrs, 'indices': self.acc_indices(tris), 'material': material}
        if morphs:
            prim['targets'] = [{'POSITION': self.acc_morph(dp), 'NORMAL': self.acc_morph(dn, minmax=False)} for _, dp, dn in morphs]
        mesh = {'name': name, 'primitives': [prim]}
        if morphs:
            mesh['weights'] = [0.0] * len(morphs)
            mesh['extras'] = {'targetNames': [n for n, _, _ in morphs], **(extras or {})}
        self.meshes.append(mesh)
        self.nodes.append({'name': name, 'mesh': len(self.meshes) - 1})

    def write(self, path, asset_extras):
        gltf = {
            'asset': {'version': '2.0', 'generator': 'FITAIA premium-avatar builder', 'extras': asset_extras},
            'scene': 0,
            'scenes': [{'nodes': list(range(len(self.nodes)))}],
            'nodes': self.nodes,
            'meshes': self.meshes,
            'materials': self.materials,
            'accessors': self.accessors,
            'bufferViews': self.views,
            'buffers': [{'byteLength': len(self.buf)}],
        }
        if self.images:
            gltf.update({'images': self.images, 'textures': self.textures, 'samplers': self.samplers})
        js = _pad(json.dumps(gltf, separators=(',', ':'), ensure_ascii=False).encode('utf-8'), b' ')
        b = _pad(bytes(self.buf))
        total = 12 + 8 + len(js) + 8 + len(b)
        with open(path, 'wb') as f:
            f.write(struct.pack('<4sII', b'glTF', 2, total))
            f.write(struct.pack('<I4s', len(js), b'JSON') + js)
            f.write(struct.pack('<I4s', len(b), b'BIN\x00') + b)
        return total
