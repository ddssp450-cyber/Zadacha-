@echo off
chcp 65001 >nul
cd /d "%~dp0"
where docker >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop is not installed or is not in PATH.
  echo Install Docker Desktop, restart Windows, and try again.
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo Created .env from .env.example.
  echo IMPORTANT: Edit .env and replace MYSQL_ROOT_PASSWORD and MYSQL_PASSWORD first.
  notepad .env
  pause
)
echo Starting Ninja with MySQL 8.4...
docker compose up --build -d
if errorlevel 1 (
  echo Startup failed. Check Docker Desktop and .env values.
  pause
  exit /b 1
)
echo.
echo Ninja should be available at http://localhost:8080
echo Logs: docker compose logs -f
start "" http://localhost:8080
pause
