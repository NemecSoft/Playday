// 生成 / 审计 `src/styles/global.css` 里的静态主题配色（MD3 色调体系）。
//
// 用法：
//   node scripts/gen-static-themes.mjs              空跑：打印每套要改什么 + 审计结果（不写盘）
//   node scripts/gen-static-themes.mjs --apply      写回 global.css
//   node scripts/gen-static-themes.mjs --only wow   只看/只改一套
//   node scripts/gen-static-themes.mjs --audit      只打审计表（判据 = 可读性 / 看得见 / 分得开）
//
// 判据与推导都在 scripts/lib/staticThemes.mjs —— 这里只负责打印与写盘。
import { GLOBAL_CSS, auditTheme, runStaticThemes } from "./lib/staticThemes.mjs";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const AUDIT_ONLY = argv.includes("--audit");
const ONLY = (() => {
  const i = argv.indexOf("--only");
  return i >= 0 ? argv[i + 1] : null;
})();

const { changed, plans } = runStaticThemes({ apply: APPLY });

const shown = ONLY ? plans.filter((p) => p.id === ONLY) : plans;
if (!shown.length) {
  console.log(ONLY ? `没有叫 ${ONLY} 的静态主题。` : "没找到静态主题块。");
  process.exit(0);
}

if (!AUDIT_ONLY) {
  for (const p of shown) {
    const head = `${p.id}（${p.mode === "dark" ? "暗色" : "亮色"}）`;
    if (!p.changes.length) {
      console.log(`\n${head}：无需改动`);
    } else {
      console.log(`\n${head}：${p.changes.length} 处`);
      for (const c of p.changes) {
        console.log(`   ${c.key.padEnd(17)} ${String(c.from).padEnd(46)} → ${String(c.to).padEnd(46)} ${c.reason}`);
      }
    }
    console.log(`   （派生）--accent-fg: ${p.accentFg}${p.accentAlt ? `  --accent-alt: ${p.accentAlt}` : ""}`);
  }
}

console.log(`\n=== 审计（判据：文字读得清 / 边框看得见 / 语义色分得开）===`);
let bad = 0;
for (const p of shown) {
  const rows = auditTheme(p.colors);
  const fails = rows.filter((r) => !r.ok);
  bad += fails.length;
  const label = `${p.id}（${p.mode === "dark" ? "暗" : "亮"}）`;
  if (!fails.length) {
    console.log(`✓ ${label.padEnd(24)} ${rows.length} 条判据全过（最低 ${Math.min(...rows.map((r) => r.value)).toFixed(2)}）`);
  } else {
    console.log(`✗ ${label}`);
    for (const f of fails) {
      console.log(`     ${f.label}：${f.value.toFixed(2)}${f.unit} < ${f.min}${f.unit}`);
    }
  }
}

console.log(
  `\n共 ${shown.length} 套，${changed ? "文件与生成结果**不一致**" : "文件与生成结果一致"}${APPLY ? "（已写回）" : "（空跑，未写盘）"}`,
);
if (bad) console.log(`⚠️ ${bad} 条判据不达标`);
process.exit(bad ? 1 : 0);
