@echo off
chcp 65001 >nul
title Playday - 一键加密用户表（jsoncrypt 明文 → YunGameConfig）
REM ============================================================
REM  一键加密 YunGame 用户表（原版 JsonCrypt 的算法）
REM
REM  默认就干这件事（就是你平时要的那一步）：
REM    源  ：D:\AI\Code\YunGameProject\YunGameTools\JsonCrypt\jsoncrypt\bin\Debug\YunGame_UserList.json
REM    目标：D:\YunGame\PlayNite\YunGameConfig\YunGame_UserList.json
REM    即：把 jsoncrypt 里的明文加密，写成 YunGameConfig 下客户端实际读取的那份密文。
REM
REM  三道安全闸（脚本里实现）：
REM    ① 目标文件已存在时先备份 `YunGame_UserList.json.bak-<时间戳>`
REM    ② **源文件已经是密文就直接拒绝**（再加密一次会把数据彻底毁掉）
REM    ③ 源文件不是合法 JSON 也拒绝（免得把坏文件藏起来）
REM    ─ 另外会先报出"部署后会改掉哪些记录"，避免默默替换数据。
REM
REM  用法：
REM    直接双击                    → 用上面两条默认路径
REM    encrypt-userlist.bat "源.json"                 → 换源，目标仍是 YunGameConfig 那份
REM    encrypt-userlist.bat "源.json" "目标.json"      → 源和目标都自己指定
REM ============================================================
setlocal

REM ---- 0. 切到工程根目录（脚本所在目录）----
cd /d "%~dp0"

REM ---- 1. 两条默认路径（可用参数覆盖）----
set "SRC=D:\AI\Code\YunGameProject\YunGameTools\JsonCrypt\jsoncrypt\bin\Debug\YunGame_UserList.json"
set "DST=D:\YunGame\PlayNite\YunGameConfig\YunGame_UserList.json"
if not "%~1"=="" set "SRC=%~1"
if not "%~2"=="" set "DST=%~2"

REM ---- 2. 用 proto 管理的 Node 22（找不到就用系统 node），与其它脚本一致 ----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
    echo [encrypt] 使用 Node 22.23.2 (proto)
) else (
    echo [encrypt] 未找到 proto Node 22，使用系统默认 node
)

echo ============================================
echo  Playday 一键加密用户表
echo  源  : %SRC%
echo  目标: %DST%
echo ============================================

REM ---- 3. 先预览（DRY-RUN，不写文件）----
echo.
echo [encrypt] 第 1 步：预览（DRY-RUN，不写文件）
echo.
node scripts\encrypt-userlist.mjs --dry-run "%SRC%" "%DST%"
if errorlevel 1 (
    echo.
    echo [encrypt] 预览就失败了（上面有原因，例如"源文件已经是密文"）。已中止，未写任何文件。
    goto :end
)

REM ---- 4. 确认后真加密（会自动备份目标文件）----
REM     坑：set /p 与随后对 %CONFIRM% 的判断不能塞进同一对括号里（解析期就展开变量）。
echo.
set /p CONFIRM="按 Y 回车加密并写入目标文件（会先备份目标）；其他键取消: "
if /i not "%CONFIRM%"=="Y" (
    echo.
    echo [encrypt] 已取消，文件未改动。
    goto :end
)

echo.
echo [encrypt] 第 2 步：加密并写盘...
echo.
node scripts\encrypt-userlist.mjs "%SRC%" "%DST%"
if errorlevel 1 (
    echo.
    echo [encrypt] 加密失败，目标文件未改动。
    goto :end
)

echo.
echo [encrypt] 完成
echo         回退方法：同目录的 YunGame_UserList.json.bak-^(时间戳^) 覆盖回去即可。
echo         客户端会自动识别明文/密文，不需要改配置。

:end
echo.
pause
endlocal
