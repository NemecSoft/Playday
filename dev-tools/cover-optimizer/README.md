# cover-optimizer —— 封面图规范化 / 瘦身

把"AI 出的大图"直接变成能放进 `CoverImages` 的封面，顺带给已有封面库瘦身。
**零新依赖**：只用 Windows 自带的 PowerShell 5.1 + GDI+（不需要 ImageMagick / sharp / node 库）。

设计与实测数据见 [封面图](../../docs/design/cover-images.md)。

## 用法

```bat
REM 1) 生成封面：AI 出的大图（几 MB、几千像素宽）→ 成品封面，输出到 <源>\covers-out\ 或 -OutDir
dev-tools\cover-optimizer\optimize-covers.bat -Source "D:\AI封面\2026-09" -OutDir "D:\YunGame\PlayNite\CoverImages"

REM 2) 给现有库瘦身：扫 CoverImages，把过大的 PNG 转成同目录的 JPEG
dev-tools\cover-optimizer\optimize-covers.bat -Slim

REM 只处理指定目录（不给 -Dir 就用 config.json 的 settings.coverImagesDir）
dev-tools\cover-optimizer\optimize-covers.bat -Slim -Dir "D:\YunGame\PlayNite\CoverImages"
```

双击 `optimize-covers.bat` 也可以（不带参数会打印用法）。

常用参数：`-MaxWidth`（默认 1920，超过才缩）、`-JpegQuality`（默认 82）、
`-SlimMinKB`（默认 300，小于它的文件不动）、`-Force`（覆盖已存在的输出）。

## 规则

- **只缩不放**：宽 > 1920 才缩到 1920；小图原样（放大小图只会更糊更大）。
- **有透明通道 → 保 PNG**；否则 → **JPEG q82**（照片/截图类封面肉眼看不出差别，体积差 5~10 倍）。
- **跳过动图**（GIF / APNG）：静态图会顶掉动图（封面匹配里 `webp 80 > gif 60 > jpg 40 > png 20`），
  那会丢动画。
- **原图一律保留**：瘦身是"同目录新增一个 jpg"，回退就是删掉新生成的 jpg
  （优先级比 png 高，所以 jpg 一出现就会被选中）。

## 文件

| 文件 | 职责 |
| --- | --- |
| `optimize-covers.bat` | 双击/命令行入口。纯 ASCII，写死 Windows PowerShell 5.1 的绝对路径 |
| `optimize-covers.ps1` | 实现。**必须 UTF-8 with BOM**（否则 5.1 按 ANSI 解析中文，输出乱码） |

## 两个坑（改这个工具前先读）

1. **必须 Windows PowerShell 5.1**，不能用 PowerShell 7：`System.Drawing`（GDI+）在 PS7 里不可用。
   本机 PATH 上的 `powershell` 是 PS7.6.5，所以 `.bat` 写死了
   `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`。
   同一个坑在 `docs/design/gpu-acceleration.md` 里也记着。
2. **找仓库根靠"向上找 `path-modes.json`"**，不能靠"上一级目录"：本工具 2026-09-14 从
   `scripts/` 搬到这里，原先那种 `Split-Path -Parent $PSScriptRoot` 的推导会去 `dev-tools\config.json`
   找配置，直接失败。要移动这个目录，`Get-RepoRoot` 不用改。
