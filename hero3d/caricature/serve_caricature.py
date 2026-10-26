"""
FITAIA — serveur « selfie → caricature » (bibliothèque standard Python, sans dépendance).
Génère le portrait caricature et 3 bustes (surpoids / actuel / athlétique) avec FLUX.2 klein 4B via l'API d'un ComfyUI local.

  python serve_caricature.py [--port 8791]        (lancé par SERVEUR-CARICATURE.bat, ComfyUI déjà démarré sur 8188)

  POST /v1/caricature        {"photo": "<jpeg base64>", "sex": "m" | "f", "sheet": {...} facultatif}
      → 202 {"ok": true, "id": "<32 hex>", "status": "/v1/caricature/<id>"}
  GET  /v1/caricature/<id>
      → 200 {"ok": true, "state": "queued" | "running"}
      → 200 {"ok": true, "state": "done", "id": "...", "portrait": "/v1/caricature/<id>/portrait.png",
             "corps": {"surpoids": ".../surpoids.png", "actuel": ".../actuel.png", "athletique": ".../athletique.png"},
             "report": {"limites": [...], "duree_s": 123, "modele": "...", "graine": 11}}
      → 422 {"ok": false, "state": "failed", "error": "..."}
      → 404 id inconnu
  GET  /v1/caricature/<id>/<portrait|surpoids|actuel|athletique>.png    image/png 512×512
  GET  /v1/health        {"ok": true, "gpu": "...", "modele": "...", "comfyui": true | false}

Même protocole que hero3d/human/code/serve_avatar.py (202 + suivi) : une génération dure plusieurs minutes sur le PC de dev
(GTX 1650 : ≈ 3 min par image, 4 images), bien au-delà du délai d'inactivité d'iOS.
Une tâche à la fois (les suivantes attendent, état « queued »). Le selfie est supprimé dès la fin de la tâche, même en échec.
Jeton facultatif : variable FITAIA_CARICATURE_TOKEN → en-tête « Authorization: Bearer <jeton> » exigé ; sinon l'en-tête est ignoré.
Recette, modèles et licences : hero3d/caricature/README.md.
"""
import argparse
import base64
import json
import os
import re
import shutil
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
COMFY_IN = os.path.join(OUT, '_comfy_in')      # --input-directory de ComfyUI (voir SERVEUR-CARICATURE.bat)
COMFY_OUT = os.path.join(OUT, '_comfy_out')    # --output-directory de ComfyUI
COMFY = os.environ.get('FITAIA_COMFYUI_URL', 'http://127.0.0.1:8188').rstrip('/')
# image de style facultative (planche validée) : jamais dans le dépôt, chemin local seulement
STYLE_REF = os.environ.get('FITAIA_CARICATURE_STYLE', '')
TOKEN = os.environ.get('FITAIA_CARICATURE_TOKEN', '')
JOB_TIMEOUT_S = int(os.environ.get('FITAIA_CARICATURE_TIMEOUT', '1200'))
MAX_PHOTO = 6 * 1024 * 1024
SEED = 11
MODELE = 'FLUX.2 klein 4B Q4_K_M'
NOMS = ('portrait', 'surpoids', 'actuel', 'athletique')
LOCK = threading.Lock()
STATES = {}
STATES_LOCK = threading.Lock()

STYLE = ('Cool caricature in soft digital painting style: smooth brush shading, painterly edges, NO black outlines, NO line art, '
         'no plastic 3D render, no photorealism. Clearly oversized head on small shoulders (caricature proportions), '
         '{traits} gently exaggerated. {cheveux} {barbe} {peau} skin, red crew-neck t-shirt, plain cream background, warm soft light.')
CORPS = {
    'surpoids': 'overweight body: big round belly pushing the t-shirt, heavy chest and thick arms, noticeably fuller rounder face '
                'with chubby cheeks and a soft double chin',
    'actuel': 'current body: average build, slightly soft',
    'athletique': 'athletic fit body: broad shoulders, defined chest and arms, flat stomach, fitted t-shirt, slightly leaner face',
}
CHEVEUX = {'noir': 'black', 'brun': 'dark brown', 'chatain': 'brown', 'blond': 'blond', 'roux': 'red', 'gris': 'grey', 'blanc': 'white'}
PEAU = {'s1': 'very fair', 's2': 'fair', 's3': 'light', 's4': 'warm medium brown', 's5': 'warm brown', 's6': 'deep brown',
        's7': 'dark brown', 's8': 'very dark brown'}


