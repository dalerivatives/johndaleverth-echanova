@echo off
cd /d "%~dp0"

if not exist ".venv" (
  echo Creating a virtual environment in .venv ...
  python -m venv .venv
)

call .venv\Scripts\activate.bat

echo Installing/checking dependencies ...
pip install -q -r requirements.txt

if not defined ADMIN_KEY (
  echo.
  echo [!] ADMIN_KEY is not set - using the default "changeme123".
  echo     Set it before deploying anywhere public: set ADMIN_KEY=your-secret-key
  echo.
  set ADMIN_KEY=changeme123
)

REM If a previous run of this app was closed by just closing the window
REM (instead of pressing Ctrl+C), its server can be left running in the
REM background, still bound to port 8000. If that happens, THIS run fails
REM to bind the port, but your browser still opens fine and quietly hits
REM that old leftover server instead - so it looks like your newest changes
REM "didn't apply" when really you're just talking to yesterday's server.
REM This finds and stops any such leftover process first, so the server
REM that answers your browser is always the one this script just started.
echo Checking for a leftover server already using port 8000 ...
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /C:"127.0.0.1:8000 " ^| findstr "LISTENING"') do (
  echo   Found an old server still running ^(PID %%P^) - stopping it ...
  taskkill /PID %%P /F >nul 2>&1
)

REM ---------------------------------------------------------------------
REM LIVE RELOAD
REM DEV=1 turns on two things that only make sense while you're editing:
REM   * uvicorn --reload restarts the server when a .py file changes
REM   * the page polls the server and refreshes itself when any file in
REM     static\ changes - so editing HTML, CSS or JS updates the browser
REM     without you touching it.
REM Neither is on in a deployed copy; DEV is set here, not in the code.
REM ---------------------------------------------------------------------
set DEV=1

start "" "http://127.0.0.1:8000"
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir backend --reload-dir static
