"""
FITAIA — personnes de l'usine : une fiche (sexe, carrure, carnation, coiffure, barbe, accessoires) → configuration de l'avatar.

  cfg = persons.config_for(person, src)       # copie de build_premium_avatar.CONFIG, le héros n'est jamais modifié
  build_premium_avatar.build(src, out, cfg=cfg)

Identité procédurale : les traits du visage sont tirés dans des plages plausibles avec une GRAINE FIXE par personne
(cibles MakeHuman CC0) → le même membre a toujours le même visage, et aucun visage réel n'est utilisé.
"""
import copy
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_premium_avatar as B  # noqa: E402

# carnations de l'app (src/data/character.ts) : couleur d'affichage → albédo de texture visé.
# Étalonné sur le héros : sa texture (≈ 0,82 / 0,60 / 0,44) rend la carnation « Dorée » (s3).
SKIN_HEX = {'s1': 'F6E3D4', 's2': 'EFCDB1', 's3': 'E2B48C', 's4': 'C6956A', 's5': 'A6714B', 's6': '7F5236', 's7': '5A3A26', 's8': '3B2619'}
ALBEDO_K = np.array([0.925, 0.85, 0.80])
# texture MakeHuman de départ et mélange d'origines (macros) par carnation
SKIN_BASE = {
    'male': {'s1': 'young_caucasian_male', 's2': 'young_caucasian_male', 's3': 'young_caucasian_male2', 's4': 'young_caucasian_male2',
             's5': 'young_caucasian_male2', 's6': 'young_african_male', 's7': 'young_african_male', 's8': 'young_african_male'},
    'female': {'s1': 'young_caucasian_female', 's2': 'young_caucasian_female', 's3': 'young_caucasian_female2', 's4': 'young_caucasian_female2',
               's5': 'young_caucasian_female2', 's6': 'young_african_female', 's7': 'young_african_female', 's8': 'young_african_female'},
}
SKIN_FILE = {'young_caucasian_male': 'young_lightskinned_male_diffuse.png', 'young_caucasian_male2': 'young_lightskinned_male_diffuse2.png',
             'young_african_male': 'young_darkskinned_male_diffuse.png', 'young_caucasian_female': 'young_lightskinned_female_diffuse.png',
             'young_caucasian_female2': 'young_lightskinned_female_diffuse2.png', 'young_african_female': 'young_darkskinned_female_diffuse.png'}
RACE = {'s1': {'caucasian': 0.9, 'asian': 0.05, 'african': 0.05}, 's2': {'caucasian': 0.85, 'asian': 0.1, 'african': 0.05},
        's3': {'caucasian': 0.6, 'asian': 0.25, 'african': 0.15}, 's4': {'caucasian': 0.65, 'asian': 0.15, 'african': 0.2},
        's5': {'caucasian': 0.45, 'asian': 0.1, 'african': 0.45}, 's6': {'caucasian': 0.3, 'asian': 0.05, 'african': 0.65},
        's7': {'caucasian': 0.15, 'asian': 0.05, 'african': 0.8}, 's8': {'caucasian': 0.05, 'asian': 0.0, 'african': 0.95}}
# cheveux : couleur (linéaire, pour les cartes) et paramètres « mélanine » du rendu en mèches (Principled Hair BSDF)
HAIR = {'noir': {'rgb': [0.035, 0.03, 0.03], 'melanin': 0.99, 'redness': 0.2},
        'brun': {'rgb': [0.08, 0.05, 0.035], 'melanin': 0.86, 'redness': 0.45},
        'chatain': {'rgb': [0.16, 0.10, 0.06], 'melanin': 0.68, 'redness': 0.55},
        'blond': {'rgb': [0.52, 0.40, 0.22], 'melanin': 0.2, 'redness': 0.3},
        'roux': {'rgb': [0.35, 0.12, 0.05], 'melanin': 0.55, 'redness': 0.95},
        'gris': {'rgb': [0.45, 0.45, 0.45], 'melanin': 0.12, 'redness': 0.1},
        'blanc': {'rgb': [0.8, 0.8, 0.78], 'melanin': 0.03, 'redness': 0.05}}
