// 静态主题（`src/styles/global.css` 里那 11 套）的守卫测试。
//
// 两条不变量，都是"以后别退化"的性质而不是"某个色值等于什么"：
//   ① **一份真源**：文件内容 == 生成器的输出。谁手改了色值，这里立刻红
//      （配色本来是手写的，所以"手改"是最容易发生的事，必须有这道闸）。
//   ② **判据全过**：文字读得清 / 按钮字压得住 / 边框看得见 / 语义色分得开 ——
//      实测改造前 10 套里有 9 套的 `.btn.primary` 白字不达标（最差 1.41:1）。
import fs from "node:fs";
import chroma from "chroma-js";
import { describe, expect, it } from "vitest";
import { contrast } from "./md3Color.mjs";
import {
  COLOR_KEYS,
  DERIVED_KEYS,
  GLOBAL_CSS,
  auditTheme,
  detectAccentAsText,
  parseStaticThemes,
  runStaticThemes,
} from "./staticThemes.mjs";

const css = fs.readFileSync(GLOBAL_CSS, "utf8");
const themes = parseStaticThemes(css);
const { plans } = runStaticThemes();
const planOf = (id) => plans.find((p) => p.id === id);

describe("静态主题配色（global.css）", () => {
  it("文件内容 = 生成器的输出（手改色值会在这里失败）", () => {
    // 失败时：跑 `node scripts/gen-static-themes.mjs --apply` 重新生成，
    // **不要手改色值** —— 手改的那处下一轮生成就被抹掉，而且没有任何判据保证它。
    const r = runStaticThemes();
    expect(r.changed ? "不一致（跑 node scripts/gen-static-themes.mjs --apply）" : "一致").toBe("一致");
  });

  it("11 套主题（含默认那套）全部存在且都有判据可查", () => {
    expect(themes.map((t) => t.id)).toEqual([
      "default",
      "cartoon",
      "cyberpunk",
      "memphis",
      "neumorphism",
      "comic",
      "ghibli",
      "chinese",
      "wow",
      "lol",
      "pubg",
    ]);
    expect(plans).toHaveLength(themes.length);
  });

  it("每套的判据全过：文字读得清 / 按钮字压得住 / 边框看得见 / 语义色分得开", () => {
    const bad = [];
    for (const p of plans) {
      for (const row of auditTheme(p.colors)) {
        if (!row.ok) bad.push(`${p.id}（${p.mode}）${row.label}: ${row.value.toFixed(2)}${row.unit} < ${row.min}${row.unit}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("当文字用的 accent 在背景上可读（如赛博朋克 / 中国风的 group-header）", () => {
    const asText = detectAccentAsText(css);
    expect(asText.size).toBeGreaterThan(0); // 探测本身要有效，否则这条测试是空的
    const bad = [];
    for (const id of asText) {
      const p = planOf(id);
      if (!p) continue;
      for (const bg of ["--bg-base", "--bg-top", "--bg-panel"]) {
        const ratio = contrast(p.colors["--accent"], p.colors[bg]);
        if (ratio < 4.5) bad.push(`${id}: accent on ${bg} = ${ratio.toFixed(2)}:1`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("非颜色键（字体 / 圆角 / 发光 / 描边）一个都没被碰", () => {
    // 这些是设计取向，不该由配色推导决定 —— 生成器必须整块跳过它们。
    for (const key of ["--font-ui", "--radius", "--radius-lg", "--glow", "--text-glow", "--text-stroke", "--text-stroke-color"]) {
      expect(COLOR_KEYS).not.toContain(key);
      expect(DERIVED_KEYS).not.toContain(key);
    }
    const missing = [];
    for (const t of themes) {
      for (const key of ["--font-ui", "--radius", "--radius-lg"]) {
        if (!t.decls.some((d) => d.key === key)) missing.push(`${t.id}.${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("语义色始终落在「认得出」的色相弧里（不让位让到洋红 / 紫色去）", () => {
    // danger 的 MD3 色相是 29°（红）。品牌色也是红的时候（comic），只按"离得越远越好"去挑
    // 会把它推到洋红（实测被推成 #b90053 ✗）—— 那就不像"危险"了。
    // 所以这里把"语义色还是不是那个语义色"钉住：绿 / 黄橙 / 红橙各占一条弧。
    const arcs = { "--success": [110, 200], "--warning": [40, 110], "--danger": [0, 60] };
    const bad = [];
    for (const p of plans) {
      for (const [key, [lo, hi]] of Object.entries(arcs)) {
        const hue = chroma(p.colors[key]).oklch()[2];
        if (!Number.isFinite(hue)) continue; // 近灰的语义色没有有意义的色相
        if (hue < lo || hue > hi) bad.push(`${p.id}: ${key} 色相 ${hue.toFixed(0)}° 不在 ${lo}~${hi}°`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("窗口关闭红与白字 ≥ 4.5:1（平台约定色，不改主题但也要可读）", () => {
    // 这两个值不在生成器的管辖范围（它们不随主题变，所以不放进 colors 表），
    // 只能直接读 `:root` 块里的声明 —— 靠这条判据兜住它们别退化成低对比。
    const decl = (key) => themes.find((t) => t.id === "default")?.decls.find((d) => d.key === key)?.value;
    const close = decl("--window-close");
    const closeActive = decl("--window-close-active");
    expect(close, "`:root` 里应有 --window-close").toBeTruthy();
    expect(closeActive, "`:root` 里应有 --window-close-active").toBeTruthy();
    expect(contrast(close, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(closeActive, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("半透明衬底跟着最终的 accent 走（不再写死 rgba 数字）", () => {
    // `--accent-soft` 是"accent 的 16% 淡底"，一旦它与 accent 脱钩，
    // 就会出现"改了主色、高亮底色还是旧的"这种只在悬停时看得见的问题。
    const bad = [];
    for (const p of plans) {
      const soft = p.colors["--accent-soft"];
      if (!soft?.includes("color-mix") || !soft.includes(p.colors["--accent"])) {
        bad.push(`${p.id}: ${soft}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("派生变量只在缺的时候补（不会每跑一次多插一份）", () => {
    const counts = new Map();
    for (const t of themes) {
      for (const d of t.decls) {
        if (!DERIVED_KEYS.includes(d.key)) continue;
        counts.set(d.key, (counts.get(d.key) ?? 0) + 1);
      }
    }
    // --accent-fg 每套一个；--accent-alt 只有孟菲斯有
    expect(counts.get("--accent-fg")).toBe(themes.length);
    expect(counts.get("--accent-alt")).toBe(1);
  });
});
