@echo off
chcp 65001 >nul
REM ============================================================
REM  Build YunGameStart (C++ / Win32).  No third-party libraries:
REM  HTTP = WinHTTP, shortcut = IShellLink - both ship with Windows,
REM  so the exe is self-contained (no libcurl, no mingw DLLs).
REM
REM  Output : dist\yungamestart.exe  (+ 1.ico / 2.ico copied next to it)
REM  Next   : package.bat copies dist\* into <package>\yungamestart\
REM           (that directory is wiped on every package build, so the
REM            copy has to happen there, not at the end of this script)
REM
REM  ASCII-ONLY ON PURPOSE: see package.bat for the reason (cmd re-reads a
REM  .bat while executing; a code-page switch plus multi-byte text can make
REM  it resume at a wrong byte offset and run half a line).
REM ============================================================
setlocal
cd /d "%~dp0"

REM ---- 1. find g++ (MinGW-w64). Prefer the known install, else PATH. ----
set "GXX=C:\Tools\mingw64\bin\g++.exe"
if not exist "%GXX%" (
    where g++ >nul 2>nul
    if errorlevel 1 (
        echo [yungamestart] ERROR: g++ not found.
        echo [yungamestart]        install MinGW-w64, or edit GXX in this file.
        exit /b 1
    )
    set "GXX=g++"
)
echo [yungamestart] compiler: %GXX%

if not exist "dist" mkdir "dist"

REM ---- 2. compile ----
REM  -mwindows            GUI subsystem: no console flashes at boot
REM  -static -static-lib* self-contained exe (no MinGW runtime DLLs needed)
REM  -finput-charset      sources are UTF-8 (Chinese comments and log text)
"%GXX%" -std=c++17 -O2 -s -mwindows ^
    -finput-charset=UTF-8 -fexec-charset=UTF-8 ^
    -static -static-libgcc -static-libstdc++ ^
    -o "dist\yungamestart.exe" "src\main.cpp" ^
    -lole32 -lshell32 -lwinhttp
if errorlevel 1 (
    echo [yungamestart] ERROR: compile failed.
    exit /b 1
)

REM ---- 3. ship the two shortcut icons next to the exe ----
REM  The program reads <exe dir>\1.ico (gold) / 2.ico (diamond) at runtime
REM  and points the desktop shortcut at them - same as the original WPF app.
copy /y "assets\1.ico" "dist\1.ico" >nul
copy /y "assets\2.ico" "dist\2.ico" >nul

echo [yungamestart] OK
for %%F in ("dist\yungamestart.exe") do echo   exe  : %%~fF  (%%~zF bytes)
echo   icons: dist\1.ico  dist\2.ico
echo.
echo Next step: deploy.bat (it copies dist\* into the destination's yungamestart\,
echo per path-modes.json); when the test passes, promote.bat upgrades it to the
echo production machine.
endlocal
pause
