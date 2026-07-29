@echo off
setlocal
set "HCOP_INSTALLER=%TEMP%\hcop-jp-instalar-%RANDOM%.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/Marcolyto/HCOP_JP/main/scripts/instalar-desde-github.ps1' -OutFile '%HCOP_INSTALLER%'"
if errorlevel 1 (
  echo No se pudo descargar el instalador desde GitHub.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HCOP_INSTALLER%"
set "HCOP_RESULT=%ERRORLEVEL%"
del "%HCOP_INSTALLER%" >nul 2>nul
if not "%HCOP_RESULT%"=="0" pause
exit /b %HCOP_RESULT%
