"""
FITAIA — planche de validation du héros (Blender, sans interface).

  blender -b --factory-startup --python render_sheet.py -- <avatar.glb> <dossier_sortie> [options JSON]

Rend le même GLB que l'app (mêmes morphs) dans un studio « publicité fitness » :
fond gris chaud type béton, grande boîte à lumière douce, deux contre-jours, ombres de contact réelles.
Sorties : <état>_<vue>.png pour chaque état (surpoids / actuel / athlétique) et vue (face, 3/4, profil, dos).
Le personnage tourne, la lumière reste fixe (comme un plateau photo avec plateau tournant).
"""
import json
import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLB, OUT = argv[0], argv[1]
OPT = (json.load(open(argv[2])) if argv[2].endswith('.json') else json.loads(argv[2])) if len(argv) > 2 else {}
os.makedirs(OUT, exist_ok=True)

STATES = OPT.get('states', {
    'surpoids': {'body_weight': 0.85, 'belly_fat': 0.6, 'body_weight_low': 0.0, 'muscle': 0.0, 'muscle_low': 0.15},
    'actuel': {'body_weight': 0.35, 'belly_fat': 0.3, 'body_weight_low': 0.0, 'muscle': 0.05, 'muscle_low': 0.0},
    'athletique': {'body_weight': 0.0, 'belly_fat': 0.0, 'body_weight_low': 0.15, 'muscle': 0.75, 'muscle_low': 0.0},
})
VIEWS = OPT.get('views', {'face': 0, 'trois-quarts': 35, 'profil': 90, 'dos': 180})
RES = OPT.get('res', [1080, 1620])
SAMPLES = OPT.get('samples', 160)
ONLY = OPT.get('only')  # ex. ["actuel_face"] pour un test rapide

# ---------------------------------------------------------------------------------------------
# Scène vide + import
# ---------------------------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
root = bpy.data.objects.new('FITAIA_root', None)
bpy.context.scene.collection.objects.link(root)
for o in bpy.context.scene.objects:
    if o.parent is None and o is not root:
        o.parent = root

# ---------------------------------------------------------------------------------------------
# Matières : peau avec diffusion sous la surface, cheveux mats, yeux brillants
# ---------------------------------------------------------------------------------------------
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
            setin(p, ['Roughness'], 0.68)
            setin(p, ['Specular IOR Level', 'Specular'], 0.26)
            setin(p, ['Coat Weight'], 0.0)
            # micro-relief de pores (procédural, très léger)
            nt = m.node_tree
            noise = nt.nodes.new('ShaderNodeTexNoise')
            noise.inputs['Scale'].default_value = 900.0
            noise.inputs['Detail'].default_value = 6.0
            bump = nt.nodes.new('ShaderNodeBump')
            bump.inputs['Strength'].default_value = 0.12
            bump.inputs['Distance'].default_value = 0.0004
            nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
            nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
        elif 'hair' in name:
            # cheveux : reflet doux et étiré, jamais de voile clair sur le dessus
            setin(p, ['Roughness'], 0.72)
            setin(p, ['Specular IOR Level', 'Specular'], 0.22)
            setin(p, ['Coat Weight'], 0.0)
            setin(p, ['Sheen Weight'], 0.0)
            m.blend_method = 'HASHED' if hasattr(m, 'blend_method') else m.blend_method
        elif 'eye' in name and 'brow' not in name and 'lash' not in name:
            setin(p, ['Roughness'], 0.08)
            setin(p, ['Coat Weight'], 0.6)
            setin(p, ['Coat Roughness'], 0.02)
        else:
            setin(p, ['Sheen Weight'], 0.35 if any(k in name for k in ('tee', 'jogger', 'casual')) else 0.0)
            setin(p, ['Sheen Roughness'], 0.5)
        if hasattr(m, 'surface_render_method') and m.blend_method in ('BLEND', 'HASHED'):
            m.surface_render_method = 'DITHERED'

