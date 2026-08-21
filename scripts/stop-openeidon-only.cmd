@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$targets = Get-CimInstance Win32_Process | Where-Object { " ^
  "  ($_.Name -eq 'python.exe' -and $_.CommandLine -match 'openeidon\.cli serve') -or " ^
  "  ($_.Name -eq 'powershell.exe' -and $_.CommandLine -match 'run_backend\.ps1') -or " ^
  "  ($_.Name -eq 'cmd.exe' -and $_.CommandLine -match 'OpenEidon Backend|OpenEidon Frontend|OpenEidon-main\\\\frontend') -or " ^
  "  ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'OpenEidon-main\\frontend') -or " ^
  "  ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'playwright\\\\driver\\\\package\\\\cli\.js run-driver')" ^
  "};" ^
  "$targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; " ^
  "Write-Host ('Stopped Eidon processes: ' + (($targets | Measure-Object).Count))"

exit /b 0
