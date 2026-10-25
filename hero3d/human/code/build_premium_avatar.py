"""
FITAIA premium-avatar — construction d'un avatar humain premium (GLB) à partir d'assets CC0 MakeHuman / MPFB2.

Pipeline (une couche = une étape, dans cet ordre) :
  1. Skeleton   : rig « game_engine » (articulations + poids de peau) → pose de présentation (bras relâchés).
  2. Base Mesh  : mesh de base + macros (homme, jeune adulte, origine, proportions « idéales »).
  3. Body Morphs: body_weight / body_weight_low / muscle / muscle_low / belly_fat (+ waist, hips, chest, shoulders prêts).
  4. Face       : yeux, sourcils, cils (proxies accrochés au visage).
  5. Skin       : texture de peau (2048 px), matière PBR mate.
  6. Hair       : coiffure (cartes de cheveux, alpha).
  7. Clothes    : vêtements + chaussures, recolorés FITAIA, accrochés au corps → ils suivent CHAQUE morph.
  8. Animations : (à venir) — le rig est déjà chargé ici, l'export du squelette viendra avec l'idle.

Usage : python tools/premium-avatar/build_premium_avatar.py --src <dossier mhsrc> [--preview]
Sources attendues (téléchargées par TELECHARGER-AVATAR-PREMIUM.bat puis PREPARER-MORPHS.bat sur le PC) :
  <src>/mpfb2/.../3dobjs/base.obj ou <src>/mh/3dobjs/base.obj, <src>/mh/targets/..., <src>/mh/rigs/..., <src>/system_assets/...
Licence de toutes les sources : CC0 1.0 (voir docs/PREMIUM-AVATAR.md).
"""
import io
import json
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mh import Mhclo, Obj, load_target, read_mhmat  # noqa: E402
from glb import GlbWriter  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DM_TO_M = 0.1

# ---------------------------------------------------------------------------------------------
# Configuration de l'avatar (une base = un fichier de config ; femme, autres carnations… = autres configs)
# ---------------------------------------------------------------------------------------------
CONFIG = {
    'id': 'premium-male-01',
    'label': 'Homme premium 01',
    'skeleton': {
        'rig': 'mh/rigs/rig.game_engine.json',
        'weights': 'mh/rigs/weights.game_engine.json',
        # Pose de présentation (degrés) : écart du bras / de l'avant-bras par rapport à la verticale, vers l'extérieur et vers l'avant ; rotation de la paume.
        'pose': {
            # mains détendues, doigts légèrement repliés et serrés (pas de main « en éventail »)
            'finger_curl': {'index': [12, 20, 12], 'middle': [15, 24, 14], 'ring': [18, 27, 15], 'pinky': [21, 30, 17], 'thumb': [4, 12, 10]},
            # bras relâchés près du corps, coude à peine fléchi, paume tournée vers la cuisse
            'upperarm_out_deg': 19.0, 'upperarm_fwd_deg': 3.0, 'forearm_out_deg': 7.0, 'forearm_fwd_deg': 10.0, 'palm_twist_deg': -25.0,
            # contrapposto : appui sur la jambe droite (sous le bassin), bassin qui bascule, épaules qui compensent,
            # jambe gauche relâchée (genou fléchi, pied un peu en avant) — pieds à largeur de hanches, pas écartés
            'bones': {
                'pelvis': [0, -4.0, -4.0],
                'spine_01': [0, 1.5, 2.0], 'spine_02': [-1.0, 1.5, 2.0], 'spine_03': [-1.5, 0, 1.0],
                'neck_01': [2.0, 2.0, -0.5], 'head': [1.0, 3.0, -1.5],
                'thigh_r': [0, 0, 3.0],
                'thigh_l': [-10.0, -10.0, -0.5], 'calf_l': [20.0, 0, 0], 'foot_l': [-8.0, 9.0, 0],
                'clavicle_l': [0, 0, -10.0], 'clavicle_r': [0, 0, 10.0], 'foot_r': [0, -6.0, 0],
            },
        },
    },
    'base': {
        'race': {'caucasian': 0.8, 'african': 0.1, 'asian': 0.1},
        'proportions': 0.8,
        'sculpt': {'brow': 0.03, 'jaw': 0.0},
        # anatomie hors cibles MakeHuman (anatomy.py) : pente du trapèze, sterno-cléido-mastoïdiens
        'anatomy': {'trapezius': 0.2, 'sterno': 0.03},
        'shape': [
            # visage (passe finale) : mâchoire nette sans lourdeur, pommettes, joues fines, nez fin, cou dégagé,
            # bouche naturelle aux coins à peine relevés (visage avenant au repos)
            ('chin/chin-prominent-incr.target.gz', 0.30), ('chin/chin-width-incr.target.gz', 0.12), ('chin/chin-height-decr.target.gz', 0.15),
            ('cheek/l-cheek-bones-incr.target.gz', 0.40), ('cheek/r-cheek-bones-incr.target.gz', 0.38),
            ('cheek/l-cheek-volume-decr.target.gz', 0.5), ('cheek/r-cheek-volume-decr.target.gz', 0.5),
            ('nose/nose-point-width-decr.target.gz', 0.5), ('nose/nose-width1-decr.target.gz', 0.35), ('nose/nose-nostrils-width-decr.target.gz', 0.3), ('nose/nose-hump-decr.target.gz', 0.25),
            ('nose/nose-scale-horiz-decr.target.gz', 0.3),
            # (passe « humain » : lèvres moins gonflées, coins à peine relevés)
            ('mouth/mouth-cupidsbow-incr.target.gz', 0.2), ('mouth/mouth-angles-up.target.gz', 0.22),
            ('eyebrows/eyebrows-trans-down.target.gz', 0.3),
            ('eyes/l-eye-height2-decr.target.gz', 0.05), ('eyes/r-eye-height2-decr.target.gz', 0.05),
            ('head/head-fat-decr.target.gz', 0.55),
            # cou d'homme adulte (plus de « cou de girafe ») ; yeux à leur taille réelle (plus d'yeux de poupée), âge neutre
            ('neck/measure-neck-circ-incr.target.gz', 0.22),
            ('eyes/l-eye-scale-incr.target.gz', 0.1), ('eyes/r-eye-scale-incr.target.gz', 0.1),
            ('nose/nose-scale-vert-decr.target.gz', 0.3),
            # légère asymétrie naturelle
            ('asym/asym-eye-1-l.target.gz', 0.15), ('asym/asym-mouth-1-r.target.gz', 0.06), ('asym/asym-brown-1-l.target.gz', 0.15),
            ('head/head-scale-horiz-decr.target.gz', 0.08), ('head/head-scale-depth-incr.target.gz', 0.06),
            # visage moins générique : ossature plus anguleuse, joues creusées sous les pommettes, arcades marquées, âge adulte
            ('head/head-rectangular.target.gz', 0.25), ('cheek/l-cheek-inner-decr.target.gz', 0.3), ('cheek/r-cheek-inner-decr.target.gz', 0.3),
            ('eyebrows/eyebrows-trans-forward.target.gz', 0.3), ('head/head-age-incr.target.gz', 0.15), ('chin/chin-bones-incr.target.gz', 0.1), ('forehead/forehead-scale-vert-decr.target.gz', 0.45),
            ('nose/nose-base-up.target.gz', 0.2), ('mouth/mouth-scale-horiz-incr.target.gz', 0.12), ('mouth/mouth-lowerlip-volume-decr.target.gz', 0.12),
            ('neck/measure-neck-height-decr.target.gz', 0.25),
            # oreilles plus petites et plus collées
            ('ears/l-ear-scale-decr.target.gz', 0.3), ('ears/r-ear-scale-decr.target.gz', 0.3), ('ears/l-ear-flap-decr.target.gz', 0.35), ('ears/r-ear-flap-decr.target.gz', 0.35),
            ('ears/l-ear-rot-backward.target.gz', 0.25), ('ears/r-ear-rot-backward.target.gz', 0.25),
            # silhouette : épaules larges, dos en V, buste un peu plus long (jambes moins dominantes), mains plus fines
            ('torso/torso-vshape-incr.target.gz', 0.25), ('torso/measure-shoulder-dist-incr.target.gz', 0.0),
            ('arms/l-upperarm-shoulder-muscle-incr.target.gz', 0.15), ('arms/r-upperarm-shoulder-muscle-incr.target.gz', 0.15),
            ('torso/torso-scale-vert-incr.target.gz', 0.25),
            ('hands/l-hand-scale-decr.target.gz', 0.3), ('hands/r-hand-scale-decr.target.gz', 0.3),
            ('hands/l-hand-fingers-distance-decr.target.gz', 0.4), ('hands/r-hand-fingers-distance-decr.target.gz', 0.4),
        ],
    },
    'morphs': {
        # nom dans le GLB : liste de (fichier target, intensité)
        # 13 réglages de corps (la corrélation entre eux est faite dans l'app : src/human-engine/body/BodyShape.ts)
        'body_weight': [('macrodetails/universal-male-young-averagemuscle-maxweight.target.gz', 2.3)],
        'body_weight_low': [('macrodetails/universal-male-young-averagemuscle-minweight.target.gz', 1.0), ('torso/measure-waist-circ-decr.target.gz', 0.3)],
        'muscle': [('macrodetails/universal-male-young-maxmuscle-averageweight.target.gz', 1.0), ('stomach/stomach-tone-incr.target.gz', 0.8),
                   # athlétique lisible même en miniature : taille affinée, dos large, pectoraux, visage un peu plus sec
                   ('torso/measure-waist-circ-decr.target.gz', 0.8), ('torso/torso-muscle-dorsi-incr.target.gz', 0.35),
                   ('neck/measure-neck-circ-incr.target.gz', 0.4), ('legs/l-upperleg-fat-decr.target.gz', 0.4), ('legs/r-upperleg-fat-decr.target.gz', 0.4),
                   ('torso/torso-muscle-pectoral-incr.target.gz', 0.5), ('head/head-fat-decr.target.gz', 0.3)],
        'muscle_low': [('macrodetails/universal-male-young-minmuscle-averageweight.target.gz', 1.0)],
        'belly_fat': [('stomach/stomach-pregnant-incr.target.gz', 0.8), ('torso/measure-waist-circ-incr.target.gz', 0.7)],
        'waist': [('torso/measure-waist-circ-incr.target.gz', 1.0)],
        'hips': [('torso/measure-hips-circ-incr.target.gz', 1.0)],
        'chest': [('torso/measure-bust-circ-incr.target.gz', 0.6), ('torso/torso-muscle-pectoral-incr.target.gz', 0.6)],
        'shoulders': [('torso/measure-shoulder-dist-incr.target.gz', 0.3), ('torso/torso-vshape-incr.target.gz', 0.35),
                      ('arms/l-upperarm-shoulder-muscle-incr.target.gz', 0.35), ('arms/r-upperarm-shoulder-muscle-incr.target.gz', 0.35)],
        'upper_arm': [('arms/l-upperarm-fat-incr.target.gz', 0.8), ('arms/r-upperarm-fat-incr.target.gz', 0.8),
                      ('arms/l-upperarm-muscle-incr.target.gz', 0.4), ('arms/r-upperarm-muscle-incr.target.gz', 0.4)],
        'forearm': [('arms/l-lowerarm-fat-incr.target.gz', 0.8), ('arms/r-lowerarm-fat-incr.target.gz', 0.8),
                    ('arms/l-lowerarm-muscle-incr.target.gz', 0.3), ('arms/r-lowerarm-muscle-incr.target.gz', 0.3)],
        'thigh': [('legs/l-upperleg-fat-incr.target.gz', 0.8), ('legs/r-upperleg-fat-incr.target.gz', 0.8), ('legs/measure-thigh-circ-incr.target.gz', 0.3)],
        'calf': [('legs/l-lowerleg-fat-incr.target.gz', 0.6), ('legs/r-lowerleg-fat-incr.target.gz', 0.6), ('legs/measure-calf-circ-incr.target.gz', 0.5)],
        'face_fat': [('head/head-fat-incr.target.gz', 0.9), ('cheek/l-cheek-volume-incr.target.gz', 0.5), ('cheek/r-cheek-volume-incr.target.gz', 0.5)],
        'neck_fat': [('neck/neck-double-incr.target.gz', 1.0), ('neck/measure-neck-circ-incr.target.gz', 0.4)],
    },
    'face': {
        'eyes': ('system_assets/eyes/high-poly/high-poly.mhclo', 'system_assets/eyes/materials/brown.mhmat'), 'iris_scale': 1.05,
        'eyebrows': 'system_assets/eyebrows/eyebrow001/eyebrow001.mhclo',
        'eyelashes': 'system_assets/eyelashes/eyelashes02/eyelashes02.mhclo',
    },
    'skin': {'mhmat': 'system_assets/skins/young_caucasian_male2/young_caucasian_male2.mhmat', 'size': 2048, 'roughness': 0.62,
             'face_art': {'hair': 0.0, 'scalp': 0.8, 'scalp_tone': 0.25, 'scalp_crown': 0.0, 'beard': 0.3, 'stubble_soft': True, 'lips': 0.45, 'lips_color': (0.6, 0.36, 0.34), 'brow': 0.45,
                          'beard_color': (0.075, 0.055, 0.045)},
             'tint': [1.0, 0.92, 0.80]},  # carnation olive légère
    # coiffure : « textured crop » en mèches (groom.py, rendus hors ligne) ; dans le GLB, la même coupe en cartes de mèches
    # (hair_cards.py) — repli : coquilles (shell) puis cartes MakeHuman
    'hair': {'cards': {'count': 1100, 'segs': 6, 'width': 0.13, 'side_count': 0},
             # brun foncé lisible (fiche « Brun » #4A3024) : l'ancienne valeur sortait noire au rendu
             'card_color': [0.32, 0.215, 0.14],
             'shell': {'color': [0.15, 0.105, 0.07]}, 'mhclo': 'system_assets/hair/short01/short01.mhclo', 'size': 1024, 'recolor': {'color': [0.24, 0.17, 0.12], 'lo': 0.4, 'hi': 1.8}},
    'groom': {'seed': 7,
              'hair': {'style': 'crop', 'hero': True, 'cut': {'top': 0.6, 'side_hi': 0.22, 'side_lo': 0.12},   # coupe pleine (réf. Mark) : côtés 1-2 cm, plus de dégradé rasé
                       'forward': 0.25, 'sweep': 0.32, 'mess': 0.1, 'side_mess': 0.05, 'side_lift': 0.06, 'side_flat': 0.25,
                       'volume': 0.32, 'lift': 1.0, 'count': 140000, 'clump': 0.75, 'frizz': 0.0015, 'segments': 9,
                       'side_density': 0.75, 'side_clump': 0.3, 'top_by_normal': True, 'split_sides': 0.0,
                       'smooth_iters': 3, 'max_turn': 1.6, 'max_out': 0.25, 'normal_up': (0.4, 0.8), 'top_edge': (0.32, 0.58),
                       'exclude': [((-0.56, 8.95, 0.64), (0.09, 0.1, 0.12))],
                       'scalp_paint': 0.7, 'paint_top': True, 'paint_from': 8.1},
              'brows': {'count': 2800, 'length': 0.065},
              # couches fines des rendus (HairPipeline) : ligne frontale douce, favoris, barbe de quelques jours en poils
              'layers': {'hairline': {'count': 6000, 'length': 0.04}, 'sideburns': {'count': 3000, 'length': 0.045},
                         'stubble': {'count': 26000, 'length': 0.008, 'radius': 0.00042}},
              'scalp_color': (0.24, 0.16, 0.11),       # même brun que les cartes (sinon calotte noire sous des mèches brunes)
              'render': {'melanin': 0.94, 'redness': 0.12, 'beard_melanin': 1.0}},
    'groom_save': False,           # GLB de l'app : les mèches ne servent qu'à fabriquer les cartes (pas de .hair.npz)
    # tenue (passe finale) : t-shirt gris pierre + jogging anthracite = vêtement MakeHuman CC0 repeint (wardrobe.py) et
    # recoupé sur notre corps (_suit_fit : aisance, manches, jogging ample resserré aux chevilles). Mêmes vêtements dans le
    # GLB de l'app, les portraits et la planche ; dans les rendus hors ligne, le tissu est en plus simulé (vrais plis).
    'clothes': [
        {'mhclo': 'system_assets/clothes/male_casualsuit06/male_casualsuit06.mhclo', 'size': 1024, 'recolor': 'fitaia_suit',
         'suit': 'male_casualsuit06', 'top': [0.56, 0.54, 0.50], 'bottom': [0.085, 0.088, 0.095], 'trim': None, 'roughness': 0.9,
         'smooth_crotch': {'radius': 1.3, 'iters': 20, 'k': 0.55},
         'fit': {'jogger': 0.16, 'cuff': 0.10, 'taper': 0.12, 'tee': 0.04, 'tee_hem': 0.10, 'sleeve': 0.03, 'sleeve_base': 0.0,
                 # épaule ronde (quality gate : « pas d'épaule carrée »)
                 'shoulder_smooth': 1.0, 'shoulder_radius': 1.5, 'shoulder_iters': 24}},
        {'mhclo': 'system_assets/clothes/shoes05/shoes05.mhclo', 'size': 1024, 'recolor': 'fitaia_sneaker', 'roughness': 0.6,
         'cut_above': -7.15},
    ],
    'animations': [],
    # vêtements générés + simulés (garments.py + blender/cloth_sim.py) : désactivés pour le héros depuis la passe finale
    # (trous au col et aux flancs avec les morphs) ; pour les réactiver : 'generated_clothes': GENERATED_CLOTHES et
    # 'replaced_by_generated': True sur la tenue ci-dessus.
    'generated_clothes': None,
}

