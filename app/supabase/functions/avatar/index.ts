// Supabase Edge Function « avatar » — dessine le perso FITAIA à partir d'un selfie et/ou d'une fiche de personnage.
// Déploiement : `supabase functions deploy avatar` puis secrets (voir supabase/README.md).
// Fournisseurs de dessin (secret AVATAR_PROVIDER) :
//   - "hf"     (défaut) : Qwen-Image-Edit (Apache 2.0) sur TON Space Hugging Face ZeroGPU — gratuit. Secrets : HF_SPACE, HF_TOKEN.
//   - "openai"           : gpt-image-1 — payant (~0,04 $/image). Secret : OPENAI_API_KEY.
// Le selfie n'est jamais écrit sur disque ni en base : il ne vit que dans la requête.
import { createClient } from 'npm:@supabase/supabase-js@2';

const PROVIDER = (Deno.env.get('AVATAR_PROVIDER') ?? 'hf').toLowerCase();
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const HF_SPACE = Deno.env.get('HF_SPACE'); // ex. "monpseudo/fitaia-avatar"
const HF_TOKEN = Deno.env.get('HF_TOKEN'); // jeton "read" du compte qui possède le Space (quota GPU de ce compte)
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'avatars';
const SIGNED_TTL = 60 * 60 * 24 * 30;

/** Style FITAIA (voir FITAIA-decisions-techniques.md, « Direction visuelle »). */
const STYLE = (outfit: string) =>
  `Full-body illustrated character in semi-realistic digital painting style, standing, front view, friendly confident expression, ` +
  `same face, skin tone, hair and facial features as the reference photo. Athleisure outfit "${outfit}": charcoal and cream sportswear with lime-green (#C8F03C) accents. ` +
  `Plain light grey background with subtle geometric shapes. Soft studio light. No text, no logo, no watermark. Portrait orientation 4:5.`;

const OUTFITS: Record<string, string> = {
  origine: 'cream sleeveless top, charcoal joggers with lime zips, white sneakers',
  cargo: 'black sports bra, black cargo pants, cream hoodie tied at the waist',
  olive: 'cream long-sleeve top with lime seams, black joggers',
  creme: 'cream open jacket over charcoal sports set',
  titane: 'charcoal tank top, cream cargo pants with lime details',
  atelier: 'black sports top, black cargo pants with lime accents, cream hoodie tied at the waist',
};

// Limitation simple : 5 dessins / heure / IP (protège le quota GPU / budget API).
const hits = new Map<string, number[]>();
function allowed(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (arr.length >= 5) return false;
  arr.push(now);
  hits.set(ip, arr);
  return true;
}

async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

class DrawError extends Error {
  constructor(msg: string, public status = 502) {
    super(msg);
  }
}

