"""
Test du serveur « selfie → avatar 3D » (serve_avatar.py) sur de vraies requêtes HTTP, sans Blender ni MediaPipe :
la tâche lourde (photo_avatar_job.py) est remplacée par un faux script qui attend puis écrit report.json + avatar.glb.
Ce test vérifie le protocole (réponse immédiate, suivi, échec, suppression du selfie), pas la ressemblance.

  python test_serve_avatar.py
"""
import base64
import json
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import serve_avatar as S  # noqa: E402

FAKE_JOB = r'''
import json, os, sys, time
a = dict(zip(sys.argv[1::2], sys.argv[2::2]))
out, photo = a['--out'], a['--photo']
assert os.path.exists(photo), 'selfie absent pendant la tâche'
time.sleep(float(os.environ.get('FAKE_JOB_SECONDS', '1.5')))
if os.environ.get('FAKE_JOB_FAIL'):
    json.dump({'ok': False, 'erreur': 'aucun visage détecté'}, open(os.path.join(out, 'report.json'), 'w'))
    sys.exit(3)
open(os.path.join(out, 'avatar.glb'), 'wb').write(b'glTF' + b'\0' * 16)
json.dump({'ok': True, 'sex': a['--sex'], 'traits_photo': {'cibles_visage': 39}}, open(os.path.join(out, 'report.json'), 'w'))
'''

JPEG = base64.b64encode(b'\xff\xd8' + b'\0' * 64).decode()


def call(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if r.headers.get('Content-Type') == 'application/json' else raw)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


class ServeAvatarTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        S.JOBS = os.path.join(cls.tmp, 'jobs')
        os.makedirs(S.JOBS)
        fake = os.path.join(cls.tmp, 'fake_job.py')
        open(fake, 'w', encoding='utf-8').write(FAKE_JOB)
        S.job_command = lambda d, photo, sex, sheet=None: [sys.executable, fake, '--photo', photo, '--sex', sex, '--out', d]
        cls.httpd = ThreadingHTTPServer(('127.0.0.1', 0), S.Handler)
        cls.base = 'http://127.0.0.1:%d' % cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def wait(self, status_url, limit=20):
        t = time.time()
        seen = []
        while time.time() - t < limit:
            code, body = call('GET', self.base + status_url)
            if body.get('state') not in seen:
                seen.append(body.get('state'))
            if body.get('state') in ('done', 'failed') or code == 404:
                return code, body, seen
            time.sleep(0.2)
        self.fail('tâche jamais terminée')

    def test_reponse_immediate_puis_glb(self):
        os.environ['FAKE_JOB_SECONDS'] = '3'
        os.environ.pop('FAKE_JOB_FAIL', None)
        t = time.time()
        code, body = call('POST', self.base + '/v1/avatar', {'photo': JPEG, 'sex': 'f'})
        self.assertEqual(code, 202)
        self.assertLess(time.time() - t, 1.0, 'le POST doit répondre sans attendre la tâche')
        jid = body['id']
        self.assertEqual(body['status'], '/v1/avatar/' + jid)
        code, done, seen = self.wait(body['status'])
        self.assertEqual(code, 200)
        self.assertIn('running', seen)
        self.assertEqual(done['state'], 'done')
        self.assertEqual(done['glb'], '/v1/avatar/%s.glb' % jid)
        self.assertEqual(done['report']['sex'], 'f')
        code, glb = call('GET', self.base + done['glb'])
        self.assertEqual(code, 200)
        self.assertTrue(glb.startswith(b'glTF'))
        self.assertFalse(os.path.exists(os.path.join(S.JOBS, jid, 'selfie.jpg')), 'selfie supprimé après la tâche')

    def test_echec_transmis(self):
        os.environ['FAKE_JOB_SECONDS'] = '0.2'
        os.environ['FAKE_JOB_FAIL'] = '1'
        try:
            code, body = call('POST', self.base + '/v1/avatar', {'photo': JPEG, 'sex': 'm'})
            self.assertEqual(code, 202)
            code, failed, _ = self.wait(body['status'])
            self.assertEqual(code, 422)
            self.assertEqual(failed['state'], 'failed')
            self.assertEqual(failed['error'], 'aucun visage détecté')
            self.assertFalse(os.path.exists(os.path.join(S.JOBS, body['id'], 'selfie.jpg')), 'selfie supprimé après un échec')
        finally:
            os.environ.pop('FAKE_JOB_FAIL', None)

    def test_file_d_attente(self):
        os.environ['FAKE_JOB_SECONDS'] = '1'
        a = call('POST', self.base + '/v1/avatar', {'photo': JPEG, 'sex': 'm'})[1]
        b = call('POST', self.base + '/v1/avatar', {'photo': JPEG, 'sex': 'm'})[1]
        time.sleep(0.3)
        states = {call('GET', self.base + a['status'])[1]['state'], call('GET', self.base + b['status'])[1]['state']}
        self.assertEqual(states, {'running', 'queued'}, 'une tâche à la fois, la suivante attend')
        self.assertEqual(self.wait(a['status'])[1]['state'], 'done')
        self.assertEqual(self.wait(b['status'])[1]['state'], 'done')

    def test_apres_redemarrage_lu_sur_disque(self):
        os.environ['FAKE_JOB_SECONDS'] = '0.2'
        body = call('POST', self.base + '/v1/avatar', {'photo': JPEG, 'sex': 'm'})[1]
        self.wait(body['status'])
        S.STATES.clear()  # comme un redémarrage du serveur
        code, done = call('GET', self.base + body['status'])
        self.assertEqual((code, done['state']), (200, 'done'))

    def test_inconnue_et_requete_invalide(self):
        self.assertEqual(call('GET', self.base + '/v1/avatar/' + 'b' * 32)[0], 404)
        code, body = call('POST', self.base + '/v1/avatar', {'photo': base64.b64encode(b'PNG').decode(), 'sex': 'm'})
        self.assertEqual(code, 400)


if __name__ == '__main__':
    unittest.main(verbosity=2)
