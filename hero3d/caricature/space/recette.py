"""
Recette de la caricature FITAIA (validée par Mark le 26/10/2026, graine 11) : prompts, tailles, étapes.
Partagée par le serveur local (ComfyUI) et le Space Hugging Face (diffusers). Aucune image ici.
"""
SEED = 11
STEPS = 4
GUIDANCE = 1.0
SIZE = 512
MODELE = 'FLUX.2 klein 4B'
NOMS = ('portrait', 'surpoids', 'actuel', 'athletique')

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
LIMITES = [
    'Caricature générée (illustration) : ressemblance non garantie, à valider par la personne.',
    'Les 3 corps sont des illustrations, pas une prédiction médicale.',
]


def prompts(sex, sheet=None):
    """(prompt du portrait, {corps: prompt}). La fiche ne sert que pour la couleur des cheveux et de la peau, si donnée."""
    sheet = sheet if isinstance(sheet, dict) else {}
    qui = 'woman' if sex == 'f' else 'man'
    pron = 'her' if sex == 'f' else 'his'
    couleur = CHEVEUX.get(str(sheet.get('hairColor', '')).lower(), '')
    style = STYLE.format(
        traits=f'{pron} own eye shape and relaxed gaze, nose, lips and cheeks from the photo',
        cheveux=f'Keep {pron} real hairstyle from the photo{", " + couleur if couleur else ""}, with visible strands, not a solid helmet.',
        barbe='' if sex == 'f' else 'Keep his facial hair exactly as in the photo.',
        peau=PEAU.get(str(sheet.get('skin', '')).lower(), 'Same'))
    portrait = f'Caricature portrait of the {qui} in image 1. {style} Front view, head and shoulders, centered.'
    corps = {k: (f'Same character as image 1, same face, same eyes, same hair, same facial hair, same caricature painting style. '
                 f'Medium shot framed from the top of the head to the waist, whole head fully visible with space above it, '
                 f'front view, {v}. Same red crew-neck t-shirt, plain cream background, warm soft light. {style}')
             for k, v in CORPS.items()}
    return portrait, corps
