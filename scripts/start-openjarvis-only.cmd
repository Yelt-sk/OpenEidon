@echo off
setlocal

set "ROOT=D:\projects\Jarvis\OpenJarvis-main"
set "LOGDIR=%ROOT%\.run-logs"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"

call "%ROOT%\scripts\stop-openjarvis-only.cmd" >nul 2>nul

echo Starting OpenJarvis backend...
if exist "%ROOT%\.run-logs\server.out.log" del /f /q "%ROOT%\.run-logs\server.out.log" >nul 2>nul
if exist "%ROOT%\.run-logs\server.err.log" del /f /q "%ROOT%\.run-logs\server.err.log" >nul 2>nul
start "OpenJarvis Backend" /min cmd /c "cd /d %ROOT% && call .venv\Scripts\python.exe -m openjarvis.cli serve --host 127.0.0.1 --port 8000 --engine ollama --model qwen3.5:cloud > .run-logs\server.out.log 2> .run-logs\server.err.log"

echo Starting OpenJarvis frontend...
start "OpenJarvis Frontend" /min cmd /c "cd /d %ROOT%\frontend && npm run dev -- --host 127.0.0.1 --port 5173 > ..\.run-logs\frontend.out.log 2> ..\.run-logs\frontend.err.log"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline = (Get-Date).AddSeconds(45);" ^
  "while ((Get-Date) -lt $deadline) {" ^
  "  try {" ^
  "    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/health' -UseBasicParsing -TimeoutSec 3;" ^
  "    if ($r.StatusCode -eq 200) { exit 0 }" ^
  "  } catch {}" ^
  "  Start-Sleep -Seconds 2" ^
  "}" ^
  "exit 1"

start "" "http://127.0.0.1:5173"

echo OpenJarvis start requested.
exit /b 0
