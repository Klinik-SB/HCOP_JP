@echo off
setlocal
cd /d "%~dp0"
where docker >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop no esta instalado o no esta iniciado.
  echo Consulte docs\inicio\WINDOWS.md
  pause
  exit /b 1
)
if exist ".env" (
  docker compose --env-file .env up --build -d --wait
) else (
  docker compose up --build -d --wait
)
if errorlevel 1 (
  echo No se pudo iniciar HCOP JP. Revise Docker Desktop y vuelva a intentar.
  pause
  exit /b 1
)
echo.
echo HCOP JP esta iniciando. Abra http://localhost:5180
echo Usuario inicial: marcolyto
echo Swagger: http://localhost:5180/swagger-ui.html
start "" "http://localhost:5180"
endlocal