IRIS = {'brun': [0.30, 0.19, 0.10], 'noir': [0.12, 0.08, 0.06], 'noisette': [0.40, 0.29, 0.14], 'vert': [0.30, 0.36, 0.20],
        'bleu': [0.30, 0.42, 0.55], 'gris': [0.42, 0.45, 0.47]}
HAIR_CARDS = {'milong': 'bob02', 'long': 'long01', 'queue': 'ponytail01', 'boucle': 'afro01', 'afro': 'afro01', 'tresses': 'braid01',
              'court': 'short02', 'degrade': 'short02', 'rase': None, 'chignon': 'ponytail01'}


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)]) / 255.0


def skin_tint(src, gender, tone):
    name = SKIN_BASE[gender][tone]
    from PIL import Image
    im = Image.open(os.path.join(src, 'system_assets/skins', name, SKIN_FILE[name])).convert('RGB').resize((256, 256))
    a = np.asarray(im).astype(np.float64).reshape(-1, 3) / 255
    a = a[a.sum(1) > 0.15]
    med = np.median(a, 0)
    target = hexrgb(SKIN_HEX[tone]) * ALBEDO_K
    # luminance visée, teinte à moitié conservée (une peau très claire éclaircie à fond devient blanche et bleutée)
    L = np.array([0.2126, 0.7152, 0.0722])
    ratio = (target @ L) / max(med @ L, 1e-6)
    tint = 0.5 * ratio + 0.5 * target / med
    tint = np.minimum(tint, 1.08) if ratio > 1 else tint
    return name, [round(float(x), 4) for x in np.clip(tint, 0.25, 2.5)]


# plages des traits du visage (paires decr/incr → valeur signée), communes puis par sexe
FACE_RANGES = {
    'head/head-scale-horiz': 0.18, 'head/head-scale-vert': 0.15, 'head/head-oval': 0.25, 'head/head-round': 0.2,
    'forehead/forehead-scale-vert': 0.3, 'forehead/forehead-trans': 0.2,
    'chin/chin-width': 0.3, 'chin/chin-height': 0.25, 'chin/chin-prominent': 0.3, 'chin/chin-jaw-drop': 0.2,
    'cheek/l-cheek-bones': 0.3, 'cheek/l-cheek-inner': 0.25,
    'nose/nose-scale-horiz': 0.25, 'nose/nose-scale-vert': 0.25, 'nose/nose-scale-depth': 0.2, 'nose/nose-point-width': 0.3,
    'nose/nose-width1': 0.25, 'nose/nose-nostrils-width': 0.25, 'nose/nose-hump': 0.3, 'nose/nose-point': 0.25, 'nose/nose-base': 0.2,
    'mouth/mouth-scale-horiz': 0.2, 'mouth/mouth-upperlip-volume': 0.3, 'mouth/mouth-lowerlip-volume': 0.3, 'mouth/mouth-cupidsbow': 0.3,
    'eyes/l-eye-scale': 0.15, 'eyes/l-eye-height2': 0.2, 'eyes/l-eye-corner1': 0.25, 'eyes/l-eye-corner2': 0.25,
    'eyebrows/eyebrows-angle': 0.3, 'eyebrows/eyebrows-trans': 0.25,
    'ears/l-ear-scale': 0.2, 'ears/l-ear-flap': 0.25,
}
GENDER_BIAS = {
    'female': {'mouth/mouth-upperlip-volume': 0.25, 'mouth/mouth-lowerlip-volume': 0.3, 'nose/nose-scale-horiz': -0.2, 'nose/nose-point-width': -0.25,
               'chin/chin-prominent': -0.1, 'eyes/l-eye-scale': 0.04, 'eyebrows/eyebrows-trans': -0.05, 'cheek/l-cheek-bones': 0.15,
               'ears/l-ear-scale': -0.2, 'nose/nose-hump': -0.2},
    'male': {'chin/chin-width': 0.15, 'chin/chin-prominent': 0.15, 'eyebrows/eyebrows-trans': -0.15, 'cheek/l-cheek-bones': 0.1},
}
SUFFIXES = [('-decr', '-incr'), ('-down', '-up'), ('-in', '-out'), ('-backward', '-forward')]


