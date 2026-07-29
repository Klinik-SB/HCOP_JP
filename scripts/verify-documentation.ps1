param(
  [string]$BaseUrl = "http://127.0.0.1:5180"
)

$ErrorActionPreference = "Stop"
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$documentationFiles = @(
  Get-Item -LiteralPath (Join-Path $RepositoryRoot "README.md")
  Get-ChildItem -LiteralPath (Join-Path $RepositoryRoot "docs") -Filter "*.md" -Recurse
)
$brokenLinks = [System.Collections.Generic.List[string]]::new()

foreach ($file in $documentationFiles) {
  $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
  foreach ($match in [regex]::Matches($content, '\[[^\]]+\]\((?<target>[^)]+)\)')) {
    $target = $match.Groups["target"].Value.Trim().Trim("<", ">")
    if ($target -match '^(?:https?://|mailto:|#|/)') { continue }
    $pathPart = ($target -split '#', 2)[0]
    if ([string]::IsNullOrWhiteSpace($pathPart)) { continue }
    $decoded = [System.Uri]::UnescapeDataString($pathPart)
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $file.DirectoryName $decoded))
    if (-not (Test-Path -LiteralPath $candidate)) {
      $relativeFile = $file.FullName.Substring($RepositoryRoot.Length + 1)
      $brokenLinks.Add("$relativeFile -> $target")
    }
  }
}

if ($brokenLinks.Count -gt 0) {
  throw "Enlaces Markdown rotos:`n$($brokenLinks -join "`n")"
}

$base = $BaseUrl.TrimEnd("/")
$publicPaths = @(
  "/actuator/health",
  "/docs/",
  "/docs/manual-usuario.html",
  "/docs/referencia-tecnica.html",
  "/docs/api-endpoints.html",
  "/swagger-ui.html",
  "/v3/api-docs/hcop-jp-completa"
)
foreach ($path in $publicPaths) {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "$base$path" -TimeoutSec 20
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
    throw "$path respondió HTTP $($response.StatusCode)"
  }
}

$webClient = [System.Net.WebClient]::new()
$webClient.Encoding = [System.Text.Encoding]::UTF8
try {
  $openApi = ($webClient.DownloadString("$base/v3/api-docs/hcop-jp-completa") |
      ConvertFrom-Json)
} finally {
  $webClient.Dispose()
}

$operations = @()
foreach ($pathProperty in $openApi.paths.PSObject.Properties) {
  foreach ($methodProperty in $pathProperty.Value.PSObject.Properties) {
    if ($methodProperty.Name -notin @("get", "post", "put", "patch", "delete")) { continue }
    $operations += $methodProperty.Value
  }
}

if ($operations.Count -eq 0) { throw "OpenAPI no contiene operaciones." }
foreach ($operation in $operations) {
  if ([string]::IsNullOrWhiteSpace([string]$operation.summary)) {
    throw "Existe una operación OpenAPI sin resumen."
  }
  if ([string]::IsNullOrWhiteSpace([string]$operation.description)) {
    throw "Existe una operación OpenAPI sin descripción."
  }
  if ($null -eq $operation.PSObject.Properties["x-hcop-controller"]) {
    throw "Existe una operación OpenAPI sin controlador MVC documentado."
  }
  if ($null -eq $operation.PSObject.Properties["x-hcop-permission"]) {
    throw "Existe una operación OpenAPI sin permiso documentado."
  }
}

[pscustomobject]@{
  ok = $true
  markdownFiles = $documentationFiles.Count
  checkedPublicUrls = $publicPaths.Count
  openApiOperations = $operations.Count
} | ConvertTo-Json -Compress
