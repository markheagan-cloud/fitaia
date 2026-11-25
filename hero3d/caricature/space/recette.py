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
# Style validé par Mark le 25/11/2026 sur la version test (4) (« c'est parfait ») : ne pas le changer sans son accord.
PORTRAIT = ('Redraw this exact {qui} as a cool caricature painting: bigger head, small shoulders, soft painted shading, '
            'no black outlines, {couleurs}plain cream background, head and shoulders, front view.')
MEME = 'Same character, same face, same hair, {barbe}same painted caricature style, soft coloured edges, no black outlines.'
CORPS = {
    'surpoids': 'Show {lui} from head to waist with an overweight body: big round belly, heavy chest, thick arms, rounder '
                'cheeks, red t-shirt. Big head, plain cream background.',
    'actuel': 'Show {lui} from head to waist with {silhouette}, red t-shirt. Big head, plain cream background.',
    'athletique': 'Show {lui} from head to waist with an athletic fit body: broad shoulders, defined chest and arms, flat '
                  'stomach, fitted red t-shirt. Big head, plain cream background.',
}
# Tenues de la boutique (créations FITAIA), portées par le perso de la personne. Clés = identifiants de SKINS côté app.
TENUES = {
    'origine': 'Full body, relaxed standing pose, very big head, one third of the figure, on a small body. {Il} wears the starter outfit: red crew-neck '
               't-shirt, black jogging pants with a lime side stripe, white sneakers. Plain cream background.',
    'cargo': 'Full body, relaxed confident pose, very big head, one third of the figure, on a small body. {Il} wears a Florida '
             'street outfit: open short-sleeve shirt with a pink and teal palm-leaf print over a white tank top, sand cargo '
             'shorts, white sneakers, sunglasses pushed up on the head. Background: pink and orange sunset sky with palm '
             'tree silhouettes.',
    'olive': 'Full body, dynamic walking pose, very big head, one third of the figure, on a small body. {Il} wears a techwear outfit: olive waterproof '
             'shell jacket with taped seams, black utility vest, tapered black pants, trail running shoes, small chest '
             'bag. Deep green background with a soft light halo.',
    'creme': 'Full body, one hand in pocket, very big head, one third of the figure, on a small body. {Il} wears an epic '
             'coastal night outfit: cream linen suit with rolled sleeves over a hot pink t-shirt, white loafers, thin gold '
             'chain. Background: night city skyline with pink and cyan neon glow reflected on wet ground.',
    'titane': 'Full body, heroic pose, very big head, one third of the figure, on a small body. {Il} wears a legendary futuristic sports suit: brushed '
              'titanium armour plates over a black bodysuit, glowing cyan neon lines, glowing visor pushed up on the '
              'forehead, neon-soled sneakers. Dark blue background with cyan glow behind {lui}.',
    'atelier': 'Full body, arms crossed, very big head, one third of the figure, on a small body. {Il} wears a legendary luxury outfit: black tailored long '
               'coat with gold embroidery, black turtleneck, gold chain, black trousers, black and gold sneakers. Dark '
               'background with golden light rays behind {lui}.',
    # Ajout du 25/11/2026 (build 8) : dix tenues de plus, créations FITAIA, aucune marque.
    'sprint': 'Full body, running pose, very big head, one third of the figure, on a small body. {Il} wears a runner outfit: red sleeveless running top, black split running shorts, bright red running shoes, white headband. Background: red athletics track with soft morning light.',
    'dojo': 'Full body, calm fighting stance, very big head, one third of the figure, on a small body. {Il} wears a martial arts training outfit: white karate-style jacket and trousers with a black belt, bare feet. Background: warm wooden dojo with paper walls.',
    'street': 'Full body, hands in hoodie pocket, very big head, one third of the figure, on a small body. {Il} wears a streetwear outfit: oversized graphite grey hoodie, black joggers, chunky white sneakers, black beanie. Background: grey concrete wall with soft lime light.',
    'plage': 'Full body, relaxed pose, very big head, one third of the figure, on a small body. {Il} wears a beach outfit: coral swim shorts with a white wave pattern, open white linen shirt, flip-flops, towel over one shoulder. Background: turquoise sea and white sand under a bright sky.',
    'ring': 'Full body, boxing guard pose, very big head, one third of the figure, on a small body. {Il} wears a boxing outfit: shiny gold boxing shorts with a black waistband, open black satin robe with gold trim, red boxing gloves, black boxing boots. Background: boxing ring ropes with spotlights.',
    'alpin': 'Full body, confident pose, very big head, one third of the figure, on a small body. {Il} wears an epic mountain outfit: ice-blue technical ski jacket with white panels, white ski trousers, ski goggles on the forehead, grey gloves, snow boots. Background: snowy peaks under a clear blue sky.',
    'pilote': 'Full body, helmet under one arm, very big head, one third of the figure, on a small body. {Il} wears an epic racing driver outfit: black racing suit with magenta and cyan neon stripes, racing gloves, racing boots, a plain black helmet under the arm. Background: night race track with blurred neon lights.',
    'samourai': 'Full body, proud stance, very big head, one third of the figure, on a small body. {Il} wears a legendary neon samurai outfit: black and red layered samurai-style armour with glowing magenta edges, wide black trousers, a sheathed sword at the hip. Background: night street with red lanterns and pink neon glow.',
    'astro': 'Full body, heroic pose, very big head, one third of the figure, on a small body. {Il} wears a legendary astronaut outfit: white space suit with lime green glowing panels, helmet held under one arm, lime-soled boots. Background: starry space with a large planet glowing behind {lui}.',
    'royal': 'Full body, arms crossed, very big head, one third of the figure, on a small body. {Il} wears a legendary champion king outfit: deep purple velvet cape with gold trim over a black and gold athletic suit, small gold crown, gold sneakers. Background: dark hall with golden light rays behind {lui}.',
}
# Les six tenues d'origine : ce que reçoit une app qui ne précise pas `only` (builds ≤ 7).
TENUES_BASE = ('origine', 'cargo', 'olive', 'creme', 'titane', 'atelier')
MAX_TENUES_PAR_APPEL = 6
CHEVEUX = {'noir': 'black', 'brun': 'dark brown', 'chatain': 'brown', 'blond': 'blond', 'roux': 'red', 'gris': 'grey', 'blanc': 'white'}
PEAU = {'s1': 'very fair', 's2': 'fair', 's3': 'light', 's4': 'warm medium brown', 's5': 'warm brown', 's6': 'deep brown',
        's7': 'dark brown', 's8': 'very dark brown'}
