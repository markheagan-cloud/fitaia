# FITAIA — Configuration automatique du dessin d'avatar (gratuit)
# Fait tout seul : Space Hugging Face (ZeroGPU) + envoi des fichiers + serveur Supabase + réglage de l'app.
# Toi : 2 comptes à créer (liens affichés) et 1 jeton à coller. Rien d'autre.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Join-Path $root 'app'
if (-not (Test-Path (Join-Path $app 'hf-space\app.py'))) { $app = Split-Path -Parent $root }  # lancé depuis app\tools
$space = Join-Path $app 'hf-space'
$log = Join-Path $root 'avatar-setup.txt'
"=== FITAIA avatar setup $(Get-Date) ===" | Out-File $log -Encoding utf8

function Say($t, $c = 'White') { Write-Host $t -ForegroundColor $c; $t | Out-File $log -Append -Encoding utf8 }
function Ask($t) { Write-Host ''; Write-Host $t -ForegroundColor Yellow; return (Read-Host '>').Trim() }
function Pause-OK($t) { Write-Host ''; Write-Host $t -ForegroundColor Yellow; [void](Read-Host 'Appuie sur Entrée quand c''est fait') }

Say '────────────────────────────────────────────────' 'DarkGray'
Say ' FITAIA · dessin d''avatar gratuit (Hugging Face + Supabase)' 'Green'
Say '────────────────────────────────────────────────' 'DarkGray'

# ── 1. Hugging Face ───────────────────────────────────────────────────────────
Say ''
Say 'ÉTAPE 1/3 · Hugging Face (gratuit)' 'Cyan'
Say '  a) Crée un compte : https://huggingface.co/join  (puis confirme l''e-mail)'
Say '  b) Crée un jeton : https://huggingface.co/settings/tokens/new?tokenType=write  → nom "fitaia", type Write → Create → copie-le'
Start-Process 'https://huggingface.co/join'
Pause-OK 'Compte créé et e-mail confirmé ?'
Start-Process 'https://huggingface.co/settings/tokens/new?tokenType=write'
$hfToken = Ask 'Colle ici ton jeton Hugging Face (commence par hf_) :'
if (-not $hfToken.StartsWith('hf_')) { throw 'Jeton invalide (il doit commencer par hf_).' }
$hfHeaders = @{ Authorization = "Bearer $hfToken" }
$who = Invoke-RestMethod -Uri 'https://huggingface.co/api/whoami-v2' -Headers $hfHeaders
$user = $who.name
Say "  ✓ Connecté à Hugging Face : $user" 'Green'

$repo = "$user/fitaia-avatar"
$exists = $true
try { Invoke-RestMethod -Uri "https://huggingface.co/api/spaces/$repo" -Headers $hfHeaders | Out-Null } catch { $exists = $false }
if (-not $exists) {
  $body = @{ name = 'fitaia-avatar'; type = 'space'; private = $true; sdk = 'gradio'; hardware = 'zero-a10g' } | ConvertTo-Json
  try {
    Invoke-RestMethod -Method Post -Uri 'https://huggingface.co/api/repos/create' -Headers $hfHeaders -ContentType 'application/json' -Body $body | Out-Null
    Say "  ✓ Space créé avec ZeroGPU : https://huggingface.co/spaces/$repo" 'Green'
  } catch {
    Say '  ! ZeroGPU refusé (compte trop récent : il faut 30 jours). Je crée le Space en CPU ; tu passeras en ZeroGPU plus tard dans Settings → Hardware.' 'Yellow'
    $body = @{ name = 'fitaia-avatar'; type = 'space'; private = $true; sdk = 'gradio' } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri 'https://huggingface.co/api/repos/create' -Headers $hfHeaders -ContentType 'application/json' -Body $body | Out-Null
    Say "  ✓ Space créé (CPU) : https://huggingface.co/spaces/$repo" 'Green'
  }
} else { Say "  ✓ Space déjà présent : $repo" 'Green' }