def prompts(sex, sheet):
    """Prompts de la recette (graine 11). La fiche ne sert que pour la couleur des cheveux et de la peau, si elle est donnée."""
    sheet = sheet if isinstance(sheet, dict) else {}
    qui = 'woman' if sex == 'f' else 'man'
    pron = 'her' if sex == 'f' else 'his'
    couleur = CHEVEUX.get(str(sheet.get('hairColor', '')).lower(), '')
    style = STYLE.format(
        traits=f'{pron} own eye shape and relaxed gaze, nose, lips and cheeks from the photo',
        cheveux=f'Keep {pron} real hairstyle from the photo{", " + couleur if couleur else ""}, with visible strands, not a solid helmet.',
        barbe='' if sex == 'f' else 'Keep his facial hair exactly as in the photo.',
        peau=PEAU.get(str(sheet.get('skin', '')).lower(), 'Same'))
    ref_style = ', in the warm colors of image 2' if STYLE_REF else ''
    portrait = f'Caricature portrait of the {qui} in image 1{ref_style}. {style} Front view, head and shoulders, centered.'
    corps = {k: (f'Same character as image 1, same face, same eyes, same hair, same facial hair, same caricature painting style. '
                 f'Medium shot framed from the top of the head to the waist, whole head fully visible with space above it, '
                 f'front view, {v}. Same red crew-neck t-shirt, plain cream background, warm soft light. {style}')
             for k, v in CORPS.items()}
    return portrait, corps


