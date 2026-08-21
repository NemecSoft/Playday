// 对比度审计：扫描 themeLibrary.ts 的所有配色，计算关键文字-背景对比度，
// 标出低于 WCAG AA（正文 4.5:1 / 大文字 3:1）的配对。只读不修改。
import * as fs from "fs";

const src = fs.readFileSync(
  "d:/AI/Code/Playnite/Playday/src/utils/themeLibrary.ts",
  "utf8",
);

// 解析每个配色：id + palette 键值
const palettes = [];
// 按 entry 分段：每个 "id: "xxx" 到下一个 "id: " 或文件结尾
const segments = src.split(/id:\s*"([^"]+)"/).slice(1);
for (let i = 0; i < segments.length; i += 2) {
  const id = segments[i];
  const body = segments[i + 1] || "";
  // 提取 palette 块（在最后一个 palette: { 到配对的 } 之间）
  const pm = body.match(/palette:\s*\{([\s\S]*?)\n\s*\},/);
  if (!pm) continue;
  const kv = {};
  for (const m of pm[1].matchAll(/(\w+):\s*"(#[0-9a-fA-F]{6}|rgba?\([^)]*\))",?/g)) {
    kv[m[1]] = m[2];
  }
  palettes.push({ id, kv });
}

// WCAG 对比度计算
function parse(c) {
  c = c.trim();
  if (c.startsWith("#")) {
    const hex = c.slice(1);
    const n = parseInt(
      hex.length === 3 ? hex.split("").map((x) => x + x).join("") : hex,
      16,
    );
    return [
      (n >> 16) & 255,
      (n >> 8) & 255,
      n & 255,
    ];
  }
  // rgba(...) 近似按不透明处理（accentSoft 等透明色不作严格对比度计算）
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
function lum(rgb) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}
function contrast(a, b) {
  const la = lum(a);
  const lb = lum(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// 需要审计的配对： [文字键, 背景键]
const pairs = [
  ["foreground", "background"],
  ["textPrimary", "bgBase"],
  ["textSecondary", "bgBase"],
  ["textDim", "bgBase"],
  ["textSecondary", "card"],
  ["textDim", "card"],
  ["accent", "bgBase"],
  ["mutedForeground", "muted"],
  ["secondaryForeground", "secondary"],
  ["primaryForeground", "primary"],
];

let anyLow = false;
for (const p of palettes) {
  const low = [];
  for (const [t, b] of pairs) {
    const tv = parse(p.kv[t]);
    const bv = parse(p.kv[b]);
    if (!tv || !bv) continue; // 透明色跳过
    const c = contrast(tv, bv);
    if (c < 4.5) low.push({ t, b, c: c.toFixed(2) });
  }
  if (low.length) {
    anyLow = true;
    console.log(`\n### ${p.id}（${low.length} 处 <4.5）`);
    low.forEach((l) =>
      console.log(
        `   ${l.t}  vs  ${l.b}  =  ${l.c}  (${p.kv[l.t]}  on  ${p.kv[l.b]})`,
      ),
    );
  }
}
if (!anyLow) console.log("全部配对 ≥ 4.5:1，无需修复。");
console.log(`\n共审计 ${palettes.length} 个配色。`);
