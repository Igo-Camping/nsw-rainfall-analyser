@echo off
echo Starting Stormwater Packaging Tool for web embedding...

call D:\LLM\llm-env\Scripts\activate.bat
cd /d "C:\Users\fonzi\Weather App Folder\packaging\scripts"
set "STREAMLIT_STATE_FILE=C:\Users\fonzi\Weather App Folder\packaging\scripts\web\streamlit_url.txt"

powershell -NoProfile -ExecutionPolicy Bypass ^
  "$ports = 8501..8510; " ^
  "$stateFile = 'C:\Users\fonzi\Weather App Folder\packaging\scripts\web\streamlit_url.txt'; " ^
  "$stateDir = Split-Path -Parent $stateFile; " ^
  "New-Item -ItemType Directory -Force -Path $stateDir | Out-Null; " ^
  "$streamlitPids = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*streamlit.exe*run ui.py*' } | Select-Object -ExpandProperty ProcessId); " ^
  "$listen = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -in $streamlitPids -and $_.LocalPort -in $ports } | Sort-Object LocalPort | Select-Object -First 1; " ^
  "if ($listen) { " ^
  "  $url = 'http://localhost:' + $listen.LocalPort; " ^
  "  Set-Content -Path $stateFile -Value $url -Encoding UTF8; " ^
  "  Write-Host ('Streamlit is already running at ' + $url); " ^
  "  exit 0; " ^
  "} " ^
  "$chosen = $null; " ^
  "foreach ($port in $ports) { " ^
  "  $busy = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $port }; " ^
  "  if (-not $busy) { $chosen = $port; break } " ^
  "} " ^
  "if (-not $chosen) { Write-Error 'No free port found between 8501 and 8510.'; exit 1 } " ^
  "$url = 'http://localhost:' + $chosen; " ^
  "Set-Content -Path $stateFile -Value $url -Encoding UTF8; " ^
  "Write-Host ('Launching Streamlit at ' + $url); " ^
  "Start-Process -FilePath 'D:\LLM\llm-env\Scripts\streamlit.exe' -ArgumentList @('run','ui.py','--server.address','0.0.0.0','--server.port',$chosen,'--server.headless','true') -WorkingDirectory 'C:\Users\fonzi\Weather App Folder\packaging\scripts'; "

if errorlevel 1 (
  echo Failed to start Streamlit.
  exit /b 1
)

echo Streamlit launcher finished.
