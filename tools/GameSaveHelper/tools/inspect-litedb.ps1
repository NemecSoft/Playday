# 检查 games.db 各集合的文档键名，定位 Actions 实际存储字段
param([string]$DbPath = "D:\YunGame\PlayNite\library\games.db")
Add-Type -Path 'D:\YunGame\PlayNite\LiteDB.dll'
$db = New-Object LiteDB.LiteDatabase("Filename=$DbPath;Connection=Direct")
foreach ($n in $db.GetCollectionNames()) {
    $col = $db.GetCollection($n)
    $c = 0
    $keysets = @{}
    foreach ($d in $col.FindAll()) {
        if ($null -eq $d) { continue }
        $c++
        $ks = ($d.Keys | Sort-Object) -join ', '
        if (-not $keysets.ContainsKey($ks)) { $keysets[$ks] = 0 }
        $keysets[$ks]++
        if ($d.ContainsKey('Actions')) {
            $a = $d['Actions']
            Write-Output ("  [{0}] Actions 类型={1}" -f $n, $a.Type)
            if ($a.IsArray -and $a.AsArray.Count -gt 0) {
                $first = $a.AsArray[0]
                if ($first.IsDocument) {
                    Write-Output ("    首个 Action 键: " + (($first.AsDocument.Keys | Sort-Object) -join ', '))
                    if ($first.AsDocument.ContainsKey('Path')) {
                        Write-Output ("    Path 示例: " + $first.AsDocument['Path'].AsString)
                    }
                }
            }
        }
    }
    Write-Output ("集合 {0}: {1} 条" -f $n, $c)
    foreach ($k in $keysets.Keys) { Write-Output ("    键组合({0}条): {1}" -f $keysets[$k], $k) }
}
$db.Dispose()
