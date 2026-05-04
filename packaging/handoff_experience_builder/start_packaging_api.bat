@echo off
setlocal
cd /d %~dp0

if not exist outputs mkdir outputs

if defined PACKAGING_SHARED_ROOT goto shared_root_ready

if defined OneDriveCommercial (
  set "PACKAGING_SHARED_ROOT=%OneDriveCommercial%\Stormwater Engineering - General\Stormwater Tool"
) else (
  set "PACKAGING_SHARED_ROOT=%~dp0"
)

:shared_root_ready
set PACKAGING_ALLOWED_ORIGINS=http://localhost,http://127.0.0.1,https://experience.arcgis.com,https://*.arcgis.com

cd /d %~dp0scripts
py -m uvicorn api:app --host 0.0.0.0 --port 8001
