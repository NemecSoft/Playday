// 重建 themeLibrary.ts：
//   保留 4 个手工主题（明亮/暗黑/赛博朋克/Catppuccin）+ tweakcn 全部社区预设。
//   其余旧主题（中国风/游戏联名/渐变特别版等）全部删除。
// 用法：node _rebuild-themes.mjs
import { readFileSync, writeFileSync } from "node:fs";

const LIB = "src/utils/themeLibrary.ts";
const KEEP = ["p-light", "p-dark", "p-cyberpunk", "p-catppuccin"];

// ─── 颜色转换（同 _gen-themes.mjs）─────────────────────────
const clamp = (v) => Math.min(1, Math.max(0, v));
const to255 = (c) => Math.round(clamp(c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
function oklchToHex(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  let l = L + 0.3963377774 * a + 0.2158037573 * b;
  let m = L - 0.1055613458 * a - 0.0638541728 * b;
  let s = L - 0.0894841775 * a - 1.2914855480 * b;
  l **= 3; m **= 3; s **= 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return "#" + [r, g, bb].map(to255).map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
}
function hslToHex(h, sPct, lPct) {
  const s = sPct / 100, l = lPct / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x) => Math.round(x * 255);
  return "#" + [f(0), f(8), f(4)].map(to).map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
}
function parseColor(v) {
  if (!v) return "#000000";
  v = String(v).trim();
  let m = v.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (m) return oklchToHex(+m[1], +m[2], +m[3]);
  m = v.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/i);
  if (m) return hslToHex(+m[1], +m[2], +m[3]);
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v.toUpperCase();
  return v;
}
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (r) => "#" + r.map((c) => Math.round(clamp(c / 255) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v + (B[i] - v) * t)); };
const rgba = (hex, a) => { const [r, g, b] = hex2rgb(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; };
const lum = (hex) => { const [r, g, b] = hex2rgb(hex).map((v) => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

// ─── 从现有文件抽出保留的手工主题块 ────────────────────────
const lib = readFileSync(LIB, "utf8");
function extractBlock(id) {
  const anchor = lib.indexOf(`id: "${id}"`);
  if (anchor < 0) throw new Error(`找不到 ${id}`);
  const start = lib.lastIndexOf("\n  {", anchor);
  const end = lib.indexOf("\n  },", anchor) + "\n  },".length;
  return lib.slice(start + 1, end);
}
const keptBlocks = KEEP.map(extractBlock);

// ─── 抓取 tweakcn 全部社区主题 ─────────────────────────────
const registry = await (await fetch("https://tweakcn.com/r/registry.json")).json();
const generated = [];
for (const item of registry.items) {
  const id = item.name;
  if (KEEP.includes("p-" + id)) continue;
  const raw = await (await fetch(`https://tweakcn.com/r/themes/${id}.json`)).json();
  const vars = raw.cssVars?.dark ?? raw.cssVars?.light;
  if (!vars) continue;
  const g = (k, d) => (vars[k] != null ? parseColor(vars[k]) : d);
  const background = g("background");
  const foreground = g("foreground");
  const card = g("card", background);
  const primary = g("primary");
  const mutedFg = g("muted-foreground", g("foreground"));
  const border = g("border");
  const isDark = lum(background) < 0.5;
  const name = id.replace(/(^|-)([a-z0-9])/g, (_, s, c) => (s ? " " : "") + c.toUpperCase());
  const p = {
    background, foreground, card,
    cardForeground: g("card-foreground", foreground),
    primary,
    primaryForeground: g("primary-foreground", isDark ? "#FFFFFF" : "#111111"),
    secondary: g("secondary", card),
    secondaryForeground: g("secondary-foreground", foreground),
    muted: g("muted", card),
    mutedForeground: mutedFg,
    border,
    ring: g("ring", primary),
    bgBase: background,
    bgTop: g("sidebar", card),
    bgSidebar: g("sidebar", g("secondary", card)),
    bgPanel: card,
    bgItemHover: g("sidebar-accent", g("muted", card)),
    bgItemActive: g("accent", g("secondary", card)),
    bgInput: g("input", background),
    borderStrong: g("ring", border),
    textPrimary: foreground,
    textSecondary: mix(mutedFg, background, 0.15),
    textDim: mix(mutedFg, background, 0.4),
    accent: primary,
    accentHover: mix(primary, "#FFFFFF", 0.18),
    accentSoft: rgba(primary, 0.18),
    success: isDark ? "#2FBF7F" : "#16A34A",
    warning: isDark ? "#E0A63A" : "#D97706",
    danger: g("destructive", isDark ? "#E5484D" : "#DC2626"),
  };
  const pTs = Object.entries(p).map(([k, v]) => `      ${k}: ${JSON.stringify(v)},`).join("\n");
  generated.push(
    `  {\n    // 来源：tweakcn 社区预设 "${name}"（自动抓取转换，深色优先）。\n    id: "p-${id}",\n    name: ${JSON.stringify(name)},\n    zh: ${JSON.stringify(name)},\n    category: "社区主题",\n    palette: {\n${pTs}\n    },\n  },`
  );
}

// ─── 组装新文件 ────────────────────────────────────────────
const ifaceStart = lib.indexOf("export interface ThemePaletteTokens");
const ifaceEnd = lib.indexOf("export const themeLibrary");
const interfaces = lib.slice(ifaceStart, ifaceEnd).trimEnd();

const header = `// 主题配色库（2026-09 精简版）。
//
// 只保留两 类：
//   1) 基础：明亮 / 暗黑（手工维护）
//   2) 社区主流：tweakcn（shadcn/ui 社区主题集）预设，含赛博朋克 / Catppuccin
//      （手工精确换算）+ 34 个自动抓取转换（_rebuild-themes.mjs，可重跑同步）。
// 旧的"中国风/游戏联名/渐变特别版"等主题已删除。
//
// 配色 + 风格(styleLibrary) 组合成完整主题；token 同时映射 shadcn 变量与
// 业务变量（--bg-base/--text-primary/--accent/...），由 themeApply.ts 注入 :root。
`;

const out = `${header}${interfaces}\n\nexport const themeLibrary: ThemeEntry[] = [\n${keptBlocks.join("\n")}\n${generated.join("\n")}\n];\n`;
writeFileSync(LIB, out, "utf8");
console.log(`重建完成：${KEEP.length} 个手工 + ${generated.length} 个社区 = ${KEEP.length + generated.length} 个主题`);
