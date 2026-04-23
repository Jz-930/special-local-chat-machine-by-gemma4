@echo off
echo ========================================================
echo Starting Open-WebUI Dev Environment (Backend + Frontend)
echo ========================================================
echo.
echo Please wait while we check dependencies. This might take a few minutes on the first run.
echo.

cd /d "%~dp0backend"
IF NOT EXIST "venv\Scripts\activate.bat" (
    echo [Backend] Creating Python virtual environment...
    python -m venv venv
)

echo [Backend] Opening Backend Server Window...
start "Open-WebUI Backend" cmd /k "cd /d ""%~dp0backend"" && venv\Scripts\activate.bat && echo [Backend] Installing lightweight requirements... && pip install -r requirements-novel.txt && set OLLAMA_BASE_URL=https://sb8kkgscyvffwh-11434.proxy.runpod.net && echo [Backend] Starting server... && start_windows.bat"

cd /d "%~dp0"
IF NOT EXIST "node_modules\" (
    echo [Frontend] Installing Node modules (forcing to bypass Node 24 engine check)...
    call npm install --force
)

echo [Frontend] Opening Frontend Dev Server Window...
start "Open-WebUI Frontend" cmd /k "cd /d ""%~dp0"" && echo [Frontend] Starting dev server... && npm run dev"

echo Done! Two new windows should have opened.
echo Watch the Frontend window to find your local access URL (Usually http://localhost:5173).
pause
