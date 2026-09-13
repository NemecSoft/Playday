@echo off
chcp 65001 >nul
title GameSaveHelper - 测试环境
REM 路径如有变化，修改下面 GAMESJSON / COVER 两行

set GAMESJSON=D:\AI\Code\Playnite\Playday\games.json
set COVER=D:\YunGame\PlayNite\CoverImages

call build-release.bat %GAMESJSON% %COVER%

pause