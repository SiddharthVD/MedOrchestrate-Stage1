@echo off
cd /d "%~dp0"
where python >nul 2>&1
if errorlevel 1 (
  echo Python was not found. Install Python 3.10 or newer, then run this file again.
  pause
  exit /b 1
)
python -c "import flask" >nul 2>&1
if errorlevel 1 (
  echo Installing the project's Python dependency...
  python -m pip install -r requirements.txt
  if errorlevel 1 (
    echo Dependency installation failed. See the error above.
    pause
    exit /b 1
  )
)
python launch.py
if errorlevel 1 pause
