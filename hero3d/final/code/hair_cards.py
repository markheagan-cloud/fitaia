"""
FITAIA — coiffure temps réel en « cartes de mèches » tirées de la coiffure en mèches (groom.py).

Pourquoi : les coquilles (hair_shell.py) se lisent comme un casque, et une vraie coiffure de 100 000 cheveux est hors
budget mobile. Ici, la MÊME coupe que les rendus hors ligne est réduite à quelques centaines de rubans : chaque ruban suit
une mèche « guide » (déjà regroupée par le coiffage), posé à plat sur la coiffure, avec une texture de cheveux fins en
transparence (alpha-test). Silhouette, sens de coiffage et ligne de cheveux sont ceux de la coupe en mèches.

Interface identique aux proxies (.mhclo / coquilles) : refs / weights / offsets / fit() / obj.faces / obj.vt — chaque
sommet suit le sommet du crâne le plus proche → les morphs de la tête déforment la coiffure comme le reste.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.spatial import cKDTree


def _norm(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


def _resample(S, M):
    N, M0, _ = S.shape
    seg = np.linalg.norm(np.diff(S, axis=1), axis=-1)
    s = np.concatenate([np.zeros((N, 1)), np.cumsum(seg, 1)], 1)
    t = s / np.maximum(s[:, -1:], 1e-9)
    u = np.linspace(0, 1, M)
    out = np.empty((N, M, 3))
    for k in range(3):
        out[..., k] = np.array([np.interp(u, t[j], S[j, :, k]) for j in range(N)])
    return out


class HairCards:
    posed = False

    def __init__(self, groom_res, shape, skel, head_center, count=700, segs=6, width=0.13, side_count=260,
                 side_width=0.09, lift=0.012, seed=3):
        """groom_res : sortie de groom.make (mèches POSÉES, dm) ; shape : corps au repos (dm)."""
        rng = np.random.default_rng(seed)
        body = groom_res['body']
        Gh_inv = body.Gh_inv
        strands = {g['name']: g['strands'] for g in groom_res['groups']}
        top = strands.get('hair')
        sides = strands.get('hair_sides')
        cards = []
        for S, n, w in ((top, count, width), (sides, side_count, side_width)):
            if S is None or not len(S) or not n:
                continue
            # guides : échantillonnage uniforme des racines (sur le crâne), puis mèche moyenne de chaque groupe
            k = min(n, len(S))
            roots = S[:, 0]
            gi = rng.choice(len(S), size=k, replace=False)
            for _ in range(4):                                  # quelques passes de k-moyennes sur les racines
                _, lab = cKDTree(roots[gi]).query(roots)
                cent = np.array([roots[lab == j].mean(0) if (lab == j).any() else roots[gi[j]] for j in range(k)])
                _, gi = cKDTree(roots).query(cent)
            _, lab = cKDTree(roots[gi]).query(roots)
            R = _resample(S, segs + 1)
            G = np.array([R[lab == j].mean(0) if (lab == j).sum() > 2 else R[gi[j]] for j in range(k)])
            cards.append((G, w))
        P_list, F, UV = [], [], []
        base = 0
        for G, w in cards:
            K, M, _ = G.shape
            T = _norm(np.gradient(G, axis=1))
            # normale « crâne » : du centre de la tête vers la mèche → ruban posé à plat sur la coiffure
            Nh = _norm(G - head_center[None, None, :])
            B = _norm(np.cross(T, Nh))
            t = np.linspace(0, 1, M)
            wid = w * (0.75 + 0.5 * rng.random(K))[:, None] * (1.0 - 0.55 * t ** 1.5)[None, :]
            # léger décollement progressif (les couches du dessus recouvrent celles du dessous)
            up = Nh * (lift * (0.3 + 0.7 * rng.random(K))[:, None, None] * (0.4 + t)[None, :, None])
            L = G - B * wid[..., None] / 2 + up
            Rr = G + B * wid[..., None] / 2 + up
            V = np.stack([L, Rr], 2).reshape(K, M * 2, 3)
            col = rng.integers(0, 4, K)                         # 4 variantes de texture (colonnes de l'atlas)
            for c in range(K):
                P_list.append(V[c])
                u0, u1 = col[c] * 0.25 + 0.01, col[c] * 0.25 + 0.24
                for i in range(M):
                    UV.append((u0, 1 - t[i]))
                    UV.append((u1, 1 - t[i]))
                for i in range(M - 1):
                    a, b_, cc, d = base + 2 * i, base + 2 * i + 1, base + 2 * i + 3, base + 2 * i + 2
                    F.append([(a, a), (b_, b_), (cc, cc), (d, d)])
                base += 2 * M
        Pp = np.concatenate(P_list)                              # posé (dm)
        # retour au repos : la coiffure est portée par l'os de la tête
        Ph = np.c_[Pp, np.ones(len(Pp))] @ Gh_inv.T
        Prest = Ph[:, :3]
        # liaison au crâne (sommet du corps le plus proche au repos, tête seulement)
        head_ids = np.where(body.Q[:, 1] > 7.0)[0]
        _, nn = cKDTree(shape[head_ids]).query(Prest)
        ref = head_ids[nn]
        self.refs = np.stack([ref] * 3, 1)
        self.weights = np.tile(np.array([1.0, 0.0, 0.0]), (len(ref), 1))
        self.offsets = Prest - shape[ref]
        self.delete_verts = []
        self.material = None

        class _O:
            pass
        self.obj = _O()
        self.obj.faces = F
        self.obj.vt = np.array(UV, dtype=np.float64)
        self.obj.vt[:, 1] = 1 - self.obj.vt[:, 1]              # le constructeur retourne v
        self.count = len(F)

    def fit(self, body):
        return body[self.refs[:, 0]] + self.offsets


def card_texture(color=(0.06, 0.045, 0.035), size=1024, seed=9):
    """Atlas 4 colonnes : cheveux fins verticaux (racine en haut), denses à la racine, pointes effilées ; alpha."""
    rng = np.random.default_rng(seed)
    W = size // 4
    a_img = Image.new('L', (size, size), 0)
    l_img = Image.new('L', (size, size), 0)
    da, dl = ImageDraw.Draw(a_img), ImageDraw.Draw(l_img)
    for col in range(4):
        x0 = col * W
        n = int(W * 0.55)
        for _ in range(n):
            x = x0 + 4 + rng.random() * (W - 8)
            y0 = rng.random() * size * 0.08
            y1 = size * (0.55 + 0.45 * rng.random())
            sway = rng.normal(0, W * 0.04)
            pts = [(x + sway * (k / 8) ** 2, y0 + (y1 - y0) * k / 8) for k in range(9)]
            wdt = 2 if rng.random() < 0.35 else 1
            da.line(pts, fill=255, width=wdt)
            dl.line(pts, fill=int(70 + 185 * rng.random()), width=wdt)
    a = np.asarray(a_img.filter(ImageFilter.GaussianBlur(0.5))).astype(np.float32) / 255
    # densité : pleine à la racine, s'éclaircit vers les pointes ; bords des colonnes adoucis
    yy = np.linspace(0, 1, size)[:, None]
    a = np.clip(a * 1.4, 0, 1) * (1 - 0.45 * yy)
    root = np.clip(1 - yy / 0.15, 0, 1) * 0.5                 # base de la mèche presque opaque (pas de crâne visible)
    a = np.maximum(a, root * (a > 0.05))
    # bords de chaque colonne adoucis : le ruban n'a pas d'arête nette
    xx = (np.arange(size) % W) / W
    a = a * np.clip(np.minimum(xx, 1 - xx) / 0.18, 0, 1)[None, :]
    lu = np.asarray(l_img.filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255
    c = np.array(color, np.float32)[None, None, :] * (0.65 + 0.7 * lu[..., None])
    rgba = np.concatenate([np.clip(c, 0, 1), a[..., None]], -1)
    return Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA')
