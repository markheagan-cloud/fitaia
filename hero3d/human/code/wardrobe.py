"""
FITAIA — tenues de sport à partir des vêtements MakeHuman CC0 (t-shirt ajusté + legging / jogging).

Les textures d'origine (t-shirt imprimé + jean délavé) sont repeintes : couleur unie FITAIA, relief des plis conservé
(occlusion ambiante + plis basse fréquence du tissu), logos, surpiqûres, poches et délavage effacés.
Le bas (jean) devient un tissu technique lisse : sa carte de normales est aplanie (seuls les grands plis restent).
"""
import numpy as np
from PIL import Image, ImageFilter

# régions des textures (coordonnées image : x = u, y = 1 − v), mesurées sur les fichiers MakeHuman
SUITS = {
    # t-shirt (2 panneaux en haut + 2 manches en bas à droite), jean = les 2 grandes pièces en bas à gauche
    'female_casualsuit01': {'bottom': lambda cx, cy, area: (cy > 0.45) & (cx < 0.6) & (area > 0.03)},
    # t-shirt dans les 43 % du haut, jean dessous
    'male_casualsuit06': {'bottom': lambda cx, cy, area: cy >= 0.43},
}


def _blur(a, r):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r))).astype(np.float64) / 255


def _masked_smooth(values, mask, radius):
    v = _blur(np.where(mask, values, 0), radius)
    m = _blur(mask.astype(np.float64), radius)
    return np.where(m > 0.004, v / np.maximum(m, 1e-4), 0)


def height_map(faces, vt, v, size):
    """Hauteur 3D (y du vêtement au repos) rastérisée dans l'espace UV : sert à classer les petits îlots UV."""
    from PIL import ImageDraw
    H, W = size
    m = Image.new('F', (W, H), np.nan)
    d = ImageDraw.Draw(m)
    for f in faces:
        pts = [(vt[ti][0] * W, (1 - vt[ti][1]) * H) for _, ti in f]
        d.polygon(pts, fill=float(np.mean([v[vi][1] for vi, _ in f])))
    return np.asarray(m)


def regions(suit, size, fabric=None, uv=None):
    """Masque « bas » (jean → legging / jogging) : pièces de tissu (composantes connexes) classées par position dans la
    texture ; les petits îlots (ourlets, chevilles, morceaux de couture) sont classés par leur HAUTEUR 3D sur le corps
    (sous l'ourlet du t-shirt → bas), sinon une cheville peut prendre la couleur du t-shirt."""
    from scipy import ndimage
    H, W = size
    if fabric is None:
        fabric = np.ones((H, W), bool)
    lab, n = ndimage.label(fabric)
    out = np.zeros((H, W), bool)
    if n == 0:
        return out
    idx = np.arange(1, n + 1)
    cy, cx = np.array(ndimage.center_of_mass(np.ones_like(lab), lab, idx)).T
    area = ndimage.sum(np.ones_like(lab), lab, idx) / (H * W)
    sel = np.asarray(SUITS[suit]['bottom'](cx / W, cy / H, area), bool)
    if uv is not None and len(uv) > 2:
        hm = height_map(uv[0], uv[1], uv[2], (H, W))
        big = area > 0.01
        top_big = np.isin(lab, idx[big & ~sel])
        bot_big = np.isin(lab, idx[big & sel])
        ok = ~np.isnan(hm)
        if (top_big & ok).any() and (bot_big & ok).any():
            hem = np.percentile(hm[top_big & ok], 3)            # bas du t-shirt
            for k in np.where(~big)[0]:
                m = (lab == idx[k]) & ok
                if m.any():
                    sel[k] = np.median(hm[m]) < hem
    return np.isin(lab, idx[sel]) & fabric


def uv_mask(faces, vt, size):
    """Pièces de tissu = îlots UV du vêtement (rastérisés) ; le fond de la texture n'est pas fiable (t-shirt blanc sur gris)."""
    from PIL import ImageDraw
    H, W = size
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    for f in faces:
        pts = [(vt[ti][0] * W, (1 - vt[ti][1]) * H) for _, ti in f]
        d.polygon(pts, fill=255)
    return np.asarray(m) > 0


