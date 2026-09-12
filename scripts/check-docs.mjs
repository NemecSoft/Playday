// 文档漂移守卫（npm run lint:docs / npm run check）。
//
// 为什么需要：本项目的设计文档很全（20+ 篇），但**文档与实现没有任何校验**。
// 已经踩过：migrate-playnite/README 写着「{InstallDir} 启动时会展开」，而代码里
// 从来没展开过 —— 755 个游戏的启动都是坏的，靠人肉排查才发现。
//
// 检查三项：
//   1) 文档里反引号写出的"仓库内路径"必须真实存在（改了文件名/删了文件却没改文档
//      会立刻失败）。只认以仓库顶层目录开头的路径，避免把示例路径误判。
//   2) 相对 markdown 链接 [x](./y.md) 必须存在。
//   3) 提到"已删除的功能"直接失败（删功能后最容易忘的地方）。
//
// 退出码非 0 = 有漂移。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
// 只检查"代码/文档"目录下的路径。release/ 是运行时数据目录（Game_Details 等
// 由程序运行时创建），文档里提到它不代表漂移，所以不纳入检查。
const REPO_PREFIXES = ['src/', 'electron/', 'shared/', 'scripts/', 'docs/', 'locales/', 'server/']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-electron', 'release', '.git'])

// 已删除/改名的东西：文档里再出现就是漂移。
const REMOVED = [
  ['PlanetView', '星球/3D 视图已于 2026-09 整体移除'],
  ['planet_zone_', '3D 分区的文案键已移除'],
  ['view_planet', '视图切换已移除（现在只有网格视图）'],
  ['HorrorValley', '恐怖谷地图已移除'],
  ['imageUrlAsync', '随 3D 视图移除而删除'],
]

function walk(dir, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (e.name.endsWith('.md')) out.push(full)
  }
  return out
}

// docs/ 下全部（plans/ 是历史实施计划，天然会引用"当时要删除的文件"，跳过）
// + 仓库根目录的 md
const files = [...walk(path.join(ROOT, 'docs'))].filter(
  (f) => !path.relative(ROOT, f).split(path.sep).join('/').startsWith('docs/plans/'),
)
for (const f of fs.readdirSync(ROOT)) {
  if (f.endsWith('.md') && fs.statSync(path.join(ROOT, f)).isFile()) files.push(path.join(ROOT, f))
}

// 第一遍：找"被文档明确声明为已删除/被取代"的路径。
// 这类路径在别处被引用是**历史说明**，不是漂移（如 save-backup-tool.md 里的
// "完全取代 —— 删除 `electron/core/nsis.ts`"）。
const HISTORY_MARKERS = ['删除', 'Delete', '原先', '取代', '不再', '废弃', '已移除', '现状', '备查', '背景']
const HISTORY_WINDOW = 3 // 标记词上下 3 行内提到的路径，视为"历史说明"
const historicalPaths = new Set()
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const around = lines.slice(Math.max(0, i - HISTORY_WINDOW), i + HISTORY_WINDOW + 1)
    if (!around.some((l) => HISTORY_MARKERS.some((k) => l.includes(k)))) return
    for (const m of line.matchAll(/`([^`\n]+)`/g)) historicalPaths.add(m[1].trim().split('::')[0])
  })
}

const problems = []
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/')

for (const file of files) {
  const r = rel(file)
  const text = fs.readFileSync(file, 'utf8')
  const dir = path.dirname(file)

  // ---- 1) 反引号里的仓库内路径 ----
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const token = m[1].trim()
    if (!REPO_PREFIXES.some((p) => token.startsWith(p))) continue
    if (token.includes('*') || token.includes('{') || token.includes('<')) continue // 通配/占位示例
    // 去掉 `path::symbol()` 这类"文件内符号"后缀，只校验文件本身存在。
    const target = token.split(/[（(]/)[0].split('::')[0].trim()
    if (historicalPaths.has(target)) continue // 文档已声明它被删除/取代
    if (!fs.existsSync(path.join(ROOT, target))) {
      problems.push(`${r}: 文档里写的路径不存在 → \`${token}\``)
    }
  }

  // ---- 2) 相对链接 ----
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = m[1].trim()
    if (/^(https?:|mailto:|#)/.test(href)) continue
    const clean = href.split('#')[0]
    if (!clean) continue
    if (!fs.existsSync(path.resolve(dir, clean))) {
      problems.push(`${r}: 相对链接指向的文件不存在 → ${href}`)
    }
  }

  // ---- 3) 已删除的功能 ----
  for (const [token, why] of REMOVED) {
    if (text.includes(token)) problems.push(`${r}: 仍提到已移除的 ${token}（${why}）`)
  }
}

if (problems.length) {
  console.error(`✗ 文档检查未通过（${problems.length} 项）：`)
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}
console.log(`✓ 文档检查通过：${files.length} 篇 md 的路径引用、相对链接、已移除功能引用均正常`)
