$ErrorActionPreference = "Stop"
$baseUrl = if ($env:HCOP_TEST_URL) { $env:HCOP_TEST_URL.TrimEnd("/") } else { "http://127.0.0.1:5180" }
$health = Invoke-RestMethod -Uri "$baseUrl/actuator/health" -Method Get
if ($health.status -ne "UP") {
  throw "El servicio no esta saludable."
}
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{
  username = if ($env:HCOP_BOOTSTRAP_USERNAME) { $env:HCOP_BOOTSTRAP_USERNAME } else { "marcolyto" }
  password = if ($env:HCOP_BOOTSTRAP_PASSWORD) { $env:HCOP_BOOTSTRAP_PASSWORD } else { "colarse2" }
} | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -ContentType "application/json" -Body $loginBody -WebSession $session
if (-not $login.ok) {
  throw "No se pudo iniciar sesion."
}
$status = Invoke-RestMethod -Uri "$baseUrl/api/clinical/status" -Method Get -WebSession $session
if (-not $status.ok) {
  throw "El nucleo clinico no respondio."
}

$pages = @(
  @{ Path = "/configuration/"; Marker = "Centro de configuracion"; Name = "Centro de configuracion" },
  @{ Path = "/protocol-admin/"; Marker = "Administrador de protocolos"; Name = "Administrador de protocolos" },
  @{ Path = "/herramientas/"; Marker = "tool-list"; Name = "Herramientas clinicas" }
)
foreach ($page in $pages) {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl$($page.Path)" -Method Get -WebSession $session
  if ($response.StatusCode -ne 200 -or $response.Content -notmatch $page.Marker) {
    throw "$($page.Name) no esta disponible."
  }
}

$openApi = Invoke-RestMethod -Uri "$baseUrl/v3/api-docs" -Method Get -WebSession $session
if ([string]::IsNullOrWhiteSpace([string]$openApi.openapi) -or $null -eq $openApi.paths) {
  throw "La documentacion OpenAPI no esta disponible."
}

Write-Host "HCOP JP operativo: salud, autenticacion, nucleo clinico, configuracion y OpenAPI verificados."
