@echo off
chcp 65001 >nul
rem FITAIA - usine a avatars : vetements simules, avatar GLB, rendu studio, planche de validation.
set FITAIA=%~dp0..\..\..
set PYTHONIOENCODING=utf-8
set BL=%FITAIA%\tools\blender-4.5.14-windows-x64
"%BL%\4.5\python\bin\python.exe" "%~dp0factory.py" --src "%FITAIA%\assets-src" --blender "%BL%\blender.exe" --out "%FITAIA%\hero3d\usine" %*
