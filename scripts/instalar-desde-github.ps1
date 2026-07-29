param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "HCOP_JP"),
  [switch]$NoOpenBrowser
)

$ErrorActionPreference = "Stop"
$RepositoryZip = "https://github.com/Marcolyto/HCOP_JP/archive/refs/heads/main.zip"
$RawInstaller = "https://raw.githubusercontent.com/Marcolyto/HCOP_JP/main/scripts/instalar-desde-github.ps1"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function New-RandomSecret([int]$Bytes = 36) {
  $buffer = New-Object byte[] $Bytes
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
  ([Convert]::ToBase64String($buffer)).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Wait-Docker {
  Write-Step "Esperando a Docker Desktop"
  $deadline = (Get-Date).AddMinutes(4)
  while ((Get-Date) -lt $deadline) {
    try {
      docker info *> $null
      if ($LASTEXITCODE -eq 0) { return }
    } catch {
    }
    Start-Sleep -Seconds 4
  }
  throw "Docker Desktop no respondió. Ábralo, espere a que indique que está iniciado y vuelva a ejecutar el instalador."
}

function Ensure-Docker {
  $docker = Get-Command docker.exe -ErrorAction SilentlyContinue
  if (-not $docker) {
    Write-Step "Instalando Docker Desktop"
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
      throw "No se encontró Docker ni winget. Instale Docker Desktop desde https://www.docker.com/products/docker-desktop/ y repita."
    }
    winget install --exact --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { throw "Docker Desktop no pudo instalarse automáticamente." }
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
    $dockerBin = Join-Path $env:ProgramFiles "Docker\Docker\resources\bin"
    if (Test-Path -LiteralPath $dockerBin) {
      $env:Path = "$dockerBin;$env:Path"
    }
  }
  try {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { return }
  } catch {
  }
  $desktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
  if (Test-Path -LiteralPath $desktop) {
    Start-Process -FilePath $desktop
  }
  Wait-Docker
}

function Ensure-Environment([string]$Root) {
  $environmentFile = Join-Path $Root ".env"
  if (Test-Path -LiteralPath $environmentFile) { return }
  Write-Step "Creando la configuración inicial"
  $username = Read-Host "Usuario administrador [marcolyto]"
  if ([string]::IsNullOrWhiteSpace($username)) { $username = "marcolyto" }
  $password = Read-Host "Contraseña inicial [colarse2]"
  if ([string]::IsNullOrWhiteSpace($password)) { $password = "colarse2" }
  if ($username -match "[\r\n=#]" -or $password -match "[\r\n=#]") {
    throw "El usuario o la contraseña contienen caracteres no admitidos en el archivo de entorno."
  }
  $port = Read-Host "Puerto web [5180]"
  if ([string]::IsNullOrWhiteSpace($port)) { $port = "5180" }
  if ($port -notmatch "^\d{2,5}$" -or [int]$port -lt 1 -or [int]$port -gt 65535) {
    throw "El puerto no es válido."
  }
  $lines = @(
    "HCOP_PORT=$port",
    "HCOP_DB_NAME=hcop_jp",
    "HCOP_DB_USER=hcop",
    "HCOP_DB_PASSWORD=$(New-RandomSecret 32)",
    "HCOP_BOOTSTRAP_USERNAME=$username",
    "HCOP_BOOTSTRAP_PASSWORD=$password",
    "HCOP_BOOTSTRAP_SECOND_USERNAME=marcolyto2",
    "HCOP_QR_SECRET=$(New-RandomSecret 48)",
    "HCOP_ENCRYPTION_SECRET=$(New-RandomSecret 48)",
    "HCOP_PUBLIC_BASE_URL=http://localhost:$port"
  )
  [System.IO.File]::WriteAllLines($environmentFile, $lines, (New-Object System.Text.UTF8Encoding($false)))
}

