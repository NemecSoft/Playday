// 字号审计（`node scripts/audit-font-sizes.mjs`）：找出所有"写死的字号/字体"，
// 并区分"受全局字体缩放控制"与"漏网"两类。
//
// 为什么需要它：设置里的"字体大小"是靠 --ui-font-scale 实现的（见 src/utils/uiFont.ts），
// 而它**只能覆盖 CSS 里的 font-size**（构建期由 postcss-font-scale.cjs 包上 calc）。
// 写在 TSX 里的内联 `style={{ fontSize: 13 }}` 构建期覆盖不到 —— 用户改设置时
// 这些字不会变，属于真缺陷（曾经 App.tsx 出错页、AboutModal 就有 9 处）。
//
// 判定规则：
//   · CSS `font-size: Npx/rem`            → ✅ 受控（插件会包 calc）
//   · CSS `font-size: var(...)/calc(...)` → ✅ 受控（值本身来自变量）
//   · TSX 类名 `text-[Npx]`                → ✅ 受控（Tailwind 生成 CSS，同样被插件覆盖）
//   · TSX 内联 `fontSize: N`               → ❌ 漏网（除非值里自带 var(--ui-font-scale)）
//   · 写死的 font-family                   → 只有 inherit / 刻意指定的等宽、主题字体，人工判断
//
// 退出码非 0 = 有漏网的内联 fontSize（可以接进 npm run check）。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SKIP = new Set(['node_modules', 'dist', 'dist-electron', 'release', '.git', 'fonts'])
const SCALE_VAR = 'var(--ui-font-scale)'

/**
 * 从 `fontSize: ` 之后的内容里取出**完整的值**（到"深度 0 的逗号"或行尾为止）。
 * 需要它是因为模板串里会有 `${...}`：直接按逗号/花括号截断会把
 * `\`calc(${n}px * var(--ui-font-scale))\`` 误判成漏网（实测踩过）。
 */
function captureValue(rest) {
  let depth = 0 // ${ } 与 ( ) 的合计深度
  let out = ''
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i]
    if (ch === '$' && rest[i + 1] === '{') {
      depth++
      out += '${'
      i++
      continue
    }
    if (ch === '(') depth++
    if (ch === '}') {
      if (depth === 0) break // style 对象的收尾
      depth--
    }
    if (ch === ')' && depth > 0) depth--
    if (ch === ',' && depth === 0) break // 下一个属性
    out += ch
  }
  return out.trim()
}

const files = []
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full)
    else if (/\.(tsx?|css)$/.test(e.name)) files.push(full)
  }
}
walk(path.join(ROOT, 'src'))
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/')

let cssPx = 0
let cssVar = 0
const inlineLeaks = [] // ❌ 内联且不带缩放变量
const inlineOk = [] // ✅ 内联但自带 var(--ui-font-scale)
const arbitrary = new Map()
const hardFamilies = []

for (const f of files) {
  const r = rel(f)
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    // 跳过注释行，避免把说明文字里的示例算进去
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return

    if (f.endsWith('.css')) {
      const m = line.match(/font-size:\s*([^;]+);/)
      if (m) {
        if (/var\(|calc\(/.test(m[1])) cssVar++
        else cssPx++
      }
      const fam = line.match(/font-family:\s*([^;]+);/)
      if (fam && !/var\(/.test(fam[1])) hardFamilies.push(`${r}:${i + 1}  ${fam[1].trim()}`)
    } else {
      const m = line.match(/fontSize:\s*(.+)$/)
      if (m) {
        // 取"完整的值"：模板串 ${...} 里会有 } 和 ,，不能简单按逗号截断
        // （否则 `calc(${x}px * var(--ui-font-scale))` 会被误判成漏网）。
        const v = captureValue(m[1])
        const decl = m[1].slice(0, v.length)
        if (decl.includes(SCALE_VAR)) inlineOk.push(`${r}:${i + 1}  ${v}`)
        else inlineLeaks.push(`${r}:${i + 1}  ${v}`)
      }
      for (const a of line.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
        arbitrary.set(a[1], (arbitrary.get(a[1]) || 0) + 1)
      }
    }
  })
}

const arbitraryTotal = [...arbitrary.values()].reduce((a, b) => a + b, 0)

console.log('================ 字号审计 ================')
console.log(`扫描 ${files.length} 个 ts/tsx/css 文件\n`)
console.log(`[CSS] font-size 写死值 ${cssPx} 处、走变量 ${cssVar} 处 —— 全部受 --ui-font-scale 控制`)
console.log(`[TSX] text-[Npx] 类名 ${arbitraryTotal} 处 —— 受控（值写在 TSX 里）`)
console.log(`[TSX] 内联 fontSize 漏网 ${inlineLeaks.length} 处 / 自带缩放 ${inlineOk.length} 处`)
console.log(`[CSS] 写死 font-family ${hardFamilies.length} 处（应有的是 inherit 与刻意指定的等宽/主题字体）`)

if (inlineLeaks.length) {
  console.log('\n❌ 内联 fontSize（改"字体大小"时不会跟着变，请改成 text-[Npx] 类）：')
  for (const x of inlineLeaks) console.log('  ' + x)
}
if (inlineOk.length) {
  console.log('\n✅ 内联但自带缩放的（如 ${设置值} × --ui-font-scale 的预览）：')
  for (const x of inlineOk) console.log('  ' + x)
}
console.log('\n### text-[Npx] 档位分布（px → 次数）')
for (const [v, n] of [...arbitrary.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  console.log(`  ${v}px × ${n}`)
}
console.log('\n### 写死的 font-family')
for (const x of hardFamilies) console.log('  ' + x)

if (inlineLeaks.length) process.exit(1)
console.log('\n✓ 没有漏网的内联字号：所有文字都受"字体大小"设置控制')
