"""
FITAIA — régénère la table des portraits sociaux de l'app (src/community/avatars/portraits.ts) à partir des fichiers
présents dans assets/community/portraits/<clé>/{head,bust,full,card}.png.

  python tools/premium-avatar/portraits_table.py [racine du dépôt]

Seule la table générée (entre les marqueurs) change ; l'API du module (PortraitKind, portraitKey, portraitSource,
hasPortraits) reste identique. Un avatar sans fichier n'apparaît pas : l'interface garde son repli (dessin vectoriel).
"""
import os
import re
import sys

KINDS = ('head', 'bust', 'full', 'card')
BEGIN = '// <portraits-usine> (généré par tools/premium-avatar/portraits_table.py — ne pas modifier à la main)'
END = '// </portraits-usine>'


def table(root):
    base = os.path.join(root, 'assets', 'community', 'portraits')
    keys = sorted(k for k in os.listdir(base) if os.path.isdir(os.path.join(base, k))) if os.path.isdir(base) else []
    lines = [BEGIN, 'const PORTRAITS: Record<string, Partial<Record<PortraitKind, ImageSourcePropType>>> = {']
    for k in keys:
        kinds = [kd for kd in KINDS if os.path.exists(os.path.join(base, k, kd + '.png'))]
        if not kinds:
            continue
        lines.append(f"  '{k}': {{")
        for kd in kinds:
            lines.append(f"    {kd}: require('../../../assets/community/portraits/{k}/{kd}.png'),")
        lines.append('  },')
    lines += ['};', END]
    return '\n'.join(lines), keys


def main(root):
    path = os.path.join(root, 'src', 'community', 'avatars', 'portraits.ts')
    src = open(path, encoding='utf-8').read()
    gen, keys = table(root)
    if BEGIN in src:
        src = re.sub(re.escape(BEGIN) + r'.*?' + re.escape(END), lambda m: gen, src, flags=re.S)
    else:
        old = re.search(r'/\*\* Table générée[^\n]*\*/\nconst PORTRAITS[^\n]*= \{\};', src)
        if not old:
            raise SystemExit('table PORTRAITS introuvable dans ' + path)
        src = src[:old.start()] + '/** Table générée : clé d\'avatar → cadrages disponibles (rendus de l\'usine d\'avatars). */\n' + gen + src[old.end():]
    open(path, 'w', encoding='utf-8').write(src)
    print(path, len(keys), 'avatars :', ', '.join(keys))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
