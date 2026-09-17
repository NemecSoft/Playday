#Requires -Version 5.1
<#
  libraryjson-importto-librarydb.ps1 —— 整库 JSON 管理：**回写（进口）方向**
  把 $jsonDir\*.json 写进权威库 <数据根>\Admin\library.db。

  双击入口 = 仓库根的 libraryjson-importto-librarydb.bat（**只当壳**：切目录 → 调本脚本 → pause）。
  ⚠️ 规矩（docs\PROJECT-MEMORY.md 硬约定 §三.14）：**逻辑一律写 .ps1，别往 bat 里塞**。
     理由见 §三.13：cmd 的重定向/括号/转义坑会**静默产生垃圾文件**（今天真生成过 4 个）。

  真正的库操作在 node：scripts\library-json.mjs（schema 驱动、零字段清单）。本脚本只做编排：
  环境 → 前置检查 → 预览 → 确认 → 写入 → 把"回退点"报出来。

  参数：
    --yes        跳过"按 Y 确认"（自动化用）
    其余原样透传：--merge / --force / --add-columns / --dir / --db / --tables（见 docs\design\library-json.md）

  退出码：0 = 成功或用户取消；1 = 前置检查失败 / 预览失败 / 写入失败（交给自动化判断）。
#>
$ErrorActionPreference = 'Stop'

# ---- 0. 仓库根（本脚本在 scripts\ 下）----
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

# ---- 1. 参数：摘出 --yes、挡掉误传的 --apply --
#   为什么挡 --apply：预览必须是**真的** dry-run，否则下面的"第 1 步"就成了真写。
#   （ps 用 -match 匹配 `--yes`/`-yes` 两种写法：PS 5.1 与 7 对双横线的处理不一样，宽进严出。）
$skipConfirm = $false
$pass = @()
foreach ($a in @($args)) {
  if ($a -match '^-+(yes|apply)$') {
    if ($a -match 'yes$') { $skipConfirm = $true }
    continue
  }
  $pass += $a
}

# ---- 2. proto 管理的 Node 22（找不到就用系统 node），与 dev-client 一致 ----
$node22 = 'C:\Users\Administrator\.proto\tools\node\22.23.2'
if (Test-Path (Join-Path $node22 'node.exe')) {
  $env:PATH = "$node22;$env:PATH"
  Write-Host '[db] 使用 Node 22.23.2 (proto)'
} else {
  Write-Host '[db] 未找到 proto Node 22，使用系统默认 node'
}

# ---- 3. 数据目录：唯一来源是 scripts/lib/devData.mjs（**别在这儿拼目录名**）----
#   它的 --bat 模式按 KEY=VALUE 逐行输出，这里解析成哈希表（用法等同 bat 侧的 data-dir.bat）。
$dataVars = @{}
foreach ($line in (& node 'scripts\data-dir.mjs' '--bat')) {
  if ($line -match '^([A-Z_]+)=(.*)$') { $dataVars[$Matches[1]] = $Matches[2] }
}
$adminDb = $dataVars['PLAYDAY_ADMIN_DB']
if (-not $adminDb) {
  Write-Host '[错误] 取不到权威库路径（data-dir.mjs 没输出）—— 见 scripts/lib/devData.mjs 与 path-modes.json。'
  exit 1
}

# 整库 JSON 目录：**从唯一来源取**（scripts/data-dir.mjs → lib/devData.mjs），本文件不许写死目录名
$jsonDir = (& node (Join-Path $PSScriptRoot 'data-dir.mjs') --json)

Write-Host '============================================'
Write-Host ' Playday 整库 JSON 回写（libraryjson → librarydb）'
Write-Host " JSON  : $jsonDir\*.json"
Write-Host " 权威库: $adminDb"
Write-Host '============================================'

# ---- 4. 前置检查：JSON 目录与权威库都在 ----
if (-not (Test-Path -LiteralPath '$jsonDir')) {
  Write-Host ''
  Write-Host '[错误] 找不到 $jsonDir\ —— 先导出一次：双击 librarydb-exportto-libraryjson.bat'
  exit 1
}
if (-not (Test-Path -LiteralPath $adminDb)) {
  Write-Host ''
  Write-Host "[错误] 找不到权威库 $adminDb"
  Write-Host '       请确认程序数据目录正常（见 config.json 的 libraryDir / sourceLibraryDir）。'
  exit 1
}

# ---- 5. 程序在跑就提醒一句（界面读的是启动时复制的运行时副本，回写不会影响它，但要重启才看到新数据）----
if (Get-Process -Name 'PlayniteUI' -ErrorAction SilentlyContinue) {
  Write-Host ''
  Write-Host '[提示] 检测到 PlayniteUI 正在运行 —— 回写改的是权威库，程序界面要**重启**才会看到新数据。'
}

