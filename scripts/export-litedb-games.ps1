# 从 YunGame/Playnite 的 LiteDB（library/games.db）导出游戏清单为 JSON。
#
# 为什么必须用 PowerShell + LiteDB.dll：
#   games.db 是 **LiteDB 4.1.4** 的库（文件头不是 SQLite 也不是明文，用 sqlite/node:sqlite
#   都读不了）。App 目录里就带着它自己那份 LiteDB.dll，直接加载它来读最稳、零依赖。
#   导出成 JSON 之后，后续处理（与游戏列表、详情页 join）全部在 Node 侧做，
#   和项目其它脚本保持一致。
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/export-litedb-games.ps1
#   powershell ... -File scripts/export-litedb-games.ps1 -DbPath D:/x/games.db -Out D:/y.json
param(
    [string]$DbPath = "D:/YunGame/PlayNite/library/games.db",
    [string]$DllPath = "D:/YunGame/PlayNite/LiteDB.dll",
    [string]$Out = "release/data/litedb-games.json"
)

$ErrorActionPreference = "Stop"

# 只读打开**副本**：绝不直接读用户的实时库（避免任一分支下写坏它）
if (-not (Test-Path $DbPath)) { throw "找不到数据库: $DbPath" }
$tmpDir = Join-Path $PSScriptRoot "..\_tmp_db"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
$copy = Join-Path $tmpDir "games.db"
Copy-Item $DbPath $copy -Force

if (-not (Test-Path $DllPath)) { throw "找不到 LiteDB.dll: $DllPath" }
Add-Type -Path $DllPath

$db = New-Object LiteDB.LiteDatabase($copy)
$col = $db.GetCollection("Game")
$total = $col.Count()

$items = New-Object System.Collections.Generic.List[string]
foreach ($doc in $col.FindAll()) {
    # LiteDB 自带 JsonSerializer：直接把文档序列化成 JSON（转义/类型都由它保证）
    $items.Add([LiteDB.JsonSerializer]::Serialize($doc, $false))
}

$json = "[" + ($items -join ",") + "]"
$outFull = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\$Out"))
New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($outFull)) | Out-Null
# 无 BOM 写入：Node 的 JSON.parse 不接受 BOM
[System.IO.File]::WriteAllText($outFull, $json, (New-Object System.Text.UTF8Encoding($false)))

$db.Dispose()
Remove-Item $copy -Force -ErrorAction SilentlyContinue

Write-Output "已导出: $outFull"
Write-Output "  Game 集合共 $total 条，输出 $($items.Count) 条，$([math]::Round((Get-Item $outFull).Length / 1KB, 1))KB"
