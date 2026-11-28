"""Mode « mélange » (s'habiller pièce par pièce) sans GPU : python -I hero3d/caricature/space/test_melange.py"""
import base64
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image  # noqa: E402

import api  # noqa: E402
import recette as r  # noqa: E402

assert set(r.PIECES) == set(r.TENUES), 'une fiche de pièces par tenue'
for k, p in r.PIECES.items():
    assert 'haut' in p and ('bas' in p or p.get('plein')), k
p = r.prompt_melange('f', {'haut': 'plage', 'bas': 'street', 'chaussures': 'sprint'})
assert 'one-piece sporty swimsuit' in p and 'black joggers' in p and 'bright red running shoes' in p and 'turquoise sea' in p, p
assert 'plain white sneakers' in r.prompt_melange('m', {'haut': 'samourai', 'bas': 'dojo'})
assert r.cle_melange({'haut': 'pilote', 'chaussures': 'astro', 'fond': 'royal'}) == 'm-pilote-x-astro-x-royal'
for bad in ({'haut': 'pilote', 'bas': 'street'}, {'haut': 'cargo'}, {'haut': 'cargo', 'bas': 'pilote'}, {'bas': 'cargo'}, {'haut': 'cargo', 'bas': 'olive', 'fond': 'nulle'}):
    try:
        r.valider_melange(bad)
        raise SystemExit('accepté à tort : %r' % bad)
    except ValueError:
        pass
b = io.BytesIO()
Image.new('RGB', (64, 64)).save(b, 'PNG')
seen = []
out = api.melange_dict(base64.b64encode(b.getvalue()).decode(), 'm', lambda im, pr: seen.append(pr) or Image.new('RGB', (8, 8)), {'haut': 'cargo', 'bas': 'creme', 'chaussures': 'atelier'})
assert out['ok'] and out['cle'] == 'm-cargo-creme-atelier-x-x' and out['image'] and 'black and gold sneakers' in seen[0], out
assert not api.melange_dict('', 'm', None, {'haut': 'cargo', 'bas': 'creme'})['ok']
print('mélange : OK')
