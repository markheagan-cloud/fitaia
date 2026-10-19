"""
FITAIA — contrôles du corps dans Blender (BodyMorphService côté Blender) : 13 curseurs 0 → 1 pilotant les shape keys.

  blender -b --factory-startup --python body_controls.py -- <avatar.glb> <sortie.blend> [<etat.json>]

Importe l'avatar de l'usine, crée sur l'objet « FITAIA_body » les propriétés bodyFat, visceralBelly, waist, hips, chest,
shoulders, upperArm, forearm, thigh, calf, faceFat, neckFat, muscleMass (0..1, neutre : bodyFat = muscleMass = 0,5) et
pose sur CHAQUE maillage (corps, vêtements, yeux…) des drivers vers ses shape keys — même table que
pipeline/body_morph.py (linéaire par morceaux, continue, paramètres indépendants). Les expressions (expr_*) ont aussi
leur curseur. Un artiste anime ou interpole les curseurs ; l'app, elle, lit directement les shape keys du GLB.
"""
import json
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT = argv[0], argv[1]
STATE = json.load(open(argv[2])) if len(argv) > 2 else {}

PARAMS = ['bodyFat', 'visceralBelly', 'waist', 'hips', 'chest', 'shoulders', 'upperArm', 'forearm', 'thigh', 'calf',
          'faceFat', 'neckFat', 'muscleMass']
NEUTRAL = {p: 0.0 for p in PARAMS}
NEUTRAL.update({'bodyFat': 0.5, 'muscleMass': 0.5})
# shape key → expression du driver (variables = paramètres)
DRIVERS = {
    'body_weight': ('max(0.0, min(1.0, (bodyFat - 0.5) * 2))', ['bodyFat']),
    'body_weight_low': ('max(0.0, min(1.0, (0.5 - bodyFat) * 2))', ['bodyFat']),
    'muscle': ('max(0.0, min(1.0, (muscleMass - 0.5) * 2))', ['muscleMass']),
    'muscle_low': ('max(0.0, min(1.0, (0.5 - muscleMass) * 2))', ['muscleMass']),
    'belly_fat': ('visceralBelly * 0.75', ['visceralBelly']),
    'waist': ('waist', ['waist']), 'hips': ('hips', ['hips']), 'chest': ('chest', ['chest']),
    'shoulders': ('shoulders', ['shoulders']), 'upper_arm': ('upperArm', ['upperArm']), 'forearm': ('forearm', ['forearm']),
    'thigh': ('thigh', ['thigh']), 'calf': ('calf', ['calf']), 'face_fat': ('faceFat', ['faceFat']), 'neck_fat': ('neckFat', ['neckFat']),
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
ctrl = bpy.data.objects.new('FITAIA_body', None)
bpy.context.scene.collection.objects.link(ctrl)
for p in PARAMS:
    ctrl[p] = float(STATE.get(p, NEUTRAL[p]))
    ui = ctrl.id_properties_ui(p)
    ui.update(min=0.0, max=1.0, soft_min=0.0, soft_max=1.0, default=NEUTRAL[p],
              description=f'FITAIA BodyMorphService : {p} (0 → 1, neutre {NEUTRAL[p]})')
exprs = sorted({kb.name for o in meshes if o.data.shape_keys for kb in o.data.shape_keys.key_blocks if kb.name.startswith('expr_')})
for e in exprs:
    ctrl[e] = float(STATE.get(e, 0.0))
    ctrl.id_properties_ui(e).update(min=0.0, max=1.0, default=0.0, description=f'expression (shape key {e})')
n = 0
for o in meshes:
    sk = o.data.shape_keys
    if not sk:
        continue
    for kb in sk.key_blocks[1:]:
        if kb.name in DRIVERS:
            expr, vars_ = DRIVERS[kb.name]
        elif kb.name in exprs:
            expr, vars_ = kb.name, [kb.name]
        else:
            continue
        fc = kb.driver_add('value')
        drv = fc.driver
        drv.type = 'SCRIPTED'
        drv.expression = expr
        for v in vars_:
            var = drv.variables.new()
            var.name = v
            var.type = 'SINGLE_PROP'
            var.targets[0].id = ctrl
            var.targets[0].data_path = f'["{v}"]'
        n += 1
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('BODY CONTROLS OK', len(meshes), 'maillages', n, 'drivers', len(exprs), 'expressions ->', OUT)
