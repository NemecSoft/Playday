# 修改 Playnite games.db：把所有 Action 路径中的 GameSaveHelperLan 改为 GameSaveHelper
# 用法：fix-actions-litedb.ps1 [-DbPath "D:\YunGame\PlayNite\library\games.db"]
param([string]$DbPath = "D:\YunGame\PlayNite\library\games.db")

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $DbPath)) { Write-Output "ERROR: 数据库不存在：$DbPath"; exit 1 }

# Playnite 必须关闭（独占打开会失败/损坏）
$pn = Get-Process -Name Playnite -ErrorAction SilentlyContinue
if ($pn) { Write-Output "ERROR: Playnite 正在运行，请先退出再执行。"; exit 1 }

$litedb = Join-Path (Split-Path $DbPath) '..\LiteDB.dll'
if (-not (Test-Path $litedb)) { $litedb = 'D:\YunGame\PlayNite\LiteDB.dll' }
if (-not (Test-Path $litedb)) { Write-Output "ERROR: 找不到 LiteDB.dll"; exit 1 }
Add-Type -Path $litedb

# ---- 1. 备份（文件名加当前时间） ----
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$bak = "$DbPath".Replace('.db', "_$stamp.db")
Copy-Item $DbPath $bak -Force
Write-Output "已备份：$bak"

# ---- 2. 打开并遍历所有集合，替换 Actions 里的字符串 ----
$db = New-Object LiteDB.LiteDatabase("Filename=$DbPath;Connection=Direct")
$changedGames = 0
$changedActions = 0
$report = New-Object System.Collections.Generic.List[string]

foreach ($colName in $db.GetCollectionNames()) {
    $col = $db.GetCollection($colName)
    foreach ($doc in $col.FindAll()) {
        if ($null -eq $doc -or -not $doc.ContainsKey('GameActions')) { continue }
        $arr = $doc['GameActions']
        if (-not $arr.IsArray) { continue }
        $gameChanged = $false
        $gameName = if ($doc.ContainsKey('Name')) { $doc['Name'].AsString } else { $doc['_id'].AsString }
        foreach ($act in $arr.AsArray) {
            if (-not $act.IsDocument) { continue }
            foreach ($key in @($act.AsDocument.Keys.ToArray())) {
                $v = $act.AsDocument[$key]
                if ($v.IsString -and $v.AsString.Contains('GameSaveHelperLan')) {
                    $new = $v.AsString.Replace('GameSaveHelperLan', 'GameSaveHelper')
                    $act.AsDocument.Set($key, (New-Object LiteDB.BsonValue($new)))
                    $gameChanged = $true
                    $changedActions++
                    $report.Add("  [$gameName] $key : $new")
                }
            }
        }
        if ($gameChanged) {
            [void]$col.Update($doc)
            $changedGames++
            $report.Add("  ↑ 游戏：$gameName")
        }
    }
}
$db.Dispose()

Write-Output "修改完成：$changedGames 个游戏，$changedActions 处路径"
if ($report.Count -gt 0) { $report | ForEach-Object { Write-Output $_ } }

# ---- 3. 复检：确认没有残留 ----
$db2 = New-Object LiteDB.LiteDatabase("Filename=$DbPath;Connection=Direct")
$left = 0
foreach ($colName in $db2.GetCollectionNames()) {
    $col = $db2.GetCollection($colName)
    foreach ($doc in $col.FindAll()) {
        if ($null -eq $doc -or -not $doc.ContainsKey('GameActions')) { continue }
        $arr = $doc['GameActions']
        if (-not $arr.IsArray) { continue }
        foreach ($act in $arr.AsArray) {
            if (-not $act.IsDocument) { continue }
            foreach ($key in $act.AsDocument.Keys.ToArray()) {
                $v = $act.AsDocument[$key]
                if ($v.IsString -and $v.AsString.Contains('GameSaveHelperLan')) { $left++ }
            }
        }
    }
}
$db2.Dispose()
if ($left -eq 0) { Write-Output "复检通过：已无 GameSaveHelperLan 残留" }
else { Write-Output "警告：仍有 $left 处残留！"; exit 1 }
