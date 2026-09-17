@echo off
if "%~1"=="" (
    echo Usage: %0 "Window Title"
    exit /b
)
"X:\YunGame\Tools\nircmde" win center ititle "%~1"