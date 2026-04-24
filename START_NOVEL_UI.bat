@echo off
set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%open-webui-main\open-webui-main\backend"
set "FRONTEND_DIR=%ROOT_DIR%open-webui-main\open-webui-main"

echo [Initialization] Checking Backend Virtual Environment...
cd /d "%BACKEND_DIR%"
IF NOT EXIST "venv\Scripts\activate.bat" (
    echo [Backend] Creating Python Virtual Environment...
    python -m venv venv
)

echo [Backend] Opening Backend Server Window...
start "Open-WebUI Backend" cmd /k "cd /d ""%BACKEND_DIR%"" && call venv\Scripts\activate.bat && (IF NOT EXIST "".env_ready"" (echo [Backend] Installing lightweight requirements... && pip install -r requirements-novel.txt && echo > .env_ready)) & set WEBUI_AUTH=False& set ENABLE_TITLE_GENERATION=False& set ENABLE_TAGS_GENERATION=False& set WEBUI_SECRET_KEY=dev_local_secret_123& set FORWARDED_ALLOW_IPS=127.0.0.1& echo [Backend] Starting server...& call start_windows.bat"

cd /d "%FRONTEND_DIR%"
IF NOT EXIST "node_modules\" (
    echo [Frontend] Installing Node dependencies...
    call npm install --force
)
echo [Frontend] Starting Svelte Frontend...
start "Open-WebUI Frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && call npm run dev"

echo [Status] Waiting for local servers to initialize...
:loop
curl -s http://localhost:5173 >nul
if %errorlevel% neq 0 (
    timeout /t 2 >nul
    goto loop
)

echo [Success] Servers are ready! Launching Browser...
start http://localhost:5173
exit