def comfy(path, data=None, timeout=10):
    req = urllib.request.Request(COMFY + path, json.dumps(data).encode() if data is not None else None,
                                 {'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def graph(n_refs, prompt, refs, seed, out_prefix):
    with open(os.path.join(HERE, 'workflows', f'klein4b_ref{n_refs}.api.json'), encoding='utf-8') as f:
        g = json.load(f)
    g['pos']['inputs']['text'] = prompt
    g['noi']['inputs']['noise_seed'] = seed
    g['out']['inputs']['filename_prefix'] = out_prefix
    for i, r in enumerate(refs):
        g[f'img{i}']['inputs']['image'] = r
    return g


def render(g, dest, deadline):
    """Envoie un graphe à ComfyUI, attend la fin, copie l'image produite vers dest."""
    pid = comfy('/prompt', {'prompt': g})['prompt_id']
    while True:
        if time.time() > deadline:
            try:
                comfy('/interrupt', {})
            except Exception:
                pass
            raise TimeoutError(f'génération trop longue (> {JOB_TIMEOUT_S} s), abandonnée')
        time.sleep(2)
        h = comfy(f'/history/{pid}')
        if pid not in h:
            continue
        st = h[pid].get('status', {})
        if st.get('status_str') != 'success':
            err = [m[1].get('exception_message', '') for m in st.get('messages', []) if m[0] == 'execution_error']
            raise RuntimeError('ComfyUI : ' + (err[0][:200] if err and err[0] else 'échec de la génération'))
        imgs = [im for o in h[pid].get('outputs', {}).values() for im in o.get('images', [])]
        if not imgs:
            raise RuntimeError('ComfyUI : aucune image produite')
        im = imgs[0]
        src = os.path.join(COMFY_OUT, im.get('subfolder', ''), im['filename'])
        if os.path.exists(src):
            shutil.move(src, dest)
        else:   # ComfyUI distant : on passe par /view
            q = urllib.parse.urlencode({'filename': im['filename'], 'subfolder': im.get('subfolder', ''), 'type': im.get('type', 'output')})
            with urllib.request.urlopen(f'{COMFY}/view?{q}', timeout=60) as r, open(dest, 'wb') as f:
                f.write(r.read())
        return


def set_state(jid, state):
    with STATES_LOCK:
        STATES[jid] = state


def write_report(d, report):
    with open(os.path.join(d, 'report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False)


def run_job(jid, photo_bytes, sex, sheet):
    d = os.path.join(OUT, jid)
    selfie = os.path.join(COMFY_IN, f'{jid}_selfie.jpg')
    portrait_in = os.path.join(COMFY_IN, f'{jid}_portrait.png')
    t = time.time()
    try:
        os.makedirs(d, exist_ok=True)
        os.makedirs(COMFY_IN, exist_ok=True)
        with open(selfie, 'wb') as f:
            f.write(photo_bytes)
        with LOCK:
            set_state(jid, 'running')
            deadline = time.time() + JOB_TIMEOUT_S
            p_portrait, p_corps = prompts(sex, sheet)
            refs = [os.path.basename(selfie)]
            if STYLE_REF and os.path.exists(STYLE_REF):
                style_name = 'style_' + os.path.basename(STYLE_REF)
                shutil.copy(STYLE_REF, os.path.join(COMFY_IN, style_name))
                refs.append(style_name)
            render(graph(len(refs), p_portrait, refs, SEED, jid + '_portrait'), os.path.join(d, 'portrait.png'), deadline)
            shutil.copy(os.path.join(d, 'portrait.png'), portrait_in)
            for nom in ('surpoids', 'actuel', 'athletique'):
                render(graph(1, p_corps[nom], [os.path.basename(portrait_in)], SEED, f'{jid}_{nom}'), os.path.join(d, nom + '.png'), deadline)
        write_report(d, {'ok': True, 'limites': [
            'Caricature générée (illustration) : ressemblance non garantie, à valider par la personne.',
            'Les 3 corps sont des illustrations, pas une prédiction médicale.',
        ], 'duree_s': round(time.time() - t), 'modele': MODELE, 'graine': SEED})
    except Exception as e:
        try:
            write_report(d, {'ok': False, 'erreur': str(e)[:300], 'duree_s': round(time.time() - t)})
        except OSError:
            pass
    finally:
        # le selfie et les copies d'entrée ne sont jamais gardés, même si la tâche plante
        for p in (selfie, portrait_in):
            try:
                os.remove(p)
            except OSError:
                pass
        ok = job_done(jid)
        set_state(jid, 'done' if ok else 'failed')
        print(f'[{time.strftime("%H:%M:%S")}] tâche {jid[:8]} sexe={sex} ok={ok} {time.time() - t:.0f} s', flush=True)


def read_report(jid):
    try:
        with open(os.path.join(OUT, jid, 'report.json'), encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def job_done(jid):
    r = read_report(jid) or {}
    return bool(r.get('ok')) and all(os.path.exists(os.path.join(OUT, jid, n + '.png')) for n in NOMS)


def job_status(jid):
    """(code HTTP, corps) pour GET /v1/caricature/<id>."""
    with STATES_LOCK:
        state = STATES.get(jid)
    if state is None:
        # tâche d'un processus précédent : seul le disque fait foi
        if not os.path.isdir(os.path.join(OUT, jid)):
            return 404, {'ok': False, 'error': 'tâche introuvable'}
        state = 'done' if job_done(jid) else 'failed'
    if state in ('queued', 'running'):
        return 200, {'ok': True, 'state': state}
    report = read_report(jid) or {'ok': False, 'erreur': 'tâche interrompue (serveur redémarré)'}
    if state == 'done':
        base = f'/v1/caricature/{jid}'
        rep = {k: report[k] for k in ('limites', 'duree_s', 'modele', 'graine') if k in report}
        return 200, {'ok': True, 'state': 'done', 'id': jid, 'portrait': f'{base}/portrait.png',
                     'corps': {n: f'{base}/{n}.png' for n in ('surpoids', 'actuel', 'athletique')}, 'report': rep}
    return 422, {'ok': False, 'state': 'failed', 'error': report.get('erreur', 'échec')}


def health():
    try:
        stats = comfy('/system_stats', timeout=3)
        dev = (stats.get('devices') or [{}])[0]
        return {'ok': True, 'gpu': dev.get('name', ''), 'modele': MODELE, 'comfyui': True}
    except Exception:
        return {'ok': True, 'gpu': '', 'modele': MODELE, 'comfyui': False}


class Handler(BaseHTTPRequestHandler):
    server_version = 'FitaiaCaricature/1'

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
            return self._send(200, health())
        s = re.match(r'^/v1/caricature/([0-9a-f]{32})$', self.path)
        m = re.match(r'^/v1/caricature/([0-9a-f]{32})/(portrait|surpoids|actuel|athletique)\.png$', self.path)
        if not s and not m:
            return self._send(404, {'ok': False, 'error': 'introuvable'})
        if not self._auth():
            return self._send(401, {'ok': False, 'error': 'jeton invalide'})
        if s:
            return self._send(*job_status(s.group(1)))
        p = os.path.join(OUT, m.group(1), m.group(2) + '.png')
        if not os.path.exists(p):
            return self._send(404, {'ok': False, 'error': 'image introuvable'})
        with open(p, 'rb') as f:
            self._send(200, f.read(), 'image/png')

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        if self.path != '/v1/caricature':
            return self._send(404, {'ok': False, 'error': 'introuvable'})
        if not self._auth():
            return self._send(401, {'ok': False, 'error': 'jeton invalide'})
        n = int(self.headers.get('Content-Length', '0') or 0)
        if n <= 0 or n > MAX_PHOTO * 4 // 3 + 4096:
            return self._send(413, {'ok': False, 'error': 'photo trop lourde'})
        try:
            body = json.loads(self.rfile.read(n))
            photo = base64.b64decode(body['photo'], validate=True)
            sex = body.get('sex', 'm')
            assert sex in ('m', 'f'), 'sex doit valoir "m" ou "f"'
            assert photo[:2] == b'\xff\xd8', 'JPEG attendu'
        except Exception as e:
            return self._send(400, {'ok': False, 'error': 'requête invalide : ' + str(e)[:80]})
        jid = uuid.uuid4().hex
        set_state(jid, 'queued')
        threading.Thread(target=run_job, args=(jid, photo, sex, body.get('sheet')), daemon=True).start()
        self._send(202, {'ok': True, 'id': jid, 'status': f'/v1/caricature/{jid}'})

    def log_message(self, fmt, *args):
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8791)
    ap.add_argument('--host', default='0.0.0.0')
    a = ap.parse_args()
    os.makedirs(COMFY_IN, exist_ok=True)
    os.makedirs(COMFY_OUT, exist_ok=True)
    h = health()
    print(f'Serveur caricature FITAIA sur http://{a.host}:{a.port}  (ComfyUI {COMFY} : {"OK " + h["gpu"] if h["comfyui"] else "INJOIGNABLE"}, '
          f'jeton {"exigé" if TOKEN else "non exigé"}, style {"oui" if STYLE_REF else "non"})', flush=True)
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
