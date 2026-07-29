param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "HCOP_JP"),
  [switch]$NoOpenBrowser
)

$ErrorActionPreference = "Stop"
$RepositoryZip = "https://github.com/Marcolyto/HCOP_JP/archive/refs/heads/main.zip"
$RepositoryArchiveApi = "https://api.github.com/repos/Marcolyto/HCOP_JP/zipball/main"

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

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Ensure-GitHubCli {
  $command = Get-Command gh.exe -ErrorAction SilentlyContinue
  if (-not $command) {
    Write-Step "Instalando GitHub CLI para acceder al repositorio privado"
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
      throw "El repositorio es privado. Instale GitHub CLI desde https://cli.github.com/ y vuelva a intentar."
    }
    winget install --exact --id GitHub.cli --accept-source-agreements --accept-package-agreements |
      Out-Host
    if ($LASTEXITCODE -ne 0) { throw "GitHub CLI no pudo instalarse automáticamente." }
    Refresh-ProcessPath
    $candidate = Join-Path $env:ProgramFiles "GitHub CLI\gh.exe"
    $command = if (Test-Path -LiteralPath $candidate) {
      Get-Item -LiteralPath $candidate
    } else {
      Get-Command gh.exe -ErrorAction SilentlyContinue
    }
  }
  if (-not $command) { throw "GitHub CLI no está disponible." }
  $executable = if ($command.Source) { $command.Source } else { $command.FullName }
  & $executable auth status --hostname github.com *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Step "Iniciando sesión segura en GitHub"
    & $executable auth login --hostname github.com --git-protocol https --web |
      Out-Host
  }
  if ($LASTEXITCODE -ne 0) { throw "No se pudo iniciar sesión en GitHub." }
  return $executable
}

function Get-GitHubAccess {
  $executable = Ensure-GitHubCli
  $token = (& $executable auth token).Trim()
  $username = (& $executable api user --jq ".login").Trim()
  if ([string]::IsNullOrWhiteSpace($token) -or [string]::IsNullOrWhiteSpace($username)) {
    throw "La sesión de GitHub no entregó credenciales válidas."
  }
  return @{ Executable = $executable; Token = $token; Username = $username }
}

function Download-RepositoryArchive([string]$Destination) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $RepositoryZip -OutFile $Destination
    return $null
  } catch {
    Write-Step "El repositorio es privado; validando su acceso a GitHub"
    $access = Get-GitHubAccess
    $headers = @{
      Authorization = "Bearer $($access.Token)"
      Accept = "application/vnd.github+json"
      "X-GitHub-Api-Version" = "2022-11-28"
    }
    Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri $RepositoryArchiveApi -OutFile $Destination
    return $access
  }
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
    Refresh-ProcessPath
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
    $githubAccess = Download-RepositoryArchive $archive
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
    return @{ Version = $destination; GitHubAccess = $githubAccess }
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
$installation = Install-Version $resolvedInstall
$version = $installation.Version
Write-Launchers $resolvedInstall

Write-Step "Descargando y arrancando HCOP JP"
$compose = Join-Path $version "compose.github.yaml"
$environment = Join-Path $resolvedInstall ".env"
if ($installation.GitHubAccess) {
  $installation.GitHubAccess.Token |
    docker login ghcr.io --username $installation.GitHubAccess.Username --password-stdin *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "No se pudo abrir la imagen privada; se construirá desde el código descargado."
  }
}
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
