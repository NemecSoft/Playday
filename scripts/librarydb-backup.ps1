#Requires -Version 5.1
<#
  librarydb-backup.ps1 —— 只备份权威库（**不写库**，随时可跑）
  把 <数据根>\Admin\library.db 复制成 library.db.bak-＜本地时间戳＞，备份就在库旁边。

  双击入口 = 仓库根的 librarydb-backup.bat（**只当壳**）。
  规矩见 docs\PROJECT-MEMORY.md 硬约定 §三.14（逻辑写 .ps1，bat 只当壳）。

  什么时候用：
    · 手改 整库 JSON 目录\*.json 之前，想留一个"改之前"的点；
    · 要跑别的会动库的脚本之前。
    · 单纯回写（双击 libraryjson-importto-librarydb.bat）**不需要**先跑这个 —— 它写库前本来就会自动备份。

  备份名规则与回写里的那次备份是**同一份实现**（scripts\library-json.mjs 的 backupDb），
  所以这里只负责调用，别在 ps 里另写一套命名。

  参数原样透传：--db（一般不用）
  退出码：0 = 成功；1 = 失败。
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

Write-Host '============================================'
Write-Host ' Playday 备份权威库（librarydb → backup）'
Write-Host '============================================'
Write-Host ''

# ---- 2. 只复制、不写库 ----
& node 'scripts\library-json.mjs' backup @($args)
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '[db] 备份失败（上面的报错说明了原因）。数据库没有被改动。'
  exit 1
}

Write-Host ''
Write-Host '[db] 备份只增不删 —— 确认库没问题后，可以把旧的 library.db.bak-* 删掉腾地方。'
exit 0
