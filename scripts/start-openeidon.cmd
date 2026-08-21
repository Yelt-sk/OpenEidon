@echo off
setlocal

call "%~dp0start-openeidon-with-ollama.cmd"
exit /b %errorlevel%
