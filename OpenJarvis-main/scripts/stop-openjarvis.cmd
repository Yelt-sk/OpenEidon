@echo off
setlocal

call "%~dp0stop-openjarvis-with-ollama.cmd"
exit /b %errorlevel%
