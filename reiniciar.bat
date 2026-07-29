@echo off
setlocal
cd /d "%~dp0"
docker compose down
if errorlevel 1 exit /b 1
docker compose up --build -d --wait
if errorlevel 1 (
  echo No se pudo reiniciar HCOP JP. Verifique Docker Desktop.
  pause
  exit /b 1
)
echo HCOP JP fue reiniciado y esta saludable.
endlocal