# ---- 6. 第 1 步：预览（DRY-RUN，不改库）----
Write-Host ''
Write-Host '[db] 第 1 步：预览（DRY-RUN，不改库）'
Write-Host ''
# 用 Tee-Object 把 node 的输出同时"打到屏幕"和"收进变量"：下面要靠它判断有没有东西要写。
& node 'scripts\library-json.mjs' import @pass 2>&1 | Tee-Object -Variable previewOut
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '[db] 预览失败（上面的报错说清了是哪一行的问题）。数据库未改动。'
  exit 1
}

# ---- 6b. 0 处变化就直接收工 ----
#  2026-09-16 实测的误判点：没有改动时脚本**不写库、不产生备份**（库的 mtime 不变），
#  如果还让人"按 Y"，很容易被读成"这脚本没起作用"。所以这里提前结束，并把两个常见原因说清。
if (($previewOut -join "`n") -match '共\s*0\s*处变化') {
  Write-Host ''
  Write-Host '[db] 没有要回写的改动 —— 库与 JSON 已经完全一致（按设计不写库、不产生备份）。'
  Write-Host '     若你确实改过 JSON 却没看到差异，检查两点：'
  Write-Host '       1) 改的是 $jsonDir\games.json（整库镜像）；仓库根那个 games.json 是给存档工具看的只读导出，改它不影响库；'
  Write-Host '       2) 文件确实保存了，且改的是库里有这一列的字段（拼错的列名会被拦下）。'
  exit 0
}

# ---- 7. 第 2 步：确认后真正写入（自动备份）----
#   ps 里没有 cmd 那个"括号块在解析期展开变量"的坑（bat 侧为此得用 goto 分流），读一行判断即可。
# ⚠️ 判据必须**正向**、且不许依赖正则：只有"明确的 Y/y"才写，其它（含读到 EOF）一律取消。
#    2026-09-16 实测踩了两个坑，都指向同一件事 —— 别把"没读到东西"当成"用户同意"：
#      ① `$null -notmatch '^[Yy]$'` 在 PowerShell 里**不是** $true：集合型的 -notmatch 返回
#         "过滤后的结果"，空结果在 if 里当 $false → **写入被放行**、连"已取消"都不打；
#      ② stdin 被重定向 / 读到 EOF 时 Read-Host 可能什么都不返回，这时 $answer 是 $null，
#         再 `.Trim()` 会直接抛错（好在那次是"抛错 = 没写库"，方向安全但不优雅）。
#    所以：先归一化成字符串，再用 -ne 做正向比较。
if (-not $skipConfirm) {
  Write-Host ''
  $raw = Read-Host '按 Y 回车写入数据库（会自动备份权威库）；其他键取消'
  $answer = if ($null -eq $raw) { '' } else { [string]$raw }
  if ($answer.Trim().ToLowerInvariant() -ne 'y') {
    Write-Host ''
    Write-Host '[db] 已取消，数据库未改动。'
    exit 0
  }
}

Write-Host ''
Write-Host '[db] 第 2 步：写入数据库 —— 先自动备份原库（library.db.bak-＜本地时间戳＞），'
Write-Host '       再写进临时文件、校验通过才原子替换（任何一步失败都不动原库）...'
Write-Host ''
& node 'scripts\library-json.mjs' import --apply @pass
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '[db] 写入失败。权威库未被改动（写的是临时文件，校验通过才会替换）。'
  exit 1
}

# ---- 8. 把这次的"回退点"名字指出来 ----
#  ⚠️ 按**文件名**排序，不能按时间：Windows 的 CopyFile 会沿用**源文件**的修改时间，所以备份的
#     mtime 是"库里数据的最后写入时间"、不是"做这份备份的时间"—— 同一份库连备两次会一模一样，
#     按时间排分不出谁新谁旧。备份名是定宽的本地时间戳（YYYYMMDD-HHMMSS）→ 字典序就是时间序。
#     （旧格式 UTC ISO 第 5 个字符是 '-'，整体排在前面，所以取最大名字仍然对。）
$adminDir = Split-Path -Parent $adminDb
$adminName = Split-Path -Leaf $adminDb
$latestBak = Get-ChildItem -LiteralPath $adminDir -Filter "$adminName.bak-*" -ErrorAction SilentlyContinue |
  Sort-Object -Property Name -Descending | Select-Object -First 1

Write-Host ''
Write-Host '[db] 完成 —— 重启 Playday 即可看到新数据。'
if ($latestBak) {
  Write-Host "      回退点（写库之前的原库）: $($latestBak.Name)"
  Write-Host "      回退方法: 把 $($latestBak.Name) 复制回 $adminName 覆盖即可"
} else {
  Write-Host "      [警告] 没在 $adminDir 里找到 .bak-* 备份 —— 不该发生，请手动确认该目录。"
}
exit 0
