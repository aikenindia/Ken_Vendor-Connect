@echo off
title Ken Vendor Connect Backend Server
color 0B

echo ================================================================
echo             Ken Vendor Connect - Backend Server
echo ================================================================
echo.

cd /d "%~dp0backend"

:: Check python
where py >nul 2>nul
if %errorlevel% neq 0 (
    set PY_CMD=python
) else (
    set PY_CMD=py
)

echo Starting FastAPI server with Uvicorn on http://localhost:8000 ...
echo Press Ctrl+C to stop the server.
echo.

%PY_CMD% -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
