$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
$stdout = Join-Path $projectRoot ".run-logs\server.out.log"
$stderr = Join-Path $projectRoot ".run-logs\server.err.log"

Set-Location $projectRoot

if (!(Test-Path $python)) {
    throw "Python not found: $python"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $stdout) | Out-Null
if (Test-Path $stdout) { Remove-Item $stdout -Force -ErrorAction SilentlyContinue }
if (Test-Path $stderr) { Remove-Item $stderr -Force -ErrorAction SilentlyContinue }

Start-Process `
    -FilePath $python `
    -ArgumentList @(
        "-m", "openjarvis.cli", "serve",
        "--host", "127.0.0.1",
        "--port", "8000",
        "--engine", "ollama",
        "--model", "qwen3.5:cloud"
    ) `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -WindowStyle Minimized
