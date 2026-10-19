@echo off
title FITAIA - verification
cd /d "%~dp0app"
set CI=1
set OUT=%~dp0verification.txt
call npm install --no-audit --no-fund >nul 2>&1
echo === TypeScript === > "%OUT%"
call npx.cmd --yes tsc --noEmit --pretty false >> "%OUT%" 2>&1
if %ERRORLEVEL%==0 (echo TypeScript : OK >> "%OUT%") else (echo TypeScript : ERREURS code %ERRORLEVEL% >> "%OUT%")
echo. >> "%OUT%"
echo === Lint === >> "%OUT%"
call npx.cmd --yes expo lint >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo === Expo doctor === >> "%OUT%"
call npx.cmd --yes expo-doctor >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo === Preflight === >> "%OUT%"
node scripts\preflight.js >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo === FIN === >> "%OUT%"
type "%OUT%"
echo.
echo Resultat ecrit dans verification.txt - cette fenetre se ferme dans 20 s.
timeout /t 20 >nul
