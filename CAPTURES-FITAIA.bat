@echo off
title FITAIA - captures App Store
cd /d "%~dp0app"
echo Le serveur FITAIA doit tourner (LANCER-FITAIA) sur http://localhost:8081
set OUT=%~dp0captures-log.txt
echo === Playwright === > "%OUT%"
if not exist node_modules\playwright call npm.cmd install --no-save --no-audit --no-fund playwright@1.47.2 >> "%OUT%" 2>&1
call npx.cmd --yes playwright@1.47.2 install chromium >> "%OUT%" 2>&1
node scripts\captures.js >> "%OUT%" 2>&1
type "%OUT%"
echo.
echo Captures dans app\store\captures\raw - cette fenetre se ferme dans 15 s.
timeout /t 15 >nul