# ---------------------------------------------------------------------------------------------
# Rendu « campagne » (défaut) : mêmes matières que les portraits fins (peau HD, maille du tissu) et surfaces lissées
# (subdivision) : plus de facettes sur les épaules, le ventre et les bras. Désactivable : {"premium": false}.
# ---------------------------------------------------------------------------------------------
PREMIUM = OPT.get('premium', True)
if PREMIUM:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import skin_hd as _shd
    _zones = os.path.splitext(GLB)[0] + '.skin_zones.png'
    _rough = os.path.splitext(GLB)[0] + '.skin_rough.png'
    for o in meshes:
        base = o.name.split('.')[0]
        for slot in o.material_slots:
            m = slot.material
            p = principled(m)
            if not p:
                continue
            nm = (m.name or '').lower()
            if 'skin' in nm and os.path.exists(_zones):
                # peau HD seulement avec la carte des zones (sinon elle brille partout : aspect plastique)
                for n in [n for n in m.node_tree.nodes if n.type in ('BUMP', 'TEX_NOISE')]:
                    m.node_tree.nodes.remove(n)
                _shd.skin_hd(m, p, _zones if os.path.exists(_zones) else None, _rough if os.path.exists(_rough) else None,
                             strength=1.0, age=0.25)
            elif any(k in nm for k in ('casualsuit', 'tee', 'jogger')):
                nt = m.node_tree
                tc = nt.nodes.new('ShaderNodeTexCoord')
                wave = nt.nodes.new('ShaderNodeTexWave')
                wave.inputs['Scale'].default_value = 1400.0
                wave.inputs['Distortion'].default_value = 1.5
                nt.links.new(tc.outputs['Object'], wave.inputs['Vector'])
                bump = nt.nodes.new('ShaderNodeBump')
                bump.inputs['Strength'].default_value = 0.16
                bump.inputs['Distance'].default_value = 0.0004
                nt.links.new(wave.outputs['Fac'], bump.inputs['Height'])
                nin = p.inputs['Normal']
                if nin.is_linked:
                    nt.links.new(nin.links[0].from_socket, bump.inputs['Normal'])
                nt.links.new(bump.outputs['Normal'], nin)
                setin(p, ['Roughness'], 0.9)
                setin(p, ['Sheen Weight'], 0.55)
                setin(p, ['Sheen Roughness'], 0.35)
        # corps seulement : sur les vêtements (maillage grossier), la subdivision rétracte le tissu (jambes en legging)
        if base == 'body':
            # le GLB duplique les sommets le long des coutures UV : on les ressoude (clés de forme comprises) avant
            # de subdiviser, sinon la subdivision ouvre des fentes aux coutures
            import bmesh
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
            bm.to_mesh(o.data)
            bm.free()
            md = o.modifiers.new('subsurf', 'SUBSURF')
            md.levels = 1
            md.render_levels = 1

# ---------------------------------------------------------------------------------------------
# Coiffure en mèches (si l'usine a produit <avatar>.hair.npz) : remplace la coiffure temps réel pour le rendu
# ---------------------------------------------------------------------------------------------
HAIR_NPZ = os.path.splitext(GLB)[0] + '.hair.npz'
if os.path.exists(HAIR_NPZ):
    import numpy as np
    _d = np.load(HAIR_NPZ)
    for _g in [str(x) for x in _d['groups']]:
        _P = _d[_g + '_points']
        _N, _M, _ = _P.shape
        _crv = bpy.data.hair_curves.new(_g)
        _crv.add_curves([_M] * _N)
        _crv.position_data.foreach_set('vector', np.stack([_P[..., 0], -_P[..., 2], _P[..., 1]], -1).astype(np.float32).ravel())
        if 'radius' not in [a.name for a in _crv.attributes]:
            _crv.attributes.new('radius', 'FLOAT', 'POINT')
        _crv.attributes['radius'].data.foreach_set('value', np.tile(_d[_g + '_radius'].astype(np.float32), _N))
        _ob = bpy.data.objects.new('strands_' + _g, _crv)
        bpy.context.scene.collection.objects.link(_ob)
        _ob.parent = root
        _m = bpy.data.materials.new('mat_' + _g)
        _m.use_nodes = True
        _nt = _m.node_tree
        for _n in list(_nt.nodes):
            if _n.type == 'BSDF_PRINCIPLED':
                _nt.nodes.remove(_n)
        _hb = _nt.nodes.new('ShaderNodeBsdfHairPrincipled')
        if 'hair_melanin' in OPT:
            # identité : mélanine / rougeur estimées sur la photo (le paramétrage « couleur » blanchit les cheveux clairs)
            _hb.parametrization = 'MELANIN'
            _hb.inputs['Melanin'].default_value = OPT['hair_melanin']
            _hb.inputs['Melanin Redness'].default_value = OPT.get('hair_redness', 0.3)
            _hb.inputs['IOR'].default_value = 1.45
            _hb.inputs['Random Color'].default_value = 0.1
            _hb.inputs['Roughness'].default_value = 0.3 if OPT['hair_melanin'] < 0.8 else 0.24
            _hb.inputs['Radial Roughness'].default_value = 0.38
        else:
            _hb.parametrization = 'COLOR'
            # couleur des cheveux (linéaire), brun foncé par défaut
            _hb.inputs['Color'].default_value = (*OPT.get('hair_color', (0.12, 0.085, 0.06)), 1.0)
            _hb.inputs['Roughness'].default_value = 0.4
            _hb.inputs['Radial Roughness'].default_value = 0.45
        _nt.links.new(_hb.outputs[0], _nt.nodes['Material Output'].inputs['Surface'])
        _crv.materials.append(_m)
    for _o in meshes:
        if _o.name.split('.')[0] == 'hair':
            _o.hide_render = True
    print('MÈCHES', HAIR_NPZ)

