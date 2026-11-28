"""
FITAIA — remise des clés de fabrication à GitHub Actions, sans secret dans le dépôt (qui est public).

La machine GitHub demande à GitHub un jeton d'identité signé (OIDC), valable quelques minutes, qui dit de quel dépôt,
de quelle branche et de quel workflow elle vient. Ce service vérifie la signature de GitHub et ne rend les clés que si
le jeton vient bien de markheagan-cloud/fitaia, branche testflight, workflow fabriquer-iphone.yml. Personne d'autre ne
peut les obtenir : il faut pouvoir pousser sur cette branche. Les clés sont dans le secret Modal « fitaia-ci ».

    modal deploy hero3d/ci/cles_modal.py
"""
import os

import modal
from fastapi import Request

image = modal.Image.debian_slim(python_version='3.12').pip_install('pyjwt[crypto]==2.10.1', 'fastapi[standard]')
app = modal.App('fitaia-cles', image=image)

EMETTEUR = 'https://token.actions.githubusercontent.com'
ATTENDU = {
    'repository': 'markheagan-cloud/fitaia',
    'repository_owner_id': '336603900',
    'ref': 'refs/heads/testflight',
    'job_workflow_ref': 'markheagan-cloud/fitaia/.github/workflows/fabriquer-iphone.yml@refs/heads/testflight',
}
CLES = ['EXPO_TOKEN', 'ASC_KEY_P8_BASE64', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'CARICATURE_TOKEN']


@app.function(secrets=[modal.Secret.from_name('fitaia-ci')], timeout=30, max_containers=1)
@modal.fastapi_endpoint(method='POST')
async def cles(request: Request):
    import jwt
    from fastapi.responses import JSONResponse

    auth = request.headers.get('authorization', '')
    if not auth.startswith('Bearer '):
        return JSONResponse({'ok': False}, status_code=401)
    try:
        cle = jwt.PyJWKClient(EMETTEUR + '/.well-known/jwks').get_signing_key_from_jwt(auth[7:])
        c = jwt.decode(auth[7:], cle.key, algorithms=['RS256'], audience='fitaia-cles', issuer=EMETTEUR,
                       options={'require': ['exp', 'iat', 'iss', 'aud']})
    except Exception:
        return JSONResponse({'ok': False}, status_code=401)
    if any(str(c.get(k)) != v for k, v in ATTENDU.items()) or c.get('event_name') not in ('push', 'workflow_dispatch'):
        return JSONResponse({'ok': False}, status_code=403)
    return {'ok': True, **{k: os.environ[k] for k in CLES}}
