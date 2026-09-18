@echo off

REM ============================================================================

REM  GameSaveHelper.bat - compatibility forwarding entry.

REM

REM  Prefer calling GameSaveHelper.exe directly (it validates arguments strictly

REM  and infers nothing):

REM

REM      GameSaveHelper.exe "<game name>" "D:\games\Z\Richman 11\2074800\*.*"

REM

REM      GameSaveHelper.exe "<game name>"        REM takes paths from config.json

REM

REM  This bat only forwards its arguments to the exe unchanged:

REM

REM      GameSaveHelper.bat "<game>" "D:\...2074800\*.*" "D:\...settings\*.*"

REM ============================================================================

"%~dp0GameSaveHelper.exe" %*

exit /b %ERRORLEVEL%

