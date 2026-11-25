"""Sons de FITAIA, 100 % originaux : synthétisés ici (sinusoïdes, enveloppes), aucun échantillon tiers, aucune licence à payer.
Relancer : python3 scripts/make-sounds.py → assets/sounds/*.wav (mono 22 050 Hz 16 bits)."""
import numpy as np, wave, os
SR = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds')

def save(name, x, peak=0.8):
    x = x / max(1e-9, np.abs(x).max()) * peak
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())

def t(d): return np.arange(int(SR * d)) / SR
def note(f, d, a=0.005, r=None, harm=(1, 0.3, 0.1)):
    x = t(d); r = r or d * 0.9
    env = np.minimum(1, x / a) * np.exp(-x / (r / 4))
    return sum(h * np.sin(2 * np.pi * f * (i + 1) * x) for i, h in enumerate(harm)) * env
def seq(parts, gap):
    n = int(SR * (gap * (len(parts) - 1))) + max(len(p) for p in parts)
    out = np.zeros(n)
    for i, p in enumerate(parts):
        s = int(SR * gap * i); out[s:s + len(p)] += p
    return out
N = lambda semi: 440 * 2 ** (semi / 12)

save('tap', note(N(15), 0.07, a=0.002, harm=(1, 0.15)), 0.45)
save('succes', seq([note(N(3), 0.25), note(N(7), 0.25), note(N(10), 0.25), note(N(15), 0.6)], 0.09))
save('pieces', seq([note(N(19), 0.12, harm=(1, 0.5, 0.25)), note(N(24), 0.35, harm=(1, 0.5, 0.25))], 0.07), 0.6)
save('erreur', seq([note(N(-2), 0.18, harm=(1, 0.4)), note(N(-7), 0.3, harm=(1, 0.4))], 0.12), 0.5)
save('rep', note(N(10), 0.12, a=0.002, harm=(1, 0.2)), 0.55)
rev = seq([note(N(s), 0.5) for s in (-9, -5, -2, 3, 7, 10, 15)], 0.11)
save('revelation', seq([rev, sum(note(N(s), 1.6, a=0.02) for s in (3, 7, 10, 15))], 0.75))

# Musique de fond : boucle de 16 temps × 4 mesures à 96 bpm, la mineur 7 → fa maj7 → do → sol (nappe + arpège + grosse caisse douce)
bpm = 96; beat = 60 / bpm; bars = [(-12, (0, 3, 7, 10)), (-16, (0, 4, 7, 11)), (-9, (0, 4, 7, 12)), (-14, (0, 4, 7, 10))]
L = int(SR * beat * 4 * len(bars)); mus = np.zeros(L + SR * 2)
def add(sig, at, g=1.0):
    s = int(SR * at); mus[s:s + len(sig)] += sig * g
for b, (root, ch) in enumerate(bars):
    t0 = b * 4 * beat
    x = t(4 * beat); env = np.minimum(1, x / 0.6) * np.minimum(1, (4 * beat - x) / 0.6)
    add(sum(np.sin(2 * np.pi * N(root + c) * x) + 0.4 * np.sin(2 * np.pi * N(root + c) * 1.003 * x) for c in ch) * env, t0, 0.10)
    add(note(N(root - 12), 4 * beat * 0.95, a=0.02, harm=(1, 0.3)), t0, 0.5)
    for i in range(8):
        add(note(N(root + 12 + ch[(i * 3) % 4]), 0.4, harm=(1, 0.25, 0.08)), t0 + i * beat / 2, 0.22)
    for k in (0, 2.5):
        x = t(0.25); add(np.sin(2 * np.pi * (48 + 70 * np.exp(-x * 30)) * x) * np.exp(-x * 14), t0 + k * beat, 0.7)
mus[:SR * 2] += mus[L:L + SR * 2]  # la queue reboucle sur le début : boucle sans coupure
save('musique', mus[:L], 0.6)
for f in sorted(os.listdir(OUT)): print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'ko')
