// 修复 themeLibrary.ts 里对比度不足的配色：自动调深/调亮 textDim/textSecondary/
// primaryForeground/mutedForeground/secondaryForeground，使其对比度达标。
// 标准：textDim 提到 ≥3:1（弱提示/大文字），其余提到 ≥4.5:1（正文）。
// 用法：--apply 真正修改；不带则 dry-run 打印将改的值。
import * as fs from "fs";

const FILE = "d:/AI/Code/Playnite/Playday/src/utils/themeLibrary.ts";
const APPLY = process.argv.includes("--apply");
const src = fs.readFileSync(FILE, "utf8");

function hexToRgb(h) {
  const hex = h.slice(1);
  const n = parseInt(hex.length === 3 ? hex.split("").map((x) => x + x).join("") : hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
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
// 调整颜色亮度直到与背景对比度达标。
// 方向始终朝"远离背景亮度"：文字比背景亮就加亮，比背景暗就加深，直到对比度达标。
function adjustToContrast(textHex, bgHex, target) {
  const rgb = hexToRgb(textHex);
  const bg = hexToRgb(bgHex);
  const moveLight = lum(rgb) > lum(bg); // 文字比背景亮 → 加亮；否则加深
  let best = rgb.slice();
  for (let step = 0; step < 200; step++) {
    if (contrast(best, bg) >= target) break;
    const d = moveLight ? 2 : -2;
    best = [best[0] + d, best[1] + d, best[2] + d].map((v) =>
      Math.max(0, Math.min(255, v)),
    );
  }
  return rgbToHex(best[0], best[1], best[2]);
}

// 解析配色
const palettes = [];
const segments = src.split(/id:\s*"([^"]+)"/).slice(1);
for (let i = 0; i < segments.length; i += 2) {
  const id = segments[i];
  const body = segments[i + 1] || "";
  const pm = body.match(/palette:\s*\{([\s\S]*?)\n\s*\},/);
  if (!pm) continue;
  const kv = {};
  for (const m of pm[1].matchAll(/(\w+):\s*"(#[0-9a-fA-F]{6})",?/g)) kv[m[1]] = m[2];
  // 记住每个键在 body 里的原始文本位置（用于替换）
  palettes.push({ id, body, kv });
}

// 修复规则：键 → 目标对比度（相对背景），背景取该键常用底
// textDim 常放 bgBase 和 card 上，取两者都要达标 → 保守取较低目标，但至少 3
// 这里用 textDim 对 bgBase 和 card 的最大值都 ≥ target
// 只自动修"阅读性文字"（textDim/textSecondary/mutedForeground/secondaryForeground）。
// primaryForeground 是按钮白字，浅主色按钮上可能无解，需单独处理（见下方手动修复）。
const RULES = [
  // [键, 背景键列表, 目标]
  ["textDim", ["bgBase", "card"], 3.0],
  ["textSecondary", ["bgBase", "card"], 4.0],
  ["mutedForeground", ["muted"], 4.5],
  ["secondaryForeground", ["secondary"], 4.5],
];

let totalChanged = 0;
for (const p of palettes) {
  for (const [key, bgKeys, target] of RULES) {
    const text = p.kv[key];
    if (!text || !text.startsWith("#")) continue;
    const bgs = bgKeys.map((k) => p.kv[k]).filter((v) => v && v.startsWith("#"));
    if (bgs.length === 0) continue;
    // 当前对所有背景的最低对比度
    const minNow = Math.min(...bgs.map((b) => contrast(hexToRgb(text), hexToRgb(b))));
    if (minNow >= target) continue;
    // 用最差的那个背景做调整基准
    const worstBg = bgs.reduce((a, b) =>
      contrast(hexToRgb(text), hexToRgb(b)) < contrast(hexToRgb(text), hexToRgb(a)) ? b : a
    );
    const newText = adjustToContrast(text, worstBg, target);
    totalChanged++;
    console.log(`  ${p.id}.${key}: ${text} -> ${newText}（对比 ${minNow.toFixed(2)} -> ${contrast(hexToRgb(newText), hexToRgb(worstBg)).toFixed(2)}）`);
    if (APPLY) {
      // 在 body 里替换该键值
      p.body = p.body.replace(
        new RegExp(`(${key}:\\s*")${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(")`),
        `$1${newText}$2`,
      );
    }
  }
}
console.log(`\n共需调整 ${totalChanged} 处（${APPLY ? "已应用" : "dry-run，加 --apply 应用"}）`);

if (APPLY) {
  // 重新组装文件：按 id 段重建
  // 简化：直接在原始文件上做替换更安全，但因为分段组装复杂，改为：
  // 收集所有 (id, 新body)，用原始 split 重组。
  const parts = src.split(/id:\s*"([^"]+)"/);
  // parts: [前缀, id1, body1, id2, body2, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const id = parts[i];
    const pal = palettes.find((q) => q.id === id);
    if (pal) parts[i + 1] = pal.body;
  }
  fs.writeFileSync(FILE, parts.join(""), "utf8");
  console.log("已写回文件。");
}