# ---------------------------------------------------------------------------------------------
# Studio : cyclorama gris chaud (sol + mur courbé), béton très léger
# ---------------------------------------------------------------------------------------------
def cyclorama():
    import bmesh
    me = bpy.data.meshes.new('cyclo')
    bm = bmesh.new()
    W, D, H, R = 14.0, 10.0, 8.0, 2.5
    prof = []
    for i in range(0, 13):
        z = -D / 2 + i * ((D - R) / 12)
        prof.append((z, 0.0))
    for i in range(1, 17):
        a = (i / 16) * (math.pi / 2)
        prof.append((D / 2 - R + math.sin(a) * R, R - math.cos(a) * R))
    for i in range(1, 9):
        prof.append((D / 2, R + i * (H - R) / 8))
    cols = 24
    grid = []
    for (z, y) in prof:
        row = []
        for c in range(cols + 1):
            x = -W / 2 + c * W / cols
            row.append(bm.verts.new((x, z, y)))
        grid.append(row)
    for r in range(len(grid) - 1):
        for c in range(cols):
            bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new('cyclo', me)
    bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.new('cyclo_mat')
    mat.use_nodes = True
    nt = mat.node_tree
    p = principled(mat)
    tex = nt.nodes.new('ShaderNodeTexNoise')
    tex.inputs['Scale'].default_value = 6.0
    tex.inputs['Detail'].default_value = 10.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    dark = OPT.get('premium', True)   # fond anthracite façon campagne fitness (le perso se détache)
    ramp.color_ramp.elements[0].color = (0.085, 0.085, 0.09, 1) if dark else (0.24, 0.224, 0.205, 1)
    ramp.color_ramp.elements[1].color = (0.11, 0.11, 0.115, 1) if dark else (0.28, 0.264, 0.244, 1)
    nt.links.new(tex.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    setin(p, ['Roughness'], 0.85)
    ob.data.materials.append(mat)
    return ob


cyclorama()


def area(name, loc, rot_deg, size, energy, color, shape='RECTANGLE', size_y=None):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.shape = shape
    ld.size = size
    if size_y:
        ld.size_y = size_y
    ld.energy = energy
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot_deg]
    bpy.context.scene.collection.objects.link(ob)
    return ob


def aim(ob, target=(0, 0, 1.0)):
    from mathutils import Vector
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