def _pair_files(src, name):
    d, base = os.path.split(name)
    files = set(os.listdir(os.path.join(src, 'mh/targets', d)))
    for neg, pos in SUFFIXES:
        fn, fp = f'{base}{neg}.target.gz', f'{base}{pos}.target.gz'
        if fn in files and fp in files:
            return f'{d}/{fn}', f'{d}/{fp}'
    if f'{base}.target.gz' in files:
        return None, f'{d}/{base}.target.gz'
    return None


def face_targets(src, gender, seed):
    rng = np.random.default_rng(seed)
    out = []
    for name, r in FACE_RANGES.items():
        v = float(np.clip(rng.normal(0, r / 1.8) + GENDER_BIAS[gender].get(name, 0.0), -r - 0.3, r + 0.3))
        names = [name]
        if '/l-' in name:                       # symétrique (+ légère asymétrie naturelle)
            names.append(name.replace('/l-', '/r-'))
        for k, nm in enumerate(names):
            pf = _pair_files(src, nm)
            if not pf:
                continue
            vv = v * (1.0 if k == 0 else 1.0 + rng.normal(0, 0.08))
            neg, pos = pf
            if vv >= 0:
                out.append((pos, round(vv, 3)))
            elif neg:
                out.append((neg, round(-vv, 3)))
    # asymétrie très légère (un visage parfaitement symétrique paraît artificiel)
    for a in ('asym/asym-eye-1-l', 'asym/asym-mouth-1-r', 'asym/asym-brown-1-l'):
        if os.path.exists(os.path.join(src, 'mh/targets', a + '.target.gz')):
            out.append((a + '.target.gz', round(float(rng.uniform(0.05, 0.25)), 3)))
    return out


def body_targets(gender, body):
    g = gender
    U = lambda m, w: f'macrodetails/universal-{g}-young-{m}-{w}.target.gz'  # noqa: E731
    if g == 'female':
        t = {'mince': [(U('averagemuscle', 'minweight'), 0.45)],
             'athle': [(U('maxmuscle', 'averageweight'), 0.42), (U('averagemuscle', 'minweight'), 0.15)],
             'rond': [(U('averagemuscle', 'maxweight'), 0.85), ('breast/female-young-averagemuscle-averageweight-maxcup-averagefirmness.target.gz', 0.3)],
             'costaud': [(U('maxmuscle', 'maxweight'), 0.4)]}[body]
        t += [('breast/female-young-averagemuscle-averageweight-maxcup-averagefirmness.target.gz', 0.12)] if body != 'rond' else []
        t += [('neck/measure-neck-circ-decr.target.gz', 0.25)]
    else:
        t = {'mince': [(U('averagemuscle', 'minweight'), 0.5)],
             'athle': [(U('maxmuscle', 'averageweight'), 0.55), ('torso/torso-vshape-incr.target.gz', 0.3)],
             'costaud': [(U('maxmuscle', 'maxweight'), 0.45), ('torso/torso-vshape-incr.target.gz', 0.2), ('neck/measure-neck-circ-incr.target.gz', 0.4)],
             'rond': [(U('averagemuscle', 'maxweight'), 0.6), ('stomach/stomach-pregnant-incr.target.gz', 0.25)]}[body]
        t += [('neck/measure-neck-circ-incr.target.gz', 0.3), ('pelvis/bulge-decr.target.gz', 1.0)]   # jogging ajusté : entrejambe sobre
    return t


def expression_targets(sheet, expr=None):
    """Expression de portrait (profils de démonstration) : bouche au repos à peine souriante, regard détendu.
    Cibles d'expression MakeHuman CC0 de l'origine dominante. (Jamais pour une identité photo : celle-ci reste neutre.)"""
    race = max(RACE[sheet['skin']].items(), key=lambda kv: kv[1])[0]
    e = {'mouth-corner-puller': 0.3, 'eye-left-slit': 0.14, 'eye-right-slit': 0.14, 'eye-left-closure': 0.06, 'eye-right-closure': 0.06}
    e.update(expr or {})
    return [(f'expression/units/{race}/{k}.target.gz', float(v)) for k, v in e.items() if v]


