// 卡片标题的「随机彩色」预设 + 稳定取色。
//
// 三条硬约束：
//
// 1) **不能真随机**。网格是虚拟列表，卡片滚出视口就卸载、滚回来重新挂载；
//    如果每次渲染现算随机色，滚动时整屏颜色会不停变。这里走「行 key → 哈希 → 下标」：
//    观感随机，但同一行**永远是同一个配色**（滚动、重渲染、切视图回来都不变）。
//
// 2) **填充色必须和背景反着来**。深色底上的深色填充会和底色融在一起，肉眼只剩一圈细边；
//    浅色底上的浅色填充同理。所以预设拆成两套，按主题明暗自动挑（见 isDarkBackground）。
//
// 3) **只收高饱和、高明度的颜色**。灰扑扑、浑浊、暗哑的一律不要 —— 小字号的标题靠的就是
//    色差和鲜艳度，低饱和色在 15px 上就是"看不清"。每一条都算过 WCAG 对比度（≥ 4.5:1，
//    多数 ≥ 7:1），见文件末尾的说明。
//
// 粒度是「每行统一」：同一行的所有卡片共用一种配色，下一行换一种。

export interface TitlePalette {
  /** 标题字色（填充）。 */
  fill: string;
  /** 标题描边色（当前描边开关是关的，属保留字段）。 */
  stroke: string;
}

/** 深色主题用：一律**高饱和的亮色**。 */
const ON_DARK: TitlePalette[] = [
  { fill: "#FFFFFF", stroke: "#000000" }, // 纯白
  { fill: "#FFD400", stroke: "#000000" }, // 金黄
  { fill: "#FF8A00", stroke: "#000000" }, // 亮橙
  { fill: "#FF2D78", stroke: "#000000" }, // 玫红
  { fill: "#A855F7", stroke: "#000000" }, // 亮紫
  { fill: "#00E5FF", stroke: "#000000" }, // 亮青
  { fill: "#00FF7F", stroke: "#000000" }, // 亮绿
  { fill: "#4D9FFF", stroke: "#000000" }, // 亮蓝
];

/** 浅色主题用：一律**高饱和的深色**（是"浓"，不是"暗哑"）。 */
const ON_LIGHT: TitlePalette[] = [
  { fill: "#000000", stroke: "#FFFFFF" }, // 纯黑
  { fill: "#C40000", stroke: "#FFFFFF" }, // 正红
  { fill: "#0A5CFF", stroke: "#FFFFFF" }, // 亮蓝
  { fill: "#7A00E6", stroke: "#FFFFFF" }, // 浓紫
  { fill: "#007A3D", stroke: "#FFFFFF" }, // 浓绿
  { fill: "#B3006B", stroke: "#FFFFFF" }, // 洋红
  { fill: "#A03000", stroke: "#FFFFFF" }, // 赭橙
  { fill: "#00607A", stroke: "#FFFFFF" }, // 深青
];

/** djb2 字符串哈希：稳定、无依赖、分布够均匀。 */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** 把 "#rgb" / "#rrggbb" 解析成 [r,g,b]，解析不了返回 null。 */
function parseHex(raw: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw.trim());
  if (!m) return null;
  const hex =
    m[1].length === 3
      ? m[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : m[1];
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 感知亮度（ITU-R BT.601）。 */
function luminance([r, g, b]: [number, number, number]): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * 当前主题背景是不是深色？—— 决定标题该用亮填充还是暗填充。
 *
 * 优先读 `--bg-panel`（卡片实际所在的面板底色）；主题开了"背景/面板渐变"时
 * 这个变量会变成渐变、解析不了，就回落到 `--text-primary`（深色主题的文字色是亮的，
 * 反过来也成立）。都读不到就按深色处理（库里绝大多数主题是深色）。
 */
export function isDarkBackground(): boolean {
  if (typeof document === "undefined") return true;
  const cs = getComputedStyle(document.documentElement);
  const bg = parseHex(cs.getPropertyValue("--bg-panel"));
  if (bg) return luminance(bg) < 128;
  const fg = parseHex(cs.getPropertyValue("--text-primary"));
  if (fg) return luminance(fg) >= 128;
  return true;
}

/** 给一行取一个固定配色（同一 rowKey 永远同一结果）。 */
export function paletteForRow(rowKey: string, darkBg: boolean): TitlePalette {
  const list = darkBg ? ON_DARK : ON_LIGHT;
  return list[hash(rowKey) % list.length];
}

// ── 对比度核对（改配色后请重新算一遍）──────────────────────────────────
// 背景取"底片合成后"的实际值：深色主题 = rgba(0,0,0,.5) 叠在 #15161D 上 ≈ #0B0B0F；
// 浅色主题 = rgba(255,255,255,.66) 叠在 #FFFFFF 上 = #FFFFFF。
// 实算结果（WCAG 对比度）：
//   深色主题：最低 #A855F7 亮紫 4.96:1，其余 5.52 ~ 19.64:1
//   浅色主题：最低 #0A5CFF 亮蓝 5.27:1，其余 5.45 ~ 21.00:1
// 16 条**全部** ≥ 4.5:1（AA 正文标准），其中 11 条 ≥ 7:1（AAA）。