# Envoi des 3 fichiers (API commit NDJSON)
$lines = @()
$lines += (@{ key = 'header'; value = @{ summary = 'FITAIA avatar (Qwen-Image-Edit, ZeroGPU)'; description = '' } } | ConvertTo-Json -Compress -Depth 5)
foreach ($f in 'app.py', 'requirements.txt', 'README.md') {
  $bytes = [System.IO.File]::ReadAllBytes((Join-Path $space $f))
  $lines += (@{ key = 'file'; value = @{ path = $f; content = [Convert]::ToBase64String($bytes); encoding = 'base64' } } | ConvertTo-Json -Compress -Depth 5)
}
$ndjson = ($lines -join "`n")
Invoke-RestMethod -Method Post -Uri "https://huggingface.co/api/spaces/$repo/commit/main" -Headers $hfHeaders -ContentType 'application/x-ndjson' -Body ([System.Text.Encoding]::UTF8.GetBytes($ndjson)) | Out-Null
Say '  ✓ Fichiers envoyés : le Space construit le modèle (~10 min la première fois)' 'Green'

# ── 2. Supabase ───────────────────────────────────────────────────────────────
Say ''
Say 'ÉTAPE 2/3 · Supabase (gratuit)' 'Cyan'
Say '  a) Crée un compte : https://supabase.com/dashboard/sign-up'
Say '  b) New project → nom "fitaia", mot de passe (garde-le), région "West EU (Paris)" → Create'
Start-Process 'https://supabase.com/dashboard/sign-up'
Pause-OK 'Projet Supabase créé (attends qu''il soit "Active") ?'

Say '  Connexion de l''outil Supabase (une page s''ouvre : clique sur Autoriser)…'
Push-Location $app
& npx.cmd --yes supabase@latest login
if ($LASTEXITCODE -ne 0) { throw 'Connexion Supabase échouée.' }
$projects = & npx.cmd --yes supabase@latest projects list -o json | ConvertFrom-Json
if (-not $projects) { throw 'Aucun projet Supabase trouvé.' }
$proj = $projects | Where-Object { $_.name -eq 'fitaia' } | Select-Object -First 1
if (-not $proj) { $proj = $projects | Select-Object -First 1 }
$ref = $proj.id
Say "  ✓ Projet : $($proj.name) ($ref)" 'Green'

& npx.cmd --yes supabase@latest secrets set --project-ref $ref "AVATAR_PROVIDER=hf" "HF_SPACE=$repo" "HF_TOKEN=$hfToken"
if ($LASTEXITCODE -ne 0) { throw 'Secrets non enregistrés.' }
Say '  ✓ Secrets enregistrés côté serveur (jamais dans l''app)' 'Green'
& npx.cmd --yes supabase@latest functions deploy avatar --project-ref $ref --no-verify-jwt
if ($LASTEXITCODE -ne 0) { throw 'Déploiement de la fonction échoué.' }
Say '  ✓ Fonction avatar déployée' 'Green'

$keys = & npx.cmd --yes supabase@latest projects api-keys --project-ref $ref -o json | ConvertFrom-Json
$anon = ($keys | Where-Object { $_.name -eq 'anon' } | Select-Object -First 1).api_key
if (-not $anon) { $anon = ($keys | Where-Object { $_.name -like 'sb_publishable*' -or $_.type -eq 'publishable' } | Select-Object -First 1).api_key }
Pop-Location

# ── 3. Réglage de l'app ───────────────────────────────────────────────────────
Say ''
Say 'ÉTAPE 3/3 · Réglage de l''app' 'Cyan'
$envFile = Join-Path $app '.env'
$content = @()
if (Test-Path $envFile) { $content = Get-Content $envFile | Where-Object { $_ -notmatch '^EXPO_PUBLIC_(SUPABASE_URL|SUPABASE_ANON_KEY|AVATAR_ENDPOINT)=' } }
$content += "EXPO_PUBLIC_SUPABASE_URL=https://$ref.supabase.co"
$content += "EXPO_PUBLIC_SUPABASE_ANON_KEY=$anon"
$content += "EXPO_PUBLIC_AVATAR_ENDPOINT=https://$ref.supabase.co/functions/v1/avatar"
$content | Set-Content $envFile -Encoding utf8
Say '  ✓ app\.env écrit (le mode démo disparaît au prochain lancement)' 'Green'

Say ''
Say 'TERMINÉ. Relance LANCER-FITAIA.bat : « Dessiner mon perso » fera un vrai dessin.' 'Green'
Say "Suivi du Space : https://huggingface.co/spaces/$repo  (attends le statut Running)" 'DarkGray'
"OK $repo $ref" | Out-File (Join-Path $root 'avatar-setup-ok.txt') -Encoding utf8
Write-Host ''
[void](Read-Host 'Appuie sur Entrée pour fermer')