def morph_spec(gender):
    """Mêmes 15 morphs que le héros (le corps pourra évoluer comme celui de l'utilisateur), macros du bon sexe."""
    m = copy.deepcopy(B.CONFIG['morphs'])
    if gender == 'female':
        for k, parts in m.items():
            m[k] = [(rel.replace('universal-male-', 'universal-female-'), w) for rel, w in parts]
    return m


SELFIE_SHEET = {'appearance': 'fem', 'body': 'athle', 'skin': 's3', 'hairStyle': 'long', 'hairColor': 'brun', 'face': 'ovale',
                'eyes': 'brun', 'beard': 'aucune', 'extras': []}


def selfie_config(src, sex='f', sheet=None):
    """Configuration de la base d'une PERSONNE (selfie → avatar) : base femme (sex='f') ou homme, carnation / coupe /
    carrure de sa fiche du créateur. Le visage ne vient PAS de cette config : il est ajusté depuis la photo
    (photo_id.make_identity avec cfg=cette config) puis appliqué par build_premium_avatar.build (cfg['identity']).
    Un seul endroit pour la base selfie : serveur (photo_avatar_job.py), usine (factory_photo.py), construction GLB."""
    sh = dict(SELFIE_SHEET, appearance='fem' if sex == 'f' else 'masc')
    given = None
    if sheet:
        given = json.loads(sheet) if isinstance(sheet, str) else dict(sheet)
        sh.update({k: given[k] for k in ('body', 'skin', 'hairStyle', 'hairColor', 'eyes', 'beard', 'extras') if k in given})
    if sh['body'] not in ('mince', 'athle', 'rond', 'costaud'):
        sh['body'] = 'athle'
    if sh['skin'] not in RACE:
        sh['skin'] = 's3'
    if sh['hairStyle'] not in HAIR_CARDS:
        sh['hairStyle'] = 'long' if sex == 'f' else 'court'
    if sh['hairColor'] not in HAIR:
        sh['hairColor'] = 'brun'
    cfg = config_for({'key': 'selfie', 'seed': 7, 'sheet': sh,
                      'outfit': {'top': [0.205, 0.215, 0.235], 'bottom': [0.075, 0.078, 0.085]}}, src)
    cfg['id'] = 'selfie-' + sex
    # une identité photo reste NEUTRE : ni visage aléatoire, ni expression de portrait dans la base (sinon le visage ajusté
    # sourit et l'ajustement part d'une base déformée : 21 mm d'erreur au lieu de 6 sur les premiers essais) ; les cibles
    # de visage sont de toute façon ignorées par build() avec une identité, il ne reste que la carrure de la fiche
    from photo_id import FACE_DIRS
    cfg['base']['shape'] = [(rel, k) for rel, k in cfg['base']['shape'] if not rel.startswith(FACE_DIRS + ('expression/',))]
    cfg['base'].pop('sculpt', None)
    cfg['groom'] = None
    if sheet and isinstance(given, dict) and given.get('beard') in ('trois', 'courte', 'pleine', 'moustache') and sex == 'm':
        # barbe déclarée dans la fiche : peinte sur la peau par-dessus la texture cuite de la photo (sinon il ne reste
        # qu'une ombre diffuse projetée depuis le selfie)
        cfg['beard_declared'] = True
    if sheet and (given.get('hairStyle') if isinstance(given, dict) else None):
        # coupe choisie dans le créateur : cartes MakeHuman de cette coupe, à la couleur des cheveux de la photo…
        cfg['hair']['keep_with_identity'] = True
        if given.get('hairColor') in HAIR:
            # …sauf si la couleur est déclarée dans la fiche : la donnée déclarée l'emporte sur la mesure (une photo
            # surexposée donne un brun clair pour des cheveux noirs)
            cfg['hair']['keep_color'] = True
            cfg['hair_declared'] = dict(HAIR[given['hairColor']])      # rgb linéaire + mélanine, pour les rendus
    else:
        # sinon la coiffure vient de la photo comme pour la base homme (volume mesuré → coquilles, ou mèches avec --strands)
        cfg['hair'] = copy.deepcopy(B.CONFIG['hair'])
    return cfg


