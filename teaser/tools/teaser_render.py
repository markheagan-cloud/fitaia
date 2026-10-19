"""
FITAIA teaser — rendus 3D de l'avatar (Blender, sans interface), fond TRANSPARENT pour la composition Remotion.

  blender -b --factory-startup --python teaser_render.py -- <avatar.glb> <dossier_sortie> <options.json>

options.json :
  {"samples": 48, "res": [1080, 1620], "shots": [
     {"name": "morph", "kind": "morph", "n": 25, "yaw": 22, "path": ["surpoids", "actuel", "athletique"]},
     {"name": "turn", "kind": "turn", "n": 24, "state": "actuel", "yaw0": 0},
     {"name": "hero_athletique", "kind": "still", "state": "athletique", "yaw": 18},
     {"name": "portrait", "kind": "still", "state": "actuel", "yaw": 8, "frame": "portrait"}]}
Studio « pub » : fond noir (transparent), lumière principale chaude, contre-jour citron (#C8F03C), contre-jour blanc,
ombre de contact sur un plan « shadow catcher ».
"""
import json
import math
import os
import sys
import time

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT, OPTF = argv[0], argv[1], argv[2]
OPT = json.load(open(OPTF))
os.makedirs(OUT, exist_ok=True)

STATES = {
    "surpoids": {"body_weight_low": 0, "body_weight": 0.88, "muscle_low": 0.114, "muscle": 0, "belly_fat": 0.645, "waist": 0.471, "hips": 0.3, "chest": 0.22, "shoulders": 0, "upper_arm": 0.57, "forearm": 0.28, "thigh": 0.533, "calf": 0.231, "face_fat": 0.757, "neck_fat": 0.771},
    "actuel": {"body_weight_low": 0, "body_weight": 0.34, "muscle_low": 0, "muscle": 0.028, "belly_fat": 0.25, "waist": 0.129, "hips": 0.043, "chest": 0, "shoulders": 0, "upper_arm": 0.195, "forearm": 0.03, "thigh": 0.165, "calf": 0.013, "face_fat": 0.16, "neck_fat": 0.193},
    "athletique": {"body_weight_low": 0.141, "body_weight": 0, "muscle_low": 0, "muscle": 0.792, "belly_fat": 0, "waist": 0, "hips": 0, "chest": 0.012, "shoulders": 0.769, "upper_arm": 0.063, "forearm": 0, "thigh": 0, "calf": 0, "face_fat": 0, "neck_fat": 0},
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
root = bpy.data.objects.new('FITAIA_root', None)
bpy.context.scene.collection.objects.link(root)
for o in bpy.context.scene.objects:
    if o.parent is None and o is not root:
        o.parent = root


def principled(mat):
    if not mat or not mat.use_nodes:
        return None
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            return n
    return None


def setin(node, names, value):
    for nm in names:
        if nm in node.inputs:
            node.inputs[nm].default_value = value
            return True
    return False


for o in meshes:
    for slot in o.material_slots:
        m = slot.material
        p = principled(m)
        if not p:
            continue
        name = (m.name or '').lower()
        if 'skin' in name:
            setin(p, ['Subsurface Weight', 'Subsurface'], 0.22)
            setin(p, ['Subsurface Radius'], (1.0, 0.35, 0.18))
            setin(p, ['Subsurface Scale'], 0.012)
            setin(p, ['Roughness'], 0.62)
            setin(p, ['Specular IOR Level', 'Specular'], 0.3)
        elif 'hair' in name:
            setin(p, ['Roughness'], 0.7)
            setin(p, ['Specular IOR Level', 'Specular'], 0.22)
            setin(p, ['Coat Weight'], 0.0)
            setin(p, ['Sheen Weight'], 0.0)
        elif 'eye' in name and 'brow' not in name and 'lash' not in name:
            setin(p, ['Roughness'], 0.08)
            setin(p, ['Coat Weight'], 0.6)
            setin(p, ['Coat Roughness'], 0.02)
        else:
            setin(p, ['Sheen Weight'], 0.35 if any(k in name for k in ('tee', 'jogger', 'casual')) else 0.0)
            setin(p, ['Sheen Roughness'], 0.5)
        if hasattr(m, 'surface_render_method') and m.blend_method in ('BLEND', 'HASHED'):
            m.surface_render_method = 'DITHERED'

# sol : attrape-ombre (ombre de contact seule, fond transparent)
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
floor = bpy.context.active_object
floor.is_shadow_catcher = True


def area(name, loc, size, energy, color, shape='RECTANGLE', size_y=None, target=(0, 0, 1.0)):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.shape = shape
    ld.size = size
    if size_y:
        ld.size_y = size_y
    ld.energy = energy
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    bpy.context.scene.collection.objects.link(ob)
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return ob


L = OPT.get('light', {})
area('key', (-2.8, -2.4, 2.9), 1.8, L.get('key', 1000), (1.0, 0.94, 0.86), 'RECTANGLE', 1.3, (0, 0, 1.25))
area('fill', (3.2, -2.8, 1.5), 2.5, L.get('fill', 70), (0.86, 0.92, 1.0), target=(0, 0, 1.0))
area('rim_lime', (2.3, 2.2, 2.1), 0.5, L.get('rim_lime', 650), (0.72, 1.0, 0.18), 'RECTANGLE', 2.2, (0, 0, 1.2))
area('rim_white', (-2.2, 2.3, 2.4), 0.5, L.get('rim_white', 520), (1.0, 1.0, 1.0), 'RECTANGLE', 2.2, (0, 0, 1.3))
area('top', (0, -0.3, 4.2), 1.4, L.get('top', 140), (1.0, 0.97, 0.92), 'DISK', target=(0, 0, 1.0))
world = bpy.data.worlds.new('w')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.2, 0.2, 0.21, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = L.get('world', 0.35)
bpy.context.scene.world = world

zmax = 0.0
for o in meshes:
    for v in o.bound_box:
        zmax = max(zmax, (o.matrix_world @ Vector(v)).z)
H = zmax if zmax > 0.5 else 1.76
cam_d = bpy.data.cameras.new('cam')
cam_d.lens = 85
cam = bpy.data.objects.new('cam', cam_d)
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam


def frame_cam(kind):
    if kind == 'portrait':
        cam.location = (0, -1.05, H * 0.925)
        tgt = (0, 0, H * 0.915)
    elif kind == 'buste':
        cam.location = (0, -2.2, H * 0.80)
        tgt = (0, 0, H * 0.77)
    else:
        dist = H * OPT.get('dist', 2.95)
        cam.location = (0, -dist, H * 0.48)
        tgt = (0, 0, H * 0.505)
    d = Vector(tgt) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


sc = bpy.context.scene
sc.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for dev_type in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = dev_type
            prefs.get_devices()
            if any(d.type == dev_type for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == dev_type
                sc.cycles.device = 'GPU'
                print('GPU', dev_type)
                break
        except Exception:
            continue
except Exception as e:
    print('GPU non disponible', e)
sc.cycles.samples = OPT.get('samples', 48)
sc.cycles.use_denoising = True
try:
    sc.cycles.denoiser = 'OPTIX'
except Exception:
    pass
sc.render.use_persistent_data = True
sc.render.resolution_x, sc.render.resolution_y = OPT.get('res', [1080, 1620])
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'AgX'
try:
    sc.view_settings.look = 'AgX - Punchy'
except Exception:
    pass
sc.view_settings.exposure = OPT.get('exposure', -0.5)


def set_values(values):
    for o in meshes:
        sk = o.data.shape_keys
        if not sk:
            continue
        for kb in sk.key_blocks[1:]:
            kb.value = float(values.get(kb.name, 0.0))


def lerp_states(a, b, t):
    keys = set(STATES[a]) | set(STATES[b])
    return {k: STATES[a].get(k, 0.0) * (1 - t) + STATES[b].get(k, 0.0) * t for k in keys}


def smooth(t):
    return t * t * (3 - 2 * t)


def render(path):
    t0 = time.time()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('RENDU', os.path.basename(path), '%.1fs' % (time.time() - t0), flush=True)


only = set(OPT.get('only', []))
for shot in OPT['shots']:
    name, kind = shot['name'], shot['kind']
    frame_cam(shot.get('frame', 'full'))
    if kind == 'still':
        set_values(STATES[shot['state']])
        root.rotation_euler = (0, 0, math.radians(shot.get('yaw', 0)))
        render(os.path.join(OUT, name + '.png'))
    elif kind == 'morph':
        n = shot['n']
        pth = shot['path']
        segs = len(pth) - 1
        root.rotation_euler = (0, 0, math.radians(shot.get('yaw', 0)))
        idx = shot.get('indices', list(range(n)))
        for i in idx:
            u = i / (n - 1) * segs
            s = min(int(u), segs - 1)
            t = u - s
            set_values(lerp_states(pth[s], pth[s + 1], t))
            render(os.path.join(OUT, '%s_%02d.png' % (name, i)))
    elif kind == 'turn':
        n = shot['n']
        set_values(STATES[shot['state']])
        idx = shot.get('indices', list(range(n)))
        for i in idx:
            root.rotation_euler = (0, 0, math.radians(shot.get('yaw0', 0) + 360.0 * i / n))
            render(os.path.join(OUT, '%s_%02d.png' % (name, i)))
print('FIN TEASER RENDER')
