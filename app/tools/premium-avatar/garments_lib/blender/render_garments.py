"""
FITAIA — rendus Cycles des vêtements sur l'avatar héros (Blender, sans interface).

  blender -b --factory-startup --python render_garments.py -- <job.json>

Même studio, même peau, mêmes mèches que les rendus du héros (fonctions de blender/render_portraits.py réutilisées) ;
vêtements = GLB temps réel de garments_lib (mêmes morph targets que le corps → état du corps = mêmes poids), matières
reconstruites depuis les presets PBR (micro-textures cuites + sheen / anisotropie / rétro-réflexion), épaisseur du tissu
(Solidify) et lissage (Subdivision). Le corps est masqué sous les pièces portées (masque calculé par le Quality Gate).
"""
import json
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Vector, kdtree

HERE = os.path.dirname(os.path.abspath(__file__))
PA = os.path.dirname(os.path.dirname(HERE))
argv = sys.argv[sys.argv.index('--') + 1:]
JOB = json.load(open(argv[0], encoding='utf-8'))
# réutilisation du studio / de la peau / des mèches du héros (module des portraits, sans travail à l'import)
_dummy = os.path.join(os.path.dirname(os.path.abspath(argv[0])), '_rp_dummy.json')
json.dump({'samples': JOB.get('samples', 64), 'scale': 1.0, 'items': [], 'exposure': JOB.get('exposure', -1.0)}, open(_dummy, 'w'))
_saved = sys.argv
sys.argv = [sys.argv[0], '--', _dummy]
sys.path.insert(0, os.path.join(PA, 'blender'))
import render_portraits as RP  # noqa: E402
sys.argv = _saved

PRESETS = json.load(open(JOB['presets'], encoding='utf-8'))
TEX = JOB['tex_dir']


