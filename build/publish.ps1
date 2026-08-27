<#
.SYNOPSIS
    Nativní (bez podman) ekvivalent `./build/build.sh publish` pro prostředí
    s lokálně nainstalovaným Node a .NET SDK.

.DESCRIPTION
    build.sh publish v kontejnerech dělá:
      1. build frontendu (npm ci && npm run build) + kopie dist/ -> wwwroot/
      2. self-contained `dotnet publish` pro win-x64 do publish/
      3. zkopíruje deploy/Install-MSProjectManager.ps1 a README-nasazeni.md do publish/

    Tento skript dělá totéž, ale volá npm/dotnet přímo na hostu.

.PARAMETER SelfContained
    Self-contained publish (výchozí $true, stejně jako build.sh). Nastav $false
    pro framework-dependent publish (na cíli musí být nainstalovaný .NET runtime).

.EXAMPLE
    ./build/publish.ps1
.EXAMPLE
    ./build/publish.ps1 -SelfContained:$false
#>
[CmdletBinding()]
param(
    [bool]$SelfContained = $true
)

$ErrorActionPreference = 'Stop'

function Info($msg) { Write-Host "▸ $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "✓ $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "! $msg" -ForegroundColor Yellow }
function Die($msg)  { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

function Invoke-Checked {
    param([string]$Exe, [string[]]$ArgList, [string]$WorkDir)
    Push-Location $WorkDir
    try {
        & $Exe @ArgList
        if ($LASTEXITCODE -ne 0) {
            Die "$Exe $($ArgList -join ' ') selhalo (exit $LASTEXITCODE)"
        }
    } finally {
        Pop-Location
    }
}

$Root       = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ClientDir  = Join-Path $Root 'src\client'
$ServerDir  = Join-Path $Root 'src\server'
$ServerProj = Join-Path $ServerDir 'MSProjectManager.Server'
$Dist       = Join-Path $ClientDir 'dist'
$WwwRoot    = Join-Path $ServerProj 'wwwroot'
$PublishDir = Join-Path $Root 'publish'

if (-not (Test-Path $ServerProj)) { Die "Server projekt ($ServerProj) neexistuje" }

if (-not (Get-Command npm -ErrorAction SilentlyContinue))    { Die "npm nebyl nalezen v PATH" }
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { Die "dotnet nebyl nalezen v PATH" }

# ── 1. Frontend build ────────────────────────────────────────────────────────

Info "Build frontendu (npm)"
Invoke-Checked -Exe npm -ArgList @('ci', '--no-audit', '--no-fund') -WorkDir $ClientDir
Invoke-Checked -Exe npm -ArgList @('run', 'build') -WorkDir $ClientDir
Ok "Frontend zbuildován -> src/client/dist/"

if (-not (Test-Path $Dist)) { Die "src/client/dist/ neexistuje - build frontendu neproběhl" }

if (Test-Path $WwwRoot) {
    $hasIndex  = Test-Path (Join-Path $WwwRoot 'index.html')
    $hasAssets = Test-Path (Join-Path $WwwRoot 'assets')
    if ($hasIndex -or $hasAssets) {
        Info "Čistím předchozí build output ve wwwroot"
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $WwwRoot 'index.html')
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $WwwRoot 'assets')
    } else {
        Warn "wwwroot obsahuje neznámý obsah - nemažu, jen překopírovávám přes"
    }
} else {
    New-Item -ItemType Directory -Force -Path $WwwRoot | Out-Null
}

Copy-Item -Path (Join-Path $Dist '*') -Destination $WwwRoot -Recurse -Force
Ok "Zkopírováno do MSProjectManager.Server/wwwroot/"

# ── 2. Backend publish (self-contained win-x64) ─────────────────────────────

Info "Publish pro win-x64 (self-contained=$SelfContained)"

$publishArgs = @(
    'publish', 'MSProjectManager.Server',
    '-c', 'Release',
    '-r', 'win-x64',
    '--self-contained', $SelfContained.ToString().ToLower(),
    '-o', $PublishDir
)
Invoke-Checked -Exe dotnet -ArgList $publishArgs -WorkDir $ServerDir

# ── 3. Deploy artefakty ──────────────────────────────────────────────────────

Copy-Item -Path (Join-Path $Root 'deploy\Install-MSProjectManager.ps1') -Destination $PublishDir -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $Root 'deploy\README-nasazeni.md') -Destination $PublishDir -Force -ErrorAction SilentlyContinue

Ok "Publish hotov -> publish/"
Info 'Zkopírovat publish/ na server a spustit (jako správce):'
Info '  powershell -ExecutionPolicy Bypass -File .\Install-MSProjectManager.ps1 -Hostname planovac.firma.cz'
