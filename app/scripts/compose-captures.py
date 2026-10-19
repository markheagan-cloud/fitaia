"""Compose les captures App Store : fond béton, légende Archivo, écran arrondi. Entrée : store/captures/raw/*.png (1290×2796)."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'store', 'captures', 'raw')
OUT = os.path.join(ROOT, 'store', 'captures', 'final')
FONT = os.path.join(ROOT, 'assets', 'fonts', 'ArchivoSemiExpanded-ExtraBold.ttf')
W, H = 1290, 2796
BG, INK, LIME = (230, 228, 223), (20, 21, 23), (200, 255, 0)
caps = json.load(open(os.path.join(ROOT, 'store', 'metadata.json'), encoding='utf-8'))['screenshots_captions']

def wrap(draw, text, font, maxw):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=font) <= maxw: cur = t
        else: lines.append(cur); cur = w
    return lines + [cur]

os.makedirs(OUT, exist_ok=True)
files = sorted(f for f in os.listdir(RAW) if f.endswith('.png'))
for i, f in enumerate(files):
    shot = Image.open(os.path.join(RAW, f)).convert('RGB')
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    # bande diagonale lime discrète (signature FITAIA)
    band = Image.new('RGBA', (W, H), (0, 0, 0, 0)); bd = ImageDraw.Draw(band)
    bd.polygon([(W * 0.55, 0), (W, 0), (W, H * 0.35)], fill=LIME + (255,))
    im.paste(Image.alpha_composite(im.convert('RGBA'), band).convert('RGB'))
    d = ImageDraw.Draw(im)
    font = ImageFont.truetype(FONT, 92)
    lines = wrap(d, caps[i] if i < len(caps) else '', font, W - 2 * 96)
    y = 150
    for ln in lines:
        d.text((96, y), ln, font=font, fill=INK); y += 108
    # écran : réduit à 82 %, coins arrondis, ombre
    sw = int(W * 0.82); sh = int(sw * shot.height / shot.width)
    sc = shot.resize((sw, sh), Image.LANCZOS)
    mask = Image.new('L', (sw, sh), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw, sh), radius=110, fill=255)
    sx, sy = (W - sw) // 2, y + 90
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(shadow).rounded_rectangle((sx + 10, sy + 40, sx + sw - 10, sy + sh), radius=110, fill=(0, 0, 0, 110))
    shadow = shadow.filter(ImageFilter.GaussianBlur(50))
    im = Image.alpha_composite(im.convert('RGBA'), shadow).convert('RGB')
    im.paste(sc, (sx, sy), mask)
    im.save(os.path.join(OUT, f'fitaia-67-{i + 1:02d}.png'))
    # 6,5" (1284×2778) : même composition redimensionnée
    im.resize((1284, 2778), Image.LANCZOS).save(os.path.join(OUT, f'fitaia-65-{i + 1:02d}.png'))
    print('ok', f)
