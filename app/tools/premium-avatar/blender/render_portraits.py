"""
FITAIA — portraits sociaux de la Communauté (Blender, sans interface).

  blender -b --factory-startup --python render_portraits.py -- <job.json>

job.json : {"samples": 160, "scale": 1.5, "items": [{"key", "glb", "hair" (npz ou null), "meta" (portrait.json),
            "state": {morph: poids}, "out": dossier, "yaw": 12, "hair_render": {"melanin", "redness"}, "framings": [...]}]}

Même avatar maître que le reste de l'app (le GLB de l'usine), même studio que la planche du héros (lumière chaude douce,
deux contre-jours), fond TRANSPARENT : la carte sociale (fond studio FITAIA) est composée ensuite (compose_portraits.py).
Cadrages : head (1:1), bust (1:1), full (640×1024), card (4:5). Les cheveux sont des mèches (fichier .hair.npz) rendues
avec le Principled Hair BSDF ; la coiffure temps réel du GLB (cartes / coquilles) est masquée quand des mèches existent.
"""
import json
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Quaternion, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
JOB = json.load(open(argv[0], encoding='utf-8'))
SAMPLES = JOB.get('samples', 160)
SCALE = JOB.get('scale', 1.5)
FRAMES = {   # sortie finale (px) ; le rendu se fait à SCALE× puis est réduit
    'head': (512, 512), 'bust': (640, 640), 'full': (640, 1024), 'card': (640, 800),
}


def gl2bl(p):
    """glTF (y vers le haut, z vers l'avant) → Blender (z vers le haut, −y vers l'avant)."""
    return Vector((p[0], -p[2], p[1]))


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


def setup_materials(meshes, rough_map=None, fine=False):
    for o in meshes:
        for slot in o.material_slots:
            m = slot.material
            p = principled(m)
            if not p:
                continue
            name = (m.name or '').lower()
            if name == 'skin' or name.startswith('skin'):
                skin_material(m, p, rough_map)
            elif name.startswith('hair'):
                setin(p, ['Roughness'], 0.72)
                setin(p, ['Specular IOR Level', 'Specular'], 0.22)
            elif name.startswith('eyes') or name == 'eyes':
                eye_material(o, m, p)
            elif name.startswith('glasses_lens'):
                setin(p, ['Alpha'], 0.12)
                setin(p, ['Roughness'], 0.02)
                setin(p, ['Specular IOR Level', 'Specular'], 0.9)
                if hasattr(m, 'surface_render_method'):
                    m.surface_render_method = 'BLENDED'
            elif name.startswith(('glasses', 'watch', 'earrings')):
                pass
            elif any(k in name for k in ('casualsuit', 'tee', 'jogger', 'sportsuit')):
                setin(p, ['Sheen Weight'], 0.4)
                setin(p, ['Sheen Roughness'], 0.5)
                setin(p, ['Specular IOR Level', 'Specular'], 0.25)
                if fine:
                    fabric_detail(m, p)
                    if not any(md.type == 'SUBSURF' for md in o.modifiers):
                        sub = o.modifiers.new('lisse', 'SUBSURF')
                        sub.levels, sub.render_levels = 1, 1
            elif fine and name.startswith('shoes'):
                setin(p, ['Roughness'], 0.55)
                setin(p, ['Sheen Weight'], 0.2)
                setin(p, ['Specular IOR Level', 'Specular'], 0.35)
            if hasattr(m, 'surface_render_method') and m.blend_method in ('BLEND', 'HASHED') and not name.startswith('glasses_lens'):
                m.surface_render_method = 'DITHERED'


def _node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
    return n


