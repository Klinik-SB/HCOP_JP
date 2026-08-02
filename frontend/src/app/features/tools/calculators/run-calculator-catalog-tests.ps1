[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$frontendRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..\..'))
$compiler = Join-Path $frontendRoot 'node_modules\.bin\tsc.cmd'
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) {
  throw 'No se encontro TypeScript. Ejecute npm install en la carpeta frontend.'
}
$bundler = Join-Path $frontendRoot 'node_modules\.bin\esbuild.cmd'
if (-not (Test-Path -LiteralPath $bundler -PathType Leaf)) {
  throw 'No se encontro esbuild. Ejecute npm install en la carpeta frontend.'
}

$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$output = [System.IO.Path]::GetFullPath((Join-Path $temporaryRoot ("hcop-calculator-catalog-tests-" + [guid]::NewGuid().ToString('N'))))
if (-not $output.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'La carpeta temporal de pruebas quedo fuera del directorio temporal permitido.'
}

try {
  & $compiler -p (Join-Path $PSScriptRoot 'tsconfig.catalog-service.json')
  if ($LASTEXITCODE -ne 0) { throw "El servicio Angular no supero el typecheck: codigo $LASTEXITCODE." }
  & $compiler -p (Join-Path $PSScriptRoot 'tsconfig.catalog-tests.json') --outDir $output
  if ($LASTEXITCODE -ne 0) { throw "TypeScript finalizo con codigo $LASTEXITCODE." }
  & node (Join-Path $output 'calculator-catalog.golden-tests.js')
  if ($LASTEXITCODE -ne 0) { throw "Las pruebas finalizaron con codigo $LASTEXITCODE." }
  $serviceBundle = Join-Path $output 'calculator-catalog.service.tests.cjs'
  & $bundler (Join-Path $PSScriptRoot 'calculator-catalog.service.tests.ts') --bundle --platform=node --format=cjs --target=node22 --log-level=warning "--outfile=$serviceBundle"
  if ($LASTEXITCODE -ne 0) { throw "esbuild finalizo con codigo $LASTEXITCODE." }
  & node $serviceBundle
  if ($LASTEXITCODE -ne 0) { throw "Las pruebas del servicio finalizaron con codigo $LASTEXITCODE." }
} finally {
  if (Test-Path -LiteralPath $output) {
    Remove-Item -LiteralPath $output -Recurse -Force
  }
}
