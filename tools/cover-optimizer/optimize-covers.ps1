# =============================================================================
#  封面图规范化 / 瘦身工具
#
#  由来（用户原话）："我现在都是用 AI 生成游戏封面，然后手工剪裁成小的。"
#  —— 手工剪裁这一步可以省掉：AI 出的图（几 MB、几千像素宽）丢进来，这个脚本直接产出
#  能放进 CoverImages 的封面。
#
#  位置：tools/cover-optimizer/（2026-09-14 从「仓库根的 optimize-covers.bat + scripts/ 下的
#  本脚本」搬到这里，改成与 tools/ 下其它工具一样的"自成一个目录"）
#
#  两种用法：
#    1) 生成封面（默认）：把源图/源目录转成封面，输出到 <源>\covers-out\
#         tools\cover-optimizer\optimize-covers.bat -Source "D:\AI封面\2026-09" -OutDir "D:\YunGame\PlayNite\CoverImages"
#    2) 给现有库瘦身：扫 CoverImages，把过大的 PNG 转成同目录的 JPEG（**原图保留**，
#       按封面匹配优先级 webp 80 > gif 60 > jpg 40 > png 20，jpg 会自动被选中，
#       想回退直接删掉新生成的 jpg 即可）
#         tools\cover-optimizer\optimize-covers.bat -Slim
#
#  规则（与 electron/core/runtimeSetup.ts 无关，纯离线处理）：
#    · 只缩不放：宽 > 1920 才缩到 1920，小图原样（放大小图只会更糊更大）
#    · 有透明通道 → 保 PNG；否则 → JPEG q82（照片/截图类封面视觉无差，体积差 5~10 倍）
#    · 跳过动图（GIF / APNG）：静态图会顶掉动图（webp/jpg 优先级高于 gif），那会丢动画
#
#  ⚠️ 本文件必须保存为 UTF-8 with BOM，否则 Windows PowerShell 5.1 会按 ANSI 解析中文，
#     输出全是乱码（同 tools/GameSaveHelper/tools/Build-GameSave.ps1 的约定）。
#  ⚠️ 必须用 Windows PowerShell 5.1 运行（System.Drawing 在 PowerShell 7 里不可用），
#     入口 optimize-covers.bat（同目录）已经写死 5.1 的绝对路径。
#  ⚠️ 找仓库根（读 config.json 要用）靠"向上找 path-modes.json"，与目录深度无关 —— 见 Get-RepoRoot。
# =============================================================================
[CmdletBinding()]
param(
    # 生成封面模式：源文件或源目录
    [string]$Source,
    # 生成封面模式：输出目录（默认 <源目录>\covers-out）
    [string]$OutDir,
    # 瘦身模式：处理现有封面目录（默认取 config.json 的 settings.coverImagesDir）
    [switch]$Slim,
    # 瘦身模式：显式指定要处理的目录（不给就用 config.json 里的封面目录）
    [string]$Dir,
    # 瘦身模式的最小体积阈值（KB），小于它的文件不动
    [int]$SlimMinKB = 300,
    # 封面最大宽度（超过才缩）
    [int]$MaxWidth = 1920,
    # JPEG 质量（1-100）。82 是"屏幕上与高质量原图看不出差别"的常用档
    [int]$JpegQuality = 82,
    # 已存在同名输出时是否覆盖
    [switch]$Force
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$ImageCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$JpegParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$JpegParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]$JpegQuality)

$script:TotalBefore = 0
$script:TotalAfter = 0
$script:Done = 0
$script:Skipped = 0

# 仓库根：从脚本所在目录往上找，认 path-modes.json（仓库根独有的文件）当标记。
# 为什么不再用 `Split-Path -Parent $PSScriptRoot`：本工具原先住在 scripts\（它的上级正好是
# 仓库根）时能歪打正着；搬进 tools\cover-optimizer\ 之后，同一个写法会去找 tools\config.json
# （不存在），-Slim 就会直接报"找不到封面目录"。按标记文件向上找与目录深度无关。
function Get-RepoRoot {
    $dir = $PSScriptRoot
    for ($i = 0; $i -lt 6 -and $dir; $i++) {
        if (Test-Path (Join-Path $dir "path-modes.json")) { return $dir }
        $parent = Split-Path -Parent $dir
        if (-not $parent -or $parent -eq $dir) { break }
        $dir = $parent
    }
    return $null
}

