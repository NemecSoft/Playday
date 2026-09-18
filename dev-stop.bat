@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday dev-mode stop.
REM  Kills the background Vite dev server window (title "Playday Vite").
REM
REM  ASCII-ONLY - do NOT put Chinese back into this file. The file is UTF-8 but
REM  the console may be on code page 936, and cmd then cuts multi-byte sequences
REM  in half while reading: the REM/echo prefix is lost and the tail of the line
REM  gets executed as a command ("'xx' is not recognized ..."). Chinese for the
REM  user is printed by scripts\bat-msg.mjs instead. Same rule as package.bat.
REM ============================================================
cd /d "%~dp0"
call node scripts\bat-msg.mjs dev-stop.stopping
taskkill /fi "WINDOWTITLE eq Playday Vite*" /f >nul 2>&1
call node scripts\bat-msg.mjs dev-stop.done
