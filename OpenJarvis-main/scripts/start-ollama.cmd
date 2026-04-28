@echo off
setlocal

set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"

tasklist /fi "imagename eq ollama.exe" | find /i "ollama.exe" >nul
if %errorlevel%==0 (
  echo Ollama is already running.
  exit /b 0
)

if not exist "%OLLAMA_EXE%" (
  echo Ollama executable not found: %OLLAMA_EXE%
  exit /b 1
)

echo Starting Ollama...
start "Ollama" /min "%OLLAMA_EXE%" app.exe

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline = (Get-Date).AddSeconds(30);" ^
  "while ((Get-Date) -lt $deadline) {" ^
  "  try {" ^
  "    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:11434/api/tags' -UseBasicParsing -TimeoutSec 3;" ^
  "    if ($r.StatusCode -eq 200) { exit 0 }" ^
  "  } catch {}" ^
  "  Start-Sleep -Seconds 2" ^
  "}" ^
  "exit 1"

if errorlevel 1 (
  echo Ollama did not become ready in time.
  exit /b 1
)

echo Ollama is ready.
exit /b 0