def recolor_suit(im, ao, suit, top, bottom, trim=None, uv=None):
    """im : diffuse d'origine ; ao : carte d'occlusion ; top / bottom : couleurs (0..1) ; trim : couleur des bords (ou None) ;
    uv : (faces, vt) du vêtement pour délimiter les pièces de tissu."""
    a = np.asarray(im.convert('RGB')).astype(np.float64) / 255
    H, W = a.shape[:2]
    bg = ~uv_mask(uv[0], uv[1], (H, W)) if uv is not None else np.abs(a - a[4, 4]).sum(-1) < 0.05
    bot = regions(suit, (H, W), ~bg, uv)
    topm = ~bot & ~bg
    lum = a @ np.array([0.2126, 0.7152, 0.0722])
    # relief des plis peints dans la texture : luminance relative, lissée (efface logo, coutures, délavage)
    med_top = np.median(a[topm], 0) if topm.any() else np.array([0.5, 0.5, 0.5])
    # logo / impression / bandes : écart de couleur au tissu, bords anti-crénelés compris (masque élargi)
    from scipy import ndimage as _nd
    odd = topm & (np.abs(a - med_top).sum(-1) >= 0.18)
    odd = _nd.binary_dilation(odd, iterations=max(2, W // 300))
    clean_top = topm & ~odd
    rs = max(4, W // 200)
    r_small = _masked_smooth(lum, clean_top, rs)
    m_small = _blur(clean_top.astype(np.float64), rs)
    r_big = _masked_smooth(lum, clean_top, max(24, W // 25))       # bouche les trous (logo) avec le relief voisin
    r_top = np.where(m_small > 0.35, r_small, r_big)
    r_top = np.where(r_top > 0, r_top, np.median(lum[clean_top]) if clean_top.any() else 0.5)
    r_top = np.clip(r_top / max(np.median(lum[clean_top]), 1e-3), 0.93, 1.04) if clean_top.any() else np.ones_like(lum)
    r_bot = _masked_smooth(lum, bot, max(10, W // 60))
    r_bot = np.clip(r_bot / max(np.median(lum[bot]), 1e-3), 0.8, 1.12) if bot.any() else np.ones_like(lum)
    if ao is not None:
        ao_a = np.asarray(ao.convert('L').resize((W, H))).astype(np.float64) / 255
        ao_a = _blur(ao_a, 1.5)
        ao_n = ao_a / max(np.median(ao_a[~bg]), 1e-3)
        ao_f = np.clip(0.55 + 0.45 * ao_n, 0.45, 1.05)
    else:
        ao_f = np.ones_like(lum)
    out = np.empty_like(a)
    out[:] = np.array(bottom)[None, None, :] * (r_bot * ao_f)[..., None]
    # t-shirt : occlusion d'origine atténuée (elle est peinte pour un corps moyen : sur une silhouette ronde ou très
    # mince, ses ombres sous la poitrine dessinent des taches)
    ao_t = 1 - 0.25 * (1 - ao_f)
    out[topm] = (np.array(top)[None, :] * (r_top * ao_t)[topm][:, None])
    # bande de col côtelée : nettement plus sombre que le tissu (logo, rayures, coutures → tissu uni, effacés)
    med_l = np.median(lum[clean_top]) if clean_top.any() else 0.5
    rib = topm & (lum < 0.62 * med_l) & ((a[..., 2] >= a[..., 0]) if med_top[2] >= med_top[0] else (lum < 0.45 * med_l))
    rib = _blur(rib.astype(np.float64), 1.0) > 0.45
    if rib.any():
        rc = np.array(trim if trim is not None else np.array(top) * 0.82)
        out[rib] = rc[None, :] * (ao_f[rib])[:, None]
    # grain du tissu très fin
    rng = np.random.default_rng(4)
    grain = _blur(rng.random((H, W)), 0.6)
    out *= (0.985 + 0.03 * grain)[..., None]
    # hors des îlots UV : couleur de la pièce de tissu la plus proche (aucun pixel de la texture d'origine ne subsiste ;
    # sinon le filtrage / les ourlets échantillonnent le fond clair d'origine → taches claires aux chevilles)
    from scipy import ndimage
    if bg.any() and (~bg).any():
        _, (iy, ix) = ndimage.distance_transform_edt(bg, return_indices=True)
        out[bg] = out[iy[bg], ix[bg]]
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))


def clean_normal(nim, suit, diffuse=None, blur_bottom=18, blur_top=4.0, uv=None):
    """Carte de normales : bas aplani (legging / jogging lisse), haut légèrement adouci (pas de relief de logo)."""
    n = np.asarray(nim.convert('RGB')).astype(np.float64) / 255
    H, W = n.shape[:2]
    fabric = np.abs(n - np.array([0.5, 0.5, 1.0])).sum(-1) > 0.01
    if uv is not None:
        fabric = uv_mask(uv[0], uv[1], (H, W))
    elif diffuse is not None:
        d = np.asarray(diffuse.convert('RGB').resize((W, H))).astype(np.float64) / 255
        fabric = np.abs(d - d[4, 4]).sum(-1) >= 0.05
    bot = regions(suit, (H, W), fabric, uv)
    out = n.copy()
    for k in range(3):
        b = _blur(n[..., k], blur_bottom)
        t = _blur(n[..., k], blur_top)
        out[..., k] = np.where(bot, b, t)
    # renormalisation et atténuation vers le plat (0.5, 0.5, 1)
    v = out * 2 - 1
    flat = np.array([0.0, 0.0, 1.0])
    v = np.where(bot[..., None], v * 0.5 + flat * 0.5, v * 0.35 + flat * 0.65)
    v /= np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-6)
    return Image.fromarray(((v * 0.5 + 0.5) * 255).astype(np.uint8))
