// Material Design 3「色调体系」的 chroma-js 实现 —— 主题配色的**推导与修复**都走这里。
//
// 为什么引入这层（2026-09-18 用户要求"用 Chroma.js 搞一下，不合适的改一下，更高级一些"）：
//   以前 scripts/fix-contrast.mjs 修对比度的办法是"RGB 三个通道每步各 ±2 硬拖"
//   （best = [r+d, g+d, b+d]）。这个做法**不保色相**：酒红会被拖成灰粉、金色被拖成土黄，
//   越修越"脏" —— 这就是"不合适"的来源。MD3 的做法是**只走色调、不动色相与彩度**。
//
// 那 tone 到底是什么：
//   MD3（Material You）的色彩系统核心是一张 tonal palette：**固定色相与彩度，只变色调 tone**。
//   tone 就是 CIE L*（0 = 纯黑，100 = 纯白）。MD3 给每个角色规定了 tone
//   （暗色：表面 6、主色 80、正文 90；亮色：表面 98、主色 40、正文 10 —— 见下面的 ROLE_TONES），
//   于是任何一个种子色都能长出一套自洽的配色。参照的就是这套映射。
//
// 为什么用 OKLCH 而不是 HSL / CIE Lab：
//   · HSL 的 L 是"数值亮度"：黄色 L=50 和蓝色 L=50 观感差着一倍，按它改 tone 会跑偏；
//   · OKLCH 是感知均匀空间，且它的 L 与 CIE L* 在灰阶上是**线性**关系（见 toneToL 的推导），
//     所以"tone 80"在 chroma 里就是 OKLCH 的 L=(80+16)/116 —— 与 MD3 的 tone 语义严格对得上；
//   · 同时它天然保色相：改 tone 不会串色。
//
// 色域：sRGB 装不下"高 tone + 高彩度"（典型是亮黄）。MD3 的做法是**保色相、退彩度**，
//   这里用 gamutMap() 二分退彩度实现。刻意不用夹取（clamp/clipped）—— 夹取会同时改色相和明度，
//   正是我们要避免的那种"脏"。
import chroma from "chroma-js";

/* ------------------------------------------------------------------ *
 * 一、tone（CIE L*）↔ OKLCH 的 L
 * ------------------------------------------------------------------ */

/**
 * tone（MD3 的 L*，0~100）→ OKLCH 的 L（0~1）。
 *
 * 推导：灰阶上 OkLab 的 L 恰好等于 Y^(1/3)（LMS 矩阵三行和为 1，三个分量相等），
 * 而 CIE 定义 L* = 116·Y^(1/3) − 16，两式相消得 **L* = 116·L_ok − 16**，
 * 反解就是 L_ok = (L*+16)/116。只在 L* ≤ 8 的线性段例外（那段 L* = 903.3·Y），
 * 否则 tone 0 会被算成 0.138（那是深灰不是黑）。
 */
export function toneToL(tone) {
  const t = Math.max(0, Math.min(100, tone));
  if (t <= 8) return Math.pow(t / 903.3, 1 / 3);
  return (t + 16) / 116;
}

/** 反向：OKLCH 的 L → tone。 */
export function lToTone(l) {
  if (l <= 0.2069) return 903.3 * Math.pow(l, 3);
  return 116 * l - 16;
}

/** 取一个颜色的 tone（MD3 的 L*）。 */
export function toneOf(color) {
  return lToTone(chroma(color).oklch()[0]);
}

/* ------------------------------------------------------------------ *
 * 二、核心操作：改 tone / 换色相（都保色相、都做色域映射）
 * ------------------------------------------------------------------ */

/** 这个 OKLCH 色出界了吗 —— 往返一次 hex，看明度有没有被夹取改掉（不依赖 chroma 的版本 API）。 */
function fits(L, C, H) {
  const c = chroma.oklch(L, C, H);
  return Math.abs(chroma(c.hex()).oklch()[0] - L) < 0.004; // 0.004 ≈ 半个 tone
}

/** 保色相、退彩度，把颜色压回 sRGB 色域内（二分）。 */
function gamutMap(L, C, H) {
  if (fits(L, C, H)) return chroma.oklch(L, C, H);
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (fits(L, mid, H)) lo = mid;
    else hi = mid;
  }
  return chroma.oklch(L, lo, H);
}

/**
 * MD3 的核心操作：**只改 tone**，色相与彩度原样带着走，最后压回色域。
 * 灰阶（彩度≈0）的色相是 NaN，得兜一下 —— 不兜的话 chroma 会吐出 NaN。
 */
export function withTone(color, tone) {
  const [, C, H] = chroma(color).oklch();
  return chroma(gamutMap(toneToL(tone), Number.isFinite(C) ? C : 0, Number.isFinite(H) ? H : 0)).hex();
}

/**
 * 指定 tone **与彩度**（色相沿用原色）—— 生成"表面色"用。
 *
 * MD3 的表面不是纯灰，而是**极低彩度的种子色**（Material 里叫 neutral，彩度约 4）：
 * 橙色品牌得到暖白表面、青色品牌得到冷灰表面，于是界面整体是一套色，而不是"灰底 + 彩色按钮"。
 * 所以要能单独指定彩度 —— withTone 会把原来的高彩度一路带着走，那是给文字/强调色用的。
 */
export function withToneChroma(color, tone, chromaValue) {
  // ⚠️ 形参别叫 chroma —— 会把上面 import 进来的那个函数遮蔽掉（chroma is not a function）。
  const [, , H] = chroma(color).oklch();
  return chroma(gamutMap(toneToL(tone), chromaValue, Number.isFinite(H) ? H : 0)).hex();
}

/** 保 tone 与彩度、只换成指定色相：语义色（成功/警告/危险）用它归位到 MD3 的固定色相。 */
export function atHue(color, hue) {
  const [L, C] = chroma(color).oklch();
  return chroma(gamutMap(L, Number.isFinite(C) ? C : 0, hue)).hex();
}

/* ------------------------------------------------------------------ *
 * 三、对比度：**最小改动**达标（这是"修得看不出来"的关键）
 * ------------------------------------------------------------------ */

/** WCAG 对比度（chroma 已实现，这里只做一层语义化包装）。 */
export function contrast(a, b) {
  return chroma.contrast(a, b);
}

/**
 * 沿色调找一个"刚好够"的 tone：**从原色出发一步步往外走**，第一个达标的就返回。
 * 为什么要"一步步"而不是直接取 100/0：改动越小，颜色越像原来那个
 * （MD3 里同色相不同 tone 仍是一家人，直接拉到纯白/纯黑就跳出这套配色了）。
 *
 * @param color  原文字色
 * @param bgs    它可能被放到哪些背景上 —— **每一个**都要达标（旧脚本只按"最差的那个"调，
 *               结果在另一个背景上仍然不达标）
 * @param target 目标对比度
 * @returns {{ color: string, tone: number, moved: number }} moved = 挪了几个 tone
 */
export function fitTone(color, bgs, target) {
  const surfaces = bgs.filter(Boolean);
  if (surfaces.length === 0) return { color, tone: toneOf(color), moved: 0 };
  // 一定要夹：`toneOf('#FFFFFF')` 会算出 100.0001（hex 是 8bit，有浮点误差），
  // 而下面 `tone > 100` 是第一句 —— 不夹的话循环第一步就 break，
  // "往变暗走"那条路永远走不到，白字压在亮色按钮上会被误判成"无解"。
  const base = Math.max(0, Math.min(100, toneOf(color)));
  const bgAvg = surfaces.reduce((s, b) => s + toneOf(b), 0) / surfaces.length;
  const scan = (dir) => {
    for (let step = 0; step <= 100; step++) {
      const tone = base + dir * step;
      if (tone < 0 || tone > 100) break;
      const cand = withTone(color, tone);
      if (surfaces.every((b) => contrast(cand, b) >= target)) return { color: cand, tone, moved: step };
    }
    return null;
  };
  const away = base >= bgAvg ? 1 : -1; // 先试"离背景更远"的方向（改动最小、观感最自然）
  // 走不通再试反方向：**白字压在亮色按钮上**就是这种情况 —— 往亮走已经到头（纯白）仍不达标，
  // 只有变暗一条路。旧版直接判定"无解"跳过了 primaryForeground，就是少了这一步。
  return scan(away) ?? scan(-away) ?? { color, tone: base, moved: 0 };
}

/**
 * 沿色调把颜色推离一组背景，直到**色调间距** ≥ minSep。
 *
 * 这是 MD3 另一条判据（对比度管"看得清"，色调间距管"看得见"）：
 * 边框、分隔线这类元素与背景的对比度往往很低（本来就该低），但**色调必须拉开一档**，
 * 否则那条线在屏幕上直接消失。实测有配色的 border 与 bgBase 只差 3~5 个 tone，就是"看不见的框"。
 *
 * @param dir 往哪边推（+1 更亮 / -1 更暗）；不给则按"离这组背景的重心更远"的自动方向。
 */
