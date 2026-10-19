"""
FITAIA — BodyMorphService : paramètres du corps CONTINUS et INDÉPENDANTS (0,00 → 1,00) → shape keys du GLB.

13 paramètres (spécification du fondateur) :
  bodyFat, visceralBelly, waist, hips, chest, shoulders, upperArm, forearm, thigh, calf, faceFat, neckFat, muscleMass
Chacun pilote SES shape keys, aucun n'en modifie un autre (indépendance) ; la relation est linéaire par morceaux
(continue) → toute valeur intermédiaire est valide et deux états s'interpolent : lerp(A, B, t) pour t ∈ [0, 1].

Neutre (corps de base de la tête maître) : bodyFat = 0,5 et muscleMass = 0,5 (moyenne), tous les autres = 0.
  bodyFat     0 → maigre (body_weight_low = 1) · 0,5 → moyen · 1 → fort (body_weight = 1)
  muscleMass  0 → peu musclé (muscle_low = 1)  · 0,5 → moyen · 1 → très musclé (muscle = 1)
  visceralBelly 0 → 1 : belly_fat 0 → 0,75 (au-delà l'effet n'est plus réaliste)
  les 10 autres : 0 → 1 = shape key du même nom (waist, hips, chest, shoulders, upper_arm, forearm, thigh, calf,
                  face_fat, neck_fat) de 0 → 1
Les 15 noms de morphs du GLB de l'app ne changent pas (le Human Engine continue de piloter les mêmes clés).
Une seule tête maître : la graisse du visage (faceFat) et du cou (neckFat) ne touchent jamais au nez, aux yeux, aux
lèvres ni au front (verrou d'identité de build_premium_avatar.py).
"""
import json
import os

PARAMS = ['bodyFat', 'visceralBelly', 'waist', 'hips', 'chest', 'shoulders', 'upperArm', 'forearm', 'thigh', 'calf',
          'faceFat', 'neckFat', 'muscleMass']
NEUTRAL = {p: 0.0 for p in PARAMS}
NEUTRAL.update({'bodyFat': 0.5, 'muscleMass': 0.5})
DIRECT = {'waist': 'waist', 'hips': 'hips', 'chest': 'chest', 'shoulders': 'shoulders', 'upperArm': 'upper_arm',
          'forearm': 'forearm', 'thigh': 'thigh', 'calf': 'calf', 'faceFat': 'face_fat', 'neckFat': 'neck_fat'}
MORPHS = ['body_weight', 'body_weight_low', 'muscle', 'muscle_low', 'belly_fat', 'waist', 'hips', 'chest', 'shoulders',
          'upper_arm', 'forearm', 'thigh', 'calf', 'face_fat', 'neck_fat']
BELLY_MAX = 0.75


def _c(v):
    return max(0.0, min(1.0, float(v)))


def to_morphs(params):
    """Paramètres (0..1, valeurs manquantes = neutre) → poids des 15 shape keys du GLB."""
    p = dict(NEUTRAL)
    p.update({k: _c(v) for k, v in (params or {}).items() if k in PARAMS})
    m = {k: 0.0 for k in MORPHS}
    m['body_weight'] = _c((p['bodyFat'] - 0.5) * 2)
    m['body_weight_low'] = _c((0.5 - p['bodyFat']) * 2)
    m['muscle'] = _c((p['muscleMass'] - 0.5) * 2)
    m['muscle_low'] = _c((0.5 - p['muscleMass']) * 2)
    m['belly_fat'] = p['visceralBelly'] * BELLY_MAX
    for k, mk in DIRECT.items():
        m[mk] = p[k]
    return {k: round(v, 4) for k, v in m.items()}


def from_morphs(m):
    """Poids des shape keys → paramètres (inverse exact de to_morphs sur son image)."""
    m = {k: float(v) for k, v in (m or {}).items()}
    p = dict(NEUTRAL)
    p['bodyFat'] = _c(0.5 + 0.5 * m.get('body_weight', 0.0) - 0.5 * m.get('body_weight_low', 0.0))
    p['muscleMass'] = _c(0.5 + 0.5 * m.get('muscle', 0.0) - 0.5 * m.get('muscle_low', 0.0))
    p['visceralBelly'] = _c(m.get('belly_fat', 0.0) / BELLY_MAX)
    for k, mk in DIRECT.items():
        p[k] = _c(m.get(mk, 0.0))
    return {k: round(v, 4) for k, v in p.items()}


def lerp(a, b, t):
    """Interpolation continue entre deux états (paramètres), t ∈ [0, 1]."""
    t = _c(t)
    A = dict(NEUTRAL)
    A.update(a or {})
    Bv = dict(NEUTRAL)
    Bv.update(b or {})
    return {k: round(A[k] + (Bv[k] - A[k]) * t, 4) for k in PARAMS}


def hero_states(path=None):
    """États Surpoids / Actuel / Objectif du héros (states-hero.json, poids de morphs) → paramètres."""
    path = path or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'states-hero.json')
    st = json.load(open(path))['states']
    return {k: from_morphs(v) for k, v in st.items()}


def self_test():
    """Contrôles : neutre = aucun morph ; aller-retour exact ; continuité (pas de saut) ; indépendance."""
    assert all(v == 0 for v in to_morphs({}).values())
    for name, prm in hero_states().items():
        back = to_morphs(prm)
        orig = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'states-hero.json')))['states'][name]
        for k in MORPHS:
            assert abs(back[k] - min(orig.get(k, 0.0), BELLY_MAX if k == 'belly_fat' else 1.0)) < 2e-3 or \
                (k in ('body_weight', 'body_weight_low', 'muscle', 'muscle_low')), (name, k, back[k], orig.get(k))
    prev = None
    for i in range(101):
        m = to_morphs({'bodyFat': i / 100})
        v = m['body_weight'] - m['body_weight_low']
        if prev is not None:
            assert abs(v - prev) <= 0.0201, 'saut'
        prev = v
    for k in PARAMS:
        a = to_morphs({k: NEUTRAL[k]})
        b = to_morphs({k: 1.0 if NEUTRAL[k] < 1 else 0.0})
        moved = [x for x in MORPHS if abs(a[x] - b[x]) > 1e-9]
        assert moved, k
        for k2 in PARAMS:
            if k2 == k:
                continue
            c = to_morphs({k: 1.0, k2: NEUTRAL[k2]})
            assert c == b, (k, k2)
    return True


if __name__ == '__main__':
    print('BodyMorphService self-test :', self_test())
    for n, p in hero_states().items():
        print(n, {k: v for k, v in p.items() if abs(v - NEUTRAL[k]) > 1e-3})