def srgb2lin(c):
    return [((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c]


def gl2bl(p):
    return Vector((p[0], -p[2], p[1]))


def load_img(path, noncolor=True):
    name = os.path.basename(path)
    im = bpy.data.images.get(name) or bpy.data.images.load(path)
    if noncolor:
        im.colorspace_settings.name = 'Non-Color'
    return im


def fabric_material(name, mdef):
    """Principled BSDF à partir d'un preset (cartes cuites tuilées par les UV du GLB)."""
    pr = PRESETS['presets'][mdef['preset']]
    col = mdef.get('rgb') or PRESETS['colors'][mdef['color']]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
    uvn = nt.nodes.new('ShaderNodeUVMap')
    base = srgb2lin(col) + [1.0]
    # légère variation de teinte (fils chinés) en coordonnées objet
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 140.0
    nz.inputs['Detail'].default_value = 3.0
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    v = mdef.get('heather', 0.06)
    ramp.color_ramp.elements[0].color = [c * (1 - v) for c in base[:3]] + [1]
    ramp.color_ramp.elements[1].color = [min(1.0, c * (1 + v)) for c in base[:3]] + [1]
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    # rugosité
    rim = nt.nodes.new('ShaderNodeTexImage')
    rim.image = load_img(os.path.join(TEX, f"{mdef['preset']}_rough.png"))
    nt.links.new(uvn.outputs['UV'], rim.inputs['Vector'])
    nt.links.new(rim.outputs['Color'], p.inputs['Roughness'])
    # micro-relief
    nim = nt.nodes.new('ShaderNodeTexImage')
    nim.image = load_img(os.path.join(TEX, f"{mdef['preset']}_normal.png"))
    nt.links.new(uvn.outputs['UV'], nim.inputs['Vector'])
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = pr['normal_strength'] * mdef.get('normal_gain', 1.0)
    nt.links.new(nim.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    RP.setin(p, ['Sheen Weight'], pr.get('sheen', 0.0))
    RP.setin(p, ['Sheen Roughness'], pr.get('sheen_roughness', 0.5))
    RP.setin(p, ['Specular IOR Level', 'Specular'], pr.get('specular', 0.4))
    RP.setin(p, ['Metallic'], pr.get('metallic', 0.0))
    RP.setin(p, ['Coat Weight'], pr.get('coat', 0.0))
    RP.setin(p, ['Coat Roughness'], 0.35)
    if pr.get('anisotropic'):
        RP.setin(p, ['Anisotropic'], pr['anisotropic'])
    if pr.get('alpha_holes'):
        aim = nt.nodes.new('ShaderNodeTexImage')
        aim.image = load_img(os.path.join(TEX, f"{mdef['preset']}_alpha.png"))
        nt.links.new(uvn.outputs['UV'], aim.inputs['Vector'])
        nt.links.new(aim.outputs['Color'], p.inputs['Alpha'])
    if pr.get('retro'):
        # rétro-réflexion simulée : surcroît de brillance face à la caméra (lumière renvoyée vers l'objectif)
        lw = nt.nodes.new('ShaderNodeLayerWeight')
        lw.inputs['Blend'].default_value = 0.2
        inv = nt.nodes.new('ShaderNodeMath')
        inv.operation = 'POWER'
        nt.links.new(lw.outputs['Facing'], inv.inputs[0])
        inv.inputs[1].default_value = 4.0
        one = nt.nodes.new('ShaderNodeMath')
        one.operation = 'SUBTRACT'
        one.inputs[0].default_value = 1.0
        nt.links.new(inv.outputs[0], one.inputs[1])
        mul = nt.nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        mul.inputs[1].default_value = mdef.get('retro_gain', 0.6)
        nt.links.new(one.outputs[0], mul.inputs[0])
        nt.links.new(mul.outputs[0], p.inputs['Emission Strength'])
        p.inputs['Emission Color'].default_value = (0.9, 0.92, 0.95, 1)
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'DITHERED'
    return m


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


class Scene:
    def __init__(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        RP.setup_render()
        sc = bpy.context.scene
        sc.cycles.samples = JOB.get('samples', 64)
        sc.view_settings.exposure = JOB.get('exposure', -1.0)
        H = JOB['hero']
        objs = import_glb(H['glb'])
        self.hero = [o for o in objs if o.type == 'MESH']
        self.turn = bpy.data.objects.new('turn', None)
        sc.collection.objects.link(self.turn)
        self.root = bpy.data.objects.new('hero_root', None)
        sc.collection.objects.link(self.root)
        self.root.parent = self.turn
        for o in objs:
            if o.parent is None:
                o.parent = self.root
        self.root.location.z = H.get('z_shift', 0.0)
        RP.setup_materials(self.hero, H.get('rough'), True)
        self.meta = json.load(open(H['meta']))
        self.body = next(o for o in self.hero if o.name.split('.')[0] == 'body')
        self.strands = []
        if H.get('hair') and os.path.exists(H['hair']):
            self.strands = RP.add_strands(H['hair'], self.root, H.get('hair_render', {}))
            groups = [str(x) for x in np.load(H['hair'])['groups']]
            for o in self.hero:
                nm = o.name.split('.')[0]
                if nm == 'hair' or (nm == 'eyebrows' and 'brows' in groups):
                    o.hide_render = True
        self.gaze = RP.Gaze(self.hero, self.meta, 1.0)
        top = gl2bl(self.meta['head_top']).z + H.get('z_shift', 0.0) + 0.03
        self.H = top
        RP.studio(top)
        self.catcher = RP.shadow_catcher()
        self.cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        sc.collection.objects.link(self.cam)
        sc.camera = self.cam
        # correspondance sommets du corps ↔ positions de l'app (masques)
        me = self.body.data
        self.kd = kdtree.KDTree(len(me.vertices))
        for v in me.vertices:
            self.kd.insert(v.co, v.index)
        self.kd.balance()
        self.mask_vg = self.body.vertex_groups.new(name='hide')
        md = self.body.modifiers.new('masque', 'MASK')
        md.vertex_group = 'hide'
        md.invert_vertex_group = True
        self.pieces = {}
        for pid, pdef in JOB['pieces'].items():
            self.add_piece(pid, pdef)

    def add_piece(self, pid, pdef):
        objs = import_glb(pdef['glb'])
        meshes = [o for o in objs if o.type == 'MESH']
        for o in objs:
            if o.parent is None:
                o.parent = self.turn
        for o in meshes:
            slot = o.name.split('__')[-1].split('.')[0]
            if slot.startswith('print_'):
                for s_ in o.material_slots:
                    if s_.material and hasattr(s_.material, 'surface_render_method'):
                        s_.material.surface_render_method = 'DITHERED'
                    pp = RP.principled(s_.material)
                    if pp:
                        RP.setin(pp, ['Roughness'], pdef.get('print_roughness', 0.6))
                        RP.setin(pp, ['Specular IOR Level', 'Specular'], 0.3)
                continue
            mdef = pdef['materials'].get(slot)
            if mdef:
                m = fabric_material(f'{pid}:{slot}', mdef)
                o.data.materials.clear()
                o.data.materials.append(m)
            for poly in o.data.polygons:
                poly.use_smooth = True
            pr = PRESETS['presets'][mdef['preset']] if mdef else {'thickness_mm': 1.0}
            if pdef.get('subsurf', 1):
                sub = o.modifiers.new('lisse', 'SUBSURF')
                sub.levels = sub.render_levels = pdef.get('subsurf', 1)
            if pdef.get('solidify', True) and slot not in pdef.get('no_solidify', []):
                so = o.modifiers.new('epaisseur', 'SOLIDIFY')
                so.thickness = pr.get('thickness_mm', 1.0) / 1000.0
                so.offset = -1.0
                so.use_even_offset = True
                so.use_rim = True
        # masque (positions de l'app → repère du GLB du héros)
        idx = set()
        if pdef.get('mask') and os.path.exists(pdef['mask']):
            pts = json.load(open(pdef['mask']))['positions']
            zs = JOB['hero'].get('z_shift', 0.0)
            for p in pts:
                co = Vector((p[0], -p[2], p[1] - zs))
                for (_, i, d) in self.kd.find_range(co, 3e-4):
                    idx.add(i)
        self.pieces[pid] = {'objs': meshes, 'mask': sorted(idx), 'def': pdef}
        print('pièce', pid, len(meshes), 'objets, masque', len(idx), flush=True)

    def set_outfit(self, ids, hide_body=False):
        for pid, p in self.pieces.items():
            for o in p['objs']:
                o.hide_render = pid not in ids
        self.body.vertex_groups.remove(self.mask_vg)
        self.mask_vg = self.body.vertex_groups.new(name='hide')
        hid = sorted(set(i for pid in ids for i in self.pieces[pid]['mask']))
        if hid:
            self.mask_vg.add(hid, 1.0, 'REPLACE')
        for o in self.hero:
            nm = o.name.split('.')[0]
            hide = hide_body
            if self.strands and nm in ('hair', 'eyebrows'):
                hide = True
            o.hide_render = hide
        hide_hair = hide_body or any(self.pieces[pid]['def'].get('hide_hair') for pid in ids)
        for o in self.strands:
            o.hide_render = hide_hair
        for pid in ids:
            cap = self.pieces[pid]['def'].get('cap_clip')
            if cap and not hide_body:
                self.clip_strands(cap)

    def clip_strands(self, cap):
        pass

    def set_state(self, st):
        for o in self.hero + [o for p in self.pieces.values() for o in p['objs']]:
            sk = o.data.shape_keys
            if sk:
                for kb in sk.key_blocks[1:]:
                    kb.value = float(st.get(kb.name, 0.0))

    def frame(self, r):
        sc = bpy.context.scene
        W, H = r.get('res', [600, 960])
        sc.render.resolution_x, sc.render.resolution_y = W, H
        self.turn.rotation_euler = (0, 0, math.radians(r.get('yaw', 0.0)))
        bpy.context.view_layer.update()
        cam = self.cam
        kind = r.get('frame', 'full')
        top = self.H
        if kind == 'full':
            z0, z1, lens = -0.03, top + 0.05, 70
        elif kind == 'bust':
            z0, z1, lens = top - 0.62, top + 0.04, 85
        elif kind == 'torso':
            z0, z1, lens = 0.78, top + 0.03, 80
        elif kind == 'legs':
            z0, z1, lens = -0.03, 1.12, 70
        elif kind == 'feet':
            z0, z1, lens = -0.02, 0.24, 100
        elif kind == 'head':
            z0, z1, lens = top - 0.32, top + 0.06, 100
        elif kind == 'product':
            z0, z1, lens = r['zrange'][0], r['zrange'][1], 85
        else:
            z0, z1, lens = -0.03, top + 0.05, 70
        hgt = (z1 - z0) * (1.0 if W <= H else W / H * 0 + 1.0)
        if W > H:
            hgt = max(hgt, (r.get('xspan', 0.0)) * H / W)
        cam.data.lens = lens
        cam.data.sensor_fit = 'VERTICAL'
        cam.data.sensor_height = 24.0
        fov = 2 * math.atan(12.0 / lens)
        dist = (hgt / 2) / math.tan(fov / 2)
        zc = (z0 + z1) / 2
        cz = r.get('cam_z', zc)
        cx = r.get('cam_x', 0.0)
        cam.location = Vector((cx, -dist, cz))
        cam.rotation_euler = (math.radians(90 - r.get('pitch', 0.0)), 0, 0)
        cam.data.shift_y = (zc - cz) / hgt
        self.catcher.hide_render = kind not in ('full', 'legs', 'feet') or r.get('hide_body', False) and kind != 'feet'

    def render(self, r):
        t0 = time.time()
        self.set_outfit(r['pieces'], r.get('hide_body', False))
        self.set_state(r.get('state', {}))
        self.frame(r)
        bpy.context.view_layer.update()
        if self.gaze.ok:
            self.gaze.aim(self.cam.matrix_world.translation)
        sc = bpy.context.scene
        sc.cycles.samples = r.get('samples', JOB.get('samples', 64))
        sc.render.filepath = r['out']
        os.makedirs(os.path.dirname(r['out']), exist_ok=True)
        bpy.ops.render.render(write_still=True)
        print('RENDU', os.path.basename(r['out']), round(time.time() - t0, 1), 's', flush=True)


S = Scene()
for r in JOB['renders']:
    try:
        S.render(r)
    except Exception as e:
        print('ERREUR rendu', r.get('out'), e, flush=True)
print('GARMENTS RENDER OK')
