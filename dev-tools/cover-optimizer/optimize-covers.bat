@echo off
REM ============================================================
REM  Cover image normalizer / slimmer  ->  optimize-covers.ps1 (same folder)
REM
REM  Lives in dev-tools\cover-optimizer\ - same "one folder per tool" layout as
REM  tools\yungamestart\ and tools\GameSaveHelper\. It can be started from
REM  anywhere: the .ps1 finds the repo root by walking up to path-modes.json,
REM  so the config.json lookup does not depend on the current directory.
REM
REM  Usage (double-click or from a terminal):
REM    optimize-covers.bat -Source "D:\ai-covers\2026-09" -OutDir "D:\YunGame\PlayNite\CoverImages"
REM    optimize-covers.bat -Slim              (scan the library set in config.json, PNG -> JPEG)
REM
REM  Why the absolute PowerShell path: System.Drawing only works in Windows
REM  PowerShell 5.1 - NOT in PowerShell 7, and on this machine PATH "powershell"
REM  IS PowerShell 7 (see docs/design/gpu-acceleration.md for the same trap).
REM  ASCII-only on purpose: a .bat with a codepage switch plus multibyte text gets
REM  re-read at a wrong byte offset by cmd and half-lines get executed as commands.
REM ============================================================
setlocal
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" (
    call node "%~dp0..\..\scripts\bat-msg.mjs" covers.err-powershell "%PS%"
    exit /b 1
)
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0optimize-covers.ps1" %*
endlocal