function Get-ConfigCoverDir {
    $root = Get-RepoRoot
    if (-not $root) { return $null }
    $cfg = Join-Path $root "config.json"
    if (-not (Test-Path $cfg)) { return $null }
    try {
        $raw = (Get-Content $cfg -Raw -Encoding UTF8 | ConvertFrom-Json).settings.coverImagesDir
        if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
        if ($raw -match '^[a-zA-Z]:[\\/]') { return $raw }
        return (Join-Path $root $raw)
    } catch { return $null }
}

# 动图判定：GIF 直接算动图（本工具不解析帧数，保守跳过）；PNG 看有没有 acTL 块（APNG 标志）。
function Test-Animated {
    param([string]$Path, [System.Drawing.Image]$Img)
    if ([System.IO.Path]::GetExtension($Path).ToLower() -eq ".gif") { return $true }
    try {
        $fs = [System.IO.File]::OpenRead($Path)
        try {
            $len = [Math]::Min(8192, $fs.Length)
            $buf = New-Object byte[] $len
            [void]$fs.Read($buf, 0, $len)
            for ($i = 0; $i -lt ($len - 4); $i++) {
                if ($buf[$i] -eq 0x61 -and $buf[$i+1] -eq 0x63 -and $buf[$i+2] -eq 0x54 -and $buf[$i+3] -eq 0x4C) { return $true }
            }
            return $false
        } finally { $fs.Dispose() }
    } catch { return $false }
}

function Test-HasAlpha {
    param([System.Drawing.Image]$Img)
    return ($Img.PixelFormat.ToString() -match "Alpha|Argb")
}

