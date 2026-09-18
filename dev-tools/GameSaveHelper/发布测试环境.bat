@echo off
chcp 65001 >nul
REM Paths: if they change, edit the GAMESJSON / COVER lines below.
REM (the window title is Chinese, so it comes from scripts\bat-msg.mjs)

set GAMESJSON=D:\AI\Code\Playnite\Playday\games.json
set COVER=D:\YunGame\PlayNite\CoverImages

call "%~dp0..\..\scripts\bat-msg.mjs" title.gsh-test
call build-release.bat %GAMESJSON% %COVER%

pause
