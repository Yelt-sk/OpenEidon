@echo off
setlocal

set "ROOT=D:\projects\Eidon\OpenEidon-main"

echo Starting Ollama...
call "%ROOT%\scripts\start-ollama.cmd"
if errorlevel 1 (
  echo Failed to start Ollama.
  exit /b 1
)

call "%ROOT%\scripts\start-openeidon-only.cmd"
exit /b %errorlevel%
