@echo off
chcp 65001 >nul
REM ============================================================
REM  Game launcher: Kingdoms Reborn (the internet-cafe online edition).
REM  A copy of what sits next to the game exe on a client machine.
REM
REM  NOTE: this one runs on a GAME machine, where node may not be installed.
REM  The window title, the menu and the "running" line all come from
REM  scripts\bat-msg.mjs; without node they would simply be empty. If this file
REM  is a template that gets copied to client machines, say so - then the text
REM  should come from a UTF-8 text file printed with `type` instead.
REM
REM  ASCII-ONLY: a Chinese string in here would make cmd cut lines in half and
REM  run the tail as a command (see the note in deploy.bat).
REM ============================================================
color 1f
for /f "delims=" %%t in ('node "%~dp0..\scripts\bat-msg.mjs" golan.title') do set "tl=%%t"
title %tl%
mode con: lines=25 cols=100
node "%~dp0..\scripts\bat-msg.mjs" golan.menu
"X:\YunGame\Tools\nircmd\nircmdc.exe" win center ititle %tl%
call update_config.bat >nul 2>&1
node "%~dp0..\scripts\bat-msg.mjs" golan.running
"KingdomsReborn.exe"
