#Requires -Version 5.1
<#
  librarydb-exportto-libraryjson.ps1 —— 整库 JSON 管理：**导出（出口）方向**
  把权威库 <数据根>\Admin\library.db 倒成 $jsonDir\*.json（一表一文件），供人工编辑。

  双击入口 = 仓库根的 librarydb-exportto-libraryjson.bat（**只当壳**）。
  规矩见 docs\PROJECT-MEMORY.md 硬约定 §三.14（逻辑写 .ps1，bat 只当壳）。

  它是**只读库**的：不动权威库，但会**覆盖 JSON 文件**。
  ⚠️ JSON 改了还没回写（与库不一致）时，node 侧默认**拒绝导出**，要 --force 才覆盖。

  参数原样透传：--force / --tables users / --dir / --db（见 docs\design\library-json.md）
  退出码：0 = 成功；1 = 导出失败（含"拒绝覆盖"）。
#>
$ErrorActionPreference = 'Stop'

# ---- 0. 仓库根（本脚本在 scripts\ 下）----
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

# ---- 1. proto 管理的 Node 22（找不到就用系统 node）----
$node22 = 'C:\Users\Administrator\.proto\tools\node\22.23.2'
if (Test-Path (Join-Path $node22 'node.exe')) {
  $env:PATH = "$node22;$env:PATH"
  Write-Host '[db] 使用 Node 22.23.2 (proto)'
} else {
  Write-Host '[db] 未找到 proto Node 22，使用系统默认 node'
}

# 整库 JSON 目录：**从唯一来源取**（scripts/data-dir.mjs → lib/devData.mjs），本文件不许写死目录名
$jsonDir = (& node (Join-Path $PSScriptRoot 'data-dir.mjs') --json)

Write-Host '============================================'
Write-Host ' Playday 整库 JSON 导出（librarydb → libraryjson）'
Write-Host " 输出   : $jsonDir\*.json"
Write-Host '============================================'
Write-Host ''

# ---- 2. 导出（权威库路径由 node 侧自己解析，权威库与 JSON 目录的唯一来源都在那边）----
& node 'scripts\library-json.mjs' export @($args)
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '[db] 导出失败（上面的报错说明了原因）。JSON 与权威库都未被改动。'
  exit 1
}

Write-Host ''
Write-Host '[db] 改完 $jsonDir\*.json 后，双击 libraryjson-importto-librarydb.bat 回写（会先预览再确认）。'
exit 0