function Install-Version([string]$Root) {
  Write-Step "Descargando la versión más reciente desde GitHub"
  $temporary = Join-Path ([System.IO.Path]::GetTempPath()) ("hcop-jp-" + [Guid]::NewGuid().ToString("N"))
  $archive = "$temporary.zip"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $RepositoryZip -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath $temporary -Force
    $source = Get-ChildItem -LiteralPath $temporary -Directory |
      Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "compose.github.yaml") } |
      Select-Object -First 1
    if (-not $source) { throw "El paquete descargado no contiene HCOP JP." }
    $versionName = (Get-Date).ToString("yyyyMMdd-HHmmss")
    $versions = Join-Path $Root "versions"
    $destination = Join-Path $versions $versionName
    New-Item -ItemType Directory -Path $versions -Force | Out-Null
    Copy-Item -LiteralPath $source.FullName -Destination $destination -Recurse
    [System.IO.File]::WriteAllText((Join-Path $Root "current.txt"), $destination, (New-Object System.Text.UTF8Encoding($false)))
    Copy-Item -LiteralPath (Join-Path $source.FullName "scripts\instalar-desde-github.ps1") -Destination (Join-Path $Root "instalar-desde-github.ps1") -Force
    return $destination
  } finally {
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
  }
}

function Write-Launchers([string]$Root) {
  $launcher = @"
@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-desde-github.ps1"
if errorlevel 1 pause
endlocal
"@
  [System.IO.File]::WriteAllText((Join-Path $Root "Lanzar HCOP JP.bat"), $launcher, [System.Text.Encoding]::ASCII)
  $stopScript = @'
param([string]$Root)
$ErrorActionPreference = "Stop"
$version = (Get-Content -LiteralPath (Join-Path $Root "current.txt") -Raw).Trim()
$environment = Join-Path $Root ".env"
$publishedCompose = Join-Path $version "compose.github.yaml"
$sourceCompose = Join-Path $version "compose.yaml"
$compose = if (Test-Path -LiteralPath $publishedCompose) { $publishedCompose } else { $sourceCompose }
docker compose --project-name hcop-jp --env-file $environment -f $compose down
if ($LASTEXITCODE -ne 0) { throw "HCOP JP no pudo detenerse." }
'@
  [System.IO.File]::WriteAllText(
    (Join-Path $Root "detener-hcop-jp.ps1"),
    $stopScript,
    (New-Object System.Text.UTF8Encoding($false)))
  $stopper = @"
@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0detener-hcop-jp.ps1" -Root "%~dp0"
if errorlevel 1 pause
endlocal
"@
  [System.IO.File]::WriteAllText((Join-Path $Root "Detener HCOP JP.bat"), $stopper, [System.Text.Encoding]::ASCII)
  try {
    $desktop = [Environment]::GetFolderPath("Desktop")
    $shortcutPath = Join-Path $desktop "HCOP JP.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $Root "Lanzar HCOP JP.bat"
    $shortcut.WorkingDirectory = $Root
    $shortcut.Description = "Actualizar y abrir HCOP JP"
    $shortcut.Save()
  } catch {
    Write-Warning "No se pudo crear el acceso directo; el lanzador quedó en $Root."
  }
}

$resolvedInstall = [System.IO.Path]::GetFullPath($InstallDir)
if ([string]::IsNullOrWhiteSpace($resolvedInstall) -or $resolvedInstall.Length -lt 5) {
  throw "La carpeta de instalación no es válida."
}
New-Item -ItemType Directory -Path $resolvedInstall -Force | Out-Null

Ensure-Docker
Ensure-Environment $resolvedInstall
$version = Install-Version $resolvedInstall
Write-Launchers $resolvedInstall

Write-Step "Descargando y arrancando HCOP JP"
$compose = Join-Path $version "compose.github.yaml"
$environment = Join-Path $resolvedInstall ".env"
docker compose --project-name hcop-jp --env-file $environment -f $compose pull
if ($LASTEXITCODE -ne 0) {
  Write-Warning "La imagen publicada aún no está disponible; se construirá desde el código descargado."
  $compose = Join-Path $version "compose.yaml"
  docker compose --project-name hcop-jp --env-file $environment -f $compose up --build --detach --wait
} else {
  docker compose --project-name hcop-jp --env-file $environment -f $compose up --detach --wait
}
if ($LASTEXITCODE -ne 0) { throw "HCOP JP no pudo iniciarse. Ejecute Docker Desktop y vuelva a intentar." }

$portLine = Get-Content -LiteralPath $environment | Where-Object { $_ -match "^HCOP_PORT=" } | Select-Object -First 1
$port = if ($portLine) { $portLine.Split("=", 2)[1] } else { "5180" }
$url = "http://localhost:$port"
Write-Host ""
Write-Host "HCOP JP quedó instalado y funcionando en $url" -ForegroundColor Green
Write-Host "Swagger / OpenAPI: $url/swagger-ui.html"
Write-Host "El acceso directo 'HCOP JP' quedó en el Escritorio."
if (-not $NoOpenBrowser) { Start-Process $url }
