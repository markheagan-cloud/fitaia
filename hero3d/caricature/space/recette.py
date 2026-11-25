"""
Recette de la caricature FITAIA (graine 11 ; consignes revues le 25/11/2026, à juger par Mark) : prompts, tailles, étapes.
Partagée par le serveur local (ComfyUI) et le Space Hugging Face (diffusers). Aucune image ici.
"""
SEED = 11
STEPS = 4
GUIDANCE = 1.0
SIZE = 640
MODELE = 'FLUX.2 klein 4B'
NOMS = ('portrait', 'surpoids', 'actuel', 'athletique')

# Recette du 25/11/2026 (premier vrai test sur Modal) : les longs prompts « the man in image 1 » + description du style
# faisaient ignorer le selfie (visage générique, peau éclaircie). Des consignes courtes, tournées comme une retouche
# (« Redraw this exact man… »), gardent la peau, les cheveux et la barbe de la photo.
PORTRAIT = ('Redraw this exact {qui} as a cool caricature painting: bigger head, small shoulders, soft painted shading, '
            'no black outlines, {couleurs}plain cream background, head and shoulders, front view.')
MEME = 'Same character, same face, same hair, {barbe}same painted caricature style.'
CORPS = {
    'surpoids': 'Show {lui} from head to waist with an overweight body: big round belly, heavy chest, thick arms, rounder '
                'cheeks, red t-shirt. Big head, plain cream background.',
    'actuel': 'Show {lui} from head to waist with an average, slightly soft body, red t-shirt. Big head, plain cream background.',
    'athletique': 'Show {lui} from head to waist with an athletic fit body: broad shoulders, defined chest and arms, flat '
                  'stomach, fitted red t-shirt. Big head, plain cream background.',
}
# Tenues de la boutique (créations FITAIA), portées par le perso de la personne. Clés = identifiants de SKINS côté app.
TENUES = {
    'origine': 'Full body, relaxed standing pose, big head on a small body. {Il} wears the starter outfit: red crew-neck '
               't-shirt, black jogging pants with a lime side stripe, white sneakers. Plain cream background.',
    'cargo': 'Full body, standing confident pose, big head on a small body. {Il} wears a streetwear outfit: olive bomber '
             'jacket with orange lining, black hoodie, sand cargo pants with straps, chunky white sneakers. Soft grey-blue '
             'background.',
    'olive': 'Full body, dynamic walking pose, big head on a small body. {Il} wears a techwear outfit: olive waterproof '
             'shell jacket with taped seams, black utility vest, tapered black pants, trail running shoes, small chest '
             'bag. Deep green background with a soft light halo.',
    'creme': 'Full body, hands in pockets, big head on a small body. {Il} wears an epic designer outfit: cream oversized '
             'varsity jacket with violet sleeves and chenille patches, cream wide pants, violet high-top sneakers, '
             'headphones around the neck. Violet background with a soft glow behind {lui}.',
    'titane': 'Full body, heroic pose, big head on a small body. {Il} wears a legendary futuristic sports suit: brushed '
              'titanium armour plates over a black bodysuit, glowing cyan neon lines, glowing visor pushed up on the '
              'forehead, neon-soled sneakers. Dark blue background with cyan glow behind {lui}.',
    'atelier': 'Full body, arms crossed, big head on a small body. {Il} wears a legendary luxury outfit: black tailored long '
               'coat with gold embroidery, black turtleneck, gold chain, black trousers, black and gold sneakers. Dark '
               'background with golden light rays behind {lui}.',
}
CHEVEUX = {'noir': 'black', 'brun': 'dark brown', 'chatain': 'brown', 'blond': 'blond', 'roux': 'red', 'gris': 'grey', 'blanc': 'white'}
PEAU = {'s1': 'very fair', 's2': 'fair', 's3': 'light', 's4': 'warm medium brown', 's5': 'warm brown', 's6': 'deep brown',
        's7': 'dark brown', 's8': 'very dark brown'}
LIMITES = [
    'Caricature générée (illustration) : ressemblance non garantie, à valider par la personne.',
    'Les 3 corps sont des illustrations, pas une prédiction médicale.',
]


def _mots(sex):
    f = sex == 'f'
    return dict(qui='woman' if f else 'man', lui='her' if f else 'him', Il='She' if f else 'He',
                barbe='' if f else 'same beard, ')


def prompts(sex, sheet=None):
    """(prompt du portrait, {corps: prompt}). La fiche ne sert que pour la couleur des cheveux et de la peau, si donnée."""
    sheet = sheet if isinstance(sheet, dict) else {}
    m = _mots(sex)
    cheveux = CHEVEUX.get(str(sheet.get('hairColor', '')).lower(), '')
    peau = PEAU.get(str(sheet.get('skin', '')).lower(), '')
    couleurs = ''.join([f'{peau} skin, ' if peau else '', f'{cheveux} hair, ' if cheveux else ''])
    portrait = PORTRAIT.format(qui=m['qui'], couleurs=couleurs)
    meme = MEME.format(barbe=m['barbe'])
    return portrait, {k: meme + ' ' + v.format(**m) for k, v in CORPS.items()}


def prompts_tenues(sex):
    """{tenue: prompt} : chaque tenue de la boutique portée par le perso (image de référence = son portrait)."""
    m = _mots(sex)
    meme = MEME.format(barbe=m['barbe'])
    return {k: meme + ' ' + v.format(**m) for k, v in TENUES.items()}