# grande boîte à lumière principale, chaude, à gauche
k = area('key', (-3.0, -2.0, 2.8), (0, 0, 0), 2.0, 1150, (1.0, 0.93, 0.85), 'RECTANGLE', 1.4)
aim(k, (0, 0, 1.2))
# remplissage froid et doux à droite
f = area('fill', (3.2, -2.6, 1.6), (0, 0, 0), 2.5, 70 if OPT.get('premium', True) else 110, (0.88, 0.93, 1.0))
aim(f, (0, 0, 1.0))
# deux contre-jours (découpent la silhouette)
r1 = area('rim_l', (-2.0, 2.4, 2.2), (0, 0, 0), 0.6, 650 if OPT.get('premium', True) else 420, (1.0, 1.0, 1.0), 'RECTANGLE', 2.0)
aim(r1, (0, 0, 1.25))
r2 = area('rim_r', (2.1, 2.3, 2.0), (0, 0, 0), 0.6, 480 if OPT.get('premium', True) else 300, (0.92, 1.0, 0.75), 'RECTANGLE', 2.0)
aim(r2, (0, 0, 1.2))
# douche de lumière douce sur le haut
t = area('top', (0, -0.4, 4.2), (0, 0, 0), 1.6, 160, (1.0, 0.97, 0.92), 'DISK')
aim(t, (0, 0, 1.0))

# halo doux sur le fond, derrière le buste : détache la silhouette (look campagne produit)
halo = area('halo', (0, 3.0, 1.3), (0, 0, 0), 3.0, 70, (1.0, 0.96, 0.9), 'DISK')
aim(halo, (0, 5.2, 1.6))
world = bpy.data.worlds.new('w')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.42, 0.41, 0.40, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.25
bpy.context.scene.world = world

# ---------------------------------------------------------------------------------------------
# Caméra : longue focale (pas de déformation), cadrage pied à tête
# ---------------------------------------------------------------------------------------------
# hauteur du personnage
zmax = 0.0
for o in meshes:
    for v in o.bound_box:
        zmax = max(zmax, (o.matrix_world @ __import__('mathutils').Vector(v)).z)
H = zmax if zmax > 0.5 else 1.76
cam_d = bpy.data.cameras.new('cam')
cam_d.lens = 85
cam = bpy.data.objects.new('cam', cam_d)
bpy.context.scene.collection.objects.link(cam)
if OPT.get('frame') == 'portrait':
    # gros plan visage (contrôle qualité du visage), même lumière que la planche
    cam.location = (0, -OPT.get('portrait_dist', 1.05), H * 0.925)
    aim(cam, (0, 0, H * 0.915))
elif OPT.get('frame') == 'buste':
    cam.location = (0, -2.1, H * 0.80)
    aim(cam, (0, 0, H * 0.76))
else:
    dist = H * OPT.get('dist', 2.95)
    cam.location = (0, -dist, H * 0.55)
    aim(cam, (0, 0, H * 0.505))
bpy.context.scene.camera = cam

# ---------------------------------------------------------------------------------------------
# Rendu Cycles (GPU si possible)
# ---------------------------------------------------------------------------------------------
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for dev_type in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
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
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.cycles.use_adaptive_sampling = True       # s'arrête tôt sur les zones déjà propres (fond, studio)
sc.cycles.adaptive_threshold = 0.02
sc.render.use_persistent_data = True         # garde la scène en mémoire GPU entre les vues
sc.render.resolution_x, sc.render.resolution_y = RES
sc.render.film_transparent = False
sc.render.image_settings.file_format = 'PNG'
try:
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = OPT.get('look', 'AgX - Punchy')
except Exception:
    sc.view_settings.view_transform = 'Filmic'
sc.view_settings.exposure = OPT.get('exposure', -0.8)

# ---------------------------------------------------------------------------------------------
# États × vues
# ---------------------------------------------------------------------------------------------
def set_state(values):
    for o in meshes:
        sk = o.data.shape_keys
        if not sk:
            continue
        for kb in sk.key_blocks[1:]:
            kb.value = float(values.get(kb.name, 0.0))


report = []
for sname, values in STATES.items():
    set_state(values)
    for vname, yaw in VIEWS.items():
        tag = f'{sname}_{vname}'
        if ONLY and tag not in ONLY:
            continue
        root.rotation_euler = (0, 0, math.radians(yaw))
        sc.render.filepath = os.path.join(OUT, tag + '.png')
        bpy.ops.render.render(write_still=True)
        report.append(tag)
        print('RENDU', tag, flush=True)

json.dump({'rendus': report, 'hauteur_m': H}, open(os.path.join(OUT, 'rendus.json'), 'w'))
