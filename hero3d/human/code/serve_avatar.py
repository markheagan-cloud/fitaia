"""
FITAIA — serveur « selfie → avatar 3D » (bibliothèque standard Python, sans dépendance).

  python serve_avatar.py [--port 8790]        (lancé par SERVEUR-AVATAR.bat avec le Python de Blender)

  POST /v1/avatar        {"photo": "<jpeg base64>", "sex": "m" | "f"}
      → 200 {"ok": true, "id": "...", "glb": "/v1/avatar/<id>.glb", "report": {...}}
      → 422 {"ok": false, "error": "aucun visage détecté ..."}  (photo inutilisable)
  GET  /v1/avatar/<id>.glb    le GLB (mêmes 15 morphs du corps que le héros)
  GET  /v1/health             {"ok": true}

Une tâche à la fois (≈ 1 min sur le PC de dev). Le selfie est supprimé dès que le GLB est construit.
Jeton facultatif : variable FITAIA_AVATAR_TOKEN → en-tête « Authorization: Bearer <jeton> » exigé.
En production, ce serveur tourne sur une machine FITAIA (le calcul ne peut pas se faire sur l'iPhone : Blender + numpy).
"""
import argparse
import base64
import json
import os
import re
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
JOBS = os.path.join(ROOT, 'hero3d', 'selfie-jobs')
MAX_PHOTO = 6 * 1024 * 1024
LOCK = threading.Lock()
TOKEN = os.environ.get('FITAIA_AVATAR_TOKEN', '')
ID_RE = re.compile(r'^[0-9a-f]{32}$')


def run_job(photo_bytes, sex, sheet=None):
    jid = uuid.uuid4().hex
    d = os.path.join(JOBS, jid)
    os.makedirs(d, exist_ok=True)
    photo = os.path.join(d, 'selfie.jpg')
    with open(photo, 'wb') as f:
        f.write(photo_bytes)
    cmd = [sys.executable, os.path.join(HERE, 'photo_avatar_job.py'),
           '--src', os.path.join(ROOT, 'assets-src'),
           '--pyenv', os.path.join(ROOT, 'tools', 'pyenv', 'Scripts', 'python.exe'),
           '--model', os.path.join(ROOT, 'photo-id', 'face_landmarker.task'),
           '--seg', os.path.join(ROOT, 'photo-id', 'selfie_multiclass.tflite'),
           '--base', os.path.join(ROOT, 'hero3d', 'identites', '_base'),
           '--photo', photo, '--sex', sex, '--out', d] + (['--sheet', json.dumps(sheet)] if isinstance(sheet, dict) else [])
    env = dict(os.environ, PYTHONIOENCODING='utf-8')
    with LOCK:
        r = subprocess.run(cmd, capture_output=True, text=True, env=env, encoding='utf-8', errors='replace')
    # le selfie et ses dérivés ne sont jamais gardés
    for p in (photo, photo + '.landmarks.json', photo + '.seg.png', os.path.join(d, 'face.png')):
        try:
            os.remove(p)
        except OSError:
            pass
    rp = os.path.join(d, 'report.json')
    report = json.load(open(rp, encoding='utf-8')) if os.path.exists(rp) else {'ok': False, 'erreur': 'tâche interrompue', 'detail': r.stderr[-400:]}
    return jid, report


class Handler(BaseHTTPRequestHandler):
    server_version = 'FitaiaAvatar/1'

    def _send(self, code, body, ctype='application/json'):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()
        self.wfile.write(data)

    def _auth(self):
        return not TOKEN or self.headers.get('Authorization', '') == 'Bearer ' + TOKEN

    def do_OPTIONS(self):
        self._send(204, b'')

    def do_GET(self):
        if self.path == '/v1/health':
            return self._send(200, {'ok': True})
        m = re.match(r'^/v1/avatar/([0-9a-f]{32})\.glb$', self.path)
        if not m:
            return self._send(404, {'ok': False, 'error': 'introuvable'})
        if not self._auth():
            return self._send(401, {'ok': False, 'error': 'jeton invalide'})
        p = os.path.join(JOBS, m.group(1), 'avatar.glb')
        if not os.path.exists(p):
            return self._send(404, {'ok': False, 'error': 'avatar introuvable'})
        with open(p, 'rb') as f:
            self._send(200, f.read(), 'model/gltf-binary')

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        if self.path != '/v1/avatar':
            return self._send(404, {'ok': False, 'error': 'introuvable'})
        if not self._auth():
            return self._send(401, {'ok': False, 'error': 'jeton invalide'})
        n = int(self.headers.get('Content-Length', '0') or 0)
        if n <= 0 or n > MAX_PHOTO * 4 // 3 + 1024:
            return self._send(413, {'ok': False, 'error': 'photo trop lourde'})
        try:
            body = json.loads(self.rfile.read(n))
            photo = base64.b64decode(body['photo'], validate=True)
            sex = body.get('sex', 'm')
            assert sex in ('m', 'f')
            assert photo[:2] == b'\xff\xd8', 'JPEG attendu'
        except Exception as e:
            return self._send(400, {'ok': False, 'error': 'requête invalide : ' + str(e)[:80]})
        t = time.time()
        jid, report = run_job(photo, sex, body.get('sheet'))
        print(f'[{time.strftime("%H:%M:%S")}] tâche {jid[:8]} sexe={sex} ok={report.get("ok")} {time.time() - t:.0f} s', flush=True)
        if not report.get('ok'):
            return self._send(422, {'ok': False, 'error': report.get('erreur', 'échec'), 'report': report})
        self._send(200, {'ok': True, 'id': jid, 'glb': f'/v1/avatar/{jid}.glb', 'report': report})

    def log_message(self, fmt, *args):
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8790)
    ap.add_argument('--host', default='0.0.0.0')
    a = ap.parse_args()
    os.makedirs(JOBS, exist_ok=True)
    print(f'Serveur avatar FITAIA sur http://{a.host}:{a.port}  (jeton {"exigé" if TOKEN else "non exigé"})', flush=True)
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
