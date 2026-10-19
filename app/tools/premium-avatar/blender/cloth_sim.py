"""
FITAIA — étape 2 des vêtements : simulation de tissu dans Blender (sans interface).

  blender -b --factory-startup --python cloth_sim.py -- garments_in.json garments_out.json [frames]

Le corps (au repos) sert d'obstacle ; chaque vêtement tombe sous la gravité, épinglé au col / à la taille / aux chevilles,
ce qui crée de vrais plis. Le repère est celui de MakeHuman (y vers le haut) : la gravité est mise sur -Y.
L'ordre des sommets est conservé (création par from_pydata) pour que l'étape 3 relie chaque sommet au corps.
"""
import json
import sys
import time

import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
IN, OUT = argv[0], argv[1]
FRAMES = int(argv[2]) if len(argv) > 2 else 48
data = json.load(open(IN))

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.gravity = (0.0, -9.81, 0.0)
sc.frame_start, sc.frame_end = 1, FRAMES


def mesh(name, verts, faces):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    return ob


body = mesh('body', data['body']['verts'], data['body']['faces'])
col = body.modifiers.new('collision', 'COLLISION')
body.collision.thickness_outer = 0.008
body.collision.thickness_inner = 0.004
body.collision.cloth_friction = 6.0
body.collision.damping = 0.6

SETTINGS = {
    # jersey de coton épais, coupe oversize : souple, tombe en plis larges
    'tee': {'mass': 0.25, 'tension': 8.0, 'compression': 6.0, 'shear': 3.0, 'bending': 0.05, 'air': 1.0},
    # molleton technique : un peu plus raide
    'jogger': {'mass': 0.3, 'tension': 12.0, 'compression': 8.0, 'shear': 5.0, 'bending': 0.25, 'air': 1.0},
}

objs = {}
results = {}
# ordre : d'abord le bas (jogging), qui devient ensuite un obstacle pour le t-shirt porté par-dessus
order = [n for n in ('jogger', 'tee') if n in data['garments']] + [n for n in data['garments'] if n not in ('jogger', 'tee')]
for name in order:
    g = data['garments'][name]
    ob = mesh(name, g['verts'], g['faces'])
    vg = ob.vertex_groups.new(name='pin')
    vg.add(g['pins'], 1.0, 'REPLACE')
    cl = ob.modifiers.new('cloth', 'CLOTH')
    s = cl.settings
    st = SETTINGS.get(name, SETTINGS['tee'])
    s.quality = 10
    s.mass = st['mass']
    s.air_damping = st['air']
    s.tension_stiffness = st['tension']
    s.compression_stiffness = st['compression']
    s.shear_stiffness = st['shear']
    s.bending_stiffness = st['bending']
    s.vertex_group_mass = 'pin'
    s.pin_stiffness = 1.0
    c = cl.collision_settings
    c.collision_quality = 4
    c.distance_min = 0.004
    c.use_self_collision = True
    c.self_distance_min = 0.003
    cl.point_cache.frame_start = 1
    cl.point_cache.frame_end = FRAMES
    t0 = time.time()
    for f in range(1, FRAMES + 1):
        sc.frame_set(f)
        if f % 12 == 0:
            print(name, 'frame', f, round(time.time() - t0, 1), 's', flush=True)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    results[name] = [[round(c, 5) for c in v.co] for v in me.vertices]
    ev.to_mesh_clear()
    # le vêtement simulé devient un obstacle figé pour les suivants
    ob.modifiers.remove(cl)
    for i, v in enumerate(ob.data.vertices):
        v.co = results[name][i]
    sc.frame_set(1)
    colm = ob.modifiers.new('collision', 'COLLISION')
    ob.collision.thickness_outer = 0.003
    ob.collision.cloth_friction = 4.0
    objs[name] = ob

out = {'units': 'm', 'garments': {n: {'verts': v} for n, v in results.items()}}
json.dump(out, open(OUT, 'w'))
print('SIM OK')
