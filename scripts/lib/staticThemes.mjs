// `src/styles/global.css` 里那批**静态主题**（`:root[data-theme="…"]`）的生成器。
//
// 为什么要有它（2026-09-18，用户："用 Chroma.js 搞一下，哪些不合适的改一下"）：
//   这 10 套配色的色值是**手写**的 —— 于是必然出现"某套的按钮白字压在亮橙上看不清"
//   （实测 10 套里有 9 套 `.btn.primary` 的白字不达标，最差 1.41:1）、
//   "边框和背景只差 3 个 tone（屏幕上直接消失）"、"warning 写成近白色 tone 96"这类问题。
//   靠眼睛一套套调是调不完的，所以改成**由种子推导**：色相与彩度（设计取向，保留）不动，
//   只把 **tone 对齐 MD3 的角色表**（ROLE_TONES），可读性由数学保证，不再靠手感。
//
// 三条设计原则（也是本文件存在的理由）：
//   1. **非颜色键一律不动**：字体 / 圆角 / 发光 / 描边是设计取向，不是配色推导的产物；
//   2. **最小改动**：只在该键确实不达标时才挪 tone（且只挪到刚好达标），能不动就不动 ——
//      "每跑一次都微调一点点、永远收敛不了"是旧脚本踩过的坑；
//   3. **一份真源**：文件内容 = 本模块的输出。`scripts/lib/staticThemes.test.mjs` 会断言二者一致，
//      所以任何人手改色值都会在 `npm test` 里立刻暴露。
//
// ⚠️ 由此带来的一条使用注意（踩过一次）：**种子就是文件里的当前值**。
//    "改了生成规则"不会把已写进文件的值重新推一遍 —— 那些值现在**满足**新规则（所以不触发改动），
//    于是一个被旧规则推坏的值会永远留着。实测：`comic` 的 `--danger` 在"让位不限方向"的旧规则下
//    被推成了洋红 `#b90053`；加了方向约束之后它依然在（洋红确实离品牌色够远，不再触发让位）。
//    正确做法：把受影响的键**改回原始手写值当种子**，再跑 `--apply`。
//
// ⚠️ 写回方式：**按块偏移量拼接**，不是 `split(分隔符)` 再 join ——
//    后者会把分隔符本身吃掉（2026-09-18 在 themeLibrary.ts 上真的把文件写成了语法错误）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chroma from "chroma-js";
import {
  ROLE_TONES,
  SEMANTIC_HUE,
  atHue,
  contrast,
  deltaE,
  fitTone,
  isDark,
  toneOf,
  withTone,
  withToneChroma,
} from "./md3Color.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 静态主题所在的文件。 */
export const GLOBAL_CSS = path.resolve(HERE, "../../src/styles/global.css");

/** 参与推导的颜色键（其余键一律原样保留）。 */
export const COLOR_KEYS = [
  "--bg-base",
  "--bg-top",
  "--bg-sidebar",
  "--bg-panel",
  "--bg-item-hover",
  "--bg-item-active",
  "--bg-input",
  "--border",
  "--border-strong",
  "--text-primary",
  "--text-secondary",
  "--text-dim",
  "--accent",
  "--accent-hover",
  "--accent-soft",
  "--success",
  "--warning",
  "--danger",
];

/** 由上面这些色值**派生**出来的变量：文件里原本没有，由生成器补上（缺了才插）。 */
export const DERIVED_KEYS = ["--accent-fg", "--accent-alt"];

/** 表面键 → ROLE_TONES 里的角色名。表面一律**由该主题自己的 --bg-base 派生**（保持"一套色"）。 */
const SURFACE_ROLE = {
  "--bg-base": "background",
  "--bg-top": "bgTop",
  "--bg-sidebar": "bgSidebar",
  "--bg-panel": "bgPanel",
  "--bg-item-hover": "bgItemHover",
  "--bg-item-active": "bgItemActive",
  "--bg-input": "bgInput",
};

/** 文字键 → 角色名（文字保留各自的色相与彩度 —— 那是"暖墨 / 冷墨"的取向）。 */
const TEXT_ROLE = {
  "--text-primary": "textPrimary",
  "--text-secondary": "textSecondary",
  "--text-dim": "textDim",
};

/** 语义键 → 角色名。 */
const SEMANTIC_KEYS = { "--success": "success", "--warning": "warning", "--danger": "danger" };

