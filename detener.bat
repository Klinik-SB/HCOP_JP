@echo off
setlocal
cd /d "%~dp0"
docker compose down
if errorlevel 1 (
  echo No se pudo detener HCOP JP. Verifique Docker Desktop.
  pause
  exit /b 1
)
echo HCOP JP fue detenido.
endlocal
