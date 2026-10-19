"""
FITAIA — peau « haute définition » pour les rendus Cycles (100 % procédural, Blender, sans texture achetée).

La texture couleur MakeHuman (2048 px pour tout le corps) est douce en gros plan : la haute fréquence est générée
ici, à l'échelle réelle (coordonnées objet en mètres), et modulée par la carte de zones de l'usine
(<avatar>.skin_zones.png : R = pores, G = lèvres, B = rougeurs, A = paupières) :
  - pores : vrais petits creux (cellules de Voronoï ≈ 0,5–0,8 mm, creux de ≈ 0,15 mm de rayon), deux octaves, plus
    profonds et plus serrés sur le nez et les joues, quasi absents sur les lèvres et les paupières ;
  - micro-relief croisé (lignes de tension de la peau) : deux bruits très étirés à ±45° ;
  - ridules des paupières, stries verticales des lèvres ;
  - variations de teint : marbrures hémoglobine / mélanine basse fréquence, cavités des pores un rien plus sombres ;
  - réflexion à deux lobes : rugosité par zones (carte de l'usine) + film gras léger (Coat) sur la zone T ;
  - diffusion sous la surface « Random Walk (Skin) », libres parcours moyens de la peau humaine (≈ 3,6 / 1,4 / 0,75 mm).
Le GLB temps réel n'est pas modifié (ces détails ne servent qu'aux rendus de l'usine).
"""
import os

import bpy

SSS_RADIUS = (3.6, 1.4, 0.75)       # mm, rouge / vert / bleu (ordre de grandeur de Jensen et al. pour la peau)
SSS_SCALE = 0.001                    # m par unité de rayon


def _n(nt, kind, x=0, y=0, **inputs):
    n = nt.nodes.new(kind)
    n.location = (x, y)
    for k, v in inputs.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
    return n


