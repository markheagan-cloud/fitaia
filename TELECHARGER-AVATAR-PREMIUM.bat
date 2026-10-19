@echo off
title FITAIA - avatar premium (telechargement)
start "FITAIA premium" conhost.exe powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0premium-download.ps1"
