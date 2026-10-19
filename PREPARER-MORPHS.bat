@echo off
title FITAIA - preparation des morphs
set SRC=%~dp0assets-src\mpfb2\mpfb2-master\src\mpfb\data
robocopy "%SRC%\targets" "%~dp0assets-src\mh\targets" /E /NFL /NDL /NJH /NJS >nul
robocopy "%SRC%\rigs\standard" "%~dp0assets-src\mh\rigs" /E /NFL /NDL /NJH /NJS >nul
robocopy "%SRC%\3dobjs" "%~dp0assets-src\mh\3dobjs" /E /NFL /NDL /NJH /NJS >nul
robocopy "%SRC%\poses" "%~dp0assets-src\mh\poses" /E /NFL /NDL /NJH /NJS >nul
echo OK > "%~dp0assets-src\mh\copie-ok.txt"
