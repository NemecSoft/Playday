@echo off
setlocal enabledelayedexpansion

set "filename=.\settings\configs.user.ini"
set "tempfile=.\tempfile.ini"

(for /f "usebackq delims=" %%a in (`findstr /n "^" "%filename%"`) do (
    set "line=%%a"
    set "line=!line:*:=!"
    if "!line:~0,13!"=="account_name=" (
        echo account_name=%COMPUTERNAME%
    ) else (
        echo(!line!
    )
)) > "%tempfile%"

move /y "%tempfile%" "%filename%"

echo File updated successfully.