// ── Fournisseur 1 : Hugging Face Space (Gradio API, voir hf-space/app.py) ────────────────────────────────
async function drawWithHF(selfieB64: string | null, prompt: string): Promise<Uint8Array> {
  if (!HF_SPACE || !HF_TOKEN) throw new DrawError('HF_SPACE / HF_TOKEN manquants côté serveur', 500);
  const base = `https://${HF_SPACE.replace('/', '-').toLowerCase()}.hf.space/gradio_api/call/draw`;
  const headers = { Authorization: `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/json' };
  const start = await fetch(base, { method: 'POST', headers, body: JSON.stringify({ data: [selfieB64 ?? '', prompt, 7] }) });
  if (!start.ok) throw new DrawError('Space injoignable (' + start.status + ')' + (start.status === 503 ? ' — il démarre, réessaie dans une minute' : ''));
  const { event_id } = (await start.json()) as { event_id?: string };
  if (!event_id) throw new DrawError('Space : pas d’identifiant de tâche');
  const stream = await fetch(`${base}/${event_id}`, { headers: { Authorization: `Bearer ${HF_TOKEN}` } });
  if (!stream.ok) throw new DrawError('Space : flux refusé (' + stream.status + ')');
  const text = await stream.text(); // SSE : "event: complete\ndata: [\"<b64>\"]"
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('event: error')) throw new DrawError('Space : ' + (lines[i + 1] ?? '').replace(/^data: /, '').slice(0, 200));
    if (lines[i].startsWith('event: complete')) {
      const data = JSON.parse((lines[i + 1] ?? '').replace(/^data: /, '')) as string[];
      const b64 = (data[0] ?? '').replace(/^data:image\/\w+;base64,/, '');
      if (!b64) throw new DrawError('Space : pas d’image renvoyée');
      return fromB64(b64);
    }
  }
  throw new DrawError('Space : réponse incomplète (quota GPU du jour épuisé ?)');
}

// ── Fournisseur 2 : OpenAI gpt-image-1 ────────────────────────────────────────────────────────────────────
async function drawWithOpenAI(selfieB64: string | null, prompt: string): Promise<Uint8Array> {
  if (!OPENAI_API_KEY) throw new DrawError('OPENAI_API_KEY manquante côté serveur', 500);
  let res: Response;
  if (selfieB64) {
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('image', new Blob([fromB64(selfieB64)], { type: 'image/jpeg' }), 'selfie.jpg');
    form.append('prompt', prompt);
    form.append('size', '1024x1536');
    form.append('quality', 'medium');
    form.append('output_format', 'webp');
    res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: form });
  } else {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1536', quality: 'medium', output_format: 'webp', n: 1 }),
    });
  }
  if (!res.ok) throw new DrawError('Génération refusée (' + res.status + ')');
  const out = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = out.data?.[0]?.b64_json;
  if (!b64) throw new DrawError('Pas d’image renvoyée');
  return fromB64(b64);
}

const draw = PROVIDER === 'openai' ? drawWithOpenAI : drawWithHF;

// Crée le bucket privé au premier appel (aucune étape manuelle dans le tableau de bord).
let bucketReady = false;
async function ensureBucket(supabase: ReturnType<typeof createClient>) {
  if (bucketReady) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 5 * 1024 * 1024 });
  bucketReady = true;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const ip = req.headers.get('x-forwarded-for') ?? 'anon';
  if (!allowed(ip)) return new Response('Too many requests', { status: 429 });

  let body: { selfie?: string | null; outfit?: string; sheet?: { key: string; prompt: string } | null };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'JSON invalide' }, { status: 400 });
  }
  const selfie = body.selfie ?? '';
  const outfit = (body.outfit ?? 'origine').toLowerCase();
  const sheet = body.sheet ?? null;
  if (!selfie && !sheet) return Response.json({ error: 'Fiche de personnage ou selfie requis' }, { status: 400 });
  if (selfie && (selfie.length < 1000 || selfie.length > 2_000_000)) return Response.json({ error: 'Selfie trop lourd' }, { status: 400 });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  await ensureBucket(supabase);

  // Cache : même fiche (+ même selfie) + même tenue = même dessin, resservi gratuitement.
  const path = selfie ? `selfies/${await sha(selfie + '|' + (sheet?.key ?? outfit))}.webp` : `sheets/${await sha(sheet!.key)}.webp`;
  const hit = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  if (!hit.error && hit.data) return Response.json({ url: hit.data.signedUrl, outfit, cached: true });

  const prompt = STYLE(OUTFITS[outfit] ?? OUTFITS.origine) + (sheet ? ' Character: ' + sheet.prompt : '');
  let img: Uint8Array;
  try {
    img = await draw(selfie || null, prompt);
  } catch (e) {
    const err = e instanceof DrawError ? e : new DrawError(e instanceof Error ? e.message : 'Dessin impossible');
    return Response.json({ error: err.message }, { status: err.status });
  }

  // Stockage privé + URL signée 30 jours (l'app la met en cache disque).
  const up = await supabase.storage.from(BUCKET).upload(path, img, { contentType: 'image/webp', upsert: true });
  if (up.error) return Response.json({ error: up.error.message }, { status: 500 });
  const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  if (signed.error || !signed.data) return Response.json({ error: 'URL signée impossible' }, { status: 500 });
  return Response.json({ url: signed.data.signedUrl, outfit, cached: false, provider: PROVIDER });
});
