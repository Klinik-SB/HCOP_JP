param(
  [string]$BaseUrl = "http://127.0.0.1:5181",
  [System.Management.Automation.PSCredential]$Credential,
  [string]$Username = "",
  [string]$Password = "",
  [string]$OutputDirectory = "",
  [switch]$AllowAlternateQaPort,
  [switch]$AllowRemoteQa,
  [switch]$NoFailExit
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Assert-QaTarget {
  param([string]$Url)
  $parsed = $null
  if (-not [uri]::TryCreate($Url, [System.UriKind]::Absolute, [ref]$parsed)) {
    throw "BaseUrl no es una URL absoluta valida: $Url"
  }
  if ($parsed.Scheme -notin @("http", "https")) { throw "BaseUrl debe usar http o https." }
  if ($parsed.Port -eq 5180) {
    throw "ABORTADO POR SEGURIDAD: el puerto 5180 es la instancia principal. Este arnes solo puede consultar QA."
  }
  if ($parsed.Port -ne 5181 -and -not $AllowAlternateQaPort) {
    throw "ABORTADO POR SEGURIDAD: use el puerto QA 5181 o confirme otro puerto con -AllowAlternateQaPort."
  }
  if ($parsed.Host -notin @("127.0.0.1", "localhost", "::1") -and -not $AllowRemoteQa) {
    throw "ABORTADO POR SEGURIDAD: el destino no es local. Use -AllowRemoteQa solo para una instancia QA conocida."
  }
}

function Get-Property {
  param([object]$Value, [string]$Name)
  if ($null -eq $Value) { return $null }
  $property = $Value.PSObject.Properties[$Name]
  if ($null -eq $property) { return $null }
  return $property.Value
}

function Require-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Join-QaUrl {
  param([string]$Path)
  return "$($script:QaBaseUrl)$Path"
}

function Invoke-QaJson {
  param(
    [ValidateSet("GET", "POST")][string]$Method = "GET",
    [Parameter(Mandatory = $true)][string]$Path,
    [object]$Body = $null
  )
  if ($Method -ne "GET" -and $Path -ne "/api/auth/login") {
    throw "El arnes no permite mutaciones. Metodo rechazado: $Method $Path"
  }
  $parameters = @{
    Uri = Join-QaUrl $Path
    Method = $Method
    WebSession = $script:WebSession
    Headers = @{ Accept = "application/json" }
    TimeoutSec = 30
  }
  if ($null -ne $Body) {
    $parameters.ContentType = "application/json; charset=utf-8"
    $json = $Body | ConvertTo-Json -Depth 20 -Compress
    $parameters.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
  }
  return Invoke-RestMethod @parameters
}

function Get-QaText {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not $script:AssetCache.ContainsKey($Path)) {
    $response = Invoke-WebRequest -UseBasicParsing -Uri (Join-QaUrl $Path) `
      -WebSession $script:WebSession -TimeoutSec 30
    $script:AssetCache[$Path] = [string]$response.Content
  }
  return [string]$script:AssetCache[$Path]
}

function Get-QaLocalTestText {
  param([Parameter(Mandatory = $true)][string]$Path)
  $projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
  $relativePath = $Path.TrimStart("/", "\").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
  $resolved = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $relativePath))
  if (-not $resolved.StartsWith(
      $projectRoot + [System.IO.Path]::DirectorySeparatorChar,
      [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "La evidencia de prueba debe permanecer dentro del proyecto."
  }
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
    throw "No existe la evidencia de prueba local: $Path"
  }
  return [System.IO.File]::ReadAllText($resolved)
}

function Get-QaAngularSourceText {
  param([Parameter(Mandatory = $true)][string]$Paths)
  $sourcePaths = @($Paths.Split("|", [System.StringSplitOptions]::RemoveEmptyEntries))
  if ($sourcePaths.Count -eq 0) { throw "No se indicaron fuentes Angular para comprobar el contrato." }
  $parts = foreach ($sourcePath in $sourcePaths) {
    $normalized = $sourcePath.Trim()
    if (-not $normalized.StartsWith("/frontend/src/app/", [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "La evidencia Angular debe permanecer dentro de /frontend/src/app/: $normalized"
    }
    Get-QaLocalTestText $normalized
  }
  return [string]::Join("`n", [string[]]$parts)
}

function Test-ObjectProperties {
  param([object]$Value, [string[]]$Names)
  foreach ($name in $Names) {
    if ($null -eq $Value.PSObject.Properties[$name]) { throw "Falta la propiedad '$name'." }
  }
}

function Test-ContainsAll {
  param([string]$Text, [string[]]$Patterns)
  $missing = @()
  foreach ($pattern in $Patterns) {
    if ($Text.IndexOf($pattern, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
      $missing += $pattern
    }
  }
  if ($missing.Count -gt 0) { throw "No se encontraron: $($missing -join ', ')" }
}

function Get-WorkflowIdentity {
  param([object]$Item)
  return @(
    [string](Get-Property $Item "patientId"),
    [string](Get-Property $Item "treatmentId"),
    [string](Get-Property $Item "cycleNumber"),
    [string](Get-Property $Item "applicationDay")
  ) -join "|"
}

function Get-QueueResult {
  param([string]$Path)
  $payload = Invoke-QaJson -Path $Path
  Test-ObjectProperties $payload @("ok", "items", "total")
  Require-True ([bool](Get-Property $payload "ok")) "La cola respondio ok=false."
  return $payload
}

function Get-ProbeValue {
  param([object]$Item, [string]$ProbeField)
  switch ($ProbeField) {
    "patientName" { return [string](Get-Property $Item "patientName") }
    "patientDni" { return [string](Get-Property $Item "patientDni") }
    "medicalRecord" { return [string](Get-Property $Item "medicalRecord") }
    "scheme" { return [string](Get-Property $Item "scheme") }
    "diagnosis" { return [string](Get-Property $Item "diagnosis") }
    "drugScheme" { return [string](Get-Property $Item "drugScheme") }
    "cycleDay" {
      return "ciclo $([int](Get-Property $Item 'cycleNumber')) dia $([int](Get-Property $Item 'applicationDay'))"
    }
    "plannedDateIso" { return [string](Get-Property $Item "plannedDate") }
    "plannedDateLocal" {
      $raw = [string](Get-Property $Item "plannedDate")
      $date = [datetime]::MinValue
      if ([datetime]::TryParse($raw, [ref]$date)) { return $date.ToString("dd/MM/yyyy") }
      return ""
    }
    default { throw "ProbeField desconocido: $ProbeField" }
  }
}

function Test-QueueProbe {
  param([string]$Queue, [string]$ProbeField)
  $baseline = Get-QueueResult "/api/clinical/application-workflows?queue=$Queue"
  $rows = @($baseline.items)
  if ($rows.Count -eq 0) {
    return @{ Status = "NO_DATA"; Evidence = "La cola respondio correctamente, pero no hay aplicaciones QA para comprobar coincidencias." }
  }
  $item = $rows | Where-Object {
    -not [string]::IsNullOrWhiteSpace((Get-ProbeValue $_ $ProbeField))
  } | Select-Object -First 1
  if ($null -eq $item) {
    return @{ Status = "NO_DATA"; Evidence = "Hay aplicaciones QA, pero ninguna tiene valor util en $ProbeField." }
  }
  $probe = Get-ProbeValue $item $ProbeField
  $filtered = Get-QueueResult "/api/clinical/application-workflows?queue=$Queue&q=$([uri]::EscapeDataString($probe))"
  $identity = Get-WorkflowIdentity $item
  # Preserve the collection wrapper when a filter returns exactly one row.
  # Windows PowerShell 5.1 otherwise exposes a scalar without a reliable Count.
  $found = @(@($filtered.items) | Where-Object { (Get-WorkflowIdentity $_) -eq $identity })
  Require-True ($found.Count -gt 0) "La busqueda por '$probe' no devolvio la aplicacion de origen."
  return @{ Status = "PASS"; Evidence = "Consulta real por '$probe': $(@($filtered.items).Count) coincidencia(s)." }
}

function Test-CandidateProbe {
  $baseline = Invoke-QaJson -Path "/api/clinical/infusion-candidates?includeScheduled=false&onlySchedulingEligible=false"
  Test-ObjectProperties $baseline @("ok", "candidates", "total")
  $rows = @($baseline.candidates)
  if ($rows.Count -eq 0) {
    return @{ Status = "NO_DATA"; Evidence = "El endpoint respondio correctamente, pero no hay candidatos QA." }
  }
  $item = $rows | Where-Object {
    -not [string]::IsNullOrWhiteSpace([string](Get-Property $_ "patientName"))
  } | Select-Object -First 1
  if ($null -eq $item) {
    return @{ Status = "NO_DATA"; Evidence = "Los candidatos QA no contienen un nombre util para buscar." }
  }
  $probe = [string](Get-Property $item "patientName")
  $filtered = Invoke-QaJson -Path "/api/clinical/infusion-candidates?q=$([uri]::EscapeDataString($probe))&includeScheduled=false&onlySchedulingEligible=false"
  Test-ObjectProperties $filtered @("ok", "candidates", "total")
  Require-True (@($filtered.candidates).Count -gt 0) "La busqueda del turnero no encontro '$probe'."
  return @{ Status = "PASS"; Evidence = "Busqueda real de candidato por '$probe': $(@($filtered.candidates).Count) resultado(s)." }
}

function Test-QueueOrder {
  param([string]$Queue)
  $today = Get-Date -Format "yyyy-MM-dd"
  $payload = Get-QueueResult "/api/clinical/application-workflows?queue=$Queue&date=$today"
  $dates = @($payload.items) | ForEach-Object {
    $appointment = Get-Property $_ "appointment"
    [string](Get-Property $appointment "scheduledAt")
  } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  if ($dates.Count -lt 2) {
    return @{ Status = "NO_DATA"; Evidence = "La cola de hoy tiene menos de dos turnos; no alcanza para demostrar el orden." }
  }
  $expected = @($dates | Sort-Object)
  Require-True (($dates -join "|") -eq ($expected -join "|")) "La cola no esta ordenada cronologicamente."
  return @{ Status = "PASS"; Evidence = "$($dates.Count) turnos verificados en orden ascendente." }
}

function Test-PharmacyLargeQueueSearch {
  $baselineWatch = [System.Diagnostics.Stopwatch]::StartNew()
  $baseline = Get-QueueResult "/api/clinical/application-workflows?queue=pharmacy"
  $baselineWatch.Stop()
  $rows = @($baseline.items)
  if ($rows.Count -lt 2000) {
    return @{
      Status = "NO_DATA"
      Evidence = "La cola contiene $($rows.Count) filas; FAR-24 requiere la semilla sintetica de 2000."
    }
  }
  Require-True ($baselineWatch.ElapsedMilliseconds -lt 10000) `
    "La cola de 2000 filas demoro $($baselineWatch.ElapsedMilliseconds) ms."

  $target = $rows |
    Where-Object {
      -not [string]::IsNullOrWhiteSpace([string](Get-Property $_ "patientName")) -and
      -not [string]::IsNullOrWhiteSpace([string](Get-Property $_ "patientDni")) -and
      -not [string]::IsNullOrWhiteSpace([string](Get-Property $_ "medicalRecord")) -and
      -not [string]::IsNullOrWhiteSpace([string](Get-Property $_ "plannedDate"))
    } |
    Select-Object -Last 1
  Require-True ($null -ne $target) "No hay una fila completa para medir las cinco busquedas."
  $identity = Get-WorkflowIdentity $target
  $measurements = @()
  foreach ($probeField in @(
    "patientName", "patientDni", "medicalRecord", "cycleDay", "plannedDateLocal"
  )) {
    $probe = Get-ProbeValue $target $probeField
    Require-True (-not [string]::IsNullOrWhiteSpace($probe)) `
      "La fila FAR-24 no tiene valor para $probeField."
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $filtered = Get-QueueResult `
      "/api/clinical/application-workflows?queue=pharmacy&q=$([uri]::EscapeDataString($probe))"
    $watch.Stop()
    $found = @(@($filtered.items) | Where-Object {
      (Get-WorkflowIdentity $_) -eq $identity
    })
    Require-True ($found.Count -gt 0) `
      "La busqueda FAR-24 por $probeField ('$probe') no encontro la fila objetivo."
    Require-True ($watch.ElapsedMilliseconds -lt 10000) `
      "La busqueda FAR-24 por $probeField demoro $($watch.ElapsedMilliseconds) ms."
    $measurements += "$probeField=$($watch.ElapsedMilliseconds)ms"
  }
  return @{
    Status = "PASS"
    Evidence = "2000 filas; carga=$($baselineWatch.ElapsedMilliseconds)ms; $($measurements -join ', ')."
  }
}

function Test-OpenApiOperation {
  param([string]$Path, [string]$Method)
  $pathProperty = $script:OpenApi.paths.PSObject.Properties[$Path]
  Require-True ($null -ne $pathProperty) "Swagger no documenta $Path."
  $operation = $pathProperty.Value.PSObject.Properties[$Method.ToLowerInvariant()]
  Require-True ($null -ne $operation) "Swagger no documenta $Method $Path."
  return "Swagger contiene $($Method.ToUpperInvariant()) $Path."
}

function Test-TreatmentOptionCatalog {
  param([string]$Property, [string[]]$ExpectedLabels)
  $me = Invoke-QaJson -Path "/api/auth/me"
  $patientId = [string](Get-Property $me "activePatientId")
  if ([string]::IsNullOrWhiteSpace($patientId)) {
    $patients = Invoke-QaJson -Path "/api/clinical/patients?q="
    $patientId = [string](Get-Property (@($patients.patients) | Select-Object -First 1) "id")
  }
  if ([string]::IsNullOrWhiteSpace($patientId)) {
    return @{ Status = "NO_DATA"; Evidence = "No hay un paciente QA para consultar las opciones de tratamiento." }
  }
  $payload = Invoke-QaJson -Path "/api/clinical/patients/$([uri]::EscapeDataString($patientId))/treatment-options"
  $options = Get-Property $payload "options"
  $catalog = @(Get-Property $options $Property)
  Require-True ($catalog.Count -gt 0) "El catalogo runtime '$Property' esta vacio."
  $labels = @($catalog | ForEach-Object {
    $label = [string](Get-Property $_ "nombre")
    if ([string]::IsNullOrWhiteSpace($label)) { $label = [string](Get-Property $_ "name") }
    if ([string]::IsNullOrWhiteSpace($label)) { $label = [string](Get-Property $_ "label") }
    $label
  })
  foreach ($expected in $ExpectedLabels) {
    Require-True ($labels -contains $expected) "El catalogo '$Property' no contiene '$expected'. Disponibles: $($labels -join ', ')."
  }
  return @{ Status = "PASS"; Evidence = "Catalogo runtime '$Property': $($labels -join ', ')." }
}

function Add-QaCase {
  param(
    [string]$Id,
    [ValidateSet("Farmacia", "Enfermeria", "Oncologia", "Turnos")][string]$Role,
    [ValidateSet("REAL", "CONTRACT", "MANUAL")][string]$Mode,
    [string]$Title,
    [string]$Expected,
    [string]$Check,
    [string]$Path = "",
    [string]$ProbeField = "",
    [string[]]$Patterns = @(),
    [string]$ManualSteps = ""
  )
  $script:Cases.Add([pscustomobject]@{
    Id = $Id; Role = $Role; Mode = $Mode; Title = $Title; Expected = $Expected
    Check = $Check; Path = $Path; ProbeField = $ProbeField
    Patterns = @($Patterns); ManualSteps = $ManualSteps
  })
}

function Invoke-QaCase {
  param([object]$Case)
  $started = Get-Date
  $status = "PASS"
  $evidence = ""
  try {
    switch ($Case.Check) {
      "queue" {
        $payload = Get-QueueResult $Case.Path
        $evidence = "HTTP real: $([int]$payload.total) fila(s), contrato ok/items/total valido."
      }
      "queue-shape" {
        $payload = Get-QueueResult $Case.Path
        $rows = @($payload.items)
        if ($rows.Count -eq 0) {
          $status = "NO_DATA"; $evidence = "La cola responde, pero no contiene filas QA para validar campos."
        } else {
          Test-ObjectProperties $rows[0] $Case.Patterns
          $evidence = "Primera fila contiene: $($Case.Patterns -join ', ')."
        }
      }
      "queue-probe" {
        $outcome = Test-QueueProbe $Case.Path $Case.ProbeField
        $status = [string]$outcome.Status; $evidence = [string]$outcome.Evidence
      }
      "queue-order" {
        $outcome = Test-QueueOrder $Case.Path
        $status = [string]$outcome.Status; $evidence = [string]$outcome.Evidence
      }
      "candidates" {
        $payload = Invoke-QaJson -Path $Case.Path
        Test-ObjectProperties $payload @("ok", "candidates", "total")
        Require-True ([bool]$payload.ok) "Candidatos respondio ok=false."
        $evidence = "HTTP real: $([int]$payload.total) candidato(s), contrato ok/candidates/total valido."
      }
      "candidate-probe" {
        $outcome = Test-CandidateProbe
        $status = [string]$outcome.Status; $evidence = [string]$outcome.Evidence
      }
      "pharmacy-load-search" {
        $outcome = Test-PharmacyLargeQueueSearch
        $status = [string]$outcome.Status; $evidence = [string]$outcome.Evidence
      }
      "json-shape" {
        $payload = Invoke-QaJson -Path $Case.Path
        Test-ObjectProperties $payload $Case.Patterns
        $evidence = "HTTP real con propiedades: $($Case.Patterns -join ', ')."
      }
      "static" {
        $text = Get-QaText $Case.Path
        Test-ContainsAll $text $Case.Patterns
        $evidence = "Contrato estatico encontrado en $($Case.Path): $($Case.Patterns -join ', ')."
      }
      "angular-source" {
        $text = Get-QaAngularSourceText $Case.Path
        Test-ContainsAll $text $Case.Patterns
        $evidence = "Contrato Angular encontrado en $($Case.Path.Replace('|', ', ')): $($Case.Patterns -join ', ')."
      }
      "test-source" {
        $text = Get-QaLocalTestText $Case.Path
        Test-ContainsAll $text $Case.Patterns
        $evidence = "Prueba automatizada presente en $($Case.Path): $($Case.Patterns -join ', ')."
      }
      "openapi" {
        $parts = $Case.Path.Split("|", 2)
        $evidence = Test-OpenApiOperation $parts[0] $parts[1]
      }
      "treatment-options" {
        $outcome = Test-TreatmentOptionCatalog $Case.Path $Case.Patterns
        $status = [string]$outcome.Status; $evidence = [string]$outcome.Evidence
      }
      "manual" { $status = "MANUAL"; $evidence = $Case.ManualSteps }
      default { throw "Tipo de comprobacion desconocido: $($Case.Check)" }
    }
  } catch {
    $status = "FAIL"; $evidence = $_.Exception.Message
  }
  return [pscustomobject]@{
    id = $Case.Id; role = $Case.Role; mode = $Case.Mode; status = $status
    title = $Case.Title; expected = $Case.Expected; evidence = $evidence
    elapsedMs = [math]::Round(((Get-Date) - $started).TotalMilliseconds)
  }
}

function Escape-MarkdownCell {
  param([object]$Value)
  return ([string]$Value).Replace("|", "\|").Replace("`r", " ").Replace("`n", " ")
}

function Write-QaReports {
  param([object[]]$Results, [string]$Directory)
  if ([string]::IsNullOrWhiteSpace($Directory)) {
    $Directory = Join-Path $PSScriptRoot "..\..\docs\08-auditoria\resultados"
  }
  $resolved = [System.IO.Path]::GetFullPath($Directory)
  [System.IO.Directory]::CreateDirectory($resolved) | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $jsonPath = Join-Path $resolved "hospital-dia-100-casos-$stamp.json"
  $markdownPath = Join-Path $resolved "hospital-dia-100-casos-$stamp.md"
  $summary = [ordered]@{
    total = $Results.Count
    pass = @($Results | Where-Object status -eq "PASS").Count
    fail = @($Results | Where-Object status -eq "FAIL").Count
    noData = @($Results | Where-Object status -eq "NO_DATA").Count
    manual = @($Results | Where-Object status -eq "MANUAL").Count
  }
  $roleSummary = @()
  foreach ($role in @("Farmacia", "Enfermeria", "Oncologia", "Turnos")) {
    $rows = @($Results | Where-Object role -eq $role)
    $roleSummary += [ordered]@{
      role = $role; total = $rows.Count
      pass = @($rows | Where-Object status -eq "PASS").Count
      fail = @($rows | Where-Object status -eq "FAIL").Count
      noData = @($rows | Where-Object status -eq "NO_DATA").Count
      manual = @($rows | Where-Object status -eq "MANUAL").Count
    }
  }
  $report = [ordered]@{
    generatedAt = (Get-Date).ToString("o"); baseUrl = $script:QaBaseUrl
    safety = [ordered]@{
      readOnly = $true; forbiddenPort = 5180; defaultQaPort = 5181
      onlyNonGetRequest = "POST /api/auth/login"
    }
    summary = $summary; roles = $roleSummary; results = $Results
  }
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($jsonPath, ($report | ConvertTo-Json -Depth 20), $utf8)
  # Windows PowerShell 5.1 has an argument binder bug with generic List[T].
  # A native string array avoids it both here and in File.WriteAllLines.
  $lines = @()
  $lines += "# Auditoria Hospital de dia - 100 casos"
  $lines += ""
  $lines += "- Fecha: $($report.generatedAt)"
  $lines += "- Instancia: ``$($script:QaBaseUrl)``"
  $lines += "- Seguridad: solo lectura; el unico POST es el inicio de sesion."
  $lines += "- Total evaluado: **$($summary.total)**"
  $lines += "- PASS: **$($summary.pass)** - FAIL: **$($summary.fail)** - SIN DATOS: **$($summary.noData)** - MANUAL: **$($summary.manual)**"
  $lines += ""
  $lines += "## Resumen por rol"
  $lines += ""
  $lines += "| Rol | Total | PASS | FAIL | Sin datos | Manual |"
  $lines += "|---|---:|---:|---:|---:|---:|"
  foreach ($row in $roleSummary) {
    $lines += "| $($row.role) | $($row.total) | $($row.pass) | $($row.fail) | $($row.noData) | $($row.manual) |"
  }
  $lines += ""
  $lines += "## Resultado detallado"
  $lines += ""
  $lines += "| ID | Rol | Modo | Estado | Caso | Evidencia |"
  $lines += "|---|---|---|---|---|---|"
  foreach ($row in $Results) {
    $lines += "| $(Escape-MarkdownCell $row.id) | $(Escape-MarkdownCell $row.role) | $(Escape-MarkdownCell $row.mode) | $(Escape-MarkdownCell $row.status) | $(Escape-MarkdownCell $row.title) | $(Escape-MarkdownCell $row.evidence) |"
  }
  $lines += ""
  $lines += "## Interpretacion"
  $lines += ""
  $lines += "- **REAL** consulta la aplicacion QA en ejecucion sin cambiar datos."
  $lines += "- **CONTRACT** comprueba que las fuentes Angular actuales o Swagger expongan el control esperado; no consulta archivos legacy retirados."
  $lines += "- **MANUAL** exige interaccion humana segura; nunca se informa como aprobado automaticamente."
  $lines += "- **NO_DATA** indica que el contrato respondio, pero falta semilla QA para demostrar el comportamiento con filas reales."
  [System.IO.File]::WriteAllLines($markdownPath, [string[]]$lines, $utf8)
  return [pscustomobject]@{ Json = $jsonPath; Markdown = $markdownPath; Summary = $summary }
}

Assert-QaTarget $BaseUrl
$script:QaBaseUrl = $BaseUrl.TrimEnd("/")
$script:WebSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$script:AssetCache = @{}
$script:Cases = New-Object System.Collections.Generic.List[object]
if ($null -eq $Credential) {
  if (-not [string]::IsNullOrWhiteSpace($Username) -and
      -not [string]::IsNullOrWhiteSpace($Password)) {
    $securePassword = ConvertTo-SecureString $Password -AsPlainText -Force
    $Credential = New-Object System.Management.Automation.PSCredential($Username, $securePassword)
  } else {
    $Credential = Get-Credential -UserName "marcolyto" -Message "Credenciales de la instancia QA HCOP JP"
  }
}
Require-True ($null -ne $Credential) "Se requieren credenciales de QA."

$health = Invoke-RestMethod -Uri (Join-QaUrl "/actuator/health") -TimeoutSec 20
Require-True ($health.status -eq "UP") "La instancia QA no esta saludable."
$runtime = Invoke-RestMethod -Uri (Join-QaUrl "/api/runtime/status") -TimeoutSec 20
Require-True ($runtime.engine -eq "java-postgresql") "La instancia no informa Java + PostgreSQL."
$login = Invoke-QaJson -Method POST -Path "/api/auth/login" -Body @{
  username = $Credential.UserName
  password = $Credential.GetNetworkCredential().Password
}
Require-True ([bool]$login.authenticated) "No se pudo iniciar sesion en QA."
$script:OpenApi = Invoke-QaJson -Path "/v3/api-docs"

$dayHospitalAngular = "/frontend/src/app/features/day-hospital/day-hospital.component.ts|/frontend/src/app/features/day-hospital/day-hospital.component.html|/frontend/src/app/features/day-hospital/day-hospital-pharmacy.models.ts|/frontend/src/app/features/day-hospital/day-hospital-triage.models.ts"
$schedulerAngular = "/frontend/src/app/features/scheduler/care-scheduler.component.ts|/frontend/src/app/features/scheduler/care-scheduler.component.html|/frontend/src/app/features/scheduler/care-scheduler.models.ts"
$documentsAngular = "/frontend/src/app/features/treatment-documents/treatment-documents.models.ts|/frontend/src/app/features/treatment-documents/treatment-documents.component.ts|/frontend/src/app/features/treatment-documents/treatment-documents.component.html"
$qrAngular = "$schedulerAngular|/frontend/src/app/features/qr/qr-scanner.component.ts|/frontend/src/app/features/qr/qr-scanner.component.html"

# FARMACIA: 25 casos
Add-QaCase "FAR-01" "Farmacia" "REAL" "Abrir cola completa de Farmacia" "Respuesta ok/items/total sin error 500." "queue" "/api/clinical/application-workflows?queue=pharmacy"
Add-QaCase "FAR-02" "Farmacia" "REAL" "Buscar por nombre de paciente" "La fila de origen aparece al buscar su nombre." "queue-probe" "pharmacy" "patientName"
Add-QaCase "FAR-03" "Farmacia" "REAL" "Buscar por DNI" "La fila de origen aparece al buscar su DNI." "queue-probe" "pharmacy" "patientDni"
Add-QaCase "FAR-04" "Farmacia" "REAL" "Buscar por historia clinica" "La fila de origen aparece al buscar su HC." "queue-probe" "pharmacy" "medicalRecord"
Add-QaCase "FAR-05" "Farmacia" "REAL" "Buscar por esquema" "La fila de origen aparece al buscar su esquema." "queue-probe" "pharmacy" "scheme"
Add-QaCase "FAR-06" "Farmacia" "REAL" "Buscar por diagnostico" "La fila de origen aparece al buscar su diagnostico." "queue-probe" "pharmacy" "diagnosis"
Add-QaCase "FAR-07" "Farmacia" "REAL" "Buscar por droga" "La fila de origen aparece al buscar su droga o resumen de drogas." "queue-probe" "pharmacy" "drugScheme"
Add-QaCase "FAR-08" "Farmacia" "REAL" "Buscar por ciclo y dia" "La consulta ciclo N dia N ubica la aplicacion." "queue-probe" "pharmacy" "cycleDay"
Add-QaCase "FAR-09" "Farmacia" "REAL" "Buscar por fecha ISO" "La fecha yyyy-mm-dd ubica la aplicacion." "queue-probe" "pharmacy" "plannedDateIso"
Add-QaCase "FAR-10" "Farmacia" "REAL" "Buscar por fecha local" "La fecha dd/mm/aaaa ubica la aplicacion." "queue-probe" "pharmacy" "plannedDateLocal"
Add-QaCase "FAR-11" "Farmacia" "REAL" "Filtrar quien debe traer medicacion" "El filtro patient_to_bring responde como cola valida." "queue" "/api/clinical/application-workflows?queue=pharmacy&medicationSource=patient_to_bring"
Add-QaCase "FAR-12" "Farmacia" "CONTRACT" "Prioridad temporal visible" "Existen Hoy, proximos 7 dias, proximos 30 dias y todas." "angular-source" $dayHospitalAngular "" @("export type PharmacyTimeScope", "'today'", "'next7'", "'next30'", "'all'", "filterPharmacyQueue")
Add-QaCase "FAR-13" "Farmacia" "CONTRACT" "Filtros de estado completos" "Se distinguen pendiente, rechazada, paciente, centro, proveedor y reserva." "angular-source" $dayHospitalAngular "" @("export type PharmacyQueueFilter", "validation-pending", "validation-rejected", "patient-to-bring", "patient-has-medication", "received-center", "pending-supplier", "reservation-pending", "reserved")
Add-QaCase "FAR-14" "Farmacia" "CONTRACT" "Listado agrupado por fecha" "La tabla inserta cabeceras por fecha con cantidad." "angular-source" $dayHospitalAngular "" @("export function groupPharmacyQueue", "new Map<string, T[]>", "plannedDate", "count: rows.length")
Add-QaCase "FAR-15" "Farmacia" "CONTRACT" "Rechazar una orden inicialmente pendiente" "El modal ofrece Rechazar orden antes de aprobar." "angular-source" $dayHospitalAngular "" @("Rechazar orden", "validatePharmacy(false)", "pharmacyNotes")
Add-QaCase "FAR-16" "Farmacia" "CONTRACT" "Validar o revalidar la orden" "El modal expone validacion y revalidacion segun el estado actual." "angular-source" $dayHospitalAngular "" @("pharmacyPrimaryActionLabel", "'Validar orden'", "'Revalidar orden'", "validatePharmacy(true)")
Add-QaCase "FAR-17" "Farmacia" "CONTRACT" "Procedencias de medicacion no ambiguas" "Se distinguen stock, debe traer, la tiene, recibida y proveedor." "angular-source" $dayHospitalAngular "" @("center_stock", "patient_to_bring", "patient_has_medication", "received_center", "pending_supplier")
Add-QaCase "FAR-18" "Farmacia" "CONTRACT" "Reserva y liberacion de stock documentadas" "Swagger expone el comando de reserva/liberacion." "openapi" "/api/clinical/application-workflows/{patientId}/{treatmentId}/{cycleNumber}/{applicationDay}/stock-reservation|post"
Add-QaCase "FAR-19" "Farmacia" "REAL" "Fila con datos farmaceuticos esenciales" "La cola informa drogas, procedencia, validacion, reserva y fecha." "queue-shape" "/api/clinical/application-workflows?queue=pharmacy" "" @("applicationDrugs", "medicationSource", "pharmacyValidationStatus", "stockReservationStatus", "plannedDate")
Add-QaCase "FAR-20" "Farmacia" "CONTRACT" "Alerta de aprobacion heredada sin traza" "Una validacion migrada sin actor/fecha se marca para revision." "angular-source" $dayHospitalAngular "" @("pharmacyTraceabilityWarning", "pharmacy_validation_approved", "pharmacy_validation_rejected", "pharmacyValidatedAt", "missing.push('actor')", "care-pharmacy-trace-warning")
Add-QaCase "FAR-21" "Farmacia" "CONTRACT" "Historial auditable de la aplicacion" "El modal representa auditTrail con actor y revision." "angular-source" $dayHospitalAngular "" @("workflowAudit(workflow", "auditTrail", "resultingRevision")
Add-QaCase "FAR-22" "Farmacia" "CONTRACT" "Carga incremental para listados extensos" "La interfaz limita y permite cargar 250 filas adicionales." "angular-source" $dayHospitalAngular "" @("pharmacyVisibleLimit", "250", "loadMorePharmacy")
Add-QaCase "FAR-23" "Farmacia" "CONTRACT" "QR por aplicacion disponible en Farmacia" "Cada fila habilitada puede abrir el QR del ciclo y dia." "angular-source" $documentsAngular "" @("'qr'", "documents/qr?cycle=", "applicationDay=")
Add-QaCase "FAR-24" "Farmacia" "REAL" "Encontrar un paciente en una lista de 2000 filas" "Nombre, DNI, HC, ciclo/dia y fecha deben resolverse en menos de 10 segundos." "pharmacy-load-search"
Add-QaCase "FAR-25" "Farmacia" "CONTRACT" "Dos farmaceuticos intentan reservar el mismo stock" "Solo una reserva se consolida; el segundo intento no puede sobre-reservar y la aplicacion se serializa por revision." "test-source" "/src/test/java/ar/com/hexium/hcop/infusion/HospitalDayConcurrencySafetyTest.java" "" @("far25TwoPharmacistsCannotOverReserveTheSameInventoryLot", "far25ApplicationLockSerializesTwoPharmacistsBeforeCheckingRevision", "containsExactlyInAnyOrder(true, false)", "FOR UPDATE OF w")

# ENFERMERIA: 25 casos
Add-QaCase "ENF-01" "Enfermeria" "REAL" "Abrir cola de triaje de hoy" "Respuesta ok/items/total filtrada por la fecha operativa." "queue" "/api/clinical/application-workflows?queue=triage&date=$((Get-Date).ToString('yyyy-MM-dd'))"
Add-QaCase "ENF-02" "Enfermeria" "REAL" "Buscar paciente en triaje" "Nombre de una fila real vuelve a encontrar la aplicacion." "queue-probe" "triage" "patientName"
Add-QaCase "ENF-03" "Enfermeria" "REAL" "Orden cronologico de triaje" "Los pacientes de hoy aparecen por hora de turno." "queue-order" "triage"
Add-QaCase "ENF-04" "Enfermeria" "REAL" "Abrir cola de preparacion" "Respuesta valida para el trabajo esteril." "queue" "/api/clinical/application-workflows?queue=preparation&date=$((Get-Date).ToString('yyyy-MM-dd'))"
Add-QaCase "ENF-05" "Enfermeria" "REAL" "Abrir cola de administracion" "Respuesta valida para sala de hoy." "queue" "/api/clinical/application-workflows?queue=administration&date=$((Get-Date).ToString('yyyy-MM-dd'))"
Add-QaCase "ENF-06" "Enfermeria" "CONTRACT" "Buscador de sala" "Sala permite buscar por paciente, DNI, esquema o sillon." "angular-source" $dayHospitalAngular "" @("view() === 'administration'", "filterOperationalQueue", "item['patientName'], item['patientDni']", "item['scheme']", "appointment['chair']")
Add-QaCase "ENF-07" "Enfermeria" "CONTRACT" "Buscador de triaje" "Triaje permite buscar por paciente, DNI, esquema o sillon." "angular-source" $dayHospitalAngular "" @("view() === 'triage'", "filterOperationalQueue", "item['patientName'], item['patientDni']", "item['scheme']", "appointment['chair']")
Add-QaCase "ENF-08" "Enfermeria" "CONTRACT" "Filtro de triaje" "Se distinguen todos, pendientes, aptos y postergados." "angular-source" $dayHospitalAngular "" @("export type TriageQueueFilter", "'all'", "'pending'", "'passed'", "'failed'", "queueStatusFilter")
Add-QaCase "ENF-09" "Enfermeria" "REAL" "Turno listo para operar hoy" "La fila informa turno, confirmacion y evaluacion clinica." "queue-shape" "/api/clinical/application-workflows?queue=triage&date=$((Get-Date).ToString('yyyy-MM-dd'))" "" @("appointment", "clinicalAuthorizationStatus", "clinicalAssessment")
Add-QaCase "ENF-10" "Enfermeria" "CONTRACT" "Laboratorio pretratamiento" "Fecha, neutrofilos, plaquetas, creatinina y funcion hepatica estan disponibles." "angular-source" $dayHospitalAngular "" @("triageLaboratoryDate", "triageNeutrophils", "triagePlatelets", "triageCreatinine", "triageHepaticFunction")
Add-QaCase "ENF-11" "Enfermeria" "CONTRACT" "Signos vitales obligatorios" "Peso, presion y temperatura forman parte del PASS." "angular-source" $dayHospitalAngular "" @("requiredForPass", "triageWeight()", "triageBloodPressure()", "triageTemperature()")
Add-QaCase "ENF-12" "Enfermeria" "CONTRACT" "Frecuencia cardiaca visible" "El formulario y el payload incluyen heartRate." "angular-source" $dayHospitalAngular "" @("triageHeartRate", "heartRate:")
Add-QaCase "ENF-13" "Enfermeria" "CONTRACT" "Saturacion visible" "El formulario y el payload incluyen oxygenSaturation." "angular-source" $dayHospitalAngular "" @("triageOxygen", "oxygenSaturation:")
Add-QaCase "ENF-14" "Enfermeria" "CONTRACT" "Toxicidad y ECOG" "Se registran ECOG 0-4 y toxicidad 0-5." "angular-source" $dayHospitalAngular "" @("triageEcog", "triageToxicityGrade", 'value="5"')
Add-QaCase "ENF-15" "Enfermeria" "CONTRACT" "Alertas clinicas de seguridad" "Se advierten neutropenia, plaquetopenia, fiebre, hipoxemia y toxicidad." "angular-source" $dayHospitalAngular "" @("triageSafetyAlerts", "neutrophils < 1_000", "platelets < 75_000", "temperature >= 38", "saturation < 92", "toxicity >= 3")
Add-QaCase "ENF-16" "Enfermeria" "CONTRACT" "Override clinico documentado" "Un PASS con alerta exige justificacion de al menos 10 caracteres." "angular-source" $dayHospitalAngular "" @("passRequiresJustification", "alerts.length > 0", "reason.trim().length < 10", "this.triageReason()")
Add-QaCase "ENF-17" "Enfermeria" "CONTRACT" "FAIL con motivo y nueva fecha" "La postergacion registra motivo y fecha propuesta." "angular-source" $dayHospitalAngular "" @("triageReason", "triageRescheduledDate", "submitTriage('FAIL')")
Add-QaCase "ENF-18" "Enfermeria" "CONTRACT" "Revocar un PASS antes de preparar" "Existe accion explicita que exige motivo, revoca el PASS y lo registra como postergacion." "angular-source" $dayHospitalAngular "" @("Revocar PASS", "revokeTriagePass(): void", "this.triageReason().trim().length < 3", "this.submitTriage('FAIL')", "canRevokeTriagePass")
Add-QaCase "ENF-19" "Enfermeria" "CONTRACT" "Trazabilidad de cada mezcla" "Lote, vencimiento, cantidad, diluyente, volumen, concentracion y TTL son obligatorios." "angular-source" $dayHospitalAngular "" @("lot:", "expiryDate:", "quantity:", "diluent:", "finalVolume:", "concentration:", "ttlMinutes:")
Add-QaCase "ENF-20" "Enfermeria" "CONTRACT" "Segundo control de preparacion" "Se declara otro profesional habilitado y la interfaz aclara que la seleccion no reemplaza una cofirma." "angular-source" $dayHospitalAngular "" @("care-preparation-verifier", "preparationVerifiedBy", "Segundo profesional verificador", "no reemplaza su cofirma")
Add-QaCase "ENF-21" "Enfermeria" "CONTRACT" "Mezcla vencida y reinicio" "Swagger expone el descarte/reinicio sin borrar trazabilidad." "openapi" "/api/clinical/application-workflows/{patientId}/{treatmentId}/{cycleNumber}/{applicationDay}/preparation/restart|post"
Add-QaCase "ENF-22" "Enfermeria" "CONTRACT" "Doble chequeo a pie de cama" "Paciente, etiqueta y segundo profesional son controles separados." "angular-source" $dayHospitalAngular "" @("administrationPatientVerified", "administrationLabelVerified", "administrationDoubleCheckBy", "Doble chequeo")
Add-QaCase "ENF-23" "Enfermeria" "CONTRACT" "Inicio y cierre reales" "Se registran horas, dosis real, reaccion y observacion." "angular-source" $dayHospitalAngular "" @("startedAt:", "completedAt:", "actualDose:", "reactionOccurred:", "observation:")
Add-QaCase "ENF-24" "Enfermeria" "CONTRACT" "QR como control de identidad" "Sala permite leer el QR y abrir la ficha operativa canonica." "angular-source" $qrAngular "" @("app-qr-scanner", "requestAdministration", "openQrAdministration", "qrWorkflowRequest")
Add-QaCase "ENF-25" "Enfermeria" "CONTRACT" "Reaccion aguda o administracion parcial" "Debe poder detener, documentar droga/dosis parcial, medidas y escalar sin cerrar todo como completado." "test-source" "/scripts/integration-test.ps1" "" @("La prueba de seguridad requiere un protocolo multidroga", 'administration/interrupt', 'actualDose = $partialDose', "actualDoseAtInterruption", "interruptionPending", 'administration/resolve')

# ONCOLOGIA: 25 casos
Add-QaCase "ONC-01" "Oncologia" "CONTRACT" "Nuevo tratamiento es el primer paso" "La primera pestana del Hospital de dia es Nuevo tratamiento." "angular-source" $schedulerAngular "" @("activeMode() === 'new-treatment'", "selectMode('new-treatment')", "Nuevo tratamiento")
Add-QaCase "ONC-02" "Oncologia" "CONTRACT" "Contexto de paciente activo" "El modal distingue claramente paciente activo o ausencia de paciente." "angular-source" $dayHospitalAngular "" @("care-new-treatment-patient-context", "activePatient()", "No hay un paciente activo")
Add-QaCase "ONC-03" "Oncologia" "CONTRACT" "Diagnostico obligatorio" "El alta de tratamiento exige elegir un diagnostico guardado." "angular-source" $dayHospitalAngular "" @('data-new-treatment-field="diagnosis"', "treatmentDiagnosisId", "!this.treatmentDiagnosisId()")
Add-QaCase "ONC-04" "Oncologia" "CONTRACT" "Caracter terapeutico obligatorio" "El catalogo runtime ofrece curativo, adyuvante, neoadyuvante y paliativo." "treatment-options" "characters" "" @("Curativo", "Adyuvante", "Neoadyuvante", "Paliativo")
Add-QaCase "ONC-05" "Oncologia" "CONTRACT" "Tipo oncologico obligatorio" "El catalogo runtime ofrece quimioterapia, inmunoterapia, terapia dirigida y hormonoterapia." "treatment-options" "treatmentTypes" "" @("Quimioterapia", "Inmunoterapia", "Terapia dirigida", "Hormonoterapia")
Add-QaCase "ONC-06" "Oncologia" "CONTRACT" "Selector de esquema" "El formulario selecciona esquema, no estadio." "angular-source" $dayHospitalAngular "" @('data-new-treatment-field="scheme"', "Seleccionar protocolo", "treatmentSchemeId")
Add-QaCase "ONC-07" "Oncologia" "REAL" "Catalogo de protocolos accesible" "El catalogo responde sin modificar configuracion." "json-shape" "/api/clinical/protocols" "" @("ok")
Add-QaCase "ONC-08" "Oncologia" "REAL" "Catalogo de esquemas prescribibles" "Los esquemas disponibles responden desde la base local." "json-shape" "/api/clinical/schemes" "" @("ok")
Add-QaCase "ONC-09" "Oncologia" "CONTRACT" "Opciones por paciente documentadas" "Swagger expone diagnosticos y esquemas elegibles." "openapi" "/api/clinical/patients/{patientId}/treatment-options|get"
Add-QaCase "ONC-10" "Oncologia" "CONTRACT" "Requisitos del esquema documentados" "Swagger expone los requisitos previos por esquema." "openapi" "/api/clinical/patients/{patientId}/treatment-requirements/{schemeId}|get"
Add-QaCase "ONC-11" "Oncologia" "CONTRACT" "Incompatibilidad diagnostico-protocolo" "La excepcion exige confirmacion y motivo clinico." "angular-source" $dayHospitalAngular "" @("treatmentMismatchConfirmed", "treatmentMismatchReason", "al menos 10 caracteres")
Add-QaCase "ONC-12" "Oncologia" "CONTRACT" "Cantidad de ciclos acotada" "La UI de prescripcion admite 1 a 50 ciclos; el backend conserva compatibilidad historica hasta 500." "angular-source" $dayHospitalAngular "" @('data-new-treatment-field="cycles"', 'min="1"', 'max="50"', "TREATMENT_UI_MAX_CYCLES")
Add-QaCase "ONC-13" "Oncologia" "CONTRACT" "Ciclo inicial explicito" "Se puede iniciar o reanudar desde un numero de ciclo valido." "angular-source" $dayHospitalAngular "" @('data-new-treatment-field="initialCycle"', "treatmentInitialCycle", "cicloInicial:")
Add-QaCase "ONC-14" "Oncologia" "CONTRACT" "Fecha del primer ciclo" "La fecha es obligatoria y alimenta la proyeccion." "angular-source" $dayHospitalAngular "" @('data-new-treatment-field="firstCycleDate"', "treatmentFirstCycleDate", "fechaPrimerCiclo:")
Add-QaCase "ONC-15" "Oncologia" "CONTRACT" "Proyeccion previa de ciclos" "Antes de guardar se muestran fechas, intervalos y duraciones calculadas." "angular-source" $dayHospitalAngular "" @("data-new-treatment-projection", "treatmentProjection()", "TREATMENT_PROJECTION_LIMIT", "row.intervalLabel", "row.durationLabel", "estimatedDurationMinutes")
Add-QaCase "ONC-16" "Oncologia" "CONTRACT" "Estado de consentimiento" "Pendiente, firmado o no requerido son opciones explicitas." "angular-source" $dayHospitalAngular "" @("treatmentConsentOptions", "treatmentOptions()['consentStates']", "estadoConsentimiento:")
Add-QaCase "ONC-17" "Oncologia" "CONTRACT" "Requisitos confirmados antes de guardar" "Los datos dinamicos del protocolo requieren confirmacion." "angular-source" $dayHospitalAngular "" @("treatmentRequirementsConfirmed", 'data-new-treatment-field="requirements"', "Confirme los requisitos")
Add-QaCase "ONC-18" "Oncologia" "REAL" "Aplicacion conserva drogas del dia" "La cola informa applicationDrugs, ciclo y dia." "queue-shape" "/api/clinical/application-workflows?queue=pharmacy" "" @("applicationDrugs", "cycleNumber", "applicationDay")
Add-QaCase "ONC-19" "Oncologia" "REAL" "Aplicaciones reales por ciclo y dia" "Cada fila incluye fecha prevista, duracion y fuente del calculo." "queue-shape" "/api/clinical/application-workflows?queue=pharmacy" "" @("plannedDate", "durationMinutes", "durationSource", "totalCycles")
Add-QaCase "ONC-20" "Oncologia" "CONTRACT" "Alta y listado de tratamientos" "Swagger documenta GET y POST de tratamientos del paciente." "openapi" "/api/clinical/patients/{patientId}/treatments|post"
Add-QaCase "ONC-21" "Oncologia" "CONTRACT" "Detalle ciclo-dia-aplicacion" "Swagger expone el detalle completo del tratamiento." "openapi" "/api/clinical/patients/{patientId}/treatments/{treatmentId}/detail|get"
Add-QaCase "ONC-22" "Oncologia" "CONTRACT" "Suspension documentada" "Swagger expone la suspension del tratamiento." "openapi" "/api/clinical/treatments/{patientId}/{treatmentId}/suspend|post"
Add-QaCase "ONC-23" "Oncologia" "CONTRACT" "Reanudacion documentada" "Swagger expone la reanudacion desde un ciclo coherente." "openapi" "/api/clinical/treatments/{patientId}/{treatmentId}/resume|post"
Add-QaCase "ONC-24" "Oncologia" "CONTRACT" "Evolucion clinica al prescribir" "El frontend envia el tratamiento completo y recarga la historia con la evolucion creada por el servidor." "angular-source" $dayHospitalAngular "" @("createTreatment()", "fechaPrimerCiclo", "cantidadCiclos", "workspace.load(patientId)")
Add-QaCase "ONC-25" "Oncologia" "CONTRACT" "Documentos del tratamiento" "La interfaz enlaza hoja de tratamiento, QR y consentimiento." "angular-source" $documentsAngular "" @("'treatment-sheet'", "documents/qr?cycle=", "/consent")

# TURNOS: 25 casos
Add-QaCase "TUR-01" "Turnos" "REAL" "Abrir candidatos del turnero" "Respuesta ok/candidates/total sin alterar turnos." "candidates" "/api/clinical/infusion-candidates?includeScheduled=false&onlySchedulingEligible=false"
Add-QaCase "TUR-02" "Turnos" "REAL" "Buscar candidato por paciente" "El buscador encuentra una fila real cuando existe semilla QA." "candidate-probe"
Add-QaCase "TUR-03" "Turnos" "REAL" "Excluir ya programados de espera" "includeScheduled=false responde como contrato valido." "candidates" "/api/clinical/infusion-candidates?includeScheduled=false&onlySchedulingEligible=false"
Add-QaCase "TUR-04" "Turnos" "REAL" "Mostrar tambien bloqueados para gestion" "onlySchedulingEligible=false permite explicar por que no entran." "candidates" "/api/clinical/infusion-candidates?includeScheduled=false&onlySchedulingEligible=false"
Add-QaCase "TUR-05" "Turnos" "REAL" "Agenda del dia" "Lista de infusiones por fecha responde sin cambios." "json-shape" "/api/clinical/infusions?date=$((Get-Date).ToString('yyyy-MM-dd'))" "" @("ok", "infusions", "total")
Add-QaCase "TUR-06" "Turnos" "CONTRACT" "Filtros operativos de espera" "Todos, prescriptos, falta receta, falta medicacion, recibida y paciente." "angular-source" $schedulerAngular "" @("prescribed", "prescription-confirmed", "missing-prescription", "missing-medication", "medication-received", "medication-with-patient")
Add-QaCase "TUR-07" "Turnos" "CONTRACT" "Prioridad cronologica de espera" "El listado usa un comparador por ciclo/fecha y no orden de carga." "angular-source" $schedulerAngular "" @("filteredCandidates", ".sort(", "suggestedDate")
Add-QaCase "TUR-08" "Turnos" "CONTRACT" "Fecha en formato local y dia de semana" "La cabecera tiene dd/mm/aaaa y nombre del dia." "angular-source" $schedulerAngular "" @("weekday = computed", "dateLabel(value", '${match[3]}/${match[2]}/${match[1]}')
Add-QaCase "TUR-09" "Turnos" "CONTRACT" "Calendario y navegacion diaria" "Existen calendario, anterior, hoy y siguiente." "angular-source" $schedulerAngular "" @('type="date"', "shiftDate(-1)", "today()", "shiftDate(1)")
Add-QaCase "TUR-10" "Turnos" "REAL" "Configuracion de Hospital de dia disponible" "La definicion activa se recupera desde PostgreSQL." "json-shape" "/api/clinical/configuration/day-hospital-settings" "" @("ok", "items", "total")
Add-QaCase "TUR-11" "Turnos" "CONTRACT" "Fracciones permitidas" "La grilla admite 5, 10, 15, 20 y 30 minutos." "angular-source" $schedulerAngular "" @("[5, 10, 15, 20, 30]", "configuredSlot", "slotMinutes")
Add-QaCase "TUR-12" "Turnos" "CONTRACT" "Cantidad de sillones y jornada configurables" "La agenda consume chairCount, startTime y endTime." "angular-source" $schedulerAngular "" @("chairCount", "startTime", "endTime", "applySettings")
Add-QaCase "TUR-13" "Turnos" "CONTRACT" "Zoom de sillones" "Acercar y alejar cambian la cantidad visible." "angular-source" $schedulerAngular "" @('title="Acercar"', 'title="Alejar"', "zoom(direction", "visibleChairCount")
Add-QaCase "TUR-14" "Turnos" "CONTRACT" "Paginado horizontal de sillones" "Anterior/siguiente desplazan el rango sin perder turnos." "angular-source" $schedulerAngular "" @("shiftChairs(-1)", "shiftChairs(1)", "chairRange()")
Add-QaCase "TUR-15" "Turnos" "CONTRACT" "Arrastrar y soltar" "La grilla escucha dragover y drop sobre el mismo objetivo." "angular-source" $schedulerAngular "" @('(dragover)="dragOver($event, slot, chair)"', '(drop)="drop($event)"', "drop(event: DragEvent)")
Add-QaCase "TUR-16" "Turnos" "CONTRACT" "Vista previa solo en posiciones validas" "El dropEffect es move solo cuando target.valid." "angular-source" $schedulerAngular "" @("target.valid ? 'move' : 'none'", "dragOver(event: DragEvent", "dropTarget.set(target)")
Add-QaCase "TUR-17" "Turnos" "CONTRACT" "Prevencion de superposicion" "El calculo compara inicio/fin contra cada turno existente." "angular-source" $schedulerAngular "" @("infusionStart < end", "infusionEnd > start", "!conflict")
Add-QaCase "TUR-18" "Turnos" "CONTRACT" "Duracion ocupa casilleros completos" "El span usa ceil(duracion/slotMinutes)." "angular-source" $schedulerAngular "" @("Math.ceil(this.duration(item) / this.settings().slotMinutes)", "slotIndex + span", "grid-row")
Add-QaCase "TUR-19" "Turnos" "CONTRACT" "Franja horaria visible" "El bloque muestra desde inicio hasta el ultimo minuto ocupado." "angular-source" $schedulerAngular "" @("schedulerInclusiveInfusionRange", "duration * 60_000 - 60_000")
Add-QaCase "TUR-20" "Turnos" "CONTRACT" "Turno confirmado y no confirmado distinguibles" "La tarjeta usa estados y colores separados." "angular-source" $schedulerAngular "" @("is-confirmed", "is-pending", "appointmentConfirmed")
Add-QaCase "TUR-21" "Turnos" "CONTRACT" "Mover turno asignado" "La logica de drop conserva la aplicacion y actualiza su ubicacion." "angular-source" $schedulerAngular "" @("beginInfusionDrag", "previousCandidates", "scheduledAt, chair", "Turno reprogramado")
Add-QaCase "TUR-22" "Turnos" "CONTRACT" "Quitar turno y devolver a espera" "Quitar la ubicacion no falsifica los estados historicos de Farmacia o Administracion." "angular-source" $schedulerAngular "" @("removeAppointment()", "scheduledAt: null", "chair: null", "clinicalStatus: 'cancelled'")
Add-QaCase "TUR-23" "Turnos" "CONTRACT" "Modal de datos del turno" "Paciente, DNI, esquema, diagnostico, medicacion y confirmacion estan visibles." "angular-source" $schedulerAngular "" @("currentDetail()['patientName']", "patientDni", "scheme", "diagnosis", "medicationWithPatient", "appointmentConfirmed")
Add-QaCase "TUR-24" "Turnos" "CONTRACT" "API de alta de turno documentada" "Swagger expone POST /api/clinical/infusions y su conflicto de agenda." "openapi" "/api/clinical/infusions|post"
Add-QaCase "TUR-25" "Turnos" "CONTRACT" "Drop rapido, borde de jornada y conflicto concurrente" "Un solo turno se consolida, el otro recibe 409 claro y los limites 08:00-16:00 se validan al minuto." "test-source" "/src/test/java/ar/com/hexium/hcop/infusion/HospitalDayConcurrencySafetyTest.java" "" @("tur25SimultaneousDropsYieldOneAppointmentAndOneClearConflict", "tur25DatabaseSerializesAChairAndRejectsDuplicateActiveApplications", "tur25AcceptsExactWorkdayEdgesAndRejectsTheFirstOverflowingSlot", "CHAIR_SCHEDULE_CONFLICT", "OUTSIDE_DAY_HOSPITAL_HOURS")

Require-True ($script:Cases.Count -eq 100) "La matriz debe contener exactamente 100 casos; contiene $($script:Cases.Count)."
foreach ($role in @("Farmacia", "Enfermeria", "Oncologia", "Turnos")) {
  $count = @($script:Cases | Where-Object Role -eq $role).Count
  Require-True ($count -eq 25) "El rol $role debe tener 25 casos; contiene $count."
}

$results = @()
$position = 0
foreach ($case in $script:Cases) {
  $position += 1
  Write-Host ("[{0}/100] {1} - {2}" -f $position, $case.Id, $case.Title)
  $results += Invoke-QaCase $case
}
$written = Write-QaReports -Results ([object[]]$results) -Directory $OutputDirectory
Write-Host ""
Write-Host "Auditoria finalizada: 100 casos (25 por rol)."
Write-Host "JSON: $($written.Json)"
Write-Host "Markdown: $($written.Markdown)"
Write-Host ("PASS={0} FAIL={1} NO_DATA={2} MANUAL={3}" -f `
  $written.Summary.pass, $written.Summary.fail, $written.Summary.noData, $written.Summary.manual)
if ($written.Summary.fail -gt 0 -and -not $NoFailExit) {
  throw "La auditoria encontro $($written.Summary.fail) fallas automaticas. Los reportes ya fueron guardados."
}
