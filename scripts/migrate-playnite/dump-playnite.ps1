# dump-playnite.ps1 — 把 Playnite 的 LiteDB 数据库导出为干净 JSON。
#
# 用法:
#   powershell -ExecutionPolicy Bypass -File dump-playnite.ps1
#     -PlayniteDir D:\YunGame\PlayNite
#     -OutDir C:\Temp\playnite-dump
#
# 读取 Playnite 便携版的 LiteDB 数据库（library/*.db），把每个集合的 BSON
# 文档展开成普通对象，写入 OutDir/<name>.json。games.db 的集合名是 "Game"，
# 分类库的集合名分别是 Genre / Platform / Company / Category / Tag / Series /
# Region / AgeRating / CompletionStatus / GameFeature / GamesSource。

param(
    [string]$PlayniteDir = 'D:\YunGame\PlayNite',
    [string]$OutDir = (Join-Path $env:TEMP 'playnite-dump')
)

$ErrorActionPreference = 'Stop'

$liteDbDll = Join-Path $PlayniteDir 'LiteDB.dll'
if (-not (Test-Path $liteDbDll)) {
    Write-Error "LiteDB.dll not found at $liteDbDll (pass -PlayniteDir)"
}

Add-Type -Path $liteDbDll

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

# ---- BsonValue → 普通对象（可被 ConvertTo-Json 处理） ----
function Convert-Bson($v) {
    if ($null -eq $v) { return $null }
    if ($v.IsNull) { return $null }
    if ($v.IsGuid) { return $v.AsGuid.ToString() }
    if ($v.IsString) { return $v.AsString }
    if ($v.IsInt32) { return $v.AsInt32 }
    if ($v.IsInt64) { return $v.AsInt64 }
    if ($v.IsDouble) { return $v.AsDouble }
    if ($v.IsDecimal) { return $v.AsDecimal }
    if ($v.IsBoolean) { return $v.AsBoolean }
    if ($v.IsDateTime) { return $v.AsDateTime.ToString('yyyy-MM-ddTHH:mm:ss.fffffffZ') }
    if ($v.IsArray) { return @($v.AsArray | ForEach-Object { Convert-Bson $_ }) }
    if ($v.IsDocument) {
        $obj = [ordered]@{}
        foreach ($kv in $v.AsDocument) { $obj[$kv.Key] = Convert-Bson $kv.Value }
        return $obj
    }
    return $v.RawValue
}

# ---- 集合名 → db 文件名 + 集合名 ----
$collections = @(
    @{ File = 'games.db';            Coll = 'Game' },
    @{ File = 'genres.db';           Coll = 'Genre' },
    @{ File = 'platforms.db';        Coll = 'Platform' },
    @{ File = 'companies.db';        Coll = 'Company' },
    @{ File = 'categories.db';       Coll = 'Category' },
    @{ File = 'tags.db';             Coll = 'Tag' },
    @{ File = 'series.db';           Coll = 'Series' },
    @{ File = 'regions.db';          Coll = 'Region' },
    @{ File = 'ageratings.db';       Coll = 'AgeRating' },
    @{ File = 'completionstatuses.db'; Coll = 'CompletionStatus' },
    @{ File = 'features.db';         Coll = 'GameFeature' },
    @{ File = 'sources.db';          Coll = 'GamesSource' },
    @{ File = 'emulators.db';        Coll = 'Emulator' }
)

foreach ($c in $collections) {
    $dbPath = Join-Path $PlayniteDir 'library' $c.File
    if (-not (Test-Path $dbPath)) {
        Write-Output "SKIP $($c.File) (missing)"
        continue
    }
    $db = New-Object LiteDB.LiteDatabase("Filename=$dbPath;Mode=ReadOnly;ReadOnly=true;Journal=false")
    try {
        $col = $db.GetCollection($c.Coll)
        $count = $col.Count()
        # 直接对 BsonDocument 做转换；用管道收集避免 PowerShell 展开 OrderedDictionary。
        $items = @($col.FindAll() | ForEach-Object { Convert-Bson $_ })
        $jsonPath = Join-Path $OutDir ($c.File -replace '\.db$', '.json')
        # -AsArray 强制输出数组（PowerShell 7+）；单元素集合才不会变成裸对象。
        $items | ConvertTo-Json -Depth 20 -AsArray | Set-Content -Path $jsonPath -Encoding UTF8
        Write-Output "$($c.File) [$($c.Coll)] -> $count items -> $jsonPath"
    }
    finally {
        $db.Dispose()
    }
}
