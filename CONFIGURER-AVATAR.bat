@echo off
start "FITAIA avatar" conhost.exe powershell -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0fitaia-avatar-setup.ps1"
