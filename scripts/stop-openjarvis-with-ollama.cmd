@echo off
setlocal

call "%~dp0stop-openjarvis-only.cmd" >nul 2>nul

taskkill /F /T /IM ollama.exe >nul 2>nul
if errorlevel 1 (
  echo Stopped Ollama processes: 0
) else (
  echo Stopped Ollama processes: 1+
)

exit /b 0