GENERATED_CLOTHES = {
    'dir': 'garments',
    'items': {
        'tee': {'color': [0.55, 0.53, 0.49], 'fabric': 'jersey', 'roughness': 0.93, 'uv_repeat': 1},
        'jogger': {'color': [0.085, 0.088, 0.095], 'fabric': 'fleece', 'roughness': 0.86, 'uv_repeat': 1},
    },
}

LIME = np.array([200, 240, 60], dtype=np.float64)


# ---------------------------------------------------------------------------------------------
# Outils
# ---------------------------------------------------------------------------------------------
def group_verts(obj, name):
    s = set()
    for f, g in zip(obj.faces, obj.groups):
        if g == name:
            s.update(vi for vi, _ in f)
    return sorted(s)


def vertex_normals(pos, tris):
    n = np.zeros_like(pos)
    a, b, c = pos[tris[:, 0]], pos[tris[:, 1]], pos[tris[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(n, tris[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    ln[ln == 0] = 1
    return n / ln


def rot(axis, deg):
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    x, y, z = axis / np.linalg.norm(axis)
    return np.array([
        [c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
        [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
        [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)],
    ])


def affine(R, pivot):
    M = np.eye(4)
    M[:3, :3] = R
    M[:3, 3] = pivot - R @ pivot
    return M


# ---------------------------------------------------------------------------------------------
# 1. Skeleton
# ---------------------------------------------------------------------------------------------
class Skeleton:
    def __init__(self, src, cfg, obj, shape):
        self.rig = json.load(open(os.path.join(src, cfg['rig'])))
        wj = json.load(open(os.path.join(src, cfg['weights'])))
        self.bones = list(self.rig.keys())
        idx = {b: i for i, b in enumerate(self.bones)}
        n = shape.shape[0]
        W = np.zeros((n, len(self.bones)))
        for b, lst in wj['weights'].items():
            if b not in idx:
                continue
            for vi, w in lst:
                if vi < n:
                    W[vi, idx[b]] += w
        s = W.sum(1)
        W[s == 0, idx['Root']] = 1.0
        W /= W.sum(1, keepdims=True)
        self.W = W
        self.heads = {}
        for b, d in self.rig.items():
            h = d['head']
            if h.get('strategy') == 'CUBE' and h.get('cube_name'):
                vs = group_verts(obj, h['cube_name'])
                self.heads[b] = shape[vs].mean(0) if vs else np.zeros(3)
            elif h.get('vertex_indices'):
                self.heads[b] = shape[h['vertex_indices']].mean(0)
            else:
                self.heads[b] = np.zeros(3)
        self.G = self._pose(cfg['pose'])

    def _pose(self, p):
        """
        Pose de présentation par directions cibles (indépendante de la pose du mesh source) :
        bras presque le long du corps, coude légèrement fléchi, paumes tournées vers les cuisses.
        """
        def between(a, b):
            a, b = a / np.linalg.norm(a), b / np.linalg.norm(b)
            v = np.cross(a, b)
            c = float(np.dot(a, b))
            if np.linalg.norm(v) < 1e-9:
                return np.eye(3)
            vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
            return np.eye(3) + vx + vx @ vx * (1 / (1 + c))

        def direction(out_deg, fwd_deg, sx):
            o, f = math.radians(out_deg), math.radians(fwd_deg)
            d = np.array([sx * math.sin(o), -math.cos(o) * math.cos(f), math.sin(f)])
            return d / np.linalg.norm(d)

        posed = {}
        for side, sx in (('l', 1.0), ('r', -1.0)):
            sh, el, wr = self.heads[f'upperarm_{side}'], self.heads[f'lowerarm_{side}'], self.heads[f'hand_{side}']
            Ru = between(el - sh, direction(p['upperarm_out_deg'], p['upperarm_fwd_deg'], sx))
            Gu = affine(Ru, sh)
            el2 = (Gu @ np.append(el, 1))[:3]
            fd = Ru @ (wr - el)
            target = direction(p['forearm_out_deg'], p['forearm_fwd_deg'], sx)
            Rf = between(fd, target)
            # rotation autour de l'axe de l'avant-bras : paume vers la cuisse
            Rt = rot(target, -sx * p['palm_twist_deg'])
            Gf = affine(Rt @ Rf, el2) @ Gu
            posed[f'upperarm_{side}'] = Gu
            posed[f'lowerarm_{side}'] = np.linalg.inv(Gu) @ Gf

        # Pose « idle » : rotations locales (degrés, axes du corps x=gauche, y=haut, z=avant) autour de l'articulation,
        # composées le long de la hiérarchie. Les bras gardent leur direction cible mais suivent le buste.
        rots = p.get('bones', {})

        # mains détendues : chaque phalange se plie vers la paume (paumes vers le bas dans la pose de repos MakeHuman)
        curl = p.get('finger_curl', {})

        def finger_rot(b):
            parts = b.split('_')
            if len(parts) != 3 or parts[0] not in ('thumb', 'index', 'middle', 'ring', 'pinky'):
                return None
            f, seg, side = parts
            ang = curl.get(f, curl.get('all', [0, 0, 0]))[int(seg) - 1]
            if not ang:
                return None
            nxt = f'{f}_{int(seg) + 1:02d}_{side}'
            prv = f'{f}_{int(seg) - 1:02d}_{side}'
            d = (self.heads[nxt] - self.heads[b]) if nxt in self.heads else (self.heads[b] - self.heads[prv])
            palm = np.array([0.0, -1.0, 0.0]) if f != 'thumb' else np.array([0.0, -0.6, 0.8])
            ax = np.cross(d, palm)
            if np.linalg.norm(ax) < 1e-9:
                return None
            return affine(rot(ax, ang), self.heads[b])

        def local(b):
            fr = finger_rot(b) if curl else None
            if fr is not None:
                return fr
            r = rots.get(b)
            if not r:
                return np.eye(4)
            R = rot(np.array([0, 0, 1.0]), r[2]) @ rot(np.array([0, 1.0, 0]), r[1]) @ rot(np.array([1.0, 0, 0]), r[0])
            return affine(R, self.heads[b])

        G = {}

        def glob(b):
            if b in G:
                return G[b]
            par = self.rig[b].get('parent') or ''
            Gp = glob(par) if par else np.eye(4)
            if b in posed:
                G[b] = Gp @ posed[b]
            else:
                G[b] = Gp @ local(b)
            return G[b]

        for b in self.bones:
            glob(b)
        return np.stack([G[b] for b in self.bones])

    def apply(self, X, W=None):
        W = self.W if W is None else W
        Xh = np.concatenate([X, np.ones((len(X), 1))], 1)
        out = np.zeros_like(X)
        for k in range(len(self.bones)):
            w = W[:, k]
            m = w > 0
            if not m.any():
                continue
            out[m] += w[m, None] * (Xh[m] @ self.G[k].T)[:, :3]
        return out

    def proxy_weights(self, clo):
        r, w = clo.refs, clo.weights
        Wp = self.W[r[:, 0]] * w[:, 0:1] + self.W[r[:, 1]] * w[:, 1:2] + self.W[r[:, 2]] * w[:, 2:3]
        Wp = np.clip(Wp, 0, None)
        Wp /= np.maximum(Wp.sum(1, keepdims=True), 1e-9)
        return Wp


# ---------------------------------------------------------------------------------------------
# 5–7. Textures
# ---------------------------------------------------------------------------------------------
def load_rgb(path, size):
    im = Image.open(path)
    has_alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
    im = im.convert('RGBA' if has_alpha else 'RGB')
    if max(im.size) > size:
        im = im.resize((size, size) if im.size[0] == im.size[1] else (size, int(size * im.size[1] / im.size[0])), Image.LANCZOS)
    return im


def encode(im, fmt, q=86):
    b = io.BytesIO()
    if fmt == 'jpeg':
        im.convert('RGB').save(b, 'JPEG', quality=q, optimize=True, progressive=False)
        return b.getvalue(), 'image/jpeg'
    im.save(b, 'PNG', optimize=True)
    return b.getvalue(), 'image/png'


def recolor_tee_jogger(im, ao=None, tee_color=(0.205, 0.215, 0.235), jog_color=(0.075, 0.078, 0.085)):
    """
    Texture male_casualsuit06 : moitié haute = t-shirt, moitié basse = jean.
    On ne garde que le relief basse fréquence (plis) + l'occlusion ; logo, surpiqûres, étiquette et délavage sont effacés.
    """
    from PIL import ImageFilter
    a = np.asarray(im.convert('RGB')).astype(np.float64) / 255
    H, W = a.shape[:2]
    lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    rows = np.arange(H)[:, None] / H
    shirt = np.broadcast_to(rows < 0.43, (H, W))
    blue = (a[..., 2] > a[..., 0] + 0.04) & (sat > 0.12)

    def smooth(values, mask, radius):
        """moyenne locale sur la zone (ignore l'extérieur) : relief des plis sans les détails imprimés"""
        v = Image.fromarray((np.where(mask, values, 0) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))
        m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))
        v, m = np.asarray(v).astype(np.float64), np.asarray(m).astype(np.float64)
        return np.where(m > 1, v / np.maximum(m, 1), 0)

    # t-shirt : le logo (saturé ou sombre) est exclu du calcul du relief
    clean = shirt & (sat < 0.12) & (lum > 0.62)
    t_rel = smooth(lum, clean, max(3, W // 160))
    t_ref = np.median(lum[clean]) if clean.any() else 0.85
    t_det = np.clip(t_rel / t_ref, 0.85, 1.06)
    # jean → jogging : relief très lissé (plus de délavage ni de coutures)
    j_rel = smooth(lum, blue, max(6, W // 70))
    j_ref = np.median(lum[blue]) if blue.any() else 0.45
    j_det = np.clip(j_rel / j_ref, 0.7, 1.15)
    out = np.empty_like(a)
    out[:] = np.array(jog_color)[None, None, :] * j_det[..., None]
    out[shirt] = (np.array(tee_color)[None, :] * t_det[shirt][:, None])
    if ao is not None:
        ao_a = np.asarray(ao.convert('L').resize(im.size)).astype(np.float64) / 255
        out *= (0.4 + 0.6 * ao_a)[..., None]
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))


def recolor_tint(im, color, gamma=1.0, lo=0.55, hi=1.35):
    """Recolore un tissu dans une teinte donnée en gardant son relief (plis, coutures, grain) via la luminance."""
    rgba = im.convert('RGBA')
    a = np.asarray(rgba).astype(np.float64) / 255
    lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    mask = a[..., 3] > 0.1
    ref = np.median(lum[mask]) if mask.any() else 0.5
    d = np.clip((lum / max(ref, 1e-3)) ** gamma, lo, hi)
    c = np.array(color, dtype=np.float64)
    out = a.copy()
    out[..., :3] = np.clip(c[None, None, :] * d[..., None], 0, 1)
    return Image.fromarray((out * 255).astype(np.uint8), 'RGBA' if im.mode == 'RGBA' else 'RGBA').convert(im.mode)


def recolor_eye(im, iris=(0.36, 0.25, 0.13), iris_scale=1.0):
    """Iris rouge-brun MakeHuman → noisette chaud (luminance conservée), blanc de l'œil plus propre."""
    a = np.asarray(im.convert('RGBA')).astype(np.float32) / 255
    rgb = a[..., :3]
    mx, mn = rgb.max(2), rgb.min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    lum = rgb @ np.array([0.3, 0.59, 0.11], np.float32)
    m = np.clip((sat - 0.3) / 0.2, 0, 1)[..., None]
    t = np.array(iris, np.float32)
    col = t[None, None, :] * (lum / (t @ np.array([0.3, 0.59, 0.11], np.float32)))[..., None] * 1.25
    # sclère : on désature et on éclaircit légèrement (moins de veines rouges)
    scl = (1 - m) * np.clip((lum[..., None] - 0.45) / 0.3, 0, 1)
    neutral = np.repeat(lum[..., None], 3, 2) * np.array([1.04, 1.02, 1.0], np.float32) + 0.04
    rgb2 = rgb * (1 - m) + np.clip(col, 0, 1) * m
    rgb2 = rgb2 * (1 - 0.6 * scl) + neutral * 0.6 * scl
    a[..., :3] = np.clip(rgb2, 0, 1)
    if iris_scale and iris_scale != 1.0:
        a = _enlarge_iris(a, m[..., 0], iris_scale)
    return Image.fromarray((a * 255).astype(np.uint8), 'RGBA')


def _enlarge_iris(a, iris_mask, s=1.12):
    """Iris MakeHuman un peu petit (≈ 39 % du globe visible au lieu de ≈ 47 %) : chaque iris est agrandi par une
    déformation radiale continue (l'iris et le limbe grandissent, la sclère autour est comprimée, rien ne se déchire)."""
    from scipy import ndimage
    H, W = iris_mask.shape
    lab, n = ndimage.label(iris_mask > 0.5)
    if n == 0:
        return a
    sizes = ndimage.sum(np.ones_like(lab), lab, np.arange(1, n + 1))
    out = a.copy()
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
    for k in np.argsort(-sizes)[:2]:
        if sizes[k] < 0.002 * H * W:
            continue
        cy, cx = ndimage.center_of_mass(lab == k + 1)
        ri = np.sqrt(sizes[k] / np.pi) * 1.04
        R = ri * 1.9
        dy, dx = yy - cy, xx - cx
        r = np.sqrt(dx * dx + dy * dy)
        inside = r < R
        rs = np.where(r <= ri * s, r / s, ri + (r - ri * s) * (R - ri) / (R - ri * s))
        f = np.where(r > 1e-6, rs / np.maximum(r, 1e-6), 1.0)
        sy, sx = cy + dy * f, cx + dx * f
        for c in range(a.shape[2]):
            v = ndimage.map_coordinates(a[..., c], [sy[inside], sx[inside]], order=1, mode='nearest')
            out[..., c][inside] = v
    return out


def recolor_sneaker(im):
    """basket blanche sans marque : bandes latérales effacées (empeigne unie), accents → lime FITAIA."""
    from PIL import ImageFilter
    rgb = im.convert('RGB')
    a0 = np.asarray(rgb).astype(np.float64)
    lum0 = a0 @ np.array([0.2126, 0.7152, 0.0722])
    bright = Image.fromarray(((lum0 > 150) * 255).astype(np.uint8))
    region = bright.filter(ImageFilter.MaxFilter(25)).filter(ImageFilter.MinFilter(21))
    reg = np.asarray(region) > 128
    stripes = reg & (lum0 < 85)
    bm = (lum0 > 150).astype(np.float64)
    num = np.asarray(Image.fromarray(np.clip(a0 * bm[..., None], 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10))).astype(np.float64)
    den = np.asarray(Image.fromarray((bm * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10))).astype(np.float64)[..., None] / 255
    fill = num / np.maximum(den, 0.05)
    w = np.asarray(Image.fromarray((stripes * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float64)[..., None] / 255
    a0 = a0 * (1 - w) + fill * w
    im = Image.fromarray(np.clip(a0, 0, 255).astype(np.uint8))
    a = np.asarray(im.convert('RGB')).astype(np.float64)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    blue = (b > r + 25) & (b > g + 10)
    lum = (0.2126 * r + 0.7152 * g + 0.0722 * b)[blue]
    ref = np.median(lum) if lum.size else 120
    a[blue] = np.clip(LIME[None, :] * (lum / ref)[:, None] ** 0.8, 0, 255)
    return Image.fromarray(a.astype(np.uint8))


# ---------------------------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------------------------
def _smooth_crotch(clo, rest, P0, Pm, o):
    """Lissage laplacien pondéré autour de l'entrejambe (repéré sur le vêtement au repos : point le plus bas entre les
    jambes). o = {'radius': dm, 'iters': n, 'k': force}."""
    nv = len(rest)
    nb = [set() for _ in range(nv)]
    for f in clo.obj.faces:
        ids = [vi for vi, _ in f]
        for a_, b_ in zip(ids, ids[1:] + ids[:1]):
            nb[a_].add(b_)
            nb[b_].add(a_)
    # fourche : sommet médian (|x| petit) le plus bas — sous la fourche, les deux jambes sont séparées
    mid = np.abs(rest[:, 0]) < 0.12
    lo = rest[mid, 1].min() if mid.any() else rest[:, 1].min()
    front = mid & (rest[:, 1] > lo) & (rest[:, 1] < lo + 1.0)
    zf = np.percentile(rest[front, 2], 80) if front.any() else 0.0
    c = np.array([0.0, lo + o.get('up', 0.45), zf])
    d = np.linalg.norm((rest - c) * np.array([1.0, 0.8, 1.0]), axis=1)
    w = np.clip(1 - d / o.get('radius', 1.3), 0, 1) ** 1.5 * o.get('k', 0.5)
    idx = np.where(w > 1e-3)[0]
    nbl = [np.array(sorted(nb[i]), dtype=np.int64) for i in idx]

    def smooth_(P):
        P = P.copy()
        for _ in range(o.get('iters', 12)):
            avg = np.array([P[n].mean(0) if len(n) else P[i] for i, n in zip(idx, nbl)])
            P[idx] = P[idx] + w[idx, None] * (avg - P[idx])
        return P
    return smooth_(P0), [(mn, smooth_(P)) for mn, P in Pm]


def _sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _suit_fit(clo, rest, P0, Pm, tris, skel, fit):
    """Coupe d'une tenue MakeHuman (t-shirt + jean ajustés) → t-shirt à l'aise + jogging.
    Décalages le long de la normale (dm), définis au repos par la hauteur sur la jambe / la position sur le bras :
      - jogging : ample aux cuisses, genoux et mollets, resserré à la cheville (bord-côte), moins à l'intérieur des cuisses ;
      - t-shirt : un peu d'aisance au ventre et à l'ourlet, manches qui s'écartent du bras vers l'ourlet.
    La même déformation est appliquée à la pose et à chaque morph (normales propres à chaque forme)."""
    n = len(rest)
    vt = clo.obj.vt
    vimg = np.zeros(n)
    cnt = np.zeros(n)
    for f in clo.obj.faces:
        for vi, ti in f:
            if ti >= 0:
                vimg[vi] += 1 - vt[ti][1]
                cnt[vi] += 1
    vimg /= np.maximum(cnt, 1)
    bottom = vimg >= fit.get('split_v', 0.43)
    H = skel.heads
    off = np.zeros(n)
    # ---- jogging
    for side, sgn in (('l', 1.0), ('r', -1.0)):
        hip, knee, ank = H[f'thigh_{side}'], H[f'calf_{side}'], H[f'foot_{side}']
        m = bottom & (np.sign(rest[:, 0]) == sgn)
        y = rest[m, 1]
        u = (y - ank[1]) / (hip[1] - ank[1])
        e = fit.get('jogger', 0.16)
        prof = (0.35 + 0.65 * _sstep(1.25, 0.85, u))                          # taille / hanches : peu d'aisance
        prof = prof * (1.0 + 0.25 * np.exp(-((u - 0.45) / 0.18) ** 2))     # genou : un peu plus de tissu
        cuff = fit.get('cuff', 0.10)                                          # hauteur du bord-côte (part de la jambe)
        prof = prof * (0.18 + 0.82 * _sstep(cuff * 0.35, cuff * 1.6, u))    # resserré à la cheville
        # intérieur des cuisses : moins (les deux jambes ne se touchent pas)
        c = ank + (hip - ank) * np.clip(u, 0, 1)[:, None]
        rad = rest[m] - c
        rad[:, 1] = 0
        rad /= np.maximum(np.linalg.norm(rad, axis=1, keepdims=True), 1e-9)
        inner = np.clip(-rad[:, 0] * sgn, 0, 1) * _sstep(0.4, 0.8, u)
        prof = prof * (1 - 0.6 * inner)
        # jogging fuselé (réf. Mark) : le jean droit d'origine est resserré vers la cheville jusqu'au bord-côte ;
        # _clear_body le garde ensuite au-dessus de la peau
        taper = fit.get('taper', 0.0) * (1 - _sstep(cuff * 0.6, cuff * 2.2, u))
        off[m] = e * prof - taper
    # ---- t-shirt
    top = ~bottom
    bi = {b: i for i, b in enumerate(skel.bones)}
    Wp = skel.proxy_weights(clo)
    arm = np.zeros(n)
    for b in ('upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'):
        if b in bi:
            arm += Wp[:, bi[b]]
    sleeve = top & (arm > 0.45)
    for side, sgn in (('l', 1.0), ('r', -1.0)):
        sh, el = H[f'upperarm_{side}'], H[f'lowerarm_{side}']
        m = sleeve & (np.sign(rest[:, 0]) == sgn)
        if not m.any():
            continue
        ax = (el - sh) / np.linalg.norm(el - sh)
        t = (rest[m] - sh) @ ax / np.linalg.norm(el - sh)
        th = np.percentile(t, 98)
        off[m] = fit.get('sleeve_base', 0.03) + fit.get('sleeve', 0.12) * _sstep(0.05, th, t)
    body_t = top & ~sleeve
    y = rest[:, 1]
    yc = H['spine_03'][1] if 'spine_03' in H else 3.5
    ypel = H['pelvis'][1]
    off[body_t] = fit.get('tee', 0.04) + fit.get('tee_hem', 0.10) * _sstep(yc, ypel, y[body_t])
    # transition douce manche ↔ buste (aisselle) : moyenne sur les voisins
    nb = [set() for _ in range(n)]
    for f in clo.obj.faces:
        ids = [vi for vi, _ in f]
        for a_, b_ in zip(ids, ids[1:] + ids[:1]):
            nb[a_].add(b_)
            nb[b_].add(a_)
    for _ in range(fit.get('smooth', 3)):
        o2 = off.copy()
        for i in range(n):
            if nb[i]:
                same = [j for j in nb[i] if bottom[j] == bottom[i]]
                if same:
                    o2[i] = 0.5 * off[i] + 0.5 * off[same].mean()
        off = o2

    # épaules du t-shirt : coin de la tête de manche adouci (sinon « épaulettes »), lissage laplacien local
    sw = np.zeros(n)
    for side in ('l', 'r'):
        c = H[f'upperarm_{side}'] + np.array([0.0, 0.25, 0.0])
        d = np.linalg.norm(rest - c, axis=1)
        sw = np.maximum(sw, np.clip(1 - d / fit.get('shoulder_radius', 1.1), 0, 1) ** 1.2)
    sw *= top * fit.get('shoulder_smooth', 0.5)
    sidx = np.where(sw > 1e-3)[0]
    snb = [np.array(sorted(j for j in nb[i] if not bottom[j]), dtype=np.int64) for i in sidx]

    # tombé du t-shirt : le buste est lissé (le tissu enjambe les creux sous la poitrine et entre les pectoraux au lieu de
    # mouler chaque relief) ; bords libres fixes ; _clear_body le remet ensuite hors de la peau
    ecount = {}
    for f in clo.obj.faces:
        ids = [vi for vi, _ in f]
        for a_, b_ in zip(ids, ids[1:] + ids[:1]):
            e = (min(a_, b_), max(a_, b_))
            ecount[e] = ecount.get(e, 0) + 1
    edge_v = np.zeros(n, dtype=bool)
    for (a_, b_), c in ecount.items():
        if c == 1:
            edge_v[a_] = edge_v[b_] = True
    didx = np.where(body_t & ~edge_v)[0]
    dnb = [np.array(sorted(j for j in nb[i] if not bottom[j]), dtype=np.int64) for i in didx]
    dk = fit.get('drape', 0.5)

    def apply(P):
        N = vertex_normals(P, tris)
        Pf = P
        P = P + N * off[:, None]
        for _ in range(fit.get('drape_iters', 10) if dk > 0 else 0):
            avg = np.array([P[q].mean(0) if len(q) else P[i] for i, q in zip(didx, dnb)])
            P[didx] = P[didx] + dk * (avg - P[didx])
        for _ in range(fit.get('shoulder_iters', 8)):
            avg = np.array([P[q].mean(0) if len(q) else P[i] for i, q in zip(sidx, snb)])
            P[sidx] = P[sidx] + sw[sidx, None] * (avg - P[sidx])
            # jamais sous le vêtement d'origine (lui-même posé sur la peau) : le lissage n'enfonce pas l'épaule
            h = ((P[sidx] - Pf[sidx]) * N[sidx]).sum(1)
            P[sidx] += N[sidx] * np.maximum(0.015 - h, 0)[:, None]
        return P
    return apply(P0), [(mn, apply(P)) for mn, P in Pm]


def tri_from_quads(faces):
    tris = []
    for f in faces:
        for k in range(1, len(f) - 1):
            tris.append((f[0], f[k], f[k + 1]))
    return tris


def split_uv(face_corners, uvs):
    """face_corners : liste de triangles [(vi, ti)×3]. Retourne (map_vi, map_ti, tris) avec sommets uniques (vi, ti)."""
    key = {}
    mv, mt, tris = [], [], []
    for tri in face_corners:
        t = []
        for vi, ti in tri:
            k = (vi, ti)
            if k not in key:
                key[k] = len(mv)
                mv.append(vi)
                mt.append(ti)
            t.append(key[k])
        tris.append(t)
    return np.array(mv), np.array(mt), np.array(tris, dtype=np.int64)


def find_base_obj(src):
    for cand in ('mh/3dobjs/base.obj', 'mpfb2/mpfb2-master/src/mpfb/data/3dobjs/base.obj'):
        if os.path.exists(os.path.join(src, cand)):
            return os.path.join(src, cand)
    raise FileNotFoundError('base.obj introuvable dans ' + src)



def _over(P0, Pm, J0, Jm, jdir, gap=0.06):
    """Tissu du dessus toujours au moins `gap` dm à l'extérieur du tissu du dessous (sinon la ceinture transparaît)."""
    if jdir is None:
        return P0, Pm
    top = J0[:, 1].max() + 0.3
    near = np.where(P0[:, 1] < top)[0]
    if not len(near):
        return P0, Pm
    # appariement fait une fois sur l'état de base (topologie fixe)
    nn = np.empty(len(near), dtype=np.int64)
    for c in np.array_split(np.arange(len(near)), max(1, len(near) // 200)):
        d = ((P0[near[c], None, :] - J0[None]) ** 2).sum(-1)
        nn[c] = d.argmin(1)

    def push(P, J):
        P = P.copy()
        h = ((P[near] - J[nn]) * jdir[nn]).sum(1)
        P[near] += np.maximum(gap - h, 0)[:, None] * jdir[nn]
        return P
    P0n = push(P0, J0)
    Pmn = [(mn, push(P, J)) for (mn, P), (_, J) in zip(Pm, Jm)]
    return P0n, Pmn

def _clear_body(clo, P0, Pm, B0, Bm, btris, skip=None, upper=None, gap=0.025, reach=0.6, iters=4, cap=None, cap_gap=0.1, sleeve=None):
    """Le tissu ne passe jamais sous la peau : chaque sommet du vêtement est repoussé à au moins `gap` dm à l'extérieur du
    sommet de corps le plus proche (le long de sa normale). Sans ça, le trapèze et la poitrine en Surpoids percent le
    t-shirt. Le décalage est diffusé sur les voisins (pas de bosse en arête). B0/Bm : corps COMPLET posé (base / morphs)."""
    near = np.empty(len(P0), dtype=np.int64)
    dist = np.empty(len(P0))
    for c in np.array_split(np.arange(len(P0)), max(1, len(P0) // 200)):
        d = ((P0[c, None, :] - B0[None]) ** 2).sum(-1)
        near[c] = d.argmin(1)
        dist[c] = np.sqrt(d.min(1))
    ok = dist < reach
    if skip is not None:
        # avant-bras et mains : le bras passe DEVANT le t-shirt, il ne doit pas le repousser (sinon ourlet déchiqueté)
        ok &= ~skip[near]
    if upper is not None and sleeve is not None:
        # flanc du t-shirt sous l'aisselle : seul le torse le pousse, pas le haut du bras (sinon pan qui pointe vers le bras)
        ok &= ~(upper[near] & ~sleeve)
    nb = [set() for _ in range(len(P0))]
    for f in clo.obj.faces:
        ids = [vi for vi, _ in f]
        for a_, b_ in zip(ids, ids[1:] + ids[:1]):
            nb[a_].add(b_)
            nb[b_].add(a_)
    nbl = [np.array(sorted(s), dtype=np.int64) for s in nb]

    def push(P, B):
        N = vertex_normals(B, btris)[near]
        h = ((P - B[near]) * N).sum(1)
        amt = np.where(ok, np.maximum(gap - h, 0), 0.0)
        # diffusion « max » : les voisins suivent à moitié (pas de marche d'escalier dans le tissu)
        for _ in range(iters):
            amt = np.maximum(amt, np.array([0.5 * amt[q].max() if len(q) else 0.0 for q in nbl]))
        if cap is not None:
            # épaules / haut de poitrine : le jersey repose sur le corps. Au-delà de `cap_gap` dm d'écart, il est ramené
            # vers la peau (sinon têtes de manche « gonflées » : vêtement MakeHuman taillé pour d'autres épaules)
            pull = np.where(ok & cap, np.minimum(np.asarray(cap_gap) - h, 0), 0.0)
            for _ in range(6):
                pull = 0.5 * pull + 0.5 * np.array([pull[q].mean() if len(q) else 0.0 for q in nbl])
            amt = amt + np.where(cap, pull, 0.0)
        return P + N * amt[:, None]
    return push(P0, B0), [(mn, push(P, B)) for (mn, P), B in zip(Pm, Bm)]


def _unflip(clo, P0, Pm, tris, iters=30):
    """Morphs du vêtement sans triangle retourné : là où un morph (ex. body_weight à l'aisselle) replie le tissu sur
    lui-même, les sommets concernés (et leurs voisins) sont relâchés vers la moyenne de leurs voisins jusqu'à ce que
    plus aucun triangle ne s'inverse par rapport à la forme de base. Les autres sommets ne bougent pas."""
    nb = [set() for _ in range(len(P0))]
    for f in clo.obj.faces:
        ids = [vi for vi, _ in f]
        for a_, b_ in zip(ids, ids[1:] + ids[:1]):
            nb[a_].add(b_)
            nb[b_].add(a_)
    nbl = [np.array(sorted(s), dtype=np.int64) for s in nb]

    def tn(P):
        return np.cross(P[tris[:, 1]] - P[tris[:, 0]], P[tris[:, 2]] - P[tris[:, 0]])
    n0 = tn(P0)
    good = np.linalg.norm(n0, axis=1) > 1e-12
    out = []
    for mn, P in Pm:
        P = P.copy()
        for _ in range(iters):
            bad = good & ((n0 * tn(P)).sum(1) < 0)
            if not bad.any():
                break
            vs = np.unique(tris[bad])
            vs = np.unique(np.concatenate([vs] + [nbl[v] for v in vs]))
            avg = np.array([P[nbl[v]].mean(0) if len(nbl[v]) else P[v] for v in vs])
            P[vs] = P[vs] + 0.6 * (avg - P[vs])
        out.append((mn, P))
    # combinaisons réelles (Surpoids / Actuel / Objectif et le parcours Surpoids → Objectif) : un mélange de morphs
    # sains peut encore replier le tissu ; la correction est versée au morph le plus pesant de l'état concerné
    try:
        st = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'states-hero.json')))['states']
    except (OSError, ValueError, KeyError):
        return P0, out
    names = [mn for mn, _ in out]
    s0, s1 = st.get('surpoids', {}), st.get('athletique', {})
    combos = list(st.values()) + [{k: (1 - t) * s0.get(k, 0) + t * s1.get(k, 0) for k in set(s0) | set(s1)} for t in (0.25, 0.5, 0.75)]
    D = [P - P0 for _, P in out]
    for _pass in range(2):
        for w in combos:
            wv = np.array([float(w.get(n, 0.0)) for n in names])
            if not wv.any():
                continue
            k = int(np.argmax(wv))
            for _ in range(iters):
                Q = P0 + sum(d * x for d, x in zip(D, wv) if x)
                bad = good & ((n0 * tn(Q)).sum(1) < 0)
                if not bad.any():
                    break
                vs = np.unique(tris[bad])
                vs = np.unique(np.concatenate([vs] + [nbl[v] for v in vs]))
                avg = np.array([Q[nbl[v]].mean(0) if len(nbl[v]) else Q[v] for v in vs])
                D[k][vs] += 0.6 * (avg - Q[vs]) / wv[k]
    return P0, [(mn, P0 + d) for mn, d in zip(names, D)]


def _smooth_hem(clo, P0, Pm, split_v=0.43, iters=16, k=0.6):
    """Ourlet du t-shirt : le bord libre du haut (boucle du bas) est lissé le long de lui-même (fini les dents de scie)."""
    n = len(clo.obj.v)
    vimg, vc = np.zeros(n), np.zeros(n)
    for f in clo.obj.faces:
        for vi, ti in f:
            if ti >= 0:
                vimg[vi] += 1 - clo.obj.vt[ti][1]
                vc[vi] += 1
    bottom_v = vimg / np.maximum(vc, 1) >= split_v
    cnt = {}
    for f in clo.obj.faces:
        ids = [vi for vi, _ in f]
        for a_, b_ in zip(ids, ids[1:] + ids[:1]):
            e = (min(a_, b_), max(a_, b_))
            cnt[e] = cnt.get(e, 0) + 1
    rest = np.asarray(clo.obj.v, dtype=np.float64)
    top = ~bottom_v
    ymid = np.median(rest[top, 1]) if top.any() else 0.0
    nb = {}
    for (a_, b_), c in cnt.items():
        if c == 1 and top[a_] and top[b_] and rest[a_, 1] < ymid and rest[b_, 1] < ymid:
            nb.setdefault(a_, []).append(b_)
            nb.setdefault(b_, []).append(a_)
    idx = np.array([i for i, q in nb.items() if len(q) == 2], dtype=np.int64)
    if not len(idx):
        return P0, Pm
    q = np.array([nb[i] for i in idx], dtype=np.int64)

    def sm(P):
        P = P.copy()
        for _ in range(iters):
            P[idx] = P[idx] + k * (0.5 * (P[q[:, 0]] + P[q[:, 1]]) - P[idx])
        return P
    return sm(P0), [(mn, sm(P)) for mn, P in Pm]


def _fit_sphere(P):
    """Sphère aux moindres carrés (centre, rayon)."""
    A = np.c_[2 * P, np.ones(len(P))]
    b = (P ** 2).sum(1)
    x, *_ = np.linalg.lstsq(A, b, rcond=None)
    c = x[:3]
    return c, float(np.sqrt(max(x[3] + c @ c, 1e-12)))


def _eye_meta(clo, rest, posed):
    """Globes oculaires (proxy MakeHuman « high-poly ») : pour chaque œil, centre du globe (sphère ajustée sur la coque
    intérieure), rayon et direction du regard posée (+z au repos, tournée comme la tête). Sert au regard caméra des rendus."""
    faces = clo.obj.faces
    n = len(rest)
    par = np.arange(n)

    def find(i):
        while par[i] != i:
            par[i] = par[par[i]]
            i = par[i]
        return i
    for f in faces:
        ids = [vi for vi, _ in f]
        for j in ids[1:]:
            a_, b_ = find(ids[0]), find(j)
            if a_ != b_:
                par[b_] = a_
    roots = np.array([find(i) for i in range(n)])
    out = {}
    for side, sgn in (('l', 1.0), ('r', -1.0)):
        comps = [r for r in np.unique(roots) if np.sign(rest[roots == r, 0].mean()) == sgn]
        if not comps:
            continue
        # coque intérieure (globe) = la moins profonde en z ; la cornée bombe davantage vers l'avant
        comps.sort(key=lambda r: np.ptp(rest[roots == r, 2]))
        idx = np.where(roots == comps[0])[0]
        allv = np.where(np.isin(roots, comps))[0]
        c_rest, rad = _fit_sphere(rest[idx])
        # rotation rigide repos → posé (Kabsch) sur tous les sommets de l'œil
        A0 = rest[allv] - rest[allv].mean(0)
        A1 = posed[allv] - posed[allv].mean(0)
        U, _, Vt = np.linalg.svd(A0.T @ A1)
        D = np.diag([1, 1, np.sign(np.linalg.det(Vt.T @ U.T))])
        R = Vt.T @ D @ U.T
        c_posed = R @ (c_rest - rest[allv].mean(0)) + posed[allv].mean(0)
        out[side] = {'center': c_posed, 'radius': rad, 'gaze': R @ np.array([0.0, 0.0, 1.0])}
    return out


def _write_portrait_meta(path, obj, shape, skel, posed0, to_m, cfg, eyes=None):
    """Repères de cadrage pour les portraits (coordonnées du GLB, mètres) : yeux, sommet du crâne, menton, épaules…"""
    def jpos(b):
        k = skel.bones.index(b)
        return (skel.G[k] @ np.append(skel.heads[b], 1.0))[:3]
    body = np.array(group_verts(obj, 'body'))
    le, re = posed0[group_verts(obj, 'joint-l-eye')].mean(0), posed0[group_verts(obj, 'joint-r-eye')].mean(0)
    jaw = posed0[group_verts(obj, 'joint-jaw')].mean(0)
    pts = {'eye_l': le, 'eye_r': re, 'eyes': (le + re) / 2, 'jaw': jaw, 'head_top': posed0[body[np.argmax(posed0[body, 1])]],
           'chin': jaw,
           'neck': jpos('neck_01'), 'head': jpos('head'), 'shoulder_l': jpos('upperarm_l'), 'shoulder_r': jpos('upperarm_r'),
           'pelvis': jpos('pelvis'), 'knee_l': jpos('calf_l'), 'knee_r': jpos('calf_r'), 'foot_l': jpos('foot_l'), 'foot_r': jpos('foot_r'),
           'spine_03': jpos('spine_03')}
    # bas du menton : point le plus bas du visage devant la mâchoire
    face = body[(posed0[body, 1] > jaw[1] - 1.0) & (posed0[body, 2] > jaw[2] + 0.5) & (np.abs(posed0[body, 0] - jaw[0]) < 0.35)]
    if len(face):
        pts['chin'] = posed0[face[np.argmin(posed0[face, 1])]]
    data = {k: [round(float(x), 5) for x in to_m(v[None, :])[0]] for k, v in pts.items()}
    for side, e in (eyes or {}).items():
        data[f'eye_center_{side}'] = [round(float(x), 5) for x in to_m(e['center'][None, :])[0]]
        data[f'eye_gaze_{side}'] = [round(float(x), 5) for x in e['gaze']]
        data[f'eye_radius_{side}'] = round(float(e['radius']) * DM_TO_M, 5)
    data['id'] = cfg['id']
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=1)


def build(src, out, preview=False, cfg=None):
    # cfg : configuration de l'avatar (par défaut le héros CONFIG ; une personne = une copie modifiée, voir persons.py)
    cfg = CONFIG if cfg is None else cfg
    gender = cfg['base'].get('gender', 'male')   # 'male' (héros) | 'female' : macros MakeHuman correspondantes
    base_obj = None
    for cand in ('mh/3dobjs/base.obj', 'mpfb2/mpfb2-master/src/mpfb/data/3dobjs/base.obj'):
        if os.path.exists(os.path.join(src, cand)):
            base_obj = os.path.join(src, cand)
            break
    obj = Obj(base_obj)
    nv = len(obj.v)
    T = lambda rel: load_target(os.path.join(src, 'mh/targets', rel), nv)  # noqa: E731

    # 2. Base mesh : macros
    shape = obj.v.copy()
    for race, w in cfg['base']['race'].items():
        shape += w * T(f'macrodetails/{race}-{gender}-young.target.gz')
    shape += cfg['base']['proportions'] * T(f'macrodetails/proportions/{gender}-young-averagemuscle-averageweight-idealproportions.target.gz')
    # identité : soit le héros (cibles de visage de la config), soit une PERSONNE (identity.json issu de sa photo :
    # la base neutre est déformée pour lui ressembler ; les cibles de corps de la config restent)
    ident = cfg.get('identity')
    import hair_shell as _hs
    _hs.HAIRLINE_FRONT = (ident or {}).get('colors', {}).get('hairline_y') if ident else None
    _hs.VOLUME = {k: ident['colors'][k] for k in ('hair_top', 'hair_side') if k in ident['colors']} if ident else None
    if ident:
        from photo_id import FACE_DIRS
        for rel, k in cfg['base'].get('shape', []):
            if not rel.startswith(FACE_DIRS):
                shape += k * T(rel)
        for rel, k in ident['targets']:
            shape += k * T(rel)
        if ident.get('offsets'):
            # identité v2 (pipeline/identity_fitting.py) : résidu des repères de LA personne, interpolé sur la tête neutre
            shape += np.load(os.path.join(ident['_dir'], ident['offsets']))['neutral'].astype(np.float64)
    else:
        for rel, k in cfg['base'].get('shape', []):
            shape += k * T(rel)

    if cfg['base'].get('sculpt') and not ident:
        from face_art import sculpt
        shape = shape + sculpt(obj, shape, group_verts, **cfg['base']['sculpt'])
    if cfg['base'].get('anatomy'):
        # anatomie hors cibles MakeHuman (pente du trapèze, sterno-cléido-mastoïdiens) : anatomy.py
        import anatomy
        shape = shape + anatomy.apply(obj, shape, group_verts, cfg['base']['anatomy'])

    # 3. Morphs (deltas pleins, unités MakeHuman, non posés)
    morphs = []
    for name, parts in cfg['morphs'].items():
        d = np.zeros_like(shape)
        for rel, k in parts:
            d += k * T(rel)
        morphs.append((name, d))

    # identité verrouillée : les morphs de poids / muscle ne touchent ni le nez, ni les yeux, ni le front, ni les
    # oreilles, ni les lèvres (seulement joues, bajoues, mâchoire, sous-menton, cou)
    if cfg.get('lock_identity', True):
        from face_art import weight_lock
        lock = weight_lock(obj, shape, group_verts)[:, None]
        morphs = [(n_, d_ * lock) for n_, d_ in morphs]

    # expressions en shape keys (identité NEUTRE + expressions séparées) : unités d'expression MakeHuman CC0, jamais
    # verrouillées ni mélangées à la géométrie de base ; « expr_photo » rejoue l'expression de la photo d'origine
    exprs = cfg.get('expressions') or ((ident or {}).get('expressions') if ident else None)
    if exprs:
        erace = max(cfg['base']['race'].items(), key=lambda kv: kv[1])[0]
        for en, units in exprs.items():
            d = np.zeros_like(shape)
            for u, k in units.items():
                d += k * T(f'expression/units/{erace}/{u}.target.gz')
            morphs.append((en, d))
        if ident and ident.get('offsets'):
            pe = np.load(os.path.join(ident['_dir'], ident['offsets']))
            if 'photo_expr' in pe:
                morphs.append(('expr_photo', pe['photo_expr'].astype(np.float64)))

    # 1. Skeleton (pivots calculés sur la forme de base, pour que la pose reste linéaire → morphs exacts)
    skel = Skeleton(src, cfg['skeleton'], obj, shape)

    # coiffure en mèches (rendus hors ligne, et source des cartes de mèches temps réel) : calculée sur le corps posé
    groom_res = None
    if cfg.get('groom'):
        import groom as _groom
        groom_res = _groom.make(cfg['groom'], obj, shape, skel, group_verts)

    # Proxies
    face = cfg['face']
    layers = []  # (nom, mhclo, matière, options)
    layers.append(('eyes', Mhclo(os.path.join(src, face['eyes'][0])), os.path.join(src, face['eyes'][1]),
                   {'kind': 'eyes', 'recolor': 'fitaia_eye' if face.get('eye_recolor', True) else None,
                    'iris': (ident or {}).get('colors', {}).get('iris') or face.get('iris'), 'iris_scale': face.get('iris_scale', 1.0)}))
    if not ident:   # avec une photo, les sourcils sont ceux de la personne (dans la texture)
        layers.append(('eyebrows', Mhclo(os.path.join(src, face['eyebrows'])), None,
                       {'kind': 'eyebrows', 'recolor': {'color': face.get('eyebrow_color', [0.09, 0.065, 0.05]), 'lo': 0.5, 'hi': 1.4}}))
    layers.append(('eyelashes', Mhclo(os.path.join(src, face['eyelashes'])), None, {'kind': 'eyelashes'}))
    thick = (ident['colors'].get('hair_thickness', 0.6) if ident else 1.0)
    has_strands = groom_res is not None and any(g['name'] == 'hair' and len(g['strands']) for g in groom_res['groups'])
    if cfg['hair'].get('cards') and has_strands:
        # coiffure temps réel = la MÊME coupe que les mèches, réduite à quelques centaines de rubans (hair_cards.py) ;
        # identité (photo) : même chose, à la couleur des cheveux de la photo (version GLB de la coiffure en mèches)
        from hair_cards import HairCards, card_texture
        hb = groom_res['body']
        hcen = hb.posed[hb.Q[:, 1] > 7.6].mean(0)
        hcards = HairCards(groom_res, shape, skel, hcen, **cfg['hair']['cards'])
        ccol = tuple(cfg['hair'].get('card_color', (0.06, 0.045, 0.035))) if not ident else \
            tuple(float(x) for x in np.clip(np.array(ident['colors'].get('hair', (0.2, 0.15, 0.1))) * 0.8, 0.02, 0.8))
        layers.append(('hair', hcards, None, {'kind': 'hair', 'texture_image': card_texture(ccol)}))
    elif cfg['hair'].get('shell') and not (ident and (ident['colors'].get('bald') or thick < 0.25)):
        # coupe générée (coquilles) : dessus texturé + fade sur les côtés
        from hair_shell import HairShell, shell_texture
        bt = np.array(tri_from_quads([f for f, g in zip(obj.faces, obj.groups) if g == 'body']))
        btv = np.array([[c[0] for c in t] for t in bt]) if bt.ndim == 3 else np.array([[c[0] for c in t] for t in bt])
        hs = HairShell(obj, shape, group_verts, vertex_normals(shape, btv), thickness=max(thick, 0.25))
        hc = tuple(np.clip(np.array(ident['colors']['hair']) * 0.85, 0.02, 0.8)) if ident else tuple(cfg['hair']['shell'].get('color', (0.085, 0.062, 0.045)))
        layers.append(('hair', hs, None, {'kind': 'hair', 'texture_image': shell_texture(hc)}))
    elif cfg['hair'].get('mhclo') and (not ident or cfg['hair'].get('keep_with_identity')):
        # cartes MakeHuman de la coupe (héros sans mèches, ou PERSONNE dont la coupe vient de sa fiche du créateur :
        # base femme du selfie) ; avec une photo, la coupe prend la couleur des cheveux lue sur la photo
        hopt = {k: v for k, v in cfg['hair'].items() if k not in ('mhclo', 'keep_with_identity')}
        if ident and ident['colors'].get('hair') and hopt.get('recolor'):
            hopt['recolor'] = dict(hopt['recolor'], color=[float(x) * 2.2 for x in ident['colors']['hair']])
        layers.append(('hair', Mhclo(os.path.join(src, cfg['hair']['mhclo'])), None, {'kind': 'hair', **hopt}))
    gen = cfg.get('generated_clothes')
    gen_ok = bool(gen) and os.path.exists(os.path.join(src, gen['dir'], 'garments_out.json'))
    for c in cfg['clothes']:
        if gen_ok and c.get('replaced_by_generated'):
            continue
        layers.append((os.path.splitext(os.path.basename(c['mhclo']))[0], Mhclo(os.path.join(src, c['mhclo'])), None, {'kind': 'clothes', **c}))
    if gen_ok:
        from garments import GenProxy
        gin = json.load(open(os.path.join(src, gen['dir'], 'garments_in.json')))
        gout = json.load(open(os.path.join(src, gen['dir'], 'garments_out.json')))
        body_ids = group_verts(obj, 'body')
        for gname, it in gen['items'].items():
            gp = GenProxy(gname, gin, gout, shape, body_ids, obj.vt, skel)
            print('vêtement simulé', gname, 'décalage max', round(gp.max_offset_cm, 1), 'cm')
            layers.append((gname, gp, None, {'kind': 'clothes', 'generated': True, **it}))

    deleted = set()
    for _, clo, _, opt in layers:
        if opt['kind'] == 'clothes':
            deleted.update(clo.delete_verts)

    # Corps : groupe « body », sans les sommets cachés par les vêtements
    body_faces = [f for f, g in zip(obj.faces, obj.groups) if g == 'body' and not any(vi in deleted for vi, _ in f)]
    corners = tri_from_quads(body_faces)

    # Mise au sol et conversion en mètres : on calcule sur la forme posée
    posed0 = skel.apply(shape)
    floor = None

    w = GlbWriter()
    stats = {'meshes': {}, 'textures': {}}

    def to_m(p):
        return (p - np.array([0.0, floor, 0.0])) * DM_TO_M

    # --- Corps (5. Skin)
    mv, mt, tris = split_uv(corners, obj.vt)
    used = np.unique(mv)
    remap = {int(v): i for i, v in enumerate(used)}
    # normales calculées sur la topologie d'origine (pas de couture visible aux coupes UV)
    tris_orig = np.array([[remap[int(mv[a])] for a in t] for t in tris])
    body_pos0 = posed0[used]

    shoes_layer = [l for l in layers if 'shoes' in l[0]]
    # le sol = dessous des chaussures (sinon du corps)
    if shoes_layer:
        sp = skel.apply(shoes_layer[0][1].fit(shape), skel.proxy_weights(shoes_layer[0][1]))
        floor = float(sp[:, 1].min())
    else:
        floor = float(body_pos0[:, 1].min())

    def mesh_data(P0, Pm_list, tri_local, vmap):
        n0 = vertex_normals(P0, tri_local)
        res = []
        for name, Pm in Pm_list:
            nm = vertex_normals(Pm, tri_local)
            res.append((name, (Pm - P0)[vmap] * DM_TO_M, (nm - n0)[vmap]))
        return n0, res

    body_morphs_posed = [(name, skel.apply(shape + d)[used]) for name, d in morphs]
    n0, bm = mesh_data(body_pos0, body_morphs_posed, tris_orig, np.array([remap[int(v)] for v in mv]))
    uv = obj.vt[mt].copy()
    uv[:, 1] = 1 - uv[:, 1]
    vmap = np.array([remap[int(v)] for v in mv])

    skin = read_mhmat(os.path.join(src, cfg['skin']['mhmat']))
    skin_im = load_rgb(os.path.join(skin['_dir'], skin['diffuseTexture']), cfg['skin']['size'])
    if ident and ident.get('face_texture'):
        # peau personnalisée : photo projetée sur le visage, corps au teint de la personne
        skin_im = Image.open(os.path.join(ident['_dir'], ident['face_texture'])).convert('RGB').resize(skin_im.size)
    if cfg['skin'].get('tint') and not ident:
        sa = np.asarray(skin_im.convert('RGB')).astype(np.float64) * np.array(cfg['skin']['tint'])[None, None, :]
        skin_im = Image.fromarray(np.clip(sa, 0, 255).astype(np.uint8))
    if cfg['skin'].get('face_art') is not None:
        from face_art import paint_skin
        full_body_faces = [f for f, g in zip(obj.faces, obj.groups) if g == 'body']
        fa = dict(cfg['skin']['face_art'])
        if ident:
            # la photo apporte déjà barbe, sourcils, lèvres, teint : on ne peint que le cuir chevelu (dégradé)
            fa.update({'beard': 0.0, 'brow': 0.0, 'lips': 0.0, 'red': 0.0, 'under': 0.0, 'lash': 0.0, 'mottle': 0.0,
                       'hair_color': tuple(ident['colors']['hair'])})
            if not ident['colors'].get('bald') and thick < 0.25:
                fa.update({'hair': 0.95, 'scalp': 0.0})          # cheveux ras : peints sur le crâne, pas de volume
            if ident['colors'].get('bald'):
                fa.update({'hair': 0.25, 'scalp': 0.15, 'hair_color': tuple(np.array(ident['colors']['skin']) * 0.6)})
        if groom_res is not None:
            # cuir chevelu assombri sous les mèches (la peau ne transparaît pas entre les cheveux) ; identité : couleur
            # des cheveux de la photo
            hc = cfg['groom'].get('scalp_color', fa.get('hair_color', (0.15, 0.105, 0.07)))
            fa['extra'] = [(v, k, hc) for _, v, k in groom_res['paint'] if k > 0]
        if cfg.get('qa_shorts'):
            # planche d'anatomie (QA) : corps sans t-shirt ni jogging, short ajusté peint sur la peau (taille → mi-cuisse)
            from face_art import smooth as _sm
            pel = shape[group_verts(obj, 'joint-pelvis')].mean(0)
            kn = shape[group_verts(obj, 'joint-l-knee')].mean(0)
            top_y, bot_y = pel[1] + 0.95, pel[1] + 0.42 * (kn[1] - pel[1])
            yy = shape[:, 1]
            vals = _sm(bot_y - 0.06, bot_y + 0.06, yy) * _sm(top_y + 0.06, top_y - 0.06, yy) * (np.abs(shape[:, 0]) < 2.4)
            fa = dict(fa)
            fa['extra'] = list(fa.get('extra', [])) + [(vals, 1.0, tuple(cfg['qa_shorts']))]
        skin_im, zmaps = paint_skin(skin_im, obj, shape, full_body_faces, fa, group_verts)
        if cfg.get('portrait'):
            # rendus hors ligne : rugosité de la peau par zones (zone T, lèvres, barbe), à côté du GLB
            from face_art import roughness_map, detail_map
            roughness_map(zmaps).save(os.path.splitext(out)[0] + '.skin_rough.png')
            # zones de micro-détail (pores, lèvres, rougeurs, paupières) pour la peau haute définition des rendus
            detail_map(zmaps, 2048).save(os.path.splitext(out)[0] + '.skin_zones.png')
    if groom_res is not None and cfg.get('groom_save', True):
        import groom as _groom
        _groom.save(os.path.splitext(out)[0] + '.hair.npz', groom_res, to_m)
    elif os.path.exists(os.path.splitext(out)[0] + '.hair.npz'):
        os.remove(os.path.splitext(out)[0] + '.hair.npz')     # pas de mèches périmées d'une fabrication précédente
    data, mime = encode(skin_im, 'jpeg', 88)
    tex_skin = w.image(data, mime, skin_im.size[0], skin_im.size[1], 'skin')
    stats['textures']['skin'] = len(data)
    avg = np.asarray(skin_im.convert('RGB').resize((1, 1))).reshape(3) / 255
    mat_skin = w.material({'name': 'skin', 'pbrMetallicRoughness': {'baseColorTexture': {'index': tex_skin}, 'metallicFactor': 0.0, 'roughnessFactor': cfg['skin']['roughness']},
                           'extras': {'fallbackColor': [float(x) for x in avg], 'layer': 'skin'}})
    w.mesh('body', to_m(body_pos0[vmap]), n0[vmap], uv, tris, mat_skin, bm, {'layer': 'base-mesh'})
    stats['meshes']['body'] = {'vertices': int(len(mv)), 'triangles': int(len(tris))}

    if cfg.get('collider'):
        # rendus hors ligne avec simulation de tissu : corps COMPLET (sans les trous cachés par les vêtements), mêmes morphs,
        # jamais rendu — sert d'obstacle au tissu dans Blender
        cfull = tri_from_quads([f for f, g in zip(obj.faces, obj.groups) if g == 'body'])
        ctri = np.array([[c[0] for c in t] for t in cfull], dtype=np.int64)
        cused = np.unique(ctri)
        cre = -np.ones(len(shape), dtype=np.int64)
        cre[cused] = np.arange(len(cused))
        ctl = cre[ctri]
        C0 = posed0[cused]
        Cm = [(name, skel.apply(shape + d)[cused]) for name, d in morphs]
        cn0, cpm = mesh_data(C0, Cm, ctl, np.arange(len(cused)))
        cmat = w.material({'name': 'collider', 'pbrMetallicRoughness': {'baseColorFactor': [0.5, 0.5, 0.5, 1.0]}, 'extras': {'layer': 'collider'}})
        w.mesh('collider', to_m(C0), cn0, None, ctl, cmat, cpm, {'layer': 'collider'})

    # --- Proxies (4. Face, 6. Hair, 7. Clothes)
    # le bas d'abord : le haut porté par-dessus est ensuite repoussé hors du bas (état de base et chaque morph)
    layers = sorted(layers, key=lambda L: 0 if L[0] == 'jogger' else 1)
    worn = {}
    eye_info = None
    full_body = None
    for name, clo, matpath, opt in layers:
        if getattr(clo, 'posed', False):
            # vêtement simulé dans la pose finale : il suit le corps déjà posé (et ses morphs)
            P0 = clo.fit(posed0)
            Pm = [(mn, clo.fit(skel.apply(shape + d))) for mn, d in morphs]
            if name == 'tee' and 'jogger' in worn:
                P0, Pm = _over(P0, Pm, *worn['jogger'])
            worn[name] = (P0, Pm, getattr(clo, 'out_dir', None))
        else:
            Wp = skel.proxy_weights(clo)
            P0 = skel.apply(clo.fit(shape), Wp)
            Pm = [(mn, skel.apply(clo.fit(shape + d), Wp)) for mn, d in morphs]
            if opt.get('smooth_crotch'):
                # jogging ajusté (vêtement MakeHuman) : le pli de l'entrejambe est lissé sur la topologie du vêtement
                # (avant la séparation des coutures UV → aucune fente), même opération pour la pose et chaque morph
                P0, Pm = _smooth_crotch(clo, clo.fit(shape), P0, Pm, opt['smooth_crotch'])
            if opt.get('kind') == 'eyes':
                eye_info = _eye_meta(clo, clo.fit(shape), P0)
        corners_p = tri_from_quads(clo.obj.faces)
        if opt.get('fit'):
            # coupe : aisance du t-shirt, manches évasées, jogging ample resserré aux chevilles (même déformation pour
            # la pose et pour chaque morph → le vêtement suit toujours le corps)
            P0, Pm = _suit_fit(clo, clo.fit(shape), P0, Pm, np.array([[c[0] for c in t] for t in corners_p], dtype=np.int64), skel, opt['fit'])
            P0, Pm = _smooth_hem(clo, P0, Pm, opt['fit'].get('split_v', 0.43))
            if full_body is None:
                fb_ids = np.array(group_verts(obj, 'body'), dtype=np.int64)
                fb_re = -np.ones(len(shape), dtype=np.int64)
                fb_re[fb_ids] = np.arange(len(fb_ids))
                fb_tris = fb_re[np.array([[c[0] for c in t] for t in tri_from_quads([f for f, g in zip(obj.faces, obj.groups) if g == 'body'])], dtype=np.int64)]
                fb_arm = np.array([any(k in b for k in ('lowerarm', 'hand', 'thumb', 'index', 'middle', 'ring', 'pinky')) for b in skel.bones])
                fb_skip = skel.W[fb_ids][:, fb_arm].sum(1) > 0.3
                fb_up = np.array(['upperarm' in b for b in skel.bones])
                fb_upper = skel.W[fb_ids][:, fb_up].sum(1) > 0.5
                full_body = (posed0[fb_ids], [skel.apply(shape + d)[fb_ids] for _, d in morphs], fb_tris, fb_skip, fb_upper)
            ychest = skel.heads['spine_03'][1] if 'spine_03' in skel.heads else P0[:, 1].max() - 2.0
            # écart max tissu ↔ peau : 1 cm sur les épaules, 3 cm ailleurs sur le t-shirt (plus de pan qui flotte sous le
            # bras quand le morph muscle affine la taille) ; jogging libre (son aisance est voulue)
            tvt = np.zeros(len(P0))
            tvc = np.zeros(len(P0))
            for f in clo.obj.faces:
                for vi, ti in f:
                    if ti >= 0:
                        tvt[vi] += 1 - clo.obj.vt[ti][1]
                        tvc[vi] += 1
            is_top = tvt / np.maximum(tvc, 1) < opt['fit'].get('split_v', 0.43)
            capg = np.where(P0[:, 1] > ychest, opt['fit'].get('cap_gap', 0.1), opt['fit'].get('torso_gap', 0.3))
            Wc = skel.proxy_weights(clo)
            arm_b = np.array([any(k in b for k in ('upperarm', 'lowerarm')) for b in skel.bones])
            is_sleeve = is_top & (Wc[:, arm_b].sum(1) > 0.45)
            P0, Pm = _clear_body(clo, P0, Pm, *full_body, cap=is_top, cap_gap=capg, sleeve=is_sleeve)
            P0, Pm = _unflip(clo, P0, Pm, np.array([[c[0] for c in t] for t in corners_p], dtype=np.int64))
        if opt.get('cut_above') is not None:
            # ex. chaussette haute des baskets MakeHuman : sous un legging elle traverse le tissu → on ne garde que la chaussure
            corners_p = [t for t in corners_p if np.mean([clo.obj.v[vi][1] for vi, _ in t]) <= opt['cut_above']]
        pmv, pmt, ptris = split_uv(corners_p, clo.obj.vt)
        tri_local = np.array([[int(pmv[a]) for a in t] for t in ptris])
        n0p, pm = mesh_data(P0, Pm, tri_local, pmv)
        puv = clo.obj.vt[pmt].copy() if len(clo.obj.vt) else np.zeros((len(pmv), 2))
        puv[:, 1] = 1 - puv[:, 1]

        if opt.get('generated'):
            puv = puv * opt.get('uv_repeat', 30)
        mat = read_mhmat(matpath or clo.material) if not (opt.get('generated') or opt.get('texture_image') is not None) else {'_dir': ''}
        kind = opt['kind']
        tex_path = os.path.join(mat['_dir'], mat['diffuseTexture']) if 'diffuseTexture' in mat else None
        m = {'name': name, 'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': 0.6}, 'extras': {'layer': kind}}
        if opt.get('texture_image') is not None or (tex_path and os.path.exists(tex_path)):
            size = opt.get('size', 512 if kind in ('eyes',) else 256 if kind in ('eyebrows', 'eyelashes') else 1024)
            im = opt['texture_image'] if opt.get('texture_image') is not None else load_rgb(tex_path, size)
            if opt.get('recolor') == 'fitaia_tee_jogger':
                ao = os.path.join(mat['_dir'], mat['aomapTexture']) if 'aomapTexture' in mat else None
                im = recolor_tee_jogger(im, Image.open(ao) if ao and os.path.exists(ao) else None, *opt.get('colors', ()))
            elif opt.get('recolor') == 'fitaia_eye':
                im = recolor_eye(im, tuple(np.clip(np.array(opt['iris']) * 0.9, 0.05, 0.6)) if opt.get('iris') else (0.36, 0.25, 0.13),
                                 opt.get('iris_scale', 1.0))
            elif opt.get('recolor') == 'fitaia_sneaker':
                im = recolor_sneaker(im)
            elif opt.get('recolor') == 'fitaia_suit':
                # tenue de sport FITAIA à partir d'un vêtement MakeHuman (t-shirt + legging / jogging), voir wardrobe.py
                import wardrobe
                ao = os.path.join(mat['_dir'], mat['aomapTexture']) if 'aomapTexture' in mat else None
                im = wardrobe.recolor_suit(im, Image.open(ao) if ao and os.path.exists(ao) else None, opt['suit'], opt['top'], opt['bottom'], opt.get('trim'),
                                           uv=(clo.obj.faces, clo.obj.vt, clo.obj.v))
            elif isinstance(opt.get('recolor'), dict):
                rc = opt['recolor']
                im = recolor_tint(im, rc['color'], rc.get('gamma', 1.0), rc.get('lo', 0.55), rc.get('hi', 1.35))
            alpha = im.mode == 'RGBA' and kind in ('hair', 'eyebrows', 'eyelashes', 'eyes')
            if alpha and opt.get('texture_image') is not None:
                # atlas de cheveux généré : palette 64 couleurs (÷4 en taille, invisible à l'écran)
                data, mime = encode(im.quantize(64, method=Image.Quantize.FASTOCTREE), 'png')
            else:
                data, mime = encode(im if alpha else im.convert('RGB'), 'png' if alpha else 'jpeg', 86)
            t = w.image(data, mime, im.size[0], im.size[1], name)
            stats['textures'][name] = len(data)
            m['pbrMetallicRoughness']['baseColorTexture'] = {'index': t}
            avgc = np.asarray(im.convert('RGB').resize((1, 1))).reshape(3) / 255
            m['extras']['fallbackColor'] = [float(x) for x in avgc]
            if kind == 'hair':
                m['alphaMode'] = 'MASK'
                m['alphaCutoff'] = 0.3
                m['doubleSided'] = True
                # cheveux mats (pas de reflet blanc sur le dessus), teinte légèrement assombrie (validé dans le labo)
                m['pbrMetallicRoughness']['roughnessFactor'] = 0.85
                m['pbrMetallicRoughness']['baseColorFactor'] = [0.85, 0.82, 0.78, 1.0]
            elif kind in ('eyebrows', 'eyelashes'):
                m['alphaMode'] = 'BLEND'
                m['doubleSided'] = True
                m['pbrMetallicRoughness']['roughnessFactor'] = 0.8
            elif kind == 'eyes':
                # globe + cornée : la cornée (alpha faible) est découpée, on voit l'iris net
                m['alphaMode'] = 'MASK'
                m['alphaCutoff'] = 0.5
                m['pbrMetallicRoughness']['roughnessFactor'] = 0.2
            else:
                m['pbrMetallicRoughness']['roughnessFactor'] = opt.get('roughness', 0.8)
                nmap = mat.get('normalmapTexture')
                if nmap and os.path.exists(os.path.join(mat['_dir'], nmap)):
                    nim = load_rgb(os.path.join(mat['_dir'], nmap), opt.get('size', 1024)).convert('RGB')
                    if opt.get('recolor') == 'fitaia_suit':
                        import wardrobe
                        dif = os.path.join(mat['_dir'], mat['diffuseTexture']) if 'diffuseTexture' in mat else None
                        nim = wardrobe.clean_normal(nim, opt['suit'], Image.open(dif) if dif and os.path.exists(dif) else None, uv=(clo.obj.faces, clo.obj.vt, clo.obj.v))
                    nd, nmime = encode(nim, 'jpeg', 90)
                    nt = w.image(nd, nmime, nim.size[0], nim.size[1], name + '_normal')
                    stats['textures'][name + '_normal'] = len(nd)
                    m['normalTexture'] = {'index': nt, 'scale': 0.8}
        if opt.get('generated'):
            from garments import fabric_textures
            nim, grain = fabric_textures(opt.get('fabric', 'jersey'))
            col = np.array(opt['color'])[None, None, :] * grain[..., None]
            cim = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8))
            cd, cmime = encode(cim, 'jpeg', 90)
            nd, nmime = encode(nim, 'jpeg', 92)
            ct = w.image(cd, cmime, cim.size[0], cim.size[1], name)
            ntx = w.image(nd, nmime, nim.size[0], nim.size[1], name + '_normal')
            stats['textures'][name] = len(cd) + len(nd)
            m['pbrMetallicRoughness']['baseColorTexture'] = {'index': ct}
            m['pbrMetallicRoughness']['roughnessFactor'] = opt.get('roughness', 0.9)
            m['normalTexture'] = {'index': ntx, 'scale': 0.55}
            m['doubleSided'] = True
            m['extras']['fallbackColor'] = [float(x) for x in opt['color']]
        mi = w.material(m)
        stripe = getattr(clo, 'stripe', None)
        if opt.get('generated') and stripe is not None and len(stripe):
            # passepoil citron : ruban continu posé sur la couture extérieure, qui suit le jogging (et ses morphs)
            from garments import side_ribbon
            R0, rtris, anc = side_ribbon(P0)
            roff = R0 - P0[anc]
            Rm = [(mn, Pq[anc] + roff) for mn, Pq in Pm]
            nr0, prm = mesh_data(R0, Rm, rtris, np.arange(len(R0)))
            lime = w.material({'name': name + '_passepoil', 'pbrMetallicRoughness': {'baseColorFactor': [0.62, 0.86, 0.12, 1.0], 'metallicFactor': 0.0, 'roughnessFactor': 0.6},
                               'doubleSided': True, 'extras': {'layer': kind, 'fallbackColor': [0.78, 0.94, 0.24]}})
            w.mesh(name + '_passepoil', to_m(R0), nr0, np.zeros((len(R0), 2)), rtris, lime, prm, {'layer': kind})
        if opt.get('generated') and getattr(clo, 'collar', None):
            from garments import collar_band
            C0, ctris = collar_band(P0, clo)
            if C0 is not None:
                Cm = [(mn, collar_band(Pq, clo)[0]) for mn, Pq in Pm]
                nc0, pcm = mesh_data(C0, Cm, ctris, np.arange(len(C0)))
                th_ = np.arctan2(C0[:, 0], C0[:, 2])
                cuv = np.c_[th_ * 8, np.repeat([0.0, 0.5, 1.0], len(C0) // 3)]
                rib = w.material({**m, 'name': name + '_col', 'pbrMetallicRoughness': {**m['pbrMetallicRoughness'], 'baseColorFactor': [0.93, 0.93, 0.93, 1.0]}})
                w.mesh(name + '_col', to_m(C0), nc0, cuv, ctris, rib, pcm, {'layer': kind})
        w.mesh(name, to_m(P0[pmv]), n0p[pmv], puv, ptris, mi, pm, {'layer': kind})
        stats['meshes'][name] = {'vertices': int(len(pmv)), 'triangles': int(len(ptris))}

    # accessoires (lunettes, boucles d'oreilles, montre) : maillages générés sur l'avatar posé
    if cfg.get('accessories'):
        import accessories as _acc
        for acc in cfg['accessories']:
            for an, (V, F, N, mat) in _acc.make(acc, obj, shape, skel, posed0, group_verts).items():
                mi = w.material({'name': an, 'pbrMetallicRoughness': {'baseColorFactor': list(mat['color']) + [1.0], 'metallicFactor': mat.get('metal', 0.0),
                                                                       'roughnessFactor': mat.get('rough', 0.3)}, 'extras': {'layer': 'accessory', 'fallbackColor': list(mat['color'])}})
                w.mesh(an, to_m(V), N, None, F, mi, [], {'layer': 'accessory'})
                stats['meshes'][an] = {'vertices': int(len(V)), 'triangles': int(len(F))}
    if cfg.get('portrait'):
        _write_portrait_meta(os.path.splitext(out)[0] + '.portrait.json', obj, shape, skel, posed0, to_m, cfg, eye_info)

    meta = {
        'id': cfg['id'], 'label': cfg['label'], 'license': 'CC0 1.0 (MakeHuman / MPFB2 assets)',
        'layers': ['skeleton', 'base-mesh', 'body-morphs', 'face', 'skin', 'hair', 'clothes', 'animations'],
        'morphs': [n for n, _ in morphs],
        'height_m': float((posed0[used][:, 1].max() - floor) * DM_TO_M),
    }
    size = w.write(out, meta)
    stats.update({'bytes': size, 'height_m': round(meta['height_m'], 3), 'morphs': meta['morphs'],
                  'vertices': sum(v['vertices'] for v in stats['meshes'].values()),
                  'triangles': sum(v['triangles'] for v in stats['meshes'].values())})
    with open(os.path.splitext(out)[0] + '.stats.json', 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print(json.dumps({k: stats[k] for k in ('bytes', 'vertices', 'triangles', 'height_m')}, ensure_ascii=False))
    print(json.dumps(stats['textures']))
    return out


if __name__ == '__main__':
    src = sys.argv[sys.argv.index('--src') + 1] if '--src' in sys.argv else os.path.join(ROOT, '..', 'mhsrc')
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(ROOT, 'src', 'human-engine', 'assets', 'premium-male-01.glb')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cfg = CONFIG
    if '--sex' in sys.argv:
        # base d'une PERSONNE (selfie) : femme ou homme, fiche du créateur (--sheet JSON) ; voir persons.selfie_config
        import persons
        cfg = persons.selfie_config(src, sys.argv[sys.argv.index('--sex') + 1],
                                    sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None)
    if '--identity' in sys.argv:
        ip = sys.argv[sys.argv.index('--identity') + 1]
        idj = json.load(open(ip))
        idj['_dir'] = os.path.dirname(os.path.abspath(ip))
        cfg['identity'] = idj
        cfg['groom'] = None           # la coupe du héros ne s'applique pas à une personne (sa coiffure vient de sa photo)
        cfg['groom_save'] = True
        if '--strands' in sys.argv and not cfg['hair'].get('keep_with_identity') and not idj.get('colors', {}).get('bald') \
                and idj.get('colors', {}).get('hair_thickness', 0.6) >= 0.25:
            # rendus hors ligne : coiffure en mèches (longueurs mesurées sur la photo) à la place de la coupe en coquilles
            # dense (90 000), un peu de volume sur le dessus, cuir chevelu teinté de la couleur des cheveux (pas de crâne clair
            # visible entre les mèches)
            cfg['groom'] = {'seed': 5, 'hair': {'style': 'crop', 'identity': True, 'forward': -0.35, 'sweep': 0.35, 'mess': 0.25,
                                                'count': 90000, 'lift': 1.0, 'scalp_paint': 0.6}}
    build(src, out, '--preview' in sys.argv, cfg=cfg)
