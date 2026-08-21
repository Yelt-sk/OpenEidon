# OpenEidon dev environment bootstrap (Windows).
# Requires: Python 3.10+, Node 20+, git. Rust toolchain optional (native extension).
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "Installing uv..."
    python -m pip install --user uv
}

Write-Host "== Backend deps =="
uv sync --extra dev

Write-Host "== Frontend deps =="
npm --prefix frontend install --no-audit --no-fund

if (Get-Command cargo -ErrorAction SilentlyContinue) {
    Write-Host "== Native extension =="
    uv run maturin develop -m rust/crates/openeidon-python/Cargo.toml
} else {
    Write-Host "Rust toolchain not found - skipping native extension (optional)."
}

Write-Host "== Smoke check =="
uv run eidon --version
Write-Host "Done. Next: 'uv run eidon init' then 'uv run eidon serve --port 8000'."