LIMITES = [
    'Caricature générée (illustration) : ressemblance non garantie, à valider par la personne.',
    'Les 3 corps sont des illustrations, pas une prédiction médicale.',
]


# Silhouette du corps « actuel » et des tenues d'après la taille et le poids du profil (IMC). Illustration, pas une mesure.
SILHOUETTES = [
    (18.5, 'a slim, thin body with narrow shoulders'),
    (23.0, 'a lean, normal body'),
    (27.0, 'an average, slightly soft body'),
    (31.0, 'a heavyset body with a visible belly and thick arms'),
    (36.0, 'an overweight body with a big round belly, heavy chest and thick arms'),
    (999.0, 'a very overweight body with a very large round belly, heavy chest, thick arms and rounder cheeks'),
]


def silhouette(sheet):
    """Description du corps d'après {heightCm, weightKg} ; corps moyen si les mesures manquent ou sont aberrantes."""
    try:
        h, w = float(sheet.get('heightCm')) / 100.0, float(sheet.get('weightKg'))
        if not (1.2 <= h <= 2.3 and 30 <= w <= 300):
            raise ValueError
        imc = w / (h * h)
    except (TypeError, ValueError, AttributeError):
        return 'an average, slightly soft body'
    return next(d for lim, d in SILHOUETTES if imc < lim)


def _mots(sex):
    f = sex == 'f'
    return dict(qui='woman' if f else 'man', lui='her' if f else 'him', Il='She' if f else 'He',
                barbe='' if f else 'same beard, ')


def prompts(sex, sheet=None):
    """(prompt du portrait, {corps: prompt}). Le visage, la peau et les cheveux viennent de la photo seule ; la fiche ne
    sert qu'à la silhouette du corps « actuel » (taille et poids du profil)."""
    sheet = sheet if isinstance(sheet, dict) else {}
    m = _mots(sex)
    portrait = PORTRAIT.format(qui=m['qui'], couleurs='')
    meme = MEME.format(barbe=m['barbe'])
    return portrait, {k: meme + ' ' + v.format(silhouette=silhouette(sheet), **m) for k, v in CORPS.items()}


def prompts_tenues(sex, sheet=None, only=None):
    """{tenue: prompt} : chaque tenue de la boutique portée par le perso (image de référence = son portrait), à sa silhouette."""
    m = _mots(sex)
    meme = MEME.format(barbe=m['barbe'])
    corps = ' ' + m['Il'] + ' has ' + silhouette(sheet if isinstance(sheet, dict) else {}) + '.'
    ids = [k for k in (only or TENUES_BASE) if k in TENUES][:MAX_TENUES_PAR_APPEL]
    return {k: meme + corps + ' ' + TENUES[k].format(**m) for k in ids}