def config_for(person, src):
    sheet = person['sheet']
    gender = 'female' if sheet['appearance'] == 'fem' else 'male'
    seed = int(person['seed'])
    cfg = copy.deepcopy(B.CONFIG)
    cfg['id'] = 'community-' + person['key']
    cfg['label'] = person.get('name', person['key'])
    cfg['base']['gender'] = gender
    cfg['base']['race'] = RACE[sheet['skin']]
    cfg['base']['proportions'] = 0.8
    cfg['base']['sculpt'] = {'brow': 0.02, 'jaw': 0.015} if gender == 'male' else {'brow': 0.0, 'jaw': 0.0}
    cfg['base']['shape'] = face_targets(src, gender, seed) + body_targets(gender, sheet['body']) + expression_targets(sheet, person.get('expression'))
    cfg['morphs'] = morph_spec(gender)
    # pose : celle du héros (contrapposto, mains détendues) + petit mouvement de tête propre à chaque personne
    pose = cfg['skeleton']['pose']
    if person.get('pose', {}).get('head'):
        pose['bones']['head'] = person['pose']['head']
    # bras plus près du corps, coudes un peu fléchis, mains détendues (doigts repliés) : posture naturelle de portrait
    pose['upperarm_out_deg'] = 9.0 if gender == 'male' else 7.5
    pose['forearm_out_deg'] = 6.0
    pose['forearm_fwd_deg'] = 30.0
    pose['finger_curl'] = {'index': [14, 24, 14], 'middle': [17, 27, 15], 'ring': [20, 30, 16], 'pinky': [23, 32, 18], 'thumb': [4, 14, 12]}
    if gender == 'female':
        pose['bones']['pelvis'] = [0, -5.0, -6.0]
    # visage
    hc = HAIR[sheet['hairColor']]
    brow_col = list(np.clip(np.array(hc['rgb']) * (0.8 if sheet['hairColor'] in ('blond', 'gris', 'blanc') else 1.0) + (0.05 if sheet['hairColor'] == 'blond' else 0), 0, 1))
    cfg['face'] = {
        'eyes': ('system_assets/eyes/high-poly/high-poly.mhclo', 'system_assets/eyes/materials/brown.mhmat'),
        'iris': IRIS.get(sheet.get('eyes', 'brun'), IRIS['brun']),
        'eyebrows': 'system_assets/eyebrows/%s/%s.mhclo' % ((('eyebrow011',) * 2) if gender == 'female' else (('eyebrow010',) * 2)),
        'eyebrow_color': [round(float(x), 3) for x in brow_col],
        'eyelashes': 'system_assets/eyelashes/%s/%s.mhclo' % ((('eyelashes03',) * 2) if gender == 'female' else (('eyelashes02',) * 2)),
    }
    # peau
    skin_name, tint = skin_tint(src, gender, sheet['skin'])
    beard = sheet.get('beard', 'aucune')
    fa = {'hair': 0.0, 'scalp': 0.0, 'beard': 0.0, 'brow': 0.25 if gender == 'male' else 0.18, 'seed': seed % 97,
          'beard_color': tuple(np.clip(np.array(hc['rgb']) * 0.9, 0.02, 0.6))}
    if gender == 'female':
        fa.update({'lips': 0.38, 'lips_color': (0.62, 0.33, 0.33), 'red': 0.16, 'lash': 0.6, 'under': 0.05})
    else:
        fa.update({'beard': {'aucune': 0.12, 'trois': 0.42, 'courte': 0.7, 'pleine': 0.85, 'moustache': 0.3}[beard], 'lips': 0.3})
    cfg['skin'] = {'mhmat': f'system_assets/skins/{skin_name}/{skin_name}.mhmat', 'size': 2048, 'roughness': 0.6, 'face_art': fa, 'tint': tint}
    # cheveux temps réel (GLB) : cartes MakeHuman de la même coupe ; le rendu hors ligne utilise les mèches (groom)
    card = HAIR_CARDS.get(sheet['hairStyle'])
    cfg['hair'] = {'mhclo': f'system_assets/hair/{card}/{card}.mhclo', 'size': 1024,
                   'recolor': {'color': [float(x) * 2.2 for x in hc['rgb']], 'lo': 0.35, 'hi': 1.9}} if card else {}
    # tenue : t-shirt ajusté + legging (femmes) / jogging (hommes), baskets blanches
    suit = 'female_casualsuit01' if gender == 'female' else 'male_casualsuit06'
    cfg['clothes'] = [
        {'mhclo': f'system_assets/clothes/{suit}/{suit}.mhclo', 'size': 1024, 'recolor': 'fitaia_suit', 'suit': suit,
         'top': person['outfit']['top'], 'bottom': person['outfit']['bottom'], 'trim': person['outfit'].get('trim'), 'roughness': 0.9,
         **({'smooth_crotch': {'radius': 1.3, 'iters': 20, 'k': 0.55}} if gender == 'male' else {})},
        {'mhclo': 'system_assets/clothes/shoes05/shoes05.mhclo', 'size': 1024, 'recolor': 'fitaia_sneaker', 'roughness': 0.6,
         'cut_above': -7.15},
    ]
    cfg['generated_clothes'] = None
    # accessoires
    acc = []
    if 'lunettes' in sheet.get('extras', []):
        acc.append({'kind': 'glasses'})
    if 'boucles' in sheet.get('extras', []):
        acc.append({'kind': 'earrings'})
    if 'montre' in sheet.get('extras', []):
        acc.append({'kind': 'watch', 'side': 'l'})
    cfg['accessories'] = acc
    # coiffure en mèches + barbe
    h = dict(person.get('hair', {}))
    groom = {'seed': seed, 'hair': h, 'scalp_color': tuple(np.clip(np.array(hc['rgb']) * 1.4, 0.02, 0.7)),
             'render': {'melanin': hc['melanin'], 'redness': hc['redness']}}
    groom['hair']['scalp_paint'] = h.get('scalp_paint', {'crop': 0.8, 'cards': 0.55}.get(h.get('style'), 0.85))
    if h.get('style') == 'cards':
        # mèches tirées des cartes MakeHuman de la MÊME coupe que le GLB temps réel
        groom['hair']['mhclo_path'] = os.path.join(src, h.get('mhclo') or cfg['hair']['mhclo'])
    if beard in ('courte', 'pleine'):
        groom['beard'] = {'kind': 'short' if beard == 'courte' else 'full', **person.get('beard', {})}
    cfg['groom'] = groom
    cfg['groom_save'] = True
    cfg['portrait'] = True
    return cfg


