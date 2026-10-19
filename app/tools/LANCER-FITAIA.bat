@echo off
title FITAIA
start "FITAIA" conhost.exe powershell -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0fitaia-setup.ps1"
