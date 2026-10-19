"""
FITAIA Avatar — Space Hugging Face (ZeroGPU, gratuit).
Dessine le perso FITAIA à partir d'un selfie (identité conservée) et d'une fiche de personnage,
avec Qwen-Image-Edit-2509 (Apache 2.0) accéléré par la LoRA Lightning (8 étapes, ~10 s sur H200).

API (appelée par la fonction Supabase `avatar`) : endpoint "/draw"
  entrées : selfie_b64 (str, JPEG base64, vide = sans selfie), prompt (str), seed (int)
  sortie  : image WebP en base64 (str)
"""
import base64
import io
import os

import gradio as gr
import spaces
import torch
from PIL import Image

MODEL = "Qwen/Qwen-Image-Edit-2509"
LORA_REPO = "lightx2v/Qwen-Image-Lightning"
LORA_FILE = "Qwen-Image-Edit-2509/Qwen-Image-Edit-2509-Lightning-8steps-V1.0-bf16.safetensors"
W, H = 832, 1040  # portrait 4:5, multiple de 16
STEPS = 8

from diffusers import QwenImageEditPlusPipeline  # noqa: E402

pipe = QwenImageEditPlusPipeline.from_pretrained(MODEL, torch_dtype=torch.bfloat16)
try:
    pipe.load_lora_weights(LORA_REPO, weight_name=LORA_FILE)
    pipe.fuse_lora()
    print("LoRA Lightning chargée (8 étapes)")
except Exception as e:  # sans LoRA : 40 étapes, plus lent mais fonctionnel
    print("LoRA Lightning indisponible, mode standard :", e)
    STEPS = 40
pipe.to("cuda")


def _blank() -> Image.Image:
    return Image.new("RGB", (W, H), (230, 228, 223))  # béton FITAIA


def _decode(selfie_b64: str) -> Image.Image:
    raw = base64.b64decode(selfie_b64.split(",")[-1])
    return Image.open(io.BytesIO(raw)).convert("RGB")


@spaces.GPU(duration=90)
def draw(selfie_b64: str, prompt: str, seed: int = 7) -> str:
    """Retourne l'image WebP en base64."""
    has_selfie = bool(selfie_b64) and len(selfie_b64) > 100
    ref = _decode(selfie_b64) if has_selfie else _blank()
    if has_selfie:
        ref.thumbnail((1024, 1024))  # le visage reste lisible, calcul plus léger
    full_prompt = prompt if has_selfie else "Create from scratch on the blank canvas: " + prompt
    g = torch.Generator(device="cuda").manual_seed(int(seed))
    out = pipe(
        image=[ref],
        prompt=full_prompt,
        negative_prompt=" ",
        height=H,
        width=W,
        num_inference_steps=STEPS,
        true_cfg_scale=1.0 if STEPS <= 8 else 4.0,
        generator=g,
        num_images_per_prompt=1,
    ).images[0]
    buf = io.BytesIO()
    out.save(buf, format="WEBP", quality=88)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def preview(selfie: Image.Image | None, prompt: str, seed: int):
    b64 = ""
    if selfie is not None:
        buf = io.BytesIO()
        selfie.convert("RGB").save(buf, format="JPEG", quality=90)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return Image.open(io.BytesIO(base64.b64decode(draw(b64, prompt, seed))))


with gr.Blocks(title="FITAIA Avatar") as demo:
    gr.Markdown("## FITAIA Avatar — Qwen-Image-Edit (Apache 2.0) · ZeroGPU")
    # Endpoint machine (utilisé par l'app) : /draw
    s_in = gr.Textbox(label="selfie_b64", visible=False)
    p_in = gr.Textbox(label="prompt", visible=False)
    seed_in = gr.Number(label="seed", value=7, visible=False)
    s_out = gr.Textbox(label="webp_b64", visible=False)
    gr.Button("draw", visible=False).click(draw, [s_in, p_in, seed_in], s_out, api_name="draw")
    # Démo humaine (pour tester à la main)
    with gr.Row():
        with gr.Column():
            img = gr.Image(label="Selfie (optionnel)", type="pil")
            txt = gr.Textbox(label="Prompt", lines=4, value="Full-body illustrated character in semi-realistic digital painting style, standing, front view, same face as the reference photo, charcoal and cream sportswear with lime-green accents, plain light grey background.")
            sd = gr.Number(label="Seed", value=7)
            btn = gr.Button("Dessiner", variant="primary")
        res = gr.Image(label="Résultat")
    btn.click(preview, [img, txt, sd], res, api_name=False)

demo.queue(max_size=20).launch(auth=None, show_api=True)
