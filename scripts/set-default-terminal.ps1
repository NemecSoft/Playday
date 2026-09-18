<#
  让"双击 .bat / .cmd"由 Windows Terminal 打开。

  背景：本机装的是**便携版** WT（C:\Tools\WindowsTerminal），它没有注册成
  "默认终端应用程序"，所以双击 bat 一直走的是老 conhost（cmd.exe 那个黑窗），
  UTF-8 处理会和文件字节偏移打架，吐一堆 "'xx' is not recognized" 的乱码行。

  本脚本只改 HKCU（当前用户），两条路一起走：

    1) 默认终端应用程序 = Windows Terminal
       HKCU\Console\%Startup 的 DelegationConsole / DelegationTerminal
       这是官方机制：console 程序启动时把窗口交给 WT。系统若解析不到就自动
       回退 conhost，不会把控制台弄坏。

    2) 双击 .bat / .cmd 直接起 wt.exe
       HKCU\Software\Classes\{batfile,cmdfile}\shell\open\command
       便携版一定能生效的那条路：Windows Terminal 跑
           wt.exe cmd /c "<你双击的那个 bat>"

  用法（二选一，撤销就是同一条加 -Revert）：

    设置： powershell -NoProfile -ExecutionPolicy Bypass -File scripts\set-default-terminal.ps1
    撤销： powershell -NoProfile -ExecutionPolicy Bypass -File scripts\set-default-terminal.ps1 -Revert

  注意：
    - 不改任何 .bat / .cmd 文件本身，只改"谁来打开它"。
    - 撤销后完全回到 Windows 默认，不留残余。
    - 关联写法里没有设置工作目录：双击后 WT 会用它默认的起始目录，所以 bat 自己
      最好 cd 到脚本所在目录（本仓库的 bat 基本都这么写了）。
#>
[CmdletBinding()]
param(
  [string]$WtDir = 'C:\Tools\WindowsTerminal',
  [switch]$Revert
)

$ErrorActionPreference = 'Stop'

# Windows Terminal 在"默认终端应用程序"里用的两个 COM 类 ID
$WtConsole  = '{2EACA947-7F5F-4CFA-BA87-8F7FBEEFBE69}'
$WtTerminal = '{E12CFF52-A866-4C77-9A90-F570A7AA2C6B}'
$LetWindows = '{00000000-0000-0000-0000-000000000000}'

$wtExe   = Join-Path $WtDir 'wt.exe'
$startup = 'HKCU:\Console\%%Startup'
$exts    = @('batfile', 'cmdfile')

if ($Revert) {
  if (Test-Path $startup) {
    Set-ItemProperty -Path $startup -Name DelegationConsole  -Value $LetWindows
    Set-ItemProperty -Path $startup -Name DelegationTerminal -Value $LetWindows
  }
  foreach ($ext in $exts) {
    $p = "HKCU:\Software\Classes\$ext\shell\open\command"
    if (Test-Path $p) { Remove-Item -Path $p -Force }
  }
  Write-Host '已撤销：默认终端回到"让 Windows 决定"；.bat / .cmd 的打开方式回到系统默认。'
  exit 0
}

if (-not (Test-Path $wtExe)) { throw "找不到 $wtExe —— WTDir 传的是 $WtDir" }

# ---- 1) 默认终端应用程序 = Windows Terminal ----
if (-not (Test-Path $startup)) { New-Item -Path $startup -Force | Out-Null }
Set-ItemProperty -Path $startup -Name DelegationConsole  -Value $WtConsole
Set-ItemProperty -Path $startup -Name DelegationTerminal -Value $WtTerminal

# ---- 2) 双击 .bat / .cmd 直接由 wt.exe 打开 ----
$cmdLine = '"' + $wtExe + '" cmd /c "%1" %*'
foreach ($ext in $exts) {
  $p = "HKCU:\Software\Classes\$ext\shell\open\command"
  New-Item -Path $p -Force | Out-Null
  Set-ItemProperty -Path $p -Name '(default)' -Value $cmdLine
}

Write-Host '设置完成。现在双击 .bat / .cmd 会由 Windows Terminal 打开：'
Write-Host "  打开方式: $cmdLine"
Write-Host "  默认终端: $WtTerminal"
Write-Host '撤销办法: 同一脚本加 -Revert。'
