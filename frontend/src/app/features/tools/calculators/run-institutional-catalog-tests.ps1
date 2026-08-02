[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$frontendRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..\..'))
$compiler = Join-Path $frontendRoot 'node_modules\.bin\tsc.cmd'
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) {
  throw 'No se encontró TypeScript. Ejecute npm install en la carpeta frontend.'
}

$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$output = [System.IO.Path]::GetFullPath((Join-Path $temporaryRoot ("hcop-institutional-calculator-tests-" + [guid]::NewGuid().ToString('N'))))
if (-not $output.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'La carpeta temporal de pruebas quedó fuera del directorio temporal permitido.'
}

try {
  & $compiler -p (Join-Path $PSScriptRoot 'tsconfig.institutional-catalog-tests.json') --outDir $output
  if ($LASTEXITCODE -ne 0) { throw "TypeScript finalizó con código $LASTEXITCODE." }
  & node (Join-Path $output 'institutional-calculator-catalog.validator.tests.js')
  if ($LASTEXITCODE -ne 0) { throw "Las pruebas finalizaron con código $LASTEXITCODE." }
} finally {
  if (Test-Path -LiteralPath $output) {
    Remove-Item -LiteralPath $output -Recurse -Force
  }
}
