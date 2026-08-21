@echo off
setlocal

call "%~dp0start-openjarvis-with-ollama.cmd"
exit /b %errorlevel%
