@echo off
chcp 65001 >nul
rem FITAIA - serveur "selfie -> avatar 3D" (port 8790). Laisse cette fenetre ouverte pendant les essais.
set FITAIA=%~dp0
set PYTHONIOENCODING=utf-8
"%FITAIA%tools\blender-4.5.14-windows-x64\4.5\python\bin\python.exe" "%FITAIA%hero3d\human\code\serve_avatar.py" --port 8790
pause