def skin_material(m, p, rough_map=None):
    """Peau : diffusion sous la surface « peau » (rayons rouge > vert > bleu, échelle réelle), rugosité par zones
    (carte de l'usine : zone T, lèvres, barbe), micro-relief de pores (Voronoï + bruit fin, coordonnées objet en mètres)
    et légère variation de rugosité : la lumière accroche la peau sans l'effet « plastique »."""
    nt = m.node_tree
    setin(p, ['Subsurface Weight', 'Subsurface'], 1.0)
    setin(p, ['Subsurface Radius'], (1.0, 0.42, 0.24))
    setin(p, ['Subsurface Scale'], 0.0042)
    setin(p, ['Subsurface IOR'], 1.4)
    setin(p, ['Subsurface Anisotropy'], 0.0)
    try:
        p.subsurface_method = 'RANDOM_WALK_SKIN'
    except Exception:
        pass
    setin(p, ['Specular IOR Level', 'Specular'], 0.42)
    setin(p, ['Coat Weight'], 0.0)
    setin(p, ['Sheen Weight'], 0.0)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    # rugosité : carte par zones (si fournie) × variation fine
    noise_r = _node(nt, 'ShaderNodeTexNoise', Scale=180.0, Detail=4.0)
    nt.links.new(tc.outputs['Object'], noise_r.inputs['Vector'])
    rough = _node(nt, 'ShaderNodeMath')
    rough.operation = 'MULTIPLY_ADD'
    rough.inputs[1].default_value = 0.12
    nt.links.new(noise_r.outputs['Fac'], rough.inputs[0])
    if rough_map and os.path.exists(rough_map):
        img = bpy.data.images.load(rough_map)
        img.colorspace_settings.name = 'Non-Color'
        it = nt.nodes.new('ShaderNodeTexImage')
        it.image = img
        uvn = nt.nodes.new('ShaderNodeUVMap')
        nt.links.new(uvn.outputs['UV'], it.inputs['Vector'])
        add = _node(nt, 'ShaderNodeMath')
        add.operation = 'ADD'
        add.inputs[1].default_value = -0.06
        nt.links.new(it.outputs['Color'], add.inputs[0])
        nt.links.new(add.outputs[0], rough.inputs[2])
    else:
        rough.inputs[2].default_value = 0.46
    for l in list(p.inputs['Roughness'].links):
        nt.links.remove(l)
    nt.links.new(rough.outputs[0], p.inputs['Roughness'])
    # pores : cellules de Voronoï (~0,7 mm) creusées + grain fin
    vor = _node(nt, 'ShaderNodeTexVoronoi', Scale=1300.0, Randomness=1.0)
    vor.feature = 'F1'
    nt.links.new(tc.outputs['Object'], vor.inputs['Vector'])
    fine = _node(nt, 'ShaderNodeTexNoise', Scale=5200.0, Detail=2.0)
    nt.links.new(tc.outputs['Object'], fine.inputs['Vector'])
    pores = _node(nt, 'ShaderNodeMath')
    pores.operation = 'POWER'
    pores.inputs[1].default_value = 0.45
    nt.links.new(vor.outputs['Distance'], pores.inputs[0])
    mix = _node(nt, 'ShaderNodeMath')
    mix.operation = 'MULTIPLY_ADD'
    mix.inputs[1].default_value = 0.35
    nt.links.new(fine.outputs['Fac'], mix.inputs[0])
    nt.links.new(pores.outputs[0], mix.inputs[2])
    bump = _node(nt, 'ShaderNodeBump', Strength=0.3, Distance=0.00025)
    nt.links.new(mix.outputs[0], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    # micro-variations de teint (taches de mélanine, petits vaisseaux) : la texture MakeHuman est floue en gros plan
    if p.inputs['Base Color'].is_linked:
        src_ = p.inputs['Base Color'].links[0].from_socket
        mel = _node(nt, 'ShaderNodeTexNoise', Scale=420.0, Detail=6.0, Roughness=0.65)
        nt.links.new(tc.outputs['Object'], mel.inputs['Vector'])
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = 0.3
        ramp.color_ramp.elements[0].color = (0.90, 0.86, 0.85, 1)
        ramp.color_ramp.elements[1].position = 0.7
        ramp.color_ramp.elements[1].color = (1.04, 1.02, 1.0, 1)
        nt.links.new(mel.outputs['Fac'], ramp.inputs['Fac'])
        dots = nt.nodes.new('ShaderNodeValToRGB')            # pores : un rien plus sombres
        dots.color_ramp.elements[0].position = 0.0
        dots.color_ramp.elements[0].color = (0.93, 0.90, 0.89, 1)
        dots.color_ramp.elements[1].position = 0.25
        dots.color_ramp.elements[1].color = (1, 1, 1, 1)
        nt.links.new(vor.outputs['Distance'], dots.inputs['Fac'])
        m1 = nt.nodes.new('ShaderNodeMix')
        m1.data_type = 'RGBA'
        m1.blend_type = 'MULTIPLY'
        m1.inputs[0].default_value = 1.0
        nt.links.new(src_, m1.inputs[6])
        nt.links.new(ramp.outputs['Color'], m1.inputs[7])
        m2 = nt.nodes.new('ShaderNodeMix')
        m2.data_type = 'RGBA'
        m2.blend_type = 'MULTIPLY'
        m2.inputs[0].default_value = 1.0
        nt.links.new(m1.outputs[2], m2.inputs[6])
        nt.links.new(dots.outputs['Color'], m2.inputs[7])
        nt.links.new(m2.outputs[2], p.inputs['Base Color'])


def eye_material(ob, m, p):
    """Œil : globe (sclère + iris) mat-satiné ; cornée = coque transparente brillante (reflet net de la boîte à lumière),
    transparente aux ombres (sinon l'iris s'éteint)."""
    nt = m.node_tree
    setin(p, ['Roughness'], 0.32)
    setin(p, ['Coat Weight'], 0.0)
    setin(p, ['Specular IOR Level', 'Specular'], 0.2)
    setin(p, ['Subsurface Weight', 'Subsurface'], 0.0)
    if p.inputs['Base Color'].is_linked:
        try:
            src_ = p.inputs['Base Color'].links[0].from_socket
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = 1.0
            mix.inputs[7].default_value = (0.84, 0.80, 0.77, 1.0)       # sclère jamais blanc pur
            nt.links.new(src_, mix.inputs[6])
            nt.links.new(mix.outputs[2], p.inputs['Base Color'])
        except Exception as e:
            print('sclère non ajustée', e)
    # cornée : faces dont les UV sont dans la pastille de la texture (coin bas-droit)
    me = ob.data
    uvl = me.uv_layers.active
    if uvl is None:
        return
    cm = bpy.data.materials.new('cornea')
    cm.use_nodes = True
    cn = cm.node_tree
    for n in list(cn.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            cn.nodes.remove(n)
    out = [n for n in cn.nodes if n.type == 'OUTPUT_MATERIAL'][0]
    gl = cn.nodes.new('ShaderNodeBsdfGlossy')
    gl.inputs['Roughness'].default_value = 0.025
    tr = cn.nodes.new('ShaderNodeBsdfTransparent')
    fr = cn.nodes.new('ShaderNodeFresnel')
    fr.inputs['IOR'].default_value = 1.38
    mx = cn.nodes.new('ShaderNodeMixShader')
    cn.links.new(fr.outputs[0], mx.inputs[0])
    cn.links.new(tr.outputs[0], mx.inputs[1])
    cn.links.new(gl.outputs[0], mx.inputs[2])
    lp = cn.nodes.new('ShaderNodeLightPath')
    mx2 = cn.nodes.new('ShaderNodeMixShader')
    tr2 = cn.nodes.new('ShaderNodeBsdfTransparent')
    cn.links.new(lp.outputs['Is Shadow Ray'], mx2.inputs[0])
    cn.links.new(mx.outputs[0], mx2.inputs[1])
    cn.links.new(tr2.outputs[0], mx2.inputs[2])
    cn.links.new(mx2.outputs[0], out.inputs['Surface'])
    me.materials.append(cm)
    ci = len(me.materials) - 1
    n_c = 0
    for poly in me.polygons:
        us = [uvl.data[li].uv for li in poly.loop_indices]
        u = sum(x[0] for x in us) / len(us)
        v = sum(x[1] for x in us) / len(us)
        if u > 0.82 and v < 0.18:
            poly.material_index = ci
            n_c += 1
    print('cornée : faces', n_c)


def fabric_detail(m, p):
    """Tissu : maille fine (jersey / molleton) en micro-relief + légère variation de teinte, en coordonnées objet."""
    nt = m.node_tree
    tc = nt.nodes.new('ShaderNodeTexCoord')
    wave = _node(nt, 'ShaderNodeTexWave', Scale=1400.0, Distortion=1.5, Detail=2.0)
    nt.links.new(tc.outputs['Object'], wave.inputs['Vector'])
    noise = _node(nt, 'ShaderNodeTexNoise', Scale=900.0, Detail=3.0)
    nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
    mixh = _node(nt, 'ShaderNodeMath')
    mixh.operation = 'MULTIPLY_ADD'
    mixh.inputs[1].default_value = 0.5
    nt.links.new(wave.outputs['Fac'], mixh.inputs[0])
    nt.links.new(noise.outputs['Fac'], mixh.inputs[2])
    bump = _node(nt, 'ShaderNodeBump', Strength=0.18, Distance=0.0004)
    nt.links.new(mixh.outputs[0], bump.inputs['Height'])
    nrm_in = p.inputs['Normal']
    if nrm_in.is_linked:
        nt.links.new(nrm_in.links[0].from_socket, bump.inputs['Normal'])
    nt.links.new(bump.outputs['Normal'], nrm_in)
    setin(p, ['Roughness'], 0.9)
    setin(p, ['Sheen Weight'], 0.55)
    setin(p, ['Sheen Roughness'], 0.35)
    setin(p, ['Sheen Tint'], (1.0, 1.0, 1.0, 1.0))


def _freeze(ob):
    """Fige l'objet dans son état courant (clés de forme + modificateurs) : nouveau maillage statique."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    if old.shape_keys:
        ob.shape_key_clear()
    ob.data = me
    for md in list(ob.modifiers):
        ob.modifiers.remove(md)
    for mat in old.materials:
        if mat and mat.name not in [m.name for m in me.materials if m]:
            me.materials.append(mat)
    return ob


def simulate_cloth(meshes, it, meta):
    """Plis réels du t-shirt et du jogging pour CET état du corps : simulation de tissu Blender (gravité, léger surplus
    de tissu, collision avec le corps complet). Épinglés : empiècement des épaules / col, ceinture, bord-côtes des
    chevilles. Rendu seulement (le GLB et l'app ne changent pas)."""
    names = {o.name.split('.')[0]: o for o in meshes}
    col = names.get('collider')
    suit = next((o for o in meshes if 'casualsuit' in o.name), None)
    if not (col and suit):
        print('tissu : pas de corps complet / tenue, simulation ignorée')
        return
    t0 = time.time()
    sc = bpy.context.scene
    _freeze(col)
    for md in list(suit.modifiers):
        if md.type == 'SUBSURF':
            suit.modifiers.remove(md)
    # coutures soudées : le GLB coupe le maillage à chaque couture UV (manches, jambes séparées du reste) ; sans soudure
    # les pièces tomberaient séparément
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(suit.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0002)
    bm.to_mesh(suit.data)
    bm.free()
    suit.data.update()
    sub = suit.modifiers.new('sim_sub', 'SUBSURF')
    sub.levels = sub.render_levels = it.get('cloth_subdiv', 1)
    _freeze(suit)
    me = suit.data
    for poly in me.polygons:
        poly.use_smooth = True
    # groupes d'épinglage, repérés en coordonnées locales (= repères de l'usine, mètres, axes Blender)
    sh_z = min(gl2bl(meta['shoulder_l']).z, gl2bl(meta['shoulder_r']).z)
    neck = gl2bl(meta['neck'])
    pel_z = gl2bl(meta['pelvis']).z
    ank_z = max(gl2bl(meta['foot_l']).z, gl2bl(meta['foot_r']).z)
    uvl = me.uv_layers.active
    vbot = np.zeros(len(me.vertices))
    vcnt = np.zeros(len(me.vertices))
    for li, lp in enumerate(me.loops):
        vbot[lp.vertex_index] += 1 - uvl.data[li].uv[1]
        vcnt[lp.vertex_index] += 1
    bottom = (vbot / np.maximum(vcnt, 1)) >= 0.43
    co = np.array([v.co[:] for v in me.vertices])
    pin = np.zeros(len(co))
    top = ~bottom
    # t-shirt : seul le col est tenu (le tissu repose sur les épaules par collision et retombe sur le deltoïde)
    dxy = np.linalg.norm(co[:, :2] - np.array([neck.x, neck.y]), axis=1)
    pin[top] = np.clip((co[top, 2] - (sh_z - 0.01)) / 0.03, 0, 1) * np.clip(1 - (dxy[top] - it.get('collar_pin_r', 0.11)) / 0.04, 0, 1)
    pin[top] = np.maximum(pin[top], np.clip((co[top, 2] - (neck.z - 0.03)) / 0.03, 0, 1))
    # jogging : ceinture et bord-côtes des chevilles
    pin[bottom] = np.maximum(np.clip((co[bottom, 2] - (pel_z + 0.02)) / 0.05, 0, 1), np.clip(((ank_z + 0.05) - co[bottom, 2]) / 0.04, 0, 1))
    vg = suit.vertex_groups.new(name='pin')
    for i in np.where(pin > 0.01)[0]:
        vg.add([int(i)], float(min(pin[i], 1.0)), 'REPLACE')
    # manches : le tissu se resserre un peu (tête de manche qui retombe sur le deltoïde au lieu d'une « épaulette »)
    shl, shr = gl2bl(meta['shoulder_l']), gl2bl(meta['shoulder_r'])
    half = abs(shl.x - shr.x) / 2
    lat = np.abs(co[:, 0] - neck.x) / max(half, 1e-6)
    sleeve = top * np.clip((lat - 0.8) / 0.25, 0, 1) * np.clip(((sh_z + 0.06) - co[:, 2]) / 0.04, 0, 1)
    vs = suit.vertex_groups.new(name='shrink')
    for i in np.where(sleeve > 0.01)[0]:
        vs.add([int(i)], float(sleeve[i]), 'REPLACE')
    # deux pièces : le jogging est simulé d'abord, puis sert d'obstacle au t-shirt (l'ourlet ne passe plus au travers)
    import bmesh
    tee = suit.copy()
    tee.data = suit.data.copy()
    bpy.context.scene.collection.objects.link(tee)
    tee.name = suit.name + '_tee'
    for ob, keep_bottom in ((suit, True), (tee, False)):
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.verts.ensure_lookup_table()
        kill = [f for f in bm.faces if (np.mean([bottom[v.index] for v in f.verts]) >= 0.5) != keep_bottom]
        bmesh.ops.delete(bm, geom=kill, context='FACES')
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    col.modifiers.new('collision', 'COLLISION')
    col.collision.thickness_outer = 0.003
    col.collision.thickness_inner = 0.006
    col.collision.cloth_friction = 8.0
    F = it.get('cloth_frames', 24)
    sc.frame_start, sc.frame_end = 1, F

    def run(ob, bending, surplus, mass, shrink=0.0):
        cl = ob.modifiers.new('cloth', 'CLOTH')
        st = cl.settings
        st.quality = it.get('cloth_quality', 6)
        st.mass = mass
        st.air_damping = 1.0
        st.tension_stiffness = 12.0
        st.compression_stiffness = 6.0
        st.shear_stiffness = 4.0
        st.bending_stiffness = bending
        st.shrink_min = -surplus                     # léger surplus de tissu → il flambe en plis
        if shrink and 'shrink' in ob.vertex_groups:
            st.vertex_group_shrink = 'shrink'
            st.shrink_max = shrink
        st.vertex_group_mass = 'pin'
        st.pin_stiffness = 1.0
        cs = cl.collision_settings
        cs.collision_quality = 3
        cs.distance_min = 0.0025
        cs.use_self_collision = False
        cl.point_cache.frame_start, cl.point_cache.frame_end = 1, F
        for f in range(1, F + 1):
            sc.frame_set(f)
        # petits froissés parasites de la simulation adoucis (les vrais plis restent)
        sm = ob.modifiers.new('adoucir', 'SMOOTH')
        sm.factor, sm.iterations = 0.5, it.get('cloth_smooth', 2)
        _freeze(ob)
        sc.frame_set(1)

    run(suit, it.get('jog_bending', 0.3), it.get('jog_surplus', 0.015), 0.2)
    suit.modifiers.new('collision', 'COLLISION')
    suit.collision.thickness_outer = 0.004
    suit.collision.thickness_inner = 0.003
    suit.collision.cloth_friction = 5.0
    run(tee, it.get('tee_bending', 0.3), it.get('tee_surplus', 0.008), 0.15, it.get('sleeve_shrink', 0.07))
    for md in list(suit.modifiers):
        suit.modifiers.remove(md)
    for o in (suit, tee):
        for poly in o.data.polygons:
            poly.use_smooth = True
        # épaisseur du tissu : ourlets, manches et col ont un vrai bord (pas une feuille effilochée)
        so = o.modifiers.new('epaisseur', 'SOLIDIFY')
        so.thickness = 0.0018
        so.offset = -1.0
        so.use_even_offset = False
        so.thickness_clamp = 1.0              # jamais de pointe aux angles vifs du maillage simulé
    col.hide_render = True
    print('tissu simulé : %d + %d sommets, %.0f s' % (len(suit.data.vertices), len(tee.data.vertices), time.time() - t0), flush=True)


def hair_material(name, melanin, redness, rough=0.36, glossy_dark=True):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type == 'BSDF_PRINCIPLED':
            nt.nodes.remove(n)
    hb = nt.nodes.new('ShaderNodeBsdfHairPrincipled')
    hb.parametrization = 'MELANIN'
    hb.inputs['Melanin'].default_value = melanin
    hb.inputs['Melanin Redness'].default_value = redness
    hb.inputs['Roughness'].default_value = rough
    hb.inputs['Radial Roughness'].default_value = 0.42
    hb.inputs['Coat'].default_value = 0.0
    hb.inputs['IOR'].default_value = 1.45
    hb.inputs['Random Color'].default_value = 0.12 if melanin < 0.9 else 0.04
    hb.inputs['Random Roughness'].default_value = 0.15
    if not glossy_dark:
        # barbe : poils courts vus de bout → reflet large et doux (un reflet serré la fait paraître grise / poivre et sel)
        hb.inputs['Radial Roughness'].default_value = 0.55
        hb.inputs['Random Roughness'].default_value = 0.2
    elif melanin >= 0.8:
        # cheveux foncés : reflet assez serré (un reflet large et rugueux les fait paraître gris / poivre et sel),
        # mais pas « plastique » ; un peu de variation de teinte d'un cheveu à l'autre
        hb.inputs['Roughness'].default_value = 0.4
        hb.inputs['Radial Roughness'].default_value = 0.45
        hb.inputs['Random Roughness'].default_value = 0.12
        hb.inputs['IOR'].default_value = 1.4          # reflet plus doux : pas de « mèche grise » sous la grande boîte à lumière
        hb.inputs['Random Color'].default_value = 0.08
    nt.links.new(hb.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    return m


def add_strands(npz_path, parent, hr):
    d = np.load(npz_path)
    objs = []
    for g in [str(x) for x in d['groups']]:
        P = d[g + '_points']                       # (N, M, 3) glTF mètres
        N, M, _ = P.shape
        Pb = np.stack([P[..., 0], -P[..., 2], P[..., 1]], -1).astype(np.float32)
        crv = bpy.data.hair_curves.new(g)
        crv.add_curves([M] * N)
        crv.position_data.foreach_set('vector', Pb.ravel())
        if 'radius' not in [a.name for a in crv.attributes]:
            crv.attributes.new('radius', 'FLOAT', 'POINT')
        r = np.tile(d[g + '_radius'].astype(np.float32), N)
        crv.attributes['radius'].data.foreach_set('value', r)
        ob = bpy.data.objects.new('strands_' + g, crv)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = parent
        mel = hr.get('melanin', 0.8) if g != 'beard' else min(1.0, hr.get('melanin', 0.8) + 0.03)
        if g == 'beard':
            crv.materials.append(hair_material('mat_' + g, mel, hr.get('redness', 0.4) * 0.8, 0.5, glossy_dark=False))
        elif g == 'hair_sides':
            crv.materials.append(hair_material('mat_' + g, mel, hr.get('redness', 0.4), 0.45, glossy_dark=False))
        else:
            crv.materials.append(hair_material('mat_' + g, mel, hr.get('redness', 0.4), hr.get('roughness', 0.36)))
        objs.append(ob)
        if g + '_tie' in d:      # élastique de la queue de cheval
            t = d[g + '_tie']
            c = gl2bl(t[:3])
            ax = Vector((t[3], -t[5], t[4])).normalized()
            bpy.ops.mesh.primitive_torus_add(major_radius=float(t[6]) * 0.95, minor_radius=0.0045, location=c)
            tor = bpy.context.active_object
            tor.rotation_mode = 'QUATERNION'
            tor.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(ax)
            tm = bpy.data.materials.new('tie')
            tm.use_nodes = True
            principled(tm).inputs['Base Color'].default_value = (0.02, 0.02, 0.022, 1)
            principled(tm).inputs['Roughness'].default_value = 0.5
            tor.data.materials.append(tm)
            tor.parent = parent
    return objs


def cyclorama():
    import bmesh
    me = bpy.data.meshes.new('cyclo')
    bm = bmesh.new()
    W, D, H, R = 14.0, 10.0, 8.0, 2.5
    prof = [(-D / 2 + i * ((D - R) / 12), 0.0) for i in range(13)]
    prof += [(D / 2 - R + math.sin((i / 16) * math.pi / 2) * R, R - math.cos((i / 16) * math.pi / 2) * R) for i in range(1, 17)]
    prof += [(D / 2, R + i * (H - R) / 8) for i in range(1, 9)]
    grid = [[bm.verts.new((-W / 2 + c * W / 24, z, y)) for c in range(25)] for (z, y) in prof]
    for r in range(len(grid) - 1):
        for c in range(24):
            bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('cyclo', me)
    bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.new('cyclo_mat')
    mat.use_nodes = True
    p = principled(mat)
    p.inputs['Base Color'].default_value = (0.22, 0.21, 0.2, 1)    # gris chaud : rebonds doux sans aplatir le modelé
    setin(p, ['Roughness'], 0.9)
    ob.data.materials.append(mat)
    ob.visible_camera = False                                     # invisible : on ne garde que sa lumière renvoyée
    ob.visible_shadow = False                                     # et il ne projette pas d'ombre sur le sol « attrape-ombre »
    return ob


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
    dvec = Vector(target) - ob.location
    ob.rotation_euler = dvec.to_track_quat('-Z', 'Y').to_euler()
    return ob


def studio(H):
    """Studio FITAIA : grande boîte à lumière chaude à gauche, remplissage froid, deux contre-jours (détachent les cheveux)."""
    cyclorama()
    t = (0, 0, H * 0.7)
    area('key', (-2.6, -2.4, H * 1.55), 2.2, 1150, (1.0, 0.94, 0.86), 'RECTANGLE', 1.6, target=(0, 0, H * 0.85))
    area('fill', (3.0, -2.8, H * 0.95), 2.6, 70, (0.9, 0.94, 1.0), target=t)
    area('rim_l', (-1.9, 2.3, H * 1.3), 0.7, 480, (1.0, 0.98, 0.95), 'RECTANGLE', 2.0, target=(0, 0, H * 0.8))
    area('rim_r', (2.0, 2.2, H * 1.2), 0.7, 340, (1.0, 0.99, 0.92), 'RECTANGLE', 2.0, target=(0, 0, H * 0.78))
    area('top', (0, -0.3, H * 2.4), 1.6, 100, (1.0, 0.97, 0.92), 'DISK', target=(0, 0, H * 0.6))
    w = bpy.data.worlds.new('w')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.42, 0.41, 0.40, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.22
    bpy.context.scene.world = w


def shadow_catcher():
    bpy.ops.mesh.primitive_plane_add(size=float(JOB.get('catcher_size', 2.4)), location=(0, 0, 0.0005))
    pl = bpy.context.active_object
    pl.is_shadow_catcher = True
    return pl


def setup_render():
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
                    break
            except Exception:
                continue
    except Exception as e:
        print('GPU non disponible', e)
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 12
    sc.cycles.transparent_max_bounces = 64
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '8'
    sc.cycles_curves.shape = 'THICK'
    sc.cycles_curves.subdivisions = 3
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = JOB.get('look', 'AgX - Punchy')
    sc.view_settings.exposure = JOB.get('exposure', -1.0)


def frame_camera(cam, kind, pts, yaw_deg):
    """Place la caméra (téléobjectif) pour le cadrage voulu à partir des repères (déjà tournés comme l'avatar)."""
    W, H = FRAMES[kind]
    eyes, top, chin = pts['eyes'], pts['top'], pts['chin']
    foot = 0.0
    head_h = top.z - chin.z
    if kind == 'head':
        lens, z0, z1 = 105, chin.z - 0.10, top.z + 0.04
        cx = eyes.x
        tz = None
    elif kind == 'bust':
        lens, z0, z1 = 85, chin.z - head_h * 1.55, top.z + 0.06
        cx = eyes.x * 0.6
        tz = None
    elif kind == 'card':
        lens, z0, z1 = 85, (pts['knee_l'].z + pts['knee_r'].z) / 2 + 0.06, top.z + 0.09
        cx = (eyes.x + pts['pelvis'].x) / 2
        tz = None
    else:
        lens, z0, z1 = 70, foot - 0.03, top.z + 0.07
        cx = (eyes.x + pts['pelvis'].x) / 2 * 0.5
        tz = None
    hgt = z1 - z0
    cam.data.lens = lens
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.sensor_height = 24.0
    fov = 2 * math.atan(12.0 / lens)
    dist = (hgt / 2) / math.tan(fov / 2)
    zc = (z0 + z1) / 2
    # hauteur de caméra : à hauteur des yeux pour les gros plans, plus bas pour le corps entier (regard légèrement montant)
    cz = eyes.z - 0.02 if kind in ('head', 'bust') else (zc + 0.15 if kind == 'card' else zc)
    cam.location = Vector((cx, -dist, cz))
    # visée : on garde l'axe horizontal-ish et on décale le cadre par le décalage d'objectif (pas de fuyantes)
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.shift_y = (zc - cz) / hgt
    cam.data.shift_x = 0.0
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = int(W * SCALE), int(H * SCALE)


def _rotate_verts(ob, idx, center, q):
    """Tourne des sommets (base + toutes les clés de forme) autour d'un centre."""
    me = ob.data
    blocks = me.shape_keys.key_blocks if me.shape_keys else []
    for i in idx:
        me.vertices[i].co = center + q @ (me.vertices[i].co - center)
    for kb in blocks:
        for i in idx:
            kb.data[i].co = center + q @ (kb.data[i].co - center)
    me.update()


class Gaze:
    """Regard caméra. Si l'usine a mesuré les globes (portrait.json : eye_center_*, eye_gaze_*), chaque globe tourne autour
    de SON centre pour viser la position réelle de l'objectif, à chaque cadrage (les deux yeux convergent naturellement).
    Sinon : ancienne estimation par le bombé de la cornée."""

    def __init__(self, meshes, meta, amount=1.0, max_deg=28.0):
        self.ob = next((o for o in meshes if o.name.split('.')[0] == 'eyes'), None)
        self.meta, self.amount, self.max = meta, amount, math.radians(max_deg)
        self.ok = self.ob is not None and 'eye_center_l' in meta
        if not self.ob:
            return
        me = self.ob.data
        self.co0 = np.array([v.co[:] for v in me.vertices])
        self.keys0 = [np.array([d.co[:] for d in kb.data]) for kb in (me.shape_keys.key_blocks if me.shape_keys else [])]
        if self.ok:
            self.eyes = []
            for side in ('l', 'r'):
                c = np.array(gl2bl(meta[f'eye_center_{side}'])[:])
                g = np.array(gl2bl(meta[f'eye_gaze_{side}'])[:])
                r = meta.get(f'eye_radius_{side}', 0.012)
                sel = np.where(np.linalg.norm(self.co0 - c, axis=1) < r * 1.6)[0]
                self.eyes.append((c, g / np.linalg.norm(g), sel))

    def aim(self, cam_world):
        if not self.ob:
            return
        me = self.ob.data
        co = self.co0.copy()
        keys = [k.copy() for k in self.keys0]
        if self.ok:
            inv = self.ob.matrix_world.inverted()
            tgt = np.array((inv @ cam_world)[:])
            for c, g, sel in self.eyes:
                d = tgt - c
                d /= np.linalg.norm(d)
                q = Vector(g).rotation_difference(Vector(d))
                ang = min(q.angle * self.amount, self.max)
                q = Quaternion(q.axis, ang) if q.angle > 1e-6 else Quaternion()
                R = np.array(q.to_matrix())
                co[sel] = (co[sel] - c) @ R.T + c
                for k in keys:
                    k[sel] = (k[sel] - c) @ R.T + c
        me.vertices.foreach_set('co', co.ravel())
        if me.shape_keys:
            for kb, k in zip(me.shape_keys.key_blocks, keys):
                kb.data.foreach_set('co', k.ravel())
        me.update()


def look_at_camera(meshes, meta, yaw, amount=0.85):
    """Ancien regard caméra (repli sans repères des globes)."""
    eyes = [o for o in meshes if o.name.split('.')[0] == 'eyes']
    if not eyes:
        return
    ob = eyes[0]
    bpy.context.view_layer.update()
    me = ob.data
    inv = ob.matrix_world.inverted()
    co = np.array([v.co[:] for v in me.vertices])
    t = math.radians(yaw)
    cam_dir = (inv.to_3x3() @ Vector((-math.sin(t), -math.cos(t), 0.0))).normalized()
    for c in (gl2bl(meta['eye_l']), gl2bl(meta['eye_r'])):
        c = inv @ c
        sel = np.where(np.linalg.norm(co - np.array(c[:]), axis=1) < 0.017)[0]
        if len(sel) < 10:
            continue
        pts = co[sel]
        rel = pts - np.array(c[:])
        dist = np.linalg.norm(rel, axis=1)
        fwd_h = (rel / np.maximum(dist[:, None], 1e-9)) @ np.array([0.0, -1.0, 0.0]) > 0.3
        cand = np.where(fwd_h)[0]
        if len(cand) < 5:
            continue
        apex = cand[np.argsort(-dist[cand])[: max(5, len(cand) // 25)]]
        gaze = Vector(rel[apex].mean(0)).normalized()
        q = Quaternion().slerp(gaze.rotation_difference(cam_dir), amount)
        _rotate_verts(ob, sel.tolist(), c, q.to_matrix())


def polish_generated_garments(meshes):
    """Héros (vêtements générés) : bande de col posée sur le t-shirt, relief de tissu adouci (moiré) — rendu seulement."""
    names = {o.name.split('.')[0]: o for o in meshes}
    tee = names.get('tee')
    col = names.get('tee_col')
    if tee and col:
        m = col.modifiers.new('posé', 'SHRINKWRAP')
        m.target = tee
        m.wrap_method = 'NEAREST_SURFACEPOINT'
        m.offset = 0.0012
    if tee:
        # petits reliefs du maillage (tétons, plis cassés) adoucis — rendu seulement, le GLB n'est pas modifié
        sm = tee.modifiers.new('lissage', 'SMOOTH')
        sm.factor = 0.4
        sm.iterations = 6
    for nm in ('tee', 'jogger', 'tee_col'):
        o = names.get(nm)
        if not o:
            continue
        for slot in o.material_slots:
            m = slot.material
            if not (m and m.use_nodes):
                continue
            p = principled(m)
            for n in list(m.node_tree.nodes):
                if n.type == 'NORMAL_MAP':
                    n.inputs['Strength'].default_value = 0.15
            # trame du tissu en texture de couleur : moirée en gros plan → couleur unie (celle du vêtement)
            fc = m.get('fallbackColor')
            if p is not None and fc is not None and p.inputs['Base Color'].is_linked:
                for l in list(p.inputs['Base Color'].links):
                    m.node_tree.links.remove(l)
                # fallbackColor = couleur de la texture (sRGB) → valeur linéaire du shader
                p.inputs['Base Color'].default_value = (float(fc[0]) ** 2.2, float(fc[1]) ** 2.2, float(fc[2]) ** 2.2, 1.0)


def parse_framings(it):
    """« head » ou « nom:cadrage:lacet » (ex. « head_34:head:32 ») → [(nom, cadrage, lacet)]."""
    out = []
    for f in it.get('framings', ['head', 'bust', 'full', 'card']):
        parts = f.split(':')
        if len(parts) == 1:
            out.append((f, f, float(it.get('yaw', 12.0))))
        else:
            out.append((parts[0], parts[1], float(parts[2]) if len(parts) > 2 else float(it.get('yaw', 12.0))))
    return out


def render_item(it):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_render()
    bpy.ops.import_scene.gltf(filepath=it['glb'])
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    root = bpy.data.objects.new('FITAIA_root', None)
    bpy.context.scene.collection.objects.link(root)
    for o in list(bpy.context.scene.objects):
        if o.parent is None and o is not root:
            o.parent = root
    rough = os.path.splitext(it['glb'])[0] + '.skin_rough.png'
    setup_materials(meshes, rough if it.get('fine') else None, bool(it.get('fine')))
    # état du corps (morphs)
    st = it.get('state', {})
    for o in meshes:
        sk = o.data.shape_keys
        if sk:
            for kb in sk.key_blocks[1:]:
                kb.value = float(st.get(kb.name, 0.0))
    for o in meshes:
        if o.name.split('.')[0] == 'collider':
            o.hide_render = True
    meta0 = json.load(open(it['meta']))
    if it.get('cloth'):
        simulate_cloth(meshes, it, meta0)
    groups = []
    if it.get('hair') and os.path.exists(it['hair']):
        add_strands(it['hair'], root, it.get('hair_render', {}))
        groups = [str(x) for x in np.load(it['hair'])['groups']]
        for o in meshes:
            nm = o.name.split('.')[0]
            if nm == 'hair' or (nm == 'eyebrows' and 'brows' in groups):
                o.hide_render = True
    meta = json.load(open(it['meta']))
    gaze = Gaze(meshes, meta, it.get('gaze', 1.0))
    if not gaze.ok:
        look_at_camera(meshes, meta, float(it.get('yaw', 12.0)), it.get('gaze', 0.85))
    polish_generated_garments(meshes)
    os.makedirs(it['out'], exist_ok=True)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    catcher = None
    lit = False
    Hh = None
    for fname, kind, yaw in parse_framings(it):
        root.rotation_euler = (0, 0, math.radians(yaw))
        bpy.context.view_layer.update()
        Rz = root.matrix_world.to_3x3()
        pts = {k: Rz @ gl2bl(v) for k, v in meta.items() if isinstance(v, list) and len(v) == 3}
        # sommet de la coiffure : point le plus haut des mèches (sinon le crâne + 2 cm)
        top = pts['head_top'].copy()
        top.z += 0.02
        if it.get('hair') and os.path.exists(it['hair']):
            d = np.load(it['hair'])
            if 'hair_points' in d:
                top.z = max(top.z, float(d['hair_points'][..., 1].max()) + 0.004)
        pts['top'] = top
        if not lit:
            Hh = top.z
            studio(Hh)
            lit = True
        if kind == 'full' and catcher is None:
            catcher = shadow_catcher()
        if catcher is not None:
            catcher.hide_render = kind != 'full'
        frame_camera(cam, kind, pts, yaw)
        bpy.context.view_layer.update()
        if gaze.ok:
            gaze.aim(cam.matrix_world.translation)
        bpy.context.scene.render.filepath = os.path.join(it['out'], fname + '.png')
        bpy.ops.render.render(write_still=True)
        print('PORTRAIT', it['key'], fname, flush=True)
    json.dump({'key': it['key'], 'yaw': float(it.get('yaw', 12.0)), 'top_z': Hh}, open(os.path.join(it['out'], 'render.json'), 'w'))


for it in JOB['items']:
    render_item(it)
print('PORTRAITS OK')
