@echo off
set "ROOT_DIR=%~dp0"
set "FRONTEND_DIR=%ROOT_DIR%open-webui-main\open-webui-main"
set "BACKEND_DIR=%FRONTEND_DIR%\backend"

echo [Initialization] Checking Frontend Dependencies...
cd /d "%FRONTEND_DIR%"
IF NOT EXIST "node_modules\" (
    echo [Frontend] Installing Node dependencies...
    call npm install --force
    IF ERRORLEVEL 1 exit /b 1
)

echo [Frontend] Building optimized mobile-friendly assets...
call npm run build
IF ERRORLEVEL 1 exit /b 1

echo [Initialization] Checking Backend Virtual Environment...
cd /d "%BACKEND_DIR%"
IF NOT EXIST "venv\Scripts\activate.bat" (
    echo [Backend] Creating Python Virtual Environment...
    python -m venv venv
    IF ERRORLEVEL 1 exit /b 1
)

echo [Backend] Opening Backend Server Window...
start "DME Backend" cmd /k "cd /d ""%BACKEND_DIR%"" && call venv\Scripts\activate.bat && (IF NOT EXIST "".env_ready"" (echo [Backend] Installing lightweight requirements... && pip install -r requirements-novel.txt && echo > .env_ready)) & set WEBUI_AUTH=False& set ENABLE_TITLE_GENERATION=False& set ENABLE_TAGS_GENERATION=False& set ""WEBUI_NAME=DME Writing Engine""& set WEBUI_SECRET_KEY=dev_local_secret_123& set FORWARDED_ALLOW_IPS=127.0.0.1& set ""FRONTEND_BUILD_DIR=%FRONTEND_DIR%\build""& echo [Backend] Starting server...& call start_windows.bat"

echo [Status] Waiting for local server to initialize...
:loop
curl -s http://localhost:8080/health >nul
if %errorlevel% neq 0 (
    timeout /t 2 >nul
    goto loop
)

echo [Success] Server is ready! Launching Browser...
start http://localhost:8080
exit