def hero_config(hair_strands=True):
    """Le héros (CONFIG inchangé) + mèches de la MÊME coupe pour les rendus hors ligne (le GLB reste identique)."""
    cfg = copy.deepcopy(B.CONFIG)
    # tenue de portrait : le t-shirt simulé du GLB a un col à bords francs (pointes aux épaules, peau qui affleure) ;
    # pour les portraits, même t-shirt gris pierre + jogging anthracite, en vêtement ajusté propre (comme les membres)
    tee, jog = [0.56, 0.54, 0.50], [0.085, 0.088, 0.095]
    cfg['generated_clothes'] = None
    cfg['clothes'] = [
        {'mhclo': 'system_assets/clothes/male_casualsuit06/male_casualsuit06.mhclo', 'size': 1024, 'recolor': 'fitaia_suit',
         'suit': 'male_casualsuit06', 'top': tee, 'bottom': jog, 'trim': None, 'roughness': 0.9,
         'smooth_crotch': {'radius': 1.3, 'iters': 20, 'k': 0.55},
         # coupe : t-shirt à l'aise, manches qui s'écartent du bras, jogging ample resserré aux chevilles
         'fit': {'jogger': 0.16, 'cuff': 0.10, 'tee': 0.04, 'tee_hem': 0.10, 'sleeve': 0.05, 'sleeve_base': 0.0}},
        {'mhclo': 'system_assets/clothes/shoes05/shoes05.mhclo', 'size': 1024, 'recolor': 'fitaia_sneaker', 'roughness': 0.6,
         'cut_above': -7.15},
    ]
    if hair_strands:
        # même coupe que le GLB (CONFIG['groom'], « textured crop ») rendue en vraies mèches ; sourcils en poils
        cfg['groom_save'] = True
    else:
        cfg['groom'] = None
    cfg['collider'] = True
    cfg['portrait'] = True
    return cfg


def load(path=None):
    path = path or os.path.join(HERE, 'persons', 'community-demo.json')
    return json.load(open(path, encoding='utf-8'))['persons']
