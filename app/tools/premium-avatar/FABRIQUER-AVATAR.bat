@echo off
chcp 65001 >nul
rem FITAIA - usine a avatars (UNE seule chaine : hero3d\human\code) : avatar GLB + morphs, controle du GLB,
rem rendu studio 3 etats x 4 vues, planche, puis copie du GLB valide dans l'app.
rem Le code de ce dossier (tools\premium-avatar) est l'ancienne copie du 4 oct. : il n'est plus utilise.
set FITAIA=%~dp0..\..\..
set PYTHONIOENCODING=utf-8
set BL=%FITAIA%\tools\blender-4.5.14-windows-x64
set CODE=%FITAIA%\hero3d\human\code
set OUT=%FITAIA%\hero3d\usine
"%BL%\4.5\python\bin\python.exe" "%CODE%\factory.py" --src "%FITAIA%\assets-src" --blender "%BL%\blender.exe" --out "%OUT%" %*
if errorlevel 1 exit /b 1
"%BL%\4.5\python\bin\python.exe" "%CODE%\pipeline\validate_glb.py" "%OUT%\avatar.glb" --out "%OUT%\validation.json"
if errorlevel 1 (
  echo GLB refuse : l'app garde l'ancien avatar. Voir %OUT%\validation.json
  exit /b 1
)
copy /Y "%OUT%\avatar.glb" "%FITAIA%\app\src\human-engine\assets\premium-male-01.glb" >nul
copy /Y "%OUT%\avatar.stats.json" "%FITAIA%\app\src\human-engine\assets\premium-male-01.stats.json" >nul
echo GLB valide copie dans l'app : src\human-engine\assets\premium-male-01.glb
