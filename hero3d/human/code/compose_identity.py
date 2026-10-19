"""Planche de ressemblance : la photo | l'avatar (face, 3/4, profil) ; puis la même tête en surpoids / actuel / athlétique.
Usage : compose_identity.py <photo> <photo.landmarks.json> <dossier_rendus> <sortie.jpg>"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

photo, lmj, src, out = sys.argv[1:5]
cw, ch, pad, lab = 480, 588, 16, 48


def font(sz):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


im = Image.open(photo).convert('RGB')
lm = json.load(open(lmj))
p = np.array(lm['landmarks'])[:, :2] * np.array([im.width, im.height])
cx, cy = p[:, 0].mean(), p[:, 1].mean()
fh = np.linalg.norm(p[10] - p[152])
hh = fh * 1.05
box = (int(cx - hh * ch / cw / 1.22 * 0.82), int(cy - hh * 1.0), int(cx + hh * ch / cw / 1.22 * 0.82), int(cy + hh * 0.95))
crop = im.crop(box).resize((cw, ch), Image.LANCZOS)

ctrl_p = os.path.join(os.path.dirname(src.rstrip('/\\')), 'controle.json')
ctrl = json.load(open(ctrl_p, encoding='utf-8')) if os.path.exists(ctrl_p) else None   # utf-8 : accents (Windows lit en cp1252 sinon)
sup_p = os.path.join(os.path.dirname(src.rstrip('/\\')), 'superposition.png')
sup = Image.open(sup_p).convert('RGB') if os.path.exists(sup_p) else None
if sup is not None:
    r_ = min(cw / sup.width, ch / sup.height)
    sup2 = Image.new('RGB', (cw, ch), (24, 24, 26))
    sup2.paste(sup.resize((int(sup.width * r_), int(sup.height * r_))), ((cw - int(sup.width * r_)) // 2, (ch - int(sup.height * r_)) // 2))
    sup = sup2
rows = [[('PHOTO', crop), ('Avatar — même angle', 'actuel_photo'), ('Superposition 50 %', sup), ('3/4', 'actuel_trois-quarts'), ('Profil', 'actuel_profil')],
        [('Mesures', 'TEXT'), ('Surpoids', 'surpoids_face'), ('Actuel', 'actuel_face'), ('Objectif athlétique', 'athletique_face'), ('', None)]]
W = 5 * cw + 6 * pad
H = 2 * (ch + lab) + 3 * pad
sheet = Image.new('RGB', (W, H), (24, 24, 26))
d = ImageDraw.Draw(sheet)
for r, row in enumerate(rows):
    y0 = pad + r * (ch + lab + pad)
    for c, (label, key) in enumerate(row):
        x0 = pad + c * (cw + pad)
        if isinstance(key, Image.Image):
            sheet.paste(key, (x0, y0 + lab))
        elif key == 'TEXT' and ctrl:
            yy = y0 + lab + 6
            gate = ctrl.get('visual_quality_gate', 'REVIEW_REQUIRED')
            gcol = {'PASS': (110, 220, 110), 'FAIL': (240, 90, 80)}.get(gate, (245, 180, 60))
            # contrôle visuel (décisif) d'abord, score automatique (signal de test) ensuite
            d.rounded_rectangle([x0 + 8, yy, x0 + cw - 8, yy + 52], 10, fill=gcol)
            d.text((x0 + cw // 2, yy + 26), f'Contrôle visuel : {gate}', fill=(20, 20, 22), font=font(23), anchor='mm')
            yy += 62
            sc = ctrl.get('automated_similarity_score', ctrl.get('score_geometrie', 0))
            d.text((x0 + 10, yy), f'Score automatique : {sc:.0f}/100 (signal de test)', fill=(220, 220, 215), font=font(18))
            yy += 28
            d.text((x0 + 10, yy), 'Sortie valide : ' + ('oui' if ctrl.get('valid_output') else 'non'), fill=gcol, font=font(18))
            yy += 32
            for r_ in ctrl.get('raisons', [])[:7]:
                txt = r_ if len(r_) <= 64 else r_[:63] + '…'
                d.text((x0 + 10, yy), '• ' + txt, fill=(235, 200, 190) if gate == 'FAIL' else (220, 220, 210), font=font(12))
                yy += 18
            yy += 8
            for m in ctrl.get('mesures_strictes', []):
                if yy > y0 + lab + ch - 20:
                    break
                st_ = m['statut']
                col = (130, 130, 130) if st_ == 'NON MESURÉ' else ((120, 220, 120) if st_ == 'OK' else (240, 100, 90))
                val = f"{100 * m['ecart']:+.0f} %" if m['type'] == 'rel' else f"{m['avatar']:.2f}"
                d.text((x0 + 10, yy), f"{m['mesure'].replace('_', ' ')[:28]:<28} {val:>7}  {st_}", fill=col, font=font(13))
                yy += 18
        elif key and key != 'TEXT' and os.path.exists(os.path.join(src, key + '.png')):
            sheet.paste(Image.open(os.path.join(src, key + '.png')).convert('RGB').resize((cw, ch), Image.LANCZOS), (x0, y0 + lab))
        if label:
            d.text((x0 + cw // 2, y0 + lab // 2), label, fill=(200, 240, 60) if (r or c == 0) else (235, 235, 230), font=font(24), anchor='mm')
sheet.save(out, quality=92)
print(out)
