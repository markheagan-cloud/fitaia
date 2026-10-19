"""
FITAIA — planches du héros « final » : avant / après et évolution du poids (même identité).

  python compose_hero_final.py --after <hero_final>/_rendus [--before <avant>/_rendus] --out <dossier>

Entrées (PNG transparents de blender/render_portraits.py) :
  après : actuel/{head_face,head_34,full,bust}.png, surpoids/{full,bust}.png, athletique/{full,bust}.png
  avant : head_face/head.png, head_34/head.png, full/full.png (même cadrage, code de l'usine avant la passe finale)
Sorties : avant-apres.jpg, evolution.jpg, et chaque rendu à plat sur le fond studio FITAIA (final/*.png).
"""
import argparse
import os

from PIL import Image, ImageDraw, ImageFont

BG = (236, 234, 229)
INK = (28, 30, 34)
MUTED = (110, 110, 112)


def flat(path, size=None):
    im = Image.open(path).convert('RGBA')
    if os.path.basename(path).startswith('full'):
        # ombre portée au sol (attrape-ombre) : gardée sous les pieds, fondue vers le haut (pas de bord de plateau visible)
        import numpy as np
        a = np.asarray(im).astype(np.float32)
        H = a.shape[0]
        shadow = (a[..., :3].max(-1) < 10) & (a[..., 3] < 255)
        Wd = a.shape[1]
        xx = np.arange(Wd)[None, :] / Wd
        ramp = np.clip((np.arange(H)[:, None] / H - 0.80) / 0.1, 0, 1) * np.clip(np.minimum(xx, 1 - xx) / 0.15, 0, 1)
        a[..., 3] = np.where(shadow, a[..., 3] * ramp, a[..., 3])
        im = Image.fromarray(a.astype(np.uint8), 'RGBA')
    b = Image.new('RGBA', im.size, BG + (255,))
    b.alpha_composite(im)
    out = b.convert('RGB')
    if size:
        out = out.resize(size, Image.LANCZOS)
    return out


def font(sz, bold=False):
    for f in (('segoeuib.ttf' if bold else 'segoeui.ttf'), ('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'), 'arial.ttf'):
        for d in ('', 'C:/Windows/Fonts/', '/usr/share/fonts/truetype/dejavu/'):
            try:
                return ImageFont.truetype(d + f, sz)
            except OSError:
                continue
    return ImageFont.load_default()


def fit_h(im, h):
    return im.resize((int(im.size[0] * h / im.size[1]), h), Image.LANCZOS)


def row(cells, h, gap=16):
    ims = [fit_h(c, h) for c in cells]
    W = sum(i.size[0] for i in ims) + gap * (len(ims) - 1)
    o = Image.new('RGB', (W, h), BG)
    x = 0
    for i in ims:
        o.paste(i, (x, 0))
        x += i.size[0] + gap
    return o


def labeled(img, title, sub=None, pad=28):
    t, s = font(34, True), font(22)
    head = 70 if sub else 56
    o = Image.new('RGB', (img.size[0], img.size[1] + head), BG)
    d = ImageDraw.Draw(o)
    d.text((pad, 10), title, fill=INK, font=t)
    if sub:
        d.text((pad + d.textlength(title, font=t) + 18, 22), sub, fill=MUTED, font=s)
    o.paste(img, (0, head))
    return o


def stack(blocks, gap=24, pad=24):
    W = max(b.size[0] for b in blocks) + 2 * pad
    H = sum(b.size[1] for b in blocks) + gap * (len(blocks) - 1) + 2 * pad
    o = Image.new('RGB', (W, H), BG)
    y = pad
    for b in blocks:
        o.paste(b, (pad + (W - 2 * pad - b.size[0]) // 2, y))
        y += b.size[1] + gap
    return o


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--after', required=True)
    ap.add_argument('--before', default=None)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    os.makedirs(os.path.join(a.out, 'final'), exist_ok=True)
    A = lambda st, n: os.path.join(a.after, st, n + '.png')  # noqa: E731
    # rendus individuels à plat
    for st in ('actuel', 'surpoids', 'athletique'):
        for n in ('head_face', 'head_34', 'bust', 'full'):
            if os.path.exists(A(st, n)):
                flat(A(st, n)).save(os.path.join(a.out, 'final', f'{st}_{n}.png'), optimize=True)
    H = 760
    after = row([flat(A('actuel', 'head_face')), flat(A('actuel', 'head_34')), flat(A('actuel', 'full'))], H)
    blocks = []
    if a.before:
        B = lambda n, f: os.path.join(a.before, n, f + '.png')  # noqa: E731
        before = row([flat(B('head_face', 'head')), flat(B('head_34', 'head')), flat(B('full', 'full'))], H)
        blocks.append(labeled(before, 'Avant', 'rendu d\'origine (même studio, mêmes cadrages)'))
    blocks.append(labeled(after, 'Après', 'passe finale : tête face · tête 3/4 · corps entier'))
    stack(blocks).save(os.path.join(a.out, 'avant-apres.jpg'), quality=92)
    # évolution : même identité, trois états du corps
    labels = [('surpoids', 'Surpoids'), ('actuel', 'Actuel'), ('athletique', 'Athlétique')]
    cols = []
    for st, lab in labels:
        col = stack([fit_h(flat(A(st, 'bust')), 520), fit_h(flat(A(st, 'full')), 980)], gap=10, pad=0)
        cols.append(labeled(col, lab))
    ev = row(cols, max(c.size[1] for c in cols), gap=30)
    stack([ev]).save(os.path.join(a.out, 'evolution.jpg'), quality=92)
    print('PLANCHES OK ->', a.out)


if __name__ == '__main__':
    main()
