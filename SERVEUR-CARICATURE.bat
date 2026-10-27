@echo off
chcp 65001 >nul
rem FITAIA - serveur "selfie -> caricature" (port 8791). Laisse cette fenetre ouverte pendant les essais.
rem Prerequis : tools\comfyui (ComfyUI + venv + modeles FLUX.2 klein 4B), voir hero3d\caricature\README.md.
set FITAIA=%~dp0
set PYTHONIOENCODING=utf-8
set CARI=%FITAIA%hero3d\caricature
set COMFY=%FITAIA%tools\comfyui
if not exist "%CARI%\out\_comfy_in" mkdir "%CARI%\out\_comfy_in"
if not exist "%CARI%\out\_comfy_out" mkdir "%CARI%\out\_comfy_out"
rem ComfyUI deja lance sur 8188 ? sinon on le demarre dans une autre fenetre (GTX 1650 : fp32 obligatoire, sinon image noire)
netstat -ano | findstr /C:"127.0.0.1:8188" | findstr LISTENING >nul
if errorlevel 1 (
  start "ComfyUI FITAIA" /D "%COMFY%" "%COMFY%\venv\Scripts\python.exe" ComfyUI\main.py --listen 127.0.0.1 --port 8188 --lowvram --disable-dynamic-vram --disable-pinned-memory --preview-method none --reserve-vram 0.4 --force-fp32 --disable-auto-launch --input-directory "%CARI%\out\_comfy_in" --output-directory "%CARI%\out\_comfy_out"
  echo Demarrage de ComfyUI...
  timeout /t 25 /nobreak >nul
)
"%COMFY%\venv\Scripts\python.exe" "%CARI%\serve_caricature.py" --port 8791
pause