def _math(nt, op, a=None, b=None, c=None, x=0, y=0, clamp=False):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    n.use_clamp = clamp
    n.location = (x, y)
    for i, v in enumerate((a, b, c)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def _setin(node, names, value):
    for nm in names:
        if nm in node.inputs:
            node.inputs[nm].default_value = value
            return True
    return False


def _maprange(nt, val, a, b, c, d, smooth=True):
    n = nt.nodes.new('ShaderNodeMapRange')
    n.interpolation_type = 'SMOOTHSTEP' if smooth else 'LINEAR'
    nt.links.new(val, n.inputs['Value'])
    n.inputs['From Min'].default_value = a
    n.inputs['From Max'].default_value = b
    n.inputs['To Min'].default_value = c
    n.inputs['To Max'].default_value = d
    return n.outputs['Result']


def _mixrgb(nt, mode, a, b, fac=1.0):
    m = nt.nodes.new('ShaderNodeMix')
    m.data_type = 'RGBA'
    m.blend_type = mode
    if isinstance(fac, float):
        m.inputs[0].default_value = fac
    else:
        nt.links.new(fac, m.inputs[0])
    for idx, v in ((6, a), (7, b)):
        if isinstance(v, tuple):
            m.inputs[idx].default_value = v
        else:
            nt.links.new(v, m.inputs[idx])
    return m.outputs[2]


DEFAULTS = {
    'pore_scale': 1150.0, 'pore_r': 0.36, 'pore2_scale': 3600.0, 'pore2_r': 0.28, 'pore2_w': 0.45, 'pore_amt': 2.0,
    'hatch_scale': (5200.0, 650.0, 5200.0), 'hatch_amt': 0.5,
    'mid_scale': 900.0, 'mid_amt': 0.8,             # « peau d'orange » (≈ 1 mm) : casse le reflet comme une vraie peau
    'bump_strength': 1.0, 'bump_dist': 0.0001,
    'mottle_amt': 0.22, 'mel_amt': 0.07, 'cav_amt': 0.035,
    'coat_max': 0.22, 'coat_rough': 0.3, 'rough_noise': 0.10, 'rough_offset': -0.09,
    'lip_tint': (0.86, 0.72, 0.72), 'lip_line_dark': 0.08,
}


def skin_hd(m, p, zones_png=None, rough_png=None, strength=1.0, age=0.25, params=None):
    """Remplace le réseau de la peau par la version haute définition. p = nœud Principled de la matière « skin »."""
    P = dict(DEFAULTS)
    P.update(params or {})
    nt = m.node_tree
    L = nt.links
    # --- diffusion, spéculaire
    _setin(p, ['Subsurface Weight', 'Subsurface'], 1.0)
    _setin(p, ['Subsurface Radius'], SSS_RADIUS)
    _setin(p, ['Subsurface Scale'], SSS_SCALE)
    _setin(p, ['Subsurface IOR'], 1.4)
    _setin(p, ['Subsurface Anisotropy'], 0.8)
    try:
        p.subsurface_method = 'RANDOM_WALK_SKIN'
    except Exception:
        pass
    _setin(p, ['IOR'], 1.4)
    _setin(p, ['Specular IOR Level', 'Specular'], 0.5)
    _setin(p, ['Sheen Weight'], 0.0)
    tc = _n(nt, 'ShaderNodeTexCoord', -1600, 0)
    obj = tc.outputs['Object']
    uv = _n(nt, 'ShaderNodeUVMap', -1600, -300).outputs['UV']
    # --- zones
    if zones_png and os.path.exists(zones_png):
        zi = bpy.data.images.load(zones_png)
        zi.colorspace_settings.name = 'Non-Color'
        zt = _n(nt, 'ShaderNodeTexImage', -1350, -300)
        zt.image = zi
        L.new(uv, zt.inputs['Vector'])
        sep = _n(nt, 'ShaderNodeSeparateColor', -1100, -300)
        L.new(zt.outputs['Color'], sep.inputs['Color'])
        z_pores, z_lips, z_red = sep.outputs[0], sep.outputs[1], sep.outputs[2]
        z_lids = zt.outputs['Alpha']
    else:
        cst = _n(nt, 'ShaderNodeValue', -1100, -300)
        cst.outputs[0].default_value = 0.4
        z_pores = cst.outputs[0]
        zero = _n(nt, 'ShaderNodeValue', -1100, -400)
        zero.outputs[0].default_value = 0.0
        z_lips = z_red = z_lids = zero.outputs[0]
    # --- pores : creux discrets (deux octaves)
    v1 = _n(nt, 'ShaderNodeTexVoronoi', -1300, 300, Scale=P['pore_scale'], Randomness=1.0)
    v1.feature = 'F1'
    L.new(obj, v1.inputs['Vector'])
    pit1 = _maprange(nt, v1.outputs['Distance'], 0.0, P['pore_r'], 1.0, 0.0)
    v2 = _n(nt, 'ShaderNodeTexVoronoi', -1300, 100, Scale=P['pore2_scale'], Randomness=1.0)
    v2.feature = 'F1'
    L.new(obj, v2.inputs['Vector'])
    pit2 = _maprange(nt, v2.outputs['Distance'], 0.0, P['pore2_r'], 1.0, 0.0)
    pits = _math(nt, 'MULTIPLY_ADD', pit2, P['pore2_w'], pit1, x=-1000, y=250)          # pit1 + w pit2
    pore_amt = _math(nt, 'MULTIPLY', z_pores, P['pore_amt'] * strength, x=-1000, y=0, clamp=False)
    pits_z = _math(nt, 'MULTIPLY', pits, pore_amt, x=-850, y=250)
    # --- micro-relief croisé (lignes de tension), bruits étirés à ±45°
    hatch = []
    for k, rot in enumerate((0.785, -0.785)):
        mp = _n(nt, 'ShaderNodeMapping', -1300, -600 - 200 * k)
        mp.inputs['Rotation'].default_value = (0.3, rot, rot)
        mp.inputs['Scale'].default_value = tuple(P['hatch_scale'])
        L.new(obj, mp.inputs['Vector'])
        nz = _n(nt, 'ShaderNodeTexNoise', -1100, -600 - 200 * k, Scale=1.0, Detail=1.0, Roughness=0.5)
        L.new(mp.outputs['Vector'], nz.inputs['Vector'])
        hatch.append(nz.outputs['Fac'])
    hx = _math(nt, 'ADD', hatch[0], hatch[1], x=-900, y=-650)
    hx = _math(nt, 'MULTIPLY', hx, P['hatch_amt'] * strength, x=-750, y=-650)
    # irrégularités moyennes (≈ 2–3 mm) : ce qui se voit encore à distance de portrait
    mid = _n(nt, 'ShaderNodeTexNoise', -1100, -850, Scale=P['mid_scale'], Detail=3.0, Roughness=0.55)
    L.new(obj, mid.inputs['Vector'])
    midz = _math(nt, 'MULTIPLY', mid.outputs['Fac'], z_pores, x=-900, y=-850)
    hx = _math(nt, 'MULTIPLY_ADD', midz, P['mid_amt'] * strength, hx, x=-700, y=-750)
    # --- ridules des paupières (horizontales) et stries des lèvres (verticales)
    lid_w = _n(nt, 'ShaderNodeTexWave', -1300, -1050, Scale=1.0, Distortion=3.0, Detail=2.0)
    lid_w.wave_type = 'BANDS'
    lid_w.bands_direction = 'Z'
    mpl = _n(nt, 'ShaderNodeMapping', -1500, -1050)
    mpl.inputs['Scale'].default_value = (900.0, 900.0, 900.0)
    L.new(obj, mpl.inputs['Vector'])
    L.new(mpl.outputs['Vector'], lid_w.inputs['Vector'])
    lid_h = _math(nt, 'MULTIPLY', lid_w.outputs['Fac'], z_lids, x=-1000, y=-1050)
    lip_w = _n(nt, 'ShaderNodeTexWave', -1300, -1300, Scale=1.0, Distortion=2.5, Detail=1.5)
    lip_w.wave_type = 'BANDS'
    lip_w.bands_direction = 'X'
    mpq = _n(nt, 'ShaderNodeMapping', -1500, -1300)
    mpq.inputs['Scale'].default_value = (1100.0, 1100.0, 1100.0)
    L.new(obj, mpq.inputs['Vector'])
    L.new(mpq.outputs['Vector'], lip_w.inputs['Vector'])
    lip_h = _math(nt, 'MULTIPLY', lip_w.outputs['Fac'], z_lips, x=-1000, y=-1300)
    # hauteur totale (creux négatifs)
    h = _math(nt, 'SUBTRACT', hx, pits_z, x=-650, y=0)
    h = _math(nt, 'MULTIPLY_ADD', lid_h, 0.6 * (0.4 + age), h, x=-550, y=-200)
    h = _math(nt, 'MULTIPLY_ADD', lip_h, 0.9, h, x=-450, y=-300)
    bump = _n(nt, 'ShaderNodeBump', -300, -200, Strength=P['bump_strength'], Distance=P['bump_dist'])
    L.new(h, bump.inputs['Height'])
    if p.inputs['Normal'].is_linked:
        L.new(p.inputs['Normal'].links[0].from_socket, bump.inputs['Normal'])
    L.new(bump.outputs['Normal'], p.inputs['Normal'])
    # --- rugosité : carte de l'usine + creux des pores un peu plus mats, lèvres plus satinées
    if rough_png and os.path.exists(rough_png):
        ri = bpy.data.images.load(rough_png)
        ri.colorspace_settings.name = 'Non-Color'
        rt = _n(nt, 'ShaderNodeTexImage', -1100, 700)
        rt.image = ri
        L.new(uv, rt.inputs['Vector'])
        r0 = rt.outputs['Color']
    else:
        rv = _n(nt, 'ShaderNodeValue', -1100, 700)
        rv.outputs[0].default_value = 0.5
        r0 = rv.outputs[0]
    rn = _n(nt, 'ShaderNodeTexNoise', -1100, 900, Scale=180.0, Detail=3.0)
    L.new(obj, rn.inputs['Vector'])
    r = _math(nt, 'MULTIPLY_ADD', rn.outputs['Fac'], P['rough_noise'], r0, x=-850, y=800)
    r = _math(nt, 'ADD', r, P['rough_offset'], x=-700, y=800)
    r = _math(nt, 'MULTIPLY_ADD', pits, 0.06, r, x=-550, y=800)
    r = _math(nt, 'MULTIPLY_ADD', z_lips, -0.08, r, x=-400, y=800, clamp=True)
    for l_ in list(p.inputs['Roughness'].links):
        nt.links.remove(l_)
    L.new(r, p.inputs['Roughness'])
    # film gras (zone T, lèvres) : second lobe spéculaire léger et net
    coat = _math(nt, 'SUBTRACT', 0.58, r0, x=-550, y=1000)
    coat = _math(nt, 'MULTIPLY', coat, 0.9, x=-400, y=1000, clamp=True)
    coat = _math(nt, 'MINIMUM', coat, P['coat_max'], x=-300, y=1000)
    if 'Coat Weight' in p.inputs:
        L.new(coat, p.inputs['Coat Weight'])
        _setin(p, ['Coat Roughness'], P['coat_rough'])
        _setin(p, ['Coat IOR'], 1.45)
    # --- couleur : marbrures (hémoglobine), rougeurs, cavités des pores
    if p.inputs['Base Color'].is_linked:
        base = p.inputs['Base Color'].links[0].from_socket
        mot = _n(nt, 'ShaderNodeTexNoise', -1100, 1300, Scale=38.0, Detail=4.0, Roughness=0.6)
        L.new(obj, mot.inputs['Vector'])
        hem = _maprange(nt, mot.outputs['Fac'], 0.35, 0.75, 0.0, 1.0)
        hem = _math(nt, 'MULTIPLY_ADD', z_red, 0.6, hem, x=-800, y=1300)
        hem = _math(nt, 'MULTIPLY', hem, P['mottle_amt'] * strength, x=-650, y=1300, clamp=True)
        c = _mixrgb(nt, 'MULTIPLY', base, (1.0, 0.86, 0.84, 1.0), hem)
        mel = _n(nt, 'ShaderNodeTexNoise', -1100, 1550, Scale=240.0, Detail=5.0, Roughness=0.7)
        L.new(obj, mel.inputs['Vector'])
        melf = _maprange(nt, mel.outputs['Fac'], 0.55, 0.8, 0.0, P['mel_amt'] * strength)
        c = _mixrgb(nt, 'MULTIPLY', c, (0.82, 0.74, 0.68, 1.0), melf)
        cav = _math(nt, 'MULTIPLY', pits_z, P['cav_amt'], x=-650, y=1700, clamp=True)
        c = _mixrgb(nt, 'MULTIPLY', c, (0.78, 0.7, 0.68, 1.0), cav)
        # lèvres : un peu plus profondes et plus rouges que la peau, stries verticales plus sombres (plus d'aplat rose)
        lt = P['lip_tint']
        c = _mixrgb(nt, 'MULTIPLY', c, (lt[0], lt[1], lt[2], 1.0), z_lips)
        lline = _math(nt, 'MULTIPLY', lip_w.outputs['Fac'], z_lips, x=-650, y=1900)
        lline = _math(nt, 'MULTIPLY', lline, P['lip_line_dark'], x=-500, y=1900, clamp=True)
        c = _mixrgb(nt, 'MULTIPLY', c, (0.7, 0.55, 0.55, 1.0), lline)
        L.new(c, p.inputs['Base Color'])
    return m
