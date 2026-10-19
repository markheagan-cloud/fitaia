"""Planche de validation : 3 états (lignes) × 4 vues (colonnes), légendes sobres. Usage : compose_sheet.py <dossier_rendus> <sortie.jpg>"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
STATES = [('surpoids', 'Surpoids'), ('actuel', 'Actuel'), ('athletique', 'Objectif athlétique')]
VIEWS = [('face', 'Face'), ('trois-quarts', '3/4'), ('profil', 'Profil'), ('dos', 'Dos')]
cw, ch = 540, 810
pad, head, lab = 24, 70, 150
W = lab + len(VIEWS) * cw + pad
H = head + len(STATES) * ch + pad


def font(sz, bold=False):
    for f in (['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if bold else []) + ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


sheet = Image.new('RGB', (W, H), (24, 24, 26))
d = ImageDraw.Draw(sheet)
for j, (_, vl) in enumerate(VIEWS):
    d.text((lab + j * cw + cw // 2, head // 2), vl, fill=(235, 235, 230), font=font(30, True), anchor='mm')
for i, (sk, sl) in enumerate(STATES):
    y0 = head + i * ch
    d.text((lab // 2, y0 + ch // 2), sl.replace(' ', '\n', 1), fill=(200, 240, 60), font=font(26, True), anchor='mm', align='center')
    for j, (vk, _) in enumerate(VIEWS):
        p = os.path.join(src, f'{sk}_{vk}.png')
        if os.path.exists(p):
            im = Image.open(p).convert('RGB').resize((cw, ch), Image.LANCZOS)
            sheet.paste(im, (lab + j * cw, y0))
sheet.save(out, quality=90)
print(out, sheet.size)