# 处理一张图：需要时缩放 + 转码。返回 $true 表示真的产出了文件。
function Convert-Cover {
    param([string]$InPath, [string]$TargetDir)

    $inSize = (Get-Item $InPath).Length
    $img = $null
    try { $img = [System.Drawing.Image]::FromFile($InPath) } catch { Write-Host ("  [跳过] 读不出图: " + (Split-Path $InPath -Leaf)); return $false }

    try {
        if (Test-Animated -Path $InPath -Img $img) {
            Write-Host ("  [跳过] 动图（静态转码会丢动画）: " + (Split-Path $InPath -Leaf))
            $script:Skipped++
            return $false
        }

        $keepPng = Test-HasAlpha -Img $img
        $ext = if ($keepPng) { ".png" } else { ".jpg" }
        $outPath = Join-Path $TargetDir ([System.IO.Path]::GetFileNameWithoutExtension($InPath) + $ext)

        # 目标与源同名（同目录 + 同扩展名，即"透明 PNG 原地转 PNG"）→ 不覆盖原图，说清原因。
        # 之前这里落到下面的"已存在"分支，提示语看着像"文件已经在了"，很误导（我排查过一次）。
        if ([string]::Equals($outPath, $InPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            Write-Host ("  [跳过] 有透明通道、只能存 PNG，与源同名，不改原图: " + (Split-Path $InPath -Leaf))
            $script:Skipped++
            return $false
        }

        if ((Test-Path $outPath) -and (-not $Force)) {
            Write-Host ("  [跳过] 已存在（要覆盖加 -Force）: " + (Split-Path $outPath -Leaf))
            $script:Skipped++
            return $false
        }

        # 只缩不放：小于等于目标宽度就保持原尺寸
        $tw = $img.Width
        $th = $img.Height
        if ($img.Width -gt $MaxWidth) {
            $scale = $MaxWidth / [double]$img.Width
            $tw = $MaxWidth
            $th = [int][Math]::Round($img.Height * $scale)
        }

        $bmp = New-Object System.Drawing.Bitmap($tw, $th)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            # 高质量重采样：这几项决定了"缩小后是不是还锐"（默认档缩出来会发糊）
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $tw, $th)))
        } finally { $g.Dispose() }

        try {
            $bmp.SetResolution(96, 96)
            if ($keepPng) { $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png) }
            else { $bmp.Save($outPath, $ImageCodec, $JpegParams) }
        } finally { $bmp.Dispose() }

        $outSize = (Get-Item $outPath).Length
        $script:TotalBefore += $inSize
        $script:TotalAfter += $outSize
        $script:Done++
        $pct = 100 - [Math]::Round(100.0 * $outSize / $inSize)
        Write-Host ("  [完成] {0}  {1}x{2} -> {3}px  {4:N0} KB -> {5:N0} KB  (省 {6}%)" -f `
            (Split-Path $InPath -Leaf), $img.Width, $img.Height, $tw, ($inSize / 1KB), ($outSize / 1KB), $pct)
        return $true
    } finally { $img.Dispose() }
}

# ---------------------------------------------------------------- 主线
if ($Slim) {
    $dir = $Dir
    if (-not $dir) { $dir = Get-ConfigCoverDir }
    if (-not $dir -or -not (Test-Path $dir)) {
        Write-Host ("[错误] 找不到封面目录（config.json 的 settings.coverImagesDir）：" + $dir)
    Write-Host ("       仓库根 = " + (Get-RepoRoot) + "（按 path-modes.json 标记向上找；找不到就是目录搬过地方了）")
        exit 1
    }
    Write-Host ("[瘦身] 目录: " + $dir)
    Write-Host ("[瘦身] 只处理 PKB 大于 " + $SlimMinKB + " KB 的 PNG（转同目录 JPEG，原图保留）")
    # 只处理 PNG：JPEG 已经是有损压缩，重编码既掉质量又省不了多少；
    # 而 PNG 转 JPEG 在同尺寸下常常能省 5~10 倍 —— 这才是主要浪费。
    $files = Get-ChildItem $dir -File -Filter *.png -ErrorAction SilentlyContinue |
        Where-Object { $_.Length -gt ($SlimMinKB * 1KB) } | Sort-Object Length -Descending
    if (-not $files) { Write-Host "  没有需要处理的 PNG。"; exit 0 }
    Write-Host ("  待处理 " + $files.Count + " 个")
    foreach ($f in $files) { [void](Convert-Cover -InPath $f.FullName -TargetDir $dir) }
} else {
    if (-not $Source) {
        Write-Host "用法："
        Write-Host "  生成封面：tools\cover-optimizer\optimize-covers.bat -Source <源图或源目录> [-OutDir <封面目录>]"
        Write-Host "  库瘦身  ：tools\cover-optimizer\optimize-covers.bat -Slim"
        exit 1
    }
    if (-not (Test-Path $Source)) { Write-Host ("[错误] 源不存在：" + $Source); exit 1 }

    $srcIsDir = (Get-Item $Source).PSIsContainer
    if (-not $OutDir) {
        if ($srcIsDir) { $OutDir = Join-Path $Source "covers-out" }
        else { $OutDir = Join-Path (Split-Path $Source -Parent) "covers-out" }
    }
    if (-not (Test-Path $OutDir)) { [void](New-Item -ItemType Directory -Path $OutDir -Force) }

    Write-Host ("[生成封面] 源: " + $Source)
    Write-Host ("[生成封面] 输出: " + $OutDir + "   最大宽度 " + $MaxWidth + "   JPEG q" + $JpegQuality)

    if ($srcIsDir) {
        $files = Get-ChildItem $Source -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Extension -match '^\.(png|jpg|jpeg|bmp|gif)$' }
    } else {
        $files = @(Get-Item $Source)
    }
    if (-not $files) { Write-Host "  源里没有图片。"; exit 0 }
    Write-Host ("  待处理 " + $files.Count + " 个")
    foreach ($f in $files) { [void](Convert-Cover -InPath $f.FullName -TargetDir $OutDir) }
}

Write-Host ""
Write-Host ("完成 " + $script:Done + " 个，跳过 " + $script:Skipped + " 个。")
if ($script:Done -gt 0) {
    Write-Host ("体积：" + [Math]::Round($script:TotalBefore / 1MB, 1) + " MB -> " + `
        [Math]::Round($script:TotalAfter / 1MB, 1) + " MB  (省 " + `
        (100 - [Math]::Round(100.0 * $script:TotalAfter / [Math]::Max(1, $script:TotalBefore))) + "%)")
}
