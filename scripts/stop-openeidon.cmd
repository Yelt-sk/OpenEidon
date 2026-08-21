@echo off
setlocal

call "%~dp0stop-openeidon-with-ollama.cmd"
exit /b %errorlevel%
