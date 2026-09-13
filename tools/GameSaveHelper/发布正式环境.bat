@echo off
chcp 65001 >nul
title GameSaveHelper - 正式环境
REM 路径如有变化，修改下面 GAMESJSON / COVER 两行

set GAMESJSON=X:\YunGame\PlayNite\games.json
set COVER=X:\YunGame\PlayNite\CoverImages

call build-release.bat %GAMESJSON% %COVER%

pause