/**
 * 语义色"读不清时"回落的 tone（MD3 没有 success / warning 这两个角色，按"主色那一档"顺延）：
 * 它们既要能当**文字**（状态文案）又要能当**填充**（徽标底色），所以取主色同一档 ——
 * 亮色 42 上下（白字压上去仍有 5:1，自身当文字也有 4.9:1）/ 暗色 78 上下。
 *
 * ⚠️ 只在**确实不达标**时才用：语义色的"扎眼"是它的职责，原来就达标的不要动
 *    （cyberpunk 的 `--danger: #ff4032` 本来是 4.79:1，无条件重刷反而被刷成浅粉 —— 那是倒退）。
 */
const SEMANTIC_TONES = {
  dark: { success: 78, warning: 80, danger: 76 },
  light: { success: 42, warning: 45, danger: 42 },
};

/** 语义色之间、以及语义色与品牌色之间的**最小感知色差**。低于它 = 屏幕上分不出来。 */
const MIN_SEMANTIC_GAP = 12;

/** 边框与表面之间要留够的**色调间距**（对比度管"看得清"，色调间距管"看得见"）。 */
export const MIN_BORDER_SEP = 8;

/**
 * 滚动条**不在这里生成**：`global.css` 里已有一条通用的
 * `::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--text-primary) 18%, transparent) }`
 * —— 它本来就跟随主题（那句注释写得很清楚：加它是为了干掉"硬编码的蓝色滑块"）。
 * 原来那 7 条 `:root[data-theme=…] ::-webkit-scrollbar-thumb` 是同一件事的**第二批**，
 * 属于历史遗留，已删除；再多加一个 `--scrollbar` 变量就是第三套机制了。
 */

/** 第二个图案色（目前只有孟菲斯用）的 tone：两种模式下都取中间调，叠 alpha 后才看得见。 */
const ALT_TONE = { dark: 70, light: 55 };

/* ------------------------------------------------------------------ *
 * 解析：把 global.css 里每个 :root[data-theme="…"] 块切成 结构 + 偏移量
 * ------------------------------------------------------------------ */

/**
 * 找出所有静态主题块：`:root[data-theme="x"] { … }` 以及**裸 `:root { … }`**（默认那套，id = `default`）。
 *
 * 为什么裸 `:root` 也要管：它是"没存过主题"时的首启动配色（96 套运行时配色库是**注入式**的，
 * 没选过就不会注入），所以用户第一次打开看到的正是它 —— 它的按钮白字压在 `#2d7ff9` 上只有 3.6:1，
 * 不修就是"第一眼就不合适"。
 *
 * 只认**块首**那种写法（行首，且花括号前没有别的选择器）—— 文件后面还有一批
 * `:root[data-theme="cyberpunk"] .grid-card .cover { … }` 这样的"主题专属修饰"规则，
 * 它们不是配色块，不能被当成主题声明。裸 `:root` 还要额外满足"块里有 --bg-base"这个条件。
 */
export function parseStaticThemes(css) {
  const out = [];
  const re = /^:root(\[data-theme="([a-zA-Z0-9_-]+)"\])?\s*\{/gm;
  let m;
  while ((m = re.exec(css))) {
    const id = m[2] ?? "default";
    const open = m.index + m[0].length - 1; // m[0] 以 `{` 结尾
    const close = css.indexOf("}", open);
    if (close < 0) continue;
    const body = css.slice(open + 1, close);
    if (id === "default" && !/--bg-base\s*:/.test(body)) continue; // 别的裸 :root（如只放 --radius）不管
    out.push({
      id,
      /** 块在整份文件里的 [start, end)：start 指向 `:root`，end 指向 `}` 之后。 */
      start: m.index,
      end: close + 1,
      body,
      decls: parseDecls(body),
    });
  }
  return out;
}

/** 解析块内的 `--key: value;` 声明（带在块内的偏移，便于原地替换）。 */
export function parseDecls(body) {
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
  const decls = [];
  let m;
  while ((m = re.exec(body))) {
    const raw = m[0];
    const at = raw.indexOf(m[2]);
    decls.push({
      key: m[1],
      value: m[2].trim(),
      /** 整条声明在 body 内的 [start, end)。 */
      start: m.index,
      end: m.index + raw.length,
      /** 值在 body 内的 [start, end) —— 只换值，保留 `--key: ` 与结尾 `;` 的原样格式。 */
      valueStart: m.index + at,
      valueEnd: m.index + at + m[2].length,
      /** 声明所在**整行**在 body 内的 [start, end)（含行尾换行）—— 插入新变量时用。 */
      lineStart: body.lastIndexOf("\n", m.index) + 1,
      lineEnd: (() => {
        const i = body.indexOf("\n", m.index + raw.length);
        return i < 0 ? body.length : i + 1;
      })(),
    });
  }
  return decls;
}

/* ------------------------------------------------------------------ *
 * 推导：种子（现有色值） → MD3 角色 tone
 * ------------------------------------------------------------------ */

/** 取一个键的现有值（找不到返回 null）。 */
function get(theme, key) {
  return theme.decls.find((d) => d.key === key)?.value ?? null;
}

/** 色相（灰阶是 NaN，兜成 0）。 */
function hueOf(color) {
  const h = chroma(color).oklch()[2];
  return Number.isFinite(h) ? h : 0;
}

/**
 * 两个色"是不是同一个"：tone 差 < 0.25 且 ΔE < 1（感知上分不出来）。
 * 用于幂等 —— 见 planTheme 里 record() 的说明。非纯色值（如 color-mix 表达式）一律返回 false。
 */
function near(a, b) {
  try {
    return Math.abs(toneOf(a) - toneOf(b)) < 0.25 && deltaE(a, b) < 1.0;
  } catch {
    return false;
  }
}

/**
 * 语义色让位时的**首选方向**（+1 = 色相往大走，−1 = 往小走）。
 *
 * 为什么要限制方向：`danger` 的 MD3 色相是 29°（红）。品牌色也是红的时候（comic 就是），
 * 只按"离得越远越好"去挑，会把它推到**洋红**（实测被推成 `#b90053` ✗）——
 * 洋红不像"危险"，语义色就失去了"不看图例也认得出"的意义。
 * 所以只允许往"更橙"那一侧让：danger 29° → +、warning 85°（琥珀）→ −、
 * success 145°（绿）两侧都还在绿区，就交给"离得远"决定。
 */
const SEMANTIC_HUE_DIRS = { success: [1, -1], warning: [-1, 1], danger: [1, -1] };

/**
 * 让一个颜色与一组"邻居"拉开至少 minGap 的感知色差：先按角色色相归位，
 * 不够就把色相**一小步一小步**往外挪（每次 8°，方向按 dirs 的首选顺序），
 * 取第一个达标的 —— 仍是"最小改动"。
 */
function separateFrom(color, hueTarget, neighbors, minGap, dirs = [1, -1]) {
  const refs = neighbors.filter(Boolean);
  for (let step = 0; step <= 6; step++) {
    const hues = step === 0 ? [hueTarget] : dirs.map((d) => hueTarget + d * 8 * step);
    for (const hue of hues) {
      const cand = atHue(color, ((hue % 360) + 360) % 360);
      if (refs.every((n) => deltaE(cand, n) >= minGap)) return cand;
    }
  }
  return atHue(color, hueTarget);
}

/**
 * 生成一套静态主题的目标色值。
 *
 * @param theme parseStaticThemes 里的一项
 * @param opts.accentAsText  该主题的 accent 是否被当作**文字**用（如 `.group-header { color: var(--accent) }`）
 * @param opts.accentAltSeed 第二个图案色的现有值（没有就为 null）
 */
export function planTheme(theme, opts = {}) {
  const bgBase = get(theme, "--bg-base");
  if (!bgBase) return null;
  const dark = isDark(bgBase);
  const mode = dark ? "dark" : "light";
  const role = ROLE_TONES[mode];

  const colors = {};
  const changes = [];
  /**
   * 记一笔。**差异低于感知阈值就保留原值、不记改动** —— 这条是幂等性的关键：
   * 目标色是"按 tone 算出来的"，而写进文件的是 8bit hex，下一轮读回来算 tone 会有 ±0.0x 的量化误差，
   * 不拦的话每跑一次就会微漂一点（旧脚本"每跑一次都微调一点点、永远收敛不了"就是这个）。
   * ΔE < 1 在感知上就是同一个色，保留文件里的那个即可。
   */
  const record = (key, from, to, reason) => {
    const cur = get(theme, key);
    if (cur && near(cur, to)) {
      colors[key] = cur;
      return;
    }
    colors[key] = to;
    if (String(from).toLowerCase() !== String(to).toLowerCase()) changes.push({ key, from, to, reason });
  };

  // ① 表面：全部由该主题自己的 --bg-base 派生（同色相、极低彩度 = MD3 的 neutral），
  //    只把 tone 对齐角色表。这样"表面层级"在任何主题下都一致。
  const surfaceChroma = Math.min(chroma(bgBase).oklch()[1] || 0, 0.02);
  for (const [key, roleKey] of Object.entries(SURFACE_ROLE)) {
    const from = get(theme, key);
    if (!from) continue;
    record(key, from, withToneChroma(bgBase, role[roleKey], surfaceChroma), `表面 → ${roleKey}（tone ${role[roleKey]}）`);
  }

  // ② 文字：保留各自的色相/彩度（暖墨、冷墨是取向），只对齐 tone。
  for (const [key, roleKey] of Object.entries(TEXT_ROLE)) {
    const from = get(theme, key);
    if (!from) continue;
    record(key, from, withTone(from, role[roleKey]), `文字 → ${roleKey}（tone ${role[roleKey]}）`);
  }

  // ③ 边框：除了对齐 outline-variant，还要与表面**拉开够看的色调间距**。
  const surfaces = Object.keys(SURFACE_ROLE)
    .map((k) => colors[k] ?? get(theme, k))
    .filter(Boolean);
  for (const [key, roleKey, minSep] of [
    ["--border", "border", MIN_BORDER_SEP],
    ["--border-strong", "borderStrong", MIN_BORDER_SEP + 8],
  ]) {
    const from = get(theme, key);
    if (!from) continue;
    let tone = role[roleKey];
    const dir = dark ? 1 : -1; // 往"离表面更远"的一侧推
    for (let step = 0; step <= 60; step++) {
      const t = tone + dir * step;
      if (t < 0 || t > 100) break;
      if (surfaces.every((s) => Math.abs(t - toneOf(s)) >= minSep)) {
        tone = t;
        break;
      }
    }
    record(key, from, withTone(from, tone), `边框 → ${roleKey}（tone ${tone.toFixed(0)}，与表面间距 ≥ ${minSep}）`);
  }

  // ④ accent：**色相与彩度原样保留**（这是每套主题的"性格"：卡通的亮橙、魔兽的金）。
  //    两种例外才动 tone：
  //      a. 它被当**文字**用（如 `.group-header { color: var(--accent) }`）→ 保底 4.5:1；
  //      b. `preferWhiteAccent`（只有默认那套）：它的 accent 是"工具蓝"不是性格色，
  //         与其把按钮文字改成深色（所有按钮的观感都变），不如把蓝压暗一档 —— 改动更小。
  const accentFrom = get(theme, "--accent");
  let accent = accentFrom;
  let accentNote = "品牌色（色相 / 彩度保留）";
  if (opts.accentAsText) {
    const bgs = [colors["--bg-base"], colors["--bg-panel"], colors["--bg-top"]].filter(Boolean);
    const dir = dark ? 1 : -1;
    for (let step = 0; step <= 60; step++) {
      if (bgs.every((b) => contrast(accent, b) >= 4.5)) break;
      accent = withTone(accentFrom, Math.max(0, Math.min(100, toneOf(accentFrom) + dir * step)));
    }
    accentNote = "品牌色（当文字用时保底 4.5:1）";
  }
  if (opts.preferWhiteAccent && contrast(accent, "#FFFFFF") < 4.5) {
    accent = fitTone(accent, ["#FFFFFF"], 4.5).color;
    accentNote = "品牌色（工具蓝：压暗到白字刚好达标）";
  }
  record("--accent", accentFrom, accent, accentNote);

  // ⑤ accent 的悬停 / 淡底：由**最终的** accent 派生，避免"改了主色忘了派生色"。
  const hoverTone = Math.max(12, Math.min(95, toneOf(accent) + (dark ? 8 : -8)));
  record(
    "--accent-hover",
    get(theme, "--accent-hover") ?? accent,
    withTone(accent, hoverTone),
    `accent 悬停（tone ${hoverTone.toFixed(0)}）`,
  );
  record(
    "--accent-soft",
    get(theme, "--accent-soft") ?? "",
    `color-mix(in srgb, ${accent} 16%, transparent)`,
    "accent 淡底（由最终 accent 派生）",
  );

  // ⑥ accent 底上的文字色（MD3 的 on-primary）：白字够读就用白字，不够就往下压暗。
  //    ⚠️ 起点不能用固定的 tone 20：MD3 的 on-primary = tone 20 是配"tone 80 的主色"的，
  //    而这里的 accent 是**保留下来的品牌色**（很多落在 tone 55~70），tone 20 压上去仍不够
  //    （实测 memphis 4.29:1、comic 3.30:1、ghibli 3.90:1）。所以交给 fitTone 从 tone 20
  //    继续往下走，走到**刚好达标**就停 —— 既保住品牌色，也保住"最小改动"。
  const accentFg =
    contrast(accent, "#FFFFFF") >= 4.5 ? "#ffffff" : fitTone(withTone(accent, 20), [accent], 4.5).color;

  // ⑦ 语义色（**最小改动**：够好就不动）：
  //    a. 只有当它在背景上"当文字读不清"时，才归位到 MD3 的固定色相 + 该模式的语义 tone；
  //    b. 只有当它与品牌色 / 别的语义色"分不开"（ΔE < 12）时，才把色相挪开一点。
  //    反过来做（无条件重刷）会把本来挺好的颜色改成另一种，纯属倒退。
  const semTones = SEMANTIC_TONES[mode];
  const semBgs = [colors["--bg-base"], colors["--bg-panel"], colors["--bg-top"]].filter(Boolean);
  const resolved = {};
  for (const [key, roleName] of Object.entries(SEMANTIC_KEYS)) {
    const from = get(theme, key);
    if (!from) continue;
    const readable = semBgs.every((b) => contrast(from, b) >= 4.5);
    let color = from;
    let note = "语义色（原值已达标，保留）";
    if (!readable) {
      color = withTone(atHue(from, SEMANTIC_HUE[roleName]), semTones[roleName]);
      note = `语义色 → ${roleName}（原值在背景上读不清，归位 MD3 色相 ${SEMANTIC_HUE[roleName]}° / tone ${semTones[roleName]}）`;
    }
    const others = [accent, ...Object.values(resolved)];
    const clash = others.filter((n) => deltaE(color, n) < MIN_SEMANTIC_GAP);
    if (clash.length) {
      color = separateFrom(color, hueOf(color), others, MIN_SEMANTIC_GAP, SEMANTIC_HUE_DIRS[roleName]);
      note = readable
        ? `语义色（与品牌色 / 其它语义色撞车，色相挪到 ${hueOf(color).toFixed(0)}°）`
        : `${note}，并把色相挪到 ${hueOf(color).toFixed(0)}°`;
    }
    resolved[key] = color;
    record(key, from, color, note);
  }

  // ⑧ 第二个图案色：以现有值为种子，只对齐 tone。
  const accentAlt = opts.accentAltSeed ? withTone(opts.accentAltSeed, ALT_TONE[mode]) : null;

  // 派生变量也放进 colors：审计与守卫测试都按"一张颜色表"来查，不另外走一条路径。
  colors["--accent-fg"] = accentFg;
  if (accentAlt) colors["--accent-alt"] = accentAlt;

  return { id: theme.id, mode, colors, changes, accentFg, accentAlt };
}

/* ------------------------------------------------------------------ *
 * 审计：这套配色"哪里不合适"（CLI 打印 + 守卫测试共用同一套判据）
 * ------------------------------------------------------------------ */

/** 正文级文字要求；提示级（dim）因为设计上就是"弱化"，只要求"看得见"。 */
const TEXT_RULES = [
  ["--text-primary", 4.5],
  ["--text-secondary", 4.5],
  ["--text-dim", 4.0],
];

/**
 * 审一套配色，返回逐条判据结果。
 *
 * @param colors  `--key` → 值（planTheme 的 colors）
 * @param toneOfFn 取 tone 的函数（默认用 md3Color 的，测试里可注入）
 * @returns {{ label: string, value: number, min: number, ok: boolean, unit?: string }[]}
 */
export function auditTheme(colors, toneOfFn = toneOf) {
  const rows = [];
  const surfaces = ["--bg-base", "--bg-panel", "--bg-top", "--bg-sidebar"].map((k) => [k, colors[k]]);
  const push = (label, value, min, unit = "") => rows.push({ label, value, min, ok: value >= min - 1e-9, unit });

  // ① 三级文字 × 背景 / 面板 / 顶栏 / 侧栏
  for (const [key, min] of TEXT_RULES) {
    for (const [sKey, sVal] of surfaces) {
      if (!colors[key] || !sVal) continue;
      push(`${key} on ${sKey}`, contrast(colors[key], sVal), min, ":1");
    }
  }
  // ② accent 底上的文字（这是"白字压在亮色按钮上"那条，实测 10 套里 9 套不达标）
  push("--accent-fg on --accent", contrast(colors["--accent-fg"], colors["--accent"]), 4.5, ":1");
  // ③ 边框"看得见"：与每个表面的色调间距
  for (const [bKey, min] of [["--border", MIN_BORDER_SEP], ["--border-strong", MIN_BORDER_SEP + 8]]) {
    for (const [sKey, sVal] of surfaces.slice(0, 3)) {
      if (!colors[bKey] || !sVal) continue;
      push(`${bKey} 与 ${sKey} 的色调间距`, Math.abs(toneOfFn(colors[bKey]) - toneOfFn(sVal)), min, "tone");
    }
  }
  // ④ 语义色：彼此之间、以及与品牌色必须分得开（否则"警告"和"品牌色"混成一片）
  const sem = ["--success", "--warning", "--danger"].map((k) => [k, colors[k]]).filter(([, v]) => v);
  for (let i = 0; i < sem.length; i++) {
    for (let j = i + 1; j < sem.length; j++) {
      push(`ΔE(${sem[i][0]}, ${sem[j][0]})`, deltaE(sem[i][1], sem[j][1]), MIN_SEMANTIC_GAP, "");
    }
    push(`ΔE(${sem[i][0]}, --accent)`, deltaE(sem[i][1], colors["--accent"]), MIN_SEMANTIC_GAP, "");
  }
  // ⑤ 语义色本身要看得见（当状态文字用时）
  for (const [key, val] of sem) {
    if (!colors["--bg-base"]) continue;
    push(`${key} on --bg-base`, contrast(val, colors["--bg-base"]), 3.0, ":1");
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * 渲染：生成新文件内容（不写盘）
 * ------------------------------------------------------------------ */

/**
 * 生成整份 global.css 的新内容。
 *
 * @param css 原文件内容
 * @param opts.accentAsTextOf (id) => boolean —— 该主题的 accent 是否被当文字用（由 detectAccentAsText 探测）
 * @param opts.accentAltSeedOf (id) => string|null
 * @returns {{ css: string, plans: Array }}
 */
export function renderStaticThemes(css, opts = {}) {
  const themes = parseStaticThemes(css);
  const plans = [];
  /** 拼装片段（顺序拼接，不碰分隔符）。 */
  const parts = [];
  let cursor = 0;

  for (const theme of themes) {
    const plan = planTheme(theme, {
      accentAsText: opts.accentAsTextOf ? !!opts.accentAsTextOf(theme.id) : false,
      accentAltSeed: opts.accentAltSeedOf ? opts.accentAltSeedOf(theme.id) : null,
      preferWhiteAccent: opts.preferWhiteAccentOf ? !!opts.preferWhiteAccentOf(theme.id) : false,
    });
    if (!plan) continue;
    plans.push(plan);

    // 块内改动：① 每个颜色声明的**值**原地替换（保留 `--key: ` 与 `;` 的原格式）
    //          ② 只补**还没有**的派生变量
    const edits = [];
    for (const d of theme.decls) {
      if (!COLOR_KEYS.includes(d.key) && !DERIVED_KEYS.includes(d.key)) continue; // 非颜色键一律不碰
      const to = plan.colors[d.key];
      if (to === undefined || to === d.value) continue;
      edits.push({ start: d.valueStart, end: d.valueEnd, text: to });
    }
    // ⚠️ 必须"缺了才插"：无条件插的话第二轮会把同一批变量再插一遍，文件越跑越长。
    const derived = [
      ["--accent-fg", plan.accentFg],
      ...(plan.accentAlt ? [["--accent-alt", plan.accentAlt]] : []),
    ].filter(([k]) => !theme.decls.some((d) => d.key === k));
    if (derived.length) {
      const anchor = theme.decls.find((d) => d.key === "--accent-soft") ?? theme.decls.find((d) => d.key === "--danger");
      if (anchor) {
        const extra = derived.map(([k, v]) => `  ${k}: ${v};`).join("\n");
        edits.push({ start: anchor.lineEnd, end: anchor.lineEnd, text: `${extra}\n` });
      }
    }

    let body = theme.body;
    for (const e of edits.sort((a, b) => b.start - a.start)) {
      body = body.slice(0, e.start) + e.text + body.slice(e.end);
    }

    const headLen = css.slice(theme.start, theme.end).indexOf("{") + 1;
    parts.push(css.slice(cursor, theme.start));
    parts.push(css.slice(theme.start, theme.start + headLen) + body + "}");
    cursor = theme.end;
  }
  parts.push(css.slice(cursor));
  return { css: parts.join(""), plans };
}

/* ------------------------------------------------------------------ *
 * 生成「设置 → 配色」里的条目：src/utils/themeLibraryStatic.ts
 *
 * 为什么要生成这份 TS：
 *   这 11 套主题原本只以 `:root[data-theme="…"]` 存在于 CSS 里，而**设置里的配色下拉读的是
 *   themeLibrary**，所以它们在界面上一直没出现过。补了一份条目（`s-<id>`）之后，
 *   用户从列表里选一套时走的是 `applyPaletteTheme(entry.palette)`（**内联注入到 :root**），
 *   并不会去设 `data-theme` 属性 —— 也就是说：**列表里选，实际生效的是这份 TS 里的值**。
 *   所以它必须由同一个生成器产出。曾经它是手工产物，结果 CSS 改了、列表里还是旧色
 *   （实测：`--accent` 已是 `#1d71ea`，条目里还写着 `#2d7ff9`）。
 * ------------------------------------------------------------------ */

/** 生成物路径。 */
export const ENTRIES_PATH = path.resolve(HERE, "../../src/utils/themeLibraryStatic.ts");

/** 展示名（**设计信息**，不是色值 —— 色值全部来自 global.css 那几个块）。 */
const THEME_META = {
  default: { zh: "默认暗色", desc: "Playday 默认（经典主题，色值由 MD3 生成）" },
  cartoon: { zh: "卡通", desc: "明亮、圆润、暖色（经典主题，色值由 MD3 生成）" },
  cyberpunk: { zh: "赛博朋克", desc: "暗底霓虹、发光边（经典主题，色值由 MD3 生成）" },
  memphis: { zh: "孟菲斯", desc: "几何原色、活泼（经典主题，色值由 MD3 生成）" },
  neumorphism: { zh: "新拟态", desc: "柔和浮雕、浅灰（经典主题，色值由 MD3 生成）" },
  comic: { zh: "美漫", desc: "粗黑描边、网点（经典主题，色值由 MD3 生成）" },
  ghibli: { zh: "吉卜力", desc: "柔和自然色（经典主题，色值由 MD3 生成）" },
  chinese: { zh: "中国风", desc: "墨红、金、宣纸（经典主题，色值由 MD3 生成）" },
  wow: { zh: "魔兽世界", desc: "羊皮纸暗底 + 金（经典主题，色值由 MD3 生成）" },
  lol: { zh: "英雄联盟", desc: "符文之地午夜 + 金（经典主题，色值由 MD3 生成）" },
  pubg: { zh: "绝地求生", desc: "军绿 / 卡其 + 炭灰（经典主题，色值由 MD3 生成）" },
};

/** 条目字段 → global.css 变量。顺序照着 ThemeEntry 的习惯写法。 */
const ENTRY_MAP = [
  ["background", "--bg-base"],
  ["foreground", "--text-primary"],
  ["card", "--bg-panel"],
  ["cardForeground", "--text-primary"],
  ["primary", "--accent"],
  // accent 底上的文字色：条目里叫 primaryForeground —— 与 CSS 的 --accent-fg 是同一件事。
  ["primaryForeground", "--accent-fg"],
  ["secondary", "--bg-item-hover"],
  ["secondaryForeground", "--text-primary"],
  ["muted", "--bg-input"],
  ["mutedForeground", "--text-secondary"],
  ["border", "--border"],
  ["ring", "--accent"],
  ["bgBase", "--bg-base"],
  ["bgTop", "--bg-top"],
  ["bgSidebar", "--bg-sidebar"],
  ["bgPanel", "--bg-panel"],
  ["bgItemHover", "--bg-item-hover"],
  ["bgItemActive", "--bg-item-active"],
  ["bgInput", "--bg-input"],
  ["borderStrong", "--border-strong"],
  ["textPrimary", "--text-primary"],
  ["textSecondary", "--text-secondary"],
  ["textDim", "--text-dim"],
  ["accent", "--accent"],
  ["accentHover", "--accent-hover"],
  ["accentSoft", "--accent-soft"],
  ["success", "--success"],
  ["warning", "--warning"],
  ["danger", "--danger"],
];

/** 生成 `themeLibraryStatic.ts` 的完整内容。 */
export function renderStaticThemeEntries(plans) {
  const head = [
    "// ⚙️ 本文件由 scripts/gen-static-themes.mjs 生成 —— **不要手改**。",
    "//",
    "// 它是 global.css 里那 11 套经典主题（中国风 / 魔兽 / 赛博朋克 …）的配色条目：",
    "// 那些主题本来靠 :root[data-theme=\"…\"] 切换，而设置里的配色下拉读的是 themeLibrary，",
    "// 所以要先变成条目才在界面上出现。",
    "//",
    "// ⚠️ 用户从列表里选这些主题时走的是 applyPaletteTheme(entry.palette)（内联注入 :root），",
    "//    **不会设 data-theme 属性** —— 所以列表里真正生效的是本文件的值，必须与 CSS 同步。",
    "//",
    "// 色值的源头只有一个：global.css 里那几个主题块。改配色请改那边（或改生成器的种子/参数），",
    "// 然后重跑：node scripts/gen-static-themes.mjs --apply",
    'import type { ThemeEntry } from "./themeLibrary";',
    "",
    "export const staticThemeEntries: ThemeEntry[] = [",
  ].join("\n");

  const blocks = plans.map((p) => {
    const meta = THEME_META[p.id] ?? { zh: p.id, desc: "经典主题（色值由 MD3 生成）" };
    const palette = ENTRY_MAP.map(([field, cssVar]) => {
      const value = p.colors[cssVar];
      return value === undefined ? null : `      ${field}: ${JSON.stringify(value)},`;
    }).filter(Boolean);
    return [
      "  {",
      `    id: "s-${p.id}",`,
      `    name: ${JSON.stringify(p.id)},`,
      `    zh: ${JSON.stringify(meta.zh)},`,
      `    desc: ${JSON.stringify(meta.desc)},`,
      '    category: "经典主题",',
      "    palette: {",
      ...palette,
      "    },",
      "  },",
    ].join("\n");
  });

  return `${head}\n${blocks.join("\n")}\n];\n`;
}

/* ------------------------------------------------------------------ *
 * 探测 + 读写
 * ------------------------------------------------------------------ */

/**
 * 探测：哪些主题的 accent 被当成**文字**用。
 *
 * 扫的是文件里 `:root[data-theme="x"] … { color: var(--accent) … }` 这类规则
 * （⚠️ 注意不能用 parseDecls：它只认 `--自定义属性`，普通 `color:` 属性抓不到）。
 */
export function detectAccentAsText(css) {
  const ids = new Set();
  const re = /^:root\[data-theme="([a-zA-Z0-9_-]+)"\][^{]*\{([\s\S]*?)\}/gm;
  let m;
  while ((m = re.exec(css))) {
    if (/^\s*color\s*:\s*var\(--accent\)\s*;/m.test(m[2])) ids.add(m[1]);
  }
  return ids;
}

/**
 * 每套主题的**人给定的**那一点点东西（其余全部推导）。
 *
 * 这里只有两类，都算"设计取向"而不是"配色推导的产物"：
 *   · `accentAltSeed`：孟菲斯的第二个图案色（只存在于"主题专属修饰"段的 `rgba(67,97,238,.12)` 里）；
 *   · `preferWhiteAccent`：默认那套的 accent 是"工具蓝"而非性格色 —— 与其把按钮文字改成深色
 *     （所有按钮的观感都跟着变），不如把蓝压暗一档：**保白字**。
 */
export const THEME_OPTS = {
  default: { preferWhiteAccent: true },
  memphis: { accentAltSeed: "#4361ee" },
};

export function runStaticThemes({ apply = false, file = GLOBAL_CSS, entriesFile = ENTRIES_PATH } = {}) {
  const css = fs.readFileSync(file, "utf8");
  const accentAsText = detectAccentAsText(css);
  const { css: next, plans } = renderStaticThemes(css, {
    accentAsTextOf: (id) => accentAsText.has(id),
    accentAltSeedOf: (id) => THEME_OPTS[id]?.accentAltSeed ?? null,
    preferWhiteAccentOf: (id) => !!THEME_OPTS[id]?.preferWhiteAccent,
  });
  const entries = renderStaticThemeEntries(plans);
  const prevEntries = fs.existsSync(entriesFile) ? fs.readFileSync(entriesFile, "utf8") : "";
  const cssChanged = next !== css;
  const entriesChanged = entries !== prevEntries;
  if (apply) {
    if (cssChanged) fs.writeFileSync(file, next, "utf8");
    if (entriesChanged) fs.writeFileSync(entriesFile, entries, "utf8");
  }
  return {
    /** 任一产物与生成结果不一致（守卫测试看这个）。 */
    changed: cssChanged || entriesChanged,
    cssChanged,
    entriesChanged,
    plans,
    next,
    css,
    entries,
  };
}
