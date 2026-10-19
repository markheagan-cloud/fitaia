$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Join-Path $here "app"
Start-Transcript -Path "$here\installation-log.txt" -Force | Out-Null
Write-Host ""
Write-Host "=== FITAIA : installation et lancement ===" -ForegroundColor Cyan
Write-Host "Ne ferme pas cette fenetre. Premiere fois : 5 a 10 minutes." -ForegroundColor Yellow
Write-Host ""

# --- Nettoyage : un seul lanceur FITAIA a la fois ---
# 1) anciens lanceurs (fenetres PowerShell executant ce script), sauf celui-ci
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*fitaia-setup.ps1*' -and $_.ProcessId -ne $PID } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
# 2) anciens serveurs Expo/Metro du projet
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*FITAIA\app*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
# 3) une seule fois : fenetres Windows Terminal orphelines laissees par les premiers essais
if (-not (Test-Path "$here\.terminal-nettoye")) {
  Get-Process WindowsTerminal -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  New-Item -ItemType File -Path "$here\.terminal-nettoye" -Force | Out-Null
}

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}

# [1/5] Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[1/5] Installation de Node.js (clique OUI si Windows demande)..." -ForegroundColor Cyan
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  Refresh-Path
} else { Write-Host "[1/5] Node.js present : $(node -v)" -ForegroundColor Green }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js introuvable. Dis-le a Claude." -ForegroundColor Red
  Stop-Transcript | Out-Null; Read-Host "Entree pour fermer"; exit 1
}

Set-Location $app

# [2/5] Dependances alignees sur le dernier SDK Expo (celui qu'accepte Expo Go)
if (-not (Test-Path "$app\node_modules\expo\package.json")) {
  Write-Host "[2/5] Installation d'Expo (derniere version)..." -ForegroundColor Cyan
  npm install --no-audit --no-fund
  Write-Host "[2/5] Installation des dependances compatibles SDK..." -ForegroundColor Cyan
  npx.cmd --yes expo install expo-router react-native react-dom react-native-web expo-linking expo-constants expo-status-bar expo-splash-screen expo-font expo-blur expo-haptics expo-linear-gradient expo-image expo-image-picker expo-image-manipulator expo-file-system expo-sensors expo-camera react-native-svg react-native-safe-area-context react-native-screens react-native-gesture-handler react-native-reanimated react-native-worklets @react-navigation/native @react-navigation/bottom-tabs zustand @expo-google-fonts/archivo @expo-google-fonts/dm-sans
  npm install --save-dev --no-audit --no-fund typescript @types/react
  npx.cmd --yes expo install --fix
} else {
  Write-Host "[2/5] Mise a jour des dependances (rapide si rien a faire)..." -ForegroundColor Cyan
  npm install --no-audit --no-fund
  npx.cmd --yes expo install --fix
}

# [3/5] Verification TypeScript (vrai test, resultat affiche tel quel)
Write-Host "[3/5] Verification TypeScript..." -ForegroundColor Cyan
$tsOut = & npx.cmd --yes tsc --noEmit --pretty false 2>&1 | Out-String
$tsOut | Out-File -FilePath "$here\typecheck.txt" -Encoding utf8
Write-Host $tsOut
if ($LASTEXITCODE -eq 0) { Write-Host "TypeScript : OK" -ForegroundColor Green } else { Write-Host "TypeScript : erreurs (voir typecheck.txt)" -ForegroundColor Red }

# [4/5] Preflight (lecture seule)
Write-Host "[4/5] Preflight..." -ForegroundColor Cyan
$env:CI = "1"
$pfOut = & node scripts\preflight.js 2>&1 | Out-String
$pfOut | Out-File -FilePath "$here\preflight.txt" -Encoding utf8
Write-Host $pfOut

# [5/5] Lancement
Write-Host ""
Write-Host "[5/5] Demarrage. Un QR code va s'afficher :" -ForegroundColor Cyan
Write-Host "  iPhone : ouvre l'appareil photo, vise le QR, touche la banniere (Expo Go doit etre installe)." -ForegroundColor Yellow
Write-Host "  Si Windows demande l'acces reseau : AUTORISER." -ForegroundColor Yellow
Write-Host "  Si le QR ne marche pas (reseaux differents) : appuie sur  s  puis scanne a nouveau (mode tunnel)." -ForegroundColor Yellow
# Libere le port 8081 si un ancien serveur Expo tourne encore (evite la question "use port 8082 ?")
try { Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } } catch {}
Stop-Transcript | Out-Null
# IMPORTANT : CI=1 (utilise par le preflight) desactive la surveillance des fichiers de Metro -> on le retire
Remove-Item Env:CI -ErrorAction SilentlyContinue
npx.cmd expo start
