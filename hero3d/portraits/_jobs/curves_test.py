import bpy, sys, math, os
import numpy as np
out = sys.argv[sys.argv.index('--') + 1]
print('VERSION', bpy.app.version_string)
print('HAS add_curves', hasattr(bpy.types.Curves, 'add_curves'))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1, location=(0, 0, 0))
crv = bpy.data.hair_curves.new('hair')
N, P = 3000, 12
crv.add_curves([P] * N)
rng = np.random.default_rng(0)
d = rng.normal(size=(N, 3)); d[:, 2] = np.abs(d[:, 2]); d /= np.linalg.norm(d, axis=1, keepdims=True)
t = np.linspace(0, 1, P)
pos = (d[:, None, :] * 0.1) + d[:, None, :] * 0.04 * t[None, :, None] + np.array([0, 0, -0.03]) * (t[None, :, None] ** 2)
crv.position_data.foreach_set('vector', pos.astype(np.float32).ravel())
names = [a.name for a in crv.attributes]
print('ATTRS', names)
if 'radius' not in names:
    crv.attributes.new('radius', 'FLOAT', 'POINT')
rad = np.full(N * P, 0.0004, np.float32) * np.tile(np.linspace(1, 0.3, P), N).astype(np.float32)
crv.attributes['radius'].data.foreach_set('value', rad)
ob = bpy.data.objects.new('hair', crv)
sc.collection.objects.link(ob)
m = bpy.data.materials.new('hairmat'); m.use_nodes = True
nt = m.node_tree
for n in list(nt.nodes):
    if n.type == 'BSDF_PRINCIPLED': nt.nodes.remove(n)
hb = nt.nodes.new('ShaderNodeBsdfHairPrincipled')
print('HAIR INPUTS', [i.name for i in hb.inputs])
print('HAIR MODELS', [e.identifier for e in hb.bl_rna.properties['model'].enum_items] if 'model' in hb.bl_rna.properties else None)
print('PARAM', [e.identifier for e in hb.bl_rna.properties['parametrization'].enum_items])
hb.parametrization = 'MELANIN'
hb.inputs['Melanin'].default_value = 0.6
nt.links.new(hb.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
crv.materials.append(m)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
cam.location = (0, -0.6, 0.05); cam.rotation_euler = (math.radians(90), 0, 0); sc.camera = cam
l = bpy.data.objects.new('l', bpy.data.lights.new('l', 'AREA')); l.data.energy = 30; l.location = (-0.5, -0.5, 0.5); sc.collection.objects.link(l)
l.rotation_euler = (math.radians(45), 0, math.radians(-45))
sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
for dv in prefs.devices: dv.use = dv.type == 'OPTIX'
sc.cycles.device = 'GPU'
print('DEVICES', [(dv.name, dv.type, dv.use) for dv in prefs.devices])
sc.cycles.samples = 32
sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = 256
sc.render.image_settings.color_mode = 'RGBA'
print('CURVE SHAPES', [e.identifier for e in sc.cycles_curves.bl_rna.properties['shape'].enum_items])
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('OK', out, os.path.exists(out))
