@echo off
echo ============================================
echo  Stormwater Packaging Tool - Build Script
echo ============================================
echo.

:: Check Python is available (try both python and py)
python --version >nul 2>&1
if errorlevel 1 (
    py --version >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Python not found. Please install Python and try again.
        pause
        exit /b 1
    )
    set PYTHON=py
    set PIP=py -m pip
) else (
    set PYTHON=python
    set PIP=pip
)

:: Install PyInstaller if not already installed
echo Installing/checking PyInstaller...
%PIP% install pyinstaller --quiet

:: Install app dependencies if not already installed
echo Installing app dependencies...
%PIP% install streamlit pandas numpy --quiet

echo.
echo Building exe - this may take a few minutes...
echo.

:: Run PyInstaller with the spec file
cd /d "%~dp0"
%PYTHON% -m PyInstaller packaging_tool.spec --noconfirm --clean

echo.
if exist "dist\StormwaterPackagingTool\StormwaterPackagingTool.exe" (
    echo ============================================
    echo  Build successful!
    echo  Your exe is in: dist\StormwaterPackagingTool\
    echo  Share the entire StormwaterPackagingTool\
    echo  folder - not just the .exe file.
    echo ============================================
) else (
    echo ERROR: Build failed. Check the output above for errors.
)

echo.
pause