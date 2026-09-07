@echo off
setlocal
 title Neighborhood - Local Play
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js LTS, then double-click this file again.
  pause
  exit /b 1
)
set "LOCAL_LAUNCHER=%~dp0tools\play-local.cjs"
if not exist "%LOCAL_LAUNCHER%" set "LOCAL_LAUNCHER=%~dp0neighborhood-game\tools\play-local.cjs"
node "%LOCAL_LAUNCHER%" %*
if errorlevel 1 pause
