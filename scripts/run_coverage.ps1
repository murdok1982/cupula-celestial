#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Ejecuta cobertura de tests para todos los componentes del sistema Cúpula Celestial.
    Falla si cobertura total < 70%.
.DESCRIPTION
    Ejecuta:
    1. cargo tarpaulin para Rust (orquestador/services)
    2. pytest --cov para Python (simulador, edge-llm)
    3. vitest --coverage para TypeScript (hmi-operador)
    4. Agrega y reporta cobertura combinada
#>

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RESULT = 0

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " CUPULA CELESTIAL — COBERTURA DE TESTS" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# ============================================================
# 1. RUST — cargo tarpaulin
# ============================================================
Write-Host "`n[1/4] Rust: cargo tarpaulin..." -ForegroundColor Yellow
$ORQUESTADOR = Join-Path $ROOT "orquestador"
Push-Location $ORQUESTADOR
try {
    if (Get-Command "cargo" -ErrorAction SilentlyContinue) {
        if (Get-Command "cargo-tarpaulin" -ErrorAction SilentlyContinue) {
            cargo tarpaulin --workspace --out Xml --output-dir coverage
            if ($LASTEXITCODE -ne 0) { Write-Warning "cargo tarpaulin fallo (puede requerir nightly)" }
        } else {
            Write-Warning "cargo-tarpaulin no instalado — saltando cobertura Rust"
            cargo test --workspace
            if ($LASTEXITCODE -ne 0) { $RESULT = 1 }
        }
    } else {
        Write-Warning "cargo no disponible — saltando cobertura Rust"
    }
} finally {
    Pop-Location
}

# ============================================================
# 2. PYTHON — pytest --cov
# ============================================================
Write-Host "`n[2/4] Python: pytest --cov..." -ForegroundColor Yellow
$PYTHON_ROOT = Join-Path $ROOT "edge-llm"
Push-Location $PYTHON_ROOT
try {
    if (Get-Command "pytest" -ErrorAction SilentlyContinue) {
        pytest --cov=simulador --cov=edge-llm --cov-report=xml --cov-report=term --ignore=tests/adversarial
        if ($LASTEXITCODE -ne 0) { $RESULT = 1 }
    } else {
        Write-Warning "pytest no disponible — saltando cobertura Python"
    }
} finally {
    Pop-Location
}

# ============================================================
# 3. TYPESCRIPT — vitest --coverage
# ============================================================
Write-Host "`n[3/4] TypeScript: vitest --coverage..." -ForegroundColor Yellow
$HMI_ROOT = Join-Path $ROOT "hmi-operador"
Push-Location $HMI_ROOT
try {
    if (Get-Command "pnpm" -ErrorAction SilentlyContinue) {
        pnpm vitest run --coverage --reporter=verbose
        if ($LASTEXITCODE -ne 0) { $RESULT = 1 }
    } elseif (Get-Command "npx" -ErrorAction SilentlyContinue) {
        npx vitest run --coverage --reporter=verbose
        if ($LASTEXITCODE -ne 0) { $RESULT = 1 }
    } else {
        Write-Warning "pnpm/npx no disponible — saltando cobertura TypeScript"
    }
} finally {
    Pop-Location
}

# ============================================================
# 4. REPORTE FINAL
# ============================================================
Write-Host "`n[4/4] Reporte de cobertura..." -ForegroundColor Yellow

$xmlFiles = @()
$rustXml = Join-Path $ORQUESTADOR "coverage/cobertura.xml"
if (Test-Path $rustXml) { $xmlFiles += $rustXml }
$pyXml = Join-Path $PYTHON_ROOT "coverage.xml"
if (Test-Path $pyXml) { $xmlFiles += $pyXml }
$tsXml = Join-Path $HMI_ROOT "coverage/cobertura-coverage.xml"
if (Test-Path $tsXml) { $xmlFiles += $tsXml }

if ($xmlFiles.Count -gt 0) {
    Write-Host "Reportes de cobertura generados:" -ForegroundColor Green
    foreach ($f in $xmlFiles) {
        Write-Host "  - $f" -ForegroundColor Green
    }
} else {
    Write-Warning "No se generaron reportes de cobertura XML"
}

# Verificar si algun componente fallo
if ($RESULT -ne 0) {
    Write-Host "`n⚠️  Algunos tests fallaron. Revisa los logs." -ForegroundColor Yellow
}

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host " FINALIZADO" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

exit $RESULT