export function fitToneSeparation(color, others, minSep, dir = 0) {
  const surfaces = others.filter(Boolean);
  if (surfaces.length === 0) return { color, tone: toneOf(color), moved: 0 };
  const base = Math.max(0, Math.min(100, toneOf(color))); // 同上：夹进合法区间，别让浮点误差短路循环
  const avg = surfaces.reduce((s, o) => s + toneOf(o), 0) / surfaces.length;
  const sign = dir !== 0 ? Math.sign(dir) : base >= avg ? 1 : -1;
  for (let step = 0; step <= 100; step++) {
    const tone = base + sign * step;
    if (tone < 0 || tone > 100) break;
    if (surfaces.every((o) => Math.abs(tone - toneOf(o)) >= minSep)) {
      return { color: withTone(color, tone), tone, moved: step };
    }
  }
  const edge = sign > 0 ? 100 : 0;
  return { color: withTone(color, edge), tone: edge, moved: 100 };
}

/** 感知色差（0 = 同色）。用于"语义色和品牌色撞了"这类判断。 */
export function deltaE(a, b) {
  return chroma.deltaE(a, b);
}

/** 这个背景算暗色吗（按感知亮度，不是简单 RGB 平均）。 */
export function isDark(color) {
  return chroma(color).get("oklab.l") < 0.5;
}

/* ------------------------------------------------------------------ *
 * 四、MD3 角色 → tone 对照表（设计参照，也是审计的标尺）
 * ------------------------------------------------------------------ */

/**
 * MD3 各颜色角色在暗色 / 亮色下的 tone。
 *
 * 来源：Material Design 3 的色彩系统规范（surface / on-surface / primary /
 * outline-variant 等角色的默认 tone）。本项目的业务变量名 → MD3 角色的对应关系
 * 写在键名注释里 —— **改配色时照这张表照，而不是靠眼睛调**。
 *
 * 少数角色 MD3 没有（textDim 是"更弱一档的提示文字"，accentHover 是悬停态），
 * 按同一套色调关系顺延一档，已在注释里注明。
 */
export const ROLE_TONES = {
  dark: {
    background: 6, // surface
    bgInput: 4, // surface-container-lowest
    bgSidebar: 10, // surface-container-low
    bgPanel: 12, // surface-container
    bgTop: 12, // surface-container
    card: 17, // surface-container-high
    bgItemHover: 17, // surface-container-high
    bgItemActive: 22, // surface-container-highest
    border: 30, // outline-variant
    borderStrong: 60, // outline
    textPrimary: 90, // on-surface
    textSecondary: 80, // on-surface-variant
    textDim: 60, // MD3 无此角色 = outline 那一档（更弱一档的提示）
    accent: 80, // primary
    accentHover: 88, // MD3 无悬停态：primary 再亮一档
    muted: 10, // surface-container-low
    mutedForeground: 80,
    secondary: 17,
    secondaryForeground: 90,
  },
  light: {
    background: 98, // surface
    bgInput: 100, // surface-container-lowest
    bgSidebar: 96, // surface-container-low
    bgPanel: 94, // surface-container
    bgTop: 94,
    card: 92, // surface-container-high
    bgItemHover: 92,
    bgItemActive: 90, // surface-container-highest
    border: 80, // outline-variant
    borderStrong: 50, // outline
    textPrimary: 10, // on-surface
    textSecondary: 30, // on-surface-variant
    // MD3 无 textDim 这个角色。取 46 而不是 50：亮色下"面板"(tone 94) 是最浅的承载面，
    // tone 50 压上去只有 3.85:1（提示文字也偏糊），46 是"仍属弱化层、但够 4.5:1"的位置。
    textDim: 46,
    accent: 40, // primary
    accentHover: 32, // 亮色下"更强调"是更深一档
    muted: 96,
    mutedForeground: 30,
    secondary: 92,
    secondaryForeground: 10,
  },
};

/**
 * MD3 的**固定色相**语义色（成功 / 警告 / 危险）。
 *
 * 为什么固定色相而不跟主题走：语义色的职责是"不看图例就认出来"。
 * 实测过一批配色把 warning 直接写成与 accent 同值（wow / lol / pubg 都是），
 * 于是"警告"和"品牌色"混成一片 —— 这类才叫不合适，归位到 MD3 的固定色相即可。
 */
export const SEMANTIC_HUE = {
  success: 145, // 绿
  warning: 85, // 琥珀
  danger: 29, // MD3 error 的红
};
