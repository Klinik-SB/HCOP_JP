[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$frontendRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..\..'))
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..\..\..'))
$compiler = Join-Path $frontendRoot 'node_modules\.bin\tsc.cmd'
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) {
  throw 'No se encontro TypeScript. Ejecute npm install en la carpeta frontend.'
}

$legacyExpression = Join-Path $repositoryRoot 'src\main\resources\static\configuration\expression-engine.js'
$legacyCalculator = Join-Path $repositoryRoot 'src\main\resources\static\configuration\calculator-engine.js'
foreach ($legacyFile in @($legacyExpression, $legacyCalculator)) {
  if (-not (Test-Path -LiteralPath $legacyFile -PathType Leaf)) {
    throw "No se encontro el motor legacy: $legacyFile"
  }
}

$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$output = [System.IO.Path]::GetFullPath((Join-Path $temporaryRoot ("hcop-configurable-engine-tests-" + [guid]::NewGuid().ToString('N'))))
if (-not $output.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'La carpeta temporal de pruebas quedo fuera del directorio temporal permitido.'
}

try {
  & $compiler -p (Join-Path $PSScriptRoot 'tsconfig.configurable-engine-tests.json') --outDir $output
  if ($LASTEXITCODE -ne 0) { throw "TypeScript finalizo con codigo $LASTEXITCODE." }
  & node `
    (Join-Path $output 'configurable-calculator.engine.tests.js') `
    $legacyExpression `
    $legacyCalculator `
    (Join-Path $PSScriptRoot 'safe-expression.engine.ts') `
    (Join-Path $PSScriptRoot 'configurable-calculator.engine.ts')
  if ($LASTEXITCODE -ne 0) { throw "Las pruebas finalizaron con codigo $LASTEXITCODE." }
} finally {
  if (Test-Path -LiteralPath $output) {
    Remove-Item -LiteralPath $output -Recurse -Force
  }
}
