@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Douyin Audio Mixer
cd /d "%~dp0"

echo.
echo   ============================================
echo     Douyin Audio Mixer  /  Yinpin Hunyin Tai
echo   ============================================
echo.

set "PY="

rem --- 1) portable runtime shipped next to this file
if exist "%~dp0runtime\python\python.exe" set "PY=%~dp0runtime\python\python.exe"

rem --- 2) known local installs
if not defined PY if exist "C:\Python313\python.exe" set "PY=C:\Python313\python.exe"
if not defined PY if exist "C:\Python311\python.exe" set "PY=C:\Python311\python.exe"

rem --- 3) fall back to PATH, skipping the fake WindowsApps stub
if not defined PY (
  for /f "delims=" %%i in ('where python 2^>nul') do (
    set "CAND=%%i"
    echo !CAND! | findstr /i "WindowsApps" >nul
    if errorlevel 1 if not defined PY set "PY=!CAND!"
  )
)

if not defined PY (
  echo   [ERROR] Python not found on this machine.
  echo.
  echo   Install Python 3.9 or newer, then run this file again.
  echo   Or open start.bat and hardcode the path into the PY variable.
  echo.
  pause
  exit /b 1
)

echo   Python : !PY!
echo.

"!PY!" "%~dp0server.py"

echo.
echo   Server stopped.
pause
