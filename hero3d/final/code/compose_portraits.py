"""
FITAIA — portraits sociaux : rendus Blender (RGBA, ×1,5) → fichiers de l'app + planche contact.

  python compose_portraits.py <dossier_rendus> <dossier_sortie> [--sheet planche.png] [--keys moi,demo_demo_sarah,...]

<dossier_rendus>/<clé>/{head,bust,full,card}.png  →  <dossier_sortie>/<clé>/{head,bust,full,card}.png
  head 512×512, bust 640×640, full 640×1024 : fond transparent ; card 640×800 : fond studio FITAIA (gris chaud clair,
  dégradé doux, halo derrière le personnage). PNG ≤ 300 Ko (sans perte si possible, sinon 7/6/5 bits tramés),
  réduction en alpha prémultiplié (pas de liseré).
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SIZES = {'head': (512, 512), 'bust': (640, 640), 'full': (640, 1024), 'card': (640, 800)}
BG_TOP = np.array([0xEC, 0xEA, 0xE5]) / 255.0
BG_BOT = np.array([0xE3, 0xE1, 0xDC]) / 255.0
LIMIT = 300 * 1024


def resize_premul(im, size):
    a = np.asarray(im.convert('RGBA')).astype(np.float32) / 255
    rgb, al = a[..., :3], a[..., 3:4]
    pm = np.concatenate([rgb * al, al], -1)
    chans = [Image.fromarray(pm[..., k]).resize(size, Image.LANCZOS) for k in range(4)]
    out = np.stack([np.asarray(c) for c in chans], -1)
    out = np.clip(out, 0, 1)
    al = out[..., 3:4]
    rgb = np.where(al > 1e-4, out[..., :3] / np.maximum(al, 1e-4), 0)
    return np.concatenate([np.clip(rgb, 0, 1), al], -1)


def studio_bg(size):
    W, H = size
    y = np.linspace(0, 1, H)[:, None, None]
    x = np.linspace(-1, 1, W)[None, :, None]
    g = BG_TOP * (1 - y) + BG_BOT * y
    # halo lumineux doux derrière le buste + léger vignettage (profondeur, sans effet « carte blanche »)
    r = np.sqrt((x / 0.9) ** 2 + ((y - 0.38) / 0.62) ** 2)
    halo = np.exp(-r ** 2 * 1.6)
    g = g * (0.965 + 0.06 * halo) + 0.012 * halo
    vig = 1 - 0.05 * np.clip(r - 0.55, 0, 1)
    return np.clip(g * vig, 0, 1)


def compose_card(rgba):
    H, W = rgba.shape[:2]
    bg = studio_bg((W, H))
    al = rgba[..., 3:4]
    out = rgba[..., :3] * al + bg * (1 - al)
    return np.clip(out, 0, 1)


BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0) - 0.5


def _encode(arr, alpha, bits):
    """PNG sans perte (8 bits) ou à précision réduite par canal avec tramage ordonné (invisible à l'œil, pas d'aplats)."""
    import io
    a = arr * 255.0
    H, W = a.shape[:2]
    q = 2 ** (8 - bits)
    if bits < 8:
        d = np.tile(BAYER, (H // 4 + 1, W // 4 + 1))[:H, :W][..., None]
        a[..., :3] = np.round((a[..., :3] + d * q) / q) * q
    else:
        a = a + 0.5
    out = np.clip(a, 0, 255).astype(np.uint8)
    if alpha:
        out[out[..., 3] == 0] = 0                     # pixels transparents : couleur nulle (compresse mieux)
    im = Image.fromarray(out, 'RGBA' if alpha else 'RGB')
    b = io.BytesIO()
    im.save(b, 'PNG', optimize=True)
    return b.getvalue()


def save_png(arr, path, alpha):
    """Meilleure qualité possible sous 300 Ko : sans perte si ça tient, sinon 7, 6, 5 bits par canal (tramés)."""
    for bits in (8, 7, 6, 5):
        data = _encode(arr.copy(), alpha, bits)
        if len(data) <= LIMIT:
            break
    if len(data) > LIMIT:   # dernier recours : palette 256 couleurs
        im = Image.fromarray((arr * 255 + 0.5).astype(np.uint8), 'RGBA' if alpha else 'RGB')
        im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)
        return os.path.getsize(path)
    open(path, 'wb').write(data)
    return len(data)


def compose(src, dst, keys=None):
    keys = keys or sorted(k for k in os.listdir(src) if os.path.isdir(os.path.join(src, k)))
    report = {}
    for k in keys:
        os.makedirs(os.path.join(dst, k), exist_ok=True)
        for kind, size in SIZES.items():
            p = os.path.join(src, k, kind + '.png')
            if not os.path.exists(p):
                continue
            rgba = resize_premul(Image.open(p), size)
            out = os.path.join(dst, k, kind + '.png')
            if kind == 'card':
                n = save_png(compose_card(rgba), out, alpha=False)
            else:
                n = save_png(rgba, out, alpha=True)
            report[f'{k}/{kind}'] = n
            print(k, kind, size, n // 1024, 'Ko')
    return report


def font(sz):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


def contact_sheet(dst, keys, out, labels=None):
    """Planche : une ligne par avatar, 4 cadrages (les transparents posés sur un damier clair pour juger le détourage)."""
    cw, ch = 300, 480
    lab = 230
    W = lab + 4 * (cw + 16) + 16
    H = 70 + len(keys) * (ch + 16) + 16
    sheet = Image.new('RGB', (W, H), (24, 24, 26))
    d = ImageDraw.Draw(sheet)
    for j, t in enumerate(['Tête (transparent)', 'Buste (transparent)', 'Corps (transparent)', 'Carte sociale']):
        d.text((lab + j * (cw + 16) + cw // 2, 35), t, fill=(235, 235, 230), font=font(22), anchor='mm')
    chk = Image.new('RGB', (cw, ch), (255, 255, 255))
    cd = ImageDraw.Draw(chk)
    for yy in range(0, ch, 16):
        for xx in range(0, cw, 16):
            if (xx // 16 + yy // 16) % 2:
                cd.rectangle([xx, yy, xx + 15, yy + 15], fill=(228, 226, 222))
    for i, k in enumerate(keys):
        y0 = 70 + i * (ch + 16)
        d.text((lab // 2, y0 + ch // 2), (labels or {}).get(k, k), fill=(200, 240, 60), font=font(20), anchor='mm', align='center')
        for j, kind in enumerate(['head', 'bust', 'full', 'card']):
            p = os.path.join(dst, k, kind + '.png')
            x0 = lab + j * (cw + 16)
            if not os.path.exists(p):
                d.rectangle([x0, y0, x0 + cw, y0 + ch], outline=(90, 90, 90))
                d.text((x0 + cw // 2, y0 + ch // 2), 'absent', fill=(140, 140, 140), font=font(18), anchor='mm')
                continue
            im = Image.open(p).convert('RGBA')
            r = min(cw / im.width, ch / im.height)
            im = im.resize((int(im.width * r), int(im.height * r)), Image.LANCZOS)
            cell = chk.copy()
            cell.paste(im, ((cw - im.width) // 2, (ch - im.height) // 2), im)
            sheet.paste(cell, (x0, y0))
            d.text((x0 + cw - 6, y0 + ch - 6), f'{os.path.getsize(p) // 1024} Ko', fill=(120, 120, 120), font=font(13), anchor='rd')
    sheet.save(out)
    return out


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    keys = sys.argv[sys.argv.index('--keys') + 1].split(',') if '--keys' in sys.argv else None
    compose(src, dst, keys)
    if '--sheet' in sys.argv:
        ks = keys or sorted(k for k in os.listdir(dst) if os.path.isdir(os.path.join(dst, k)))
        print(contact_sheet(dst, ks, sys.argv[sys.argv.index('--sheet') + 1]))
