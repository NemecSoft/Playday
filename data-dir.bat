@echo off
REM ============================================================
REM  Development data paths, for other .bat files to call.
REM
REM  Values come from path-modes.json (its "dev" section) through
REM  scripts/data-dir.mjs - never hard-code a directory name here.
REM  See docs/design/release-build.md.
REM
REM  WHY THIS FILE IS ASCII-ONLY: cmd.exe decodes a .bat with the console
REM  code page active when it opened the file; multi-byte text can be
REM  mis-decoded, a line can get split, and cmd then tries to RUN the tail
REM  of a comment ("'se' is not recognized ..."). Keep it pure ASCII.
REM
REM  usage:   call "%~dp0data-dir.bat"
REM  after that these are set:
REM      %YUNGAME_DATA_DIR%     data root
REM      %PLAYDAY_ADMIN_DB%     authoritative library file
REM      %PLAYDAY_RUNTIME_DB%   runtime copy file
REM      %PLAYDAY_DATA_REL%     data root relative to the repo (empty = outside)
REM
REM  exits 1 when it cannot resolve them -> the caller must abort.
REM ============================================================
setlocal
cd /d "%~dp0"

for /f "delims=" %%i in ('node scripts\data-dir.mjs --bat') do set "%%i"

if not defined YUNGAME_DATA_DIR (
    call node scripts\bat-msg.mjs data-dir.err
    endlocal
    exit /b 1
)

endlocal & set "YUNGAME_DATA_DIR=%YUNGAME_DATA_DIR%" & set "PLAYDAY_ADMIN_DB=%PLAYDAY_ADMIN_DB%" & set "PLAYDAY_RUNTIME_DB=%PLAYDAY_RUNTIME_DB%" & set "PLAYDAY_DATA_REL=%PLAYDAY_DATA_REL%"
exit /b 0
