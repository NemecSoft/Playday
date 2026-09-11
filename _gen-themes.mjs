// 批量抓取 tweakcn 社区主题（shadcn/ui 最主流的主题集）→ 转成 Playday
// ThemePaletteTokens → 自动插入 src/utils/themeLibrary.ts。
//
// 幂等：已存在的 p-<id> 会跳过，可重复运行。
// 用法：node _gen-themes.mjs [--refresh]   (--refresh 重新抓取全部并覆盖社区主题段)
import { readFileSync, writeFileSync } from "node:fs";

const LIB = "src/utils/themeLibrary.ts";
const SKIP = new Set(["p-cyberpunk", "p-catppuccin"]); // 已手工接入

// ─── 颜色转换 ─────────────────────────────────────────────
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
  return v; // 兜底原样
}
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (r) => "#" + r.map((c) => Math.round(clamp(c / 255) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
const mix = (a, b, t) => {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex(A.map((v, i) => v + (B[i] - v) * t));
};
const rgba = (hex, a) => {
  const [r, g, b] = hex2rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
const lum = (hex) => {
  const [r, g, b] = hex2rgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// ─── 抓取 ─────────────────────────────────────────────────
const registry = await (await fetch("https://tweakcn.com/r/registry.json")).json();
const ids = registry.items.map((i) => i.name);
console.log(`registry: ${ids.length} 个主题`);

const lib = readFileSync(LIB, "utf8");
const generated = [];
for (const id of ids) {
  const pid = "p-" + id;
  if (SKIP.has(pid) || lib.includes(`id: "${pid}"`)) {
    console.log(`skip ${pid} (已存在)`);
    continue;
  }
  const raw = await (await fetch(`https://tweakcn.com/r/themes/${id}.json`)).json();
  const vars = raw.cssVars?.dark ?? raw.cssVars?.light; // 深色优先（游戏库场景）
  if (!vars) { console.log(`skip ${pid} (无 cssVars)`); continue; }
  const g = (k, d) => (vars[k] != null ? parseColor(vars[k]) : d);
  const background = g("background");
  const foreground = g("foreground");
  const card = g("card", background);
  const primary = g("primary");
  const mutedFg = g("muted-foreground", g("foreground"));
  const border = g("border");
  const isDark = lum(background) < 0.5;

  const entry = {
    id: pid,
    name: id.replace(/(^|-)([a-z0-9])/g, (_, s, c) => (s ? " " : "") + c.toUpperCase()),
    zh: id.replace(/(^|-)([a-z0-9])/g, (_, s, c) => (s ? " " : "") + c.toUpperCase()),
    category: "社区主题",
    palette: {
      background,
      foreground,
      card,
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
    },
  };
  generated.push(entry);
  console.log(`fetch ${pid} ok`);
}

// ─── 生成 TS 并插入 ───────────────────────────────────────
const ts = generated
  .map((e) => {
    const p = Object.entries(e.palette)
      .map(([k, v]) => `      ${k}: ${JSON.stringify(v)},`)
      .join("\n");
    return `  {\n    // 来源：tweakcn 社区预设 "${e.name}"（自动抓取转换，深色优先）。\n    id: "${e.id}",\n    name: ${JSON.stringify(e.name)},\n    zh: ${JSON.stringify(e.zh)},\n    category: ${JSON.stringify(e.category)},\n    palette: {\n${p}\n    },\n  },`;
  })
  .join("\n");

if (!generated.length) { console.log("没有需要新增的主题"); process.exit(0); }
const out = lib.replace(/\];\s*$/, ts + "\n];\n");
writeFileSync(LIB, out, "utf8");
console.log(`\n已追加 ${generated.length} 个主题 → ${LIB}`);
