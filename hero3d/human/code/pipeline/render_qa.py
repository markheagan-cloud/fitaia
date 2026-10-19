"""
FITAIA — RenderQAService : rendus Blender (Cycles) pilotés par Python, préparation pour la mesure, planches QA.

  render(blender, job_items, samples, scale)      → lance blender/render_portraits.py sur une liste d'items
  flatten(png, bg)                                → PNG transparent posé sur un fond uni (MediaPipe exige une image opaque)
  sheet_likeness(...)                             → planche photo | rendu même angle | superposition | face | 3/4 | profil
                                                    + rapport d'erreurs (avant / après)
  grid(...)                                       → grille d'images légendée (variations du corps, gros plans…)
Toutes les planches sont des RENDUS de l'usine : jamais de retouche d'image sur l'avatar.
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def font(sz, bold=True, mono=False):
    names = (['/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
              'C:/Windows/Fonts/consolab.ttf' if bold else 'C:/Windows/Fonts/consola.ttf'] if mono else
             ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
              'C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/arial.ttf'])
    for f in names:
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


def render(blender, items, out_job, samples=64, scale=1.0, extra=None):
    job = {'samples': samples, 'scale': scale, 'items': items}
    job.update(extra or {})
    json.dump(job, open(out_job, 'w', encoding='utf-8'), indent=1)
    r = subprocess.run([blender, '-b', '--factory-startup', '--python', os.path.join(HERE, 'blender', 'render_portraits.py'), '--', out_job],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    log = r.stdout + r.stderr
    if r.returncode != 0 or 'PORTRAITS OK' not in log:
        print(log[-4000:])
        raise RuntimeError('rendu Blender en échec')
    return [l for l in log.splitlines() if l.startswith('PORTRAIT ')]


def flatten(png, bg=(150, 148, 145), out=None):
    im = Image.open(png).convert('RGBA')
    b = Image.new('RGBA', im.size, bg + (255,))
    b.alpha_composite(im)
    out = out or os.path.splitext(png)[0] + '_bg.png'
    b.convert('RGB').save(out)
    return out


def landmarks(pyenv, model, seg, images):
    args = [pyenv, os.path.join(HERE, 'landmarks.py'), model] + ([seg] if seg else []) + list(images)
    subprocess.run(args, check=True, capture_output=True)


def _crop_face(img, lmj, scale=1.25, size=(360, 440), center_y=0.42):
    """Recadre autour du visage (repères MediaPipe) à la même échelle pour la photo et les rendus."""
    lm = json.load(open(lmj)) if lmj and os.path.exists(lmj) else None
    im = Image.open(img).convert('RGB')
    W, H = im.size
    if lm and lm.get('found'):
        p = np.array(lm['landmarks'])[:, :2] * np.array([W, H])
        fh = np.linalg.norm(p[10] - p[152])
        cx, cy = p[[33, 263, 152, 10]].mean(0)
    else:
        fh, cx, cy = H * 0.35, W / 2, H * 0.45
    h = fh * 2.0 * scale
    w = h * size[0] / size[1]
    box = (int(cx - w / 2), int(cy - h * center_y), int(cx + w / 2), int(cy + h * (1 - center_y)))
    bg = Image.new('RGB', (box[2] - box[0], box[3] - box[1]), (150, 148, 145))
    bg.paste(im.crop((max(box[0], 0), max(box[1], 0), min(box[2], W), min(box[3], H))), (max(-box[0], 0), max(-box[1], 0)))
    return bg.resize(size, Image.LANCZOS)


def _crop_png(png, size=(360, 440), bg=(150, 148, 145), zoom=1.0, cy=0.5):
    im = Image.open(png).convert('RGBA')
    b = Image.new('RGBA', im.size, bg + (255,))
    b.alpha_composite(im)
    b = b.convert('RGB')
    W, H = b.size
    ar = size[0] / size[1]
    h = H / zoom
    w = h * ar
    if w > W:
        w = W
        h = w / ar
    x0 = (W - w) / 2
    y0 = np.clip(H * cy - h / 2, 0, H - h)
    return b.crop((int(x0), int(y0), int(x0 + w), int(y0 + h))).resize(size, Image.LANCZOS)


def overlay(photo, render_bg, size=(360, 440)):
    """Rendu ramené sur la photo par similarité sur des repères stables, mélange 50 %."""
    from likeness import load, _sim2, STABLE
    pp, lp, _ = load(photo)
    pr, lr, _ = load(render_bg)
    if pp is None or pr is None:
        return Image.new('RGB', size, (60, 60, 60))
    s, R, t = _sim2(pr[STABLE, :2], pp[STABLE, :2])
    M = np.linalg.inv(np.vstack([np.c_[s * R, t], [0, 0, 1]]))
    ph = Image.open(photo).convert('RGB')
    rn = Image.open(render_bg).convert('RGB').transform(ph.size, Image.AFFINE, tuple(M[:2].reshape(-1)), Image.BICUBIC)
    mix = Image.blend(ph, rn, 0.5)
    tmp = photo + '.overlay.png'
    mix.save(tmp)
    out = _crop_face(tmp, photo + '.landmarks.json', size=size)
    os.remove(tmp)
    return out


def _report_panel(rep, w, h, title):
    from likeness import SPEC_ERRORS
    pan = Image.new('RGB', (w, h), (24, 24, 27))
    d = ImageDraw.Draw(pan)
    gate = rep.get('visual_quality_gate', '?')
    gc = {'FAIL': (230, 90, 80), 'PASS': (120, 210, 110), 'REVIEW_REQUIRED': (235, 190, 70)}.get(gate, (200, 200, 200))
    d.text((14, 10), title, fill=(235, 235, 230), font=font(19))
    d.text((14, 40), f"Automated similarity: {rep.get('automated_similarity', 0):.0f}/100", fill=(220, 220, 215), font=font(16, False))
    d.rectangle((14, 66, w - 14, 96), fill=gc)
    d.text((w // 2, 81), f'Visual quality gate: {gate}', fill=(18, 18, 20), font=font(17), anchor='mm')
    y = 106
    reasons = rep.get('reasons', [])
    txt = 'Reason: ' + (', '.join(reasons) if reasons else '—')
    line = ''
    for word in txt.split(' '):
        if d.textlength(line + ' ' + word, font=font(12, False)) > w - 28:
            d.text((14, y), line, fill=(240, 200, 190) if gate == 'FAIL' else (220, 220, 210), font=font(12, False))
            y += 16
            line = word
        else:
            line = (line + ' ' + word).strip()
    d.text((14, y), line, fill=(240, 200, 190) if gate == 'FAIL' else (220, 220, 210), font=font(12, False))
    y += 24
    errs = rep.get('errors', {})
    order = SPEC_ERRORS + [k for k in sorted(errs) if k not in SPEC_ERRORS]
    for k in order:
        v = errs.get(k, {})
        e, st = v.get('error'), v.get('status', '?')
        if e is None:
            val = '   —'
        elif k in ('expression_neutrality_error', 'face_contour_error'):
            val = f'{e:6.2f}'
        else:
            val = f'{100 * e:+5.1f}%'
        col = {'OK': (150, 220, 140), 'ÉCHEC': (240, 110, 100)}.get(st, (150, 150, 150))
        bold = k in SPEC_ERRORS
        d.text((14, y), f'{k:<30}{val:>8}  {st}', fill=col, font=font(12, bold, mono=True))
        y += 16
        if y > h - 16:
            break
    return pan


def sheet_likeness(name, photo, rows, out, cell=(300, 366)):
    """rows : [(titre, {photo_bg, face, trois-quarts, profil}, rapport)] → planche."""
    lab = 34
    rep_w = 470
    cols = ['PHOTO', 'Avatar — même angle', 'Superposition 50 %', 'Face', '3/4', 'Profil']
    W = cell[0] * len(cols) + rep_w
    H = 56 + len(rows) * (cell[1] + lab + 36)
    sh = Image.new('RGB', (W, H), (18, 18, 20))
    d = ImageDraw.Draw(sh)
    d.text((16, 14), f'{name} — ressemblance photo → avatar (photo de test NASA, domaine public, usage interne)', fill=(200, 240, 60), font=font(22))
    y = 56
    for title, R, rep in rows:
        d.text((16, y + 4), title, fill=(235, 235, 230), font=font(20))
        y += 36
        for c, t in enumerate(cols):
            d.text((c * cell[0] + cell[0] // 2, y + lab // 2), t, fill=(200, 240, 60) if c == 0 else (220, 220, 215), font=font(15), anchor='mm')
        imgs = [_crop_face(photo, photo + '.landmarks.json', size=cell),
                _crop_face(R['photo_bg'], R['photo_bg'] + '.landmarks.json', size=cell) if R.get('photo_bg') else None,
                overlay(photo, R['photo_bg'], size=cell) if R.get('photo_bg') else None]
        for k in ('face', 'trois-quarts', 'profil'):
            imgs.append(_crop_png(R[k], size=cell, zoom=1.0, cy=0.5) if R.get(k) and os.path.exists(R[k]) else None)
        for c, im in enumerate(imgs):
            if im is not None:
                sh.paste(im, (c * cell[0], y + lab))
        sh.paste(_report_panel(rep, rep_w - 10, cell[1] + lab, 'Rapport de ressemblance'), (len(cols) * cell[0] + 10, y))
        y += cell[1] + lab
    sh.save(out, quality=90)
    return out


def grid(cells, out, cols, cell=(300, 450), title=None, sub=None, bg=(236, 234, 229)):
    """cells : [(png, légende)] ; png transparent posé sur fond studio."""
    rows = (len(cells) + cols - 1) // cols
    top = 70 if title else 10
    sh = Image.new('RGB', (cols * cell[0], top + rows * (cell[1] + 30)), bg)
    d = ImageDraw.Draw(sh)
    if title:
        d.text((18, 12), title, fill=(25, 25, 28), font=font(24))
        if sub:
            d.text((18, 44), sub, fill=(90, 90, 92), font=font(15, False))
    for i, (png, cap) in enumerate(cells):
        r, c = divmod(i, cols)
        x, y = c * cell[0], top + r * (cell[1] + 30)
        if png and os.path.exists(png):
            im = Image.open(png).convert('RGBA')
            im.thumbnail(cell, Image.LANCZOS)
            b = Image.new('RGBA', cell, bg + (255,))
            b.alpha_composite(im, ((cell[0] - im.size[0]) // 2, cell[1] - im.size[1]))
            sh.paste(b.convert('RGB'), (x, y))
        d.text((x + cell[0] // 2, y + cell[1] + 14), cap, fill=(40, 40, 44), font=font(14), anchor='mm')
    sh.save(out, quality=90)
    return out


if __name__ == '__main__':
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
