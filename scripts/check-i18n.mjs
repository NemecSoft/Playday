// i18n 守卫（npm run lint:i18n / npm run check）。
//
// 背景：文案有两处曾被搞成"双源"—— locales/*.json（运行时真正读的）和
// src/i18n/locales/*.ts（零引用的死文件，且已经缺了新键）。死文件已删除，
// 本脚本负责让以下三类问题**自动失败**，防止再漂移：
//   1) 三个语言文件的键不一致（漏翻 / 多翻）。
//   2) 代码里 t("xxx") 用到的键在语言文件里不存在（拼错或忘了加）→ 错误。
//   3) 语言文件里没人用的孤儿键 → 提示（不失败，因为可能是预留）。
//
// 判定"被用到"的方式刻意宽松：收集 src/ 下**所有字符串字面量**再与键集合求交集。
// 这样 ToolsView 那种 `titleKey: "tools_recorder_title"` 的间接用法也能算命中，
// 不会产生误报。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const LOCALES_DIR = path.join(ROOT, 'locales')
const SRC_DIR = path.join(ROOT, 'src')
const BASE = 'zh-CN' // 以中文为基准语言

const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-electron', 'release', '.git'])

function walk(dir, exts, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, exts, out)
    else if (exts.some((x) => e.name.endsWith(x))) out.push(full)
  }
  return out
}

const localeFiles = fs
  .readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ name: path.basename(f, '.json'), file: path.join(LOCALES_DIR, f) }))

if (localeFiles.length === 0) {
  console.error('✗ locales/ 下没有找到任何 .json 语言文件')
  process.exit(1)
}

const locales = new Map()
for (const { name, file } of localeFiles) {
  try {
    locales.set(name, JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch (e) {
    console.error(`✗ locales/${name}.json 不是合法 JSON：${e.message}`)
    process.exit(1)
  }
}

const problems = []
const baseKeys = new Set(Object.keys(locales.get(BASE) ?? {}))
if (baseKeys.size === 0) {
  console.error(`✗ 基准语言 ${BASE}.json 为空`)
  process.exit(1)
}

// ---- 1) 三语言键一致性 ----
for (const [name, obj] of locales) {
  if (name === BASE) continue
  const keys = new Set(Object.keys(obj))
  const missing = [...baseKeys].filter((k) => !keys.has(k))
  const extra = [...keys].filter((k) => !baseKeys.has(k))
  if (missing.length) problems.push(`${name}.json 缺少 ${missing.length} 个键：${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`)
  if (extra.length) problems.push(`${name}.json 多出 ${extra.length} 个键（基准里没有）：${extra.slice(0, 8).join(', ')}${extra.length > 8 ? ' …' : ''}`)
}

// ---- 2) 代码用到的键必须存在 ----
const srcFiles = walk(SRC_DIR, ['.ts', '.tsx'])
const usedLiterals = new Set()
for (const f of srcFiles) {
  const text = fs.readFileSync(f, 'utf8')
  for (const m of text.matchAll(/["'`]([A-Za-z0-9_]*[A-Za-z0-9])["'`]/g)) usedLiterals.add(m[1])
}

// 分两档：
//   hard = 既没有语言文件条目、又没有 defaultValue 兜底 → 界面会直接显示原始 key（真 bug）
//   soft = 有 defaultValue 兜底 → 中文用户正常，其它语言会看到中文兜底文案（缺翻译）
const missingHard = new Set()
const missingSoft = new Set()
for (const f of srcFiles) {
  const text = fs.readFileSync(f, 'utf8')
  // 只认字面量键；变量键无法静态检查，跳过。
  for (const m of text.matchAll(/\bt\(\s*["']([^"']+)["'][^)]*?\)/gs)) {
    const key = m[1]
    if (baseKeys.has(key)) continue
    const loc = `${path.relative(ROOT, f).split(path.sep).join('/')} → t("${key}")`
    if (/defaultValue\s*:/.test(m[0])) missingSoft.add(loc)
    else missingHard.add(loc)
  }
}
for (const m of missingHard) {
  problems.push(`代码里用到但语言文件里没有、也没有 defaultValue 兜底的键：${m}`)
}

// ---- 3) 孤儿键（提示，不失败）----
const orphans = [...baseKeys].filter((k) => !usedLiterals.has(k))

if (problems.length) {
  console.error(`✗ i18n 检查未通过（${problems.length} 项）：`)
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}
console.log(
  `✓ i18n 检查通过：${localeFiles.length} 个语言文件各 ${baseKeys.size} 键且完全一致，无缺失键引用` +
    (orphans.length ? `（另有 ${orphans.length} 个疑似孤儿键，可用 --orphans 查看）` : ''),
)
if (process.argv.includes('--orphans') && orphans.length) {
  console.log('\n疑似孤儿键（没有任何字符串字面量引用）：')
  for (const k of orphans) console.log('  ' + k)
}
