"""Teste le protocole de l'API du Space (ou du stub local) : python test_space.py <url> [selfie.jpg]. Sort 0 si les 4 images arrivent."""
import base64
import json
import re
import sys
import time
import urllib.request

url = sys.argv[1].rstrip('/')
if len(sys.argv) > 2:
    with open(sys.argv[2], 'rb') as f:
        photo = base64.b64encode(f.read()).decode('ascii')
else:  # JPEG minimal 1×1 (test du protocole seulement)
    from PIL import Image
    import io
    buf = io.BytesIO()
    Image.new('RGB', (64, 64), (200, 150, 120)).save(buf, format='JPEG')
    photo = base64.b64encode(buf.getvalue()).decode('ascii')
t = time.time()
req = urllib.request.Request(url + '/gradio_api/call/caricature', json.dumps({'data': [photo, 'm', '{}']}).encode(), {'Content-Type': 'application/json'})
with urllib.request.urlopen(req, timeout=30) as r:
    ev = json.load(r)['event_id']
with urllib.request.urlopen(url + '/gradio_api/call/caricature/' + ev, timeout=600) as r:
    sse = r.read().decode('utf-8')
m = re.findall(r'^event: (\w+)\s*\ndata: (.*)$', sse, re.M)
final = [d for e, d in m if e in ('complete', 'error')]
assert final, 'pas d événement final : ' + sse[:300]
out = json.loads(json.loads(final[-1])[0])
assert out.get('ok'), out
for k in ('surpoids', 'actuel', 'athletique'):
    assert out['corps'][k], k
print(f'OK : 4 images en {time.time() - t:.1f} s ; limites : {out["report"]["limites"]}')
