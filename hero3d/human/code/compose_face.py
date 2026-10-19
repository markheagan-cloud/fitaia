"""Planche visage : actuel (face, 3/4, profil) puis même tête en surpoids / actuel / athlétique (contrôle d'identité).
Usage : compose_face.py <dossier_portraits> <sortie.jpg>"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
ROWS = [
    [('actuel_face', 'Face'), ('actuel_trois-quarts', '3/4'), ('actuel_profil', 'Profil')],
    [('surpoids_face', 'Surpoids'), ('actuel_face', 'Actuel'), ('athletique_face', 'Objectif athlétique')],
]
cw, ch, pad, lab = 600, 733, 18, 54


def font(sz):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


W = 3 * cw + 4 * pad
H = len(ROWS) * (ch + lab) + (len(ROWS) + 1) * pad
sheet = Image.new('RGB', (W, H), (24, 24, 26))
d = ImageDraw.Draw(sheet)
for r, row in enumerate(ROWS):
    y0 = pad + r * (ch + lab + pad)
    for c, (key, label) in enumerate(row):
        x0 = pad + c * (cw + pad)
        p = os.path.join(src, key + '.png')
        if os.path.exists(p):
            sheet.paste(Image.open(p).convert('RGB').resize((cw, ch), Image.LANCZOS), (x0, y0 + lab))
        d.text((x0 + cw // 2, y0 + lab // 2), label, fill=(200, 240, 60) if r else (235, 235, 230), font=font(26), anchor='mm')
sheet.save(out, quality=92)
print(out, sheet.size)
