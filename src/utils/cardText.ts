// 卡片文字相关的共享工具。
// 单一数据源：卡片名字号 / 简介字号的取值范围，以及"简介跟随游戏名"的规则只在此处定义，
// settingsStore 与 GridView 都引用 —— 避免两处各写一遍 clamp 导致改一处漏一处。

/** 卡片名字号的合法范围（px）。 */
export const CARD_TITLE_SIZE_MIN = 10;
export const CARD_TITLE_SIZE_MAX = 28;

/** 卡片名字号（10~28px，默认 15）。 */
export function clampCardFontSize(value: number | string | null | undefined): number {
  const n = Number(value) || 15;
  return Math.max(CARD_TITLE_SIZE_MIN, Math.min(CARD_TITLE_SIZE_MAX, n));
}

/** 卡片简介字号的合法范围（px）。 */
export const CARD_DESC_SIZE_MIN = 9;
export const CARD_DESC_SIZE_MAX = 28;

/**
 * 卡片简介默认显示几行（超出省略，点击可展开）。
 *
 * ⚠️ 这是**唯一来源**：CSS 里 `.grid-desc` 的 `-webkit-line-clamp` 读
 * `var(--card-desc-lines)`（settingsStore 注入），GridView 的精确行高公式也读这个常量。
 * 以前两处各写一份（CSS 3 行 / 行高公式 3 行），改一处就会出现"间距忽大忽小"
 * （2026-09-15 改成 4 行时踩到过：只改 CSS，行高公式仍按 3 行算）。
 */
export const CARD_DESC_LINES = 4;

/**
 * 卡片简介字号：**0 表示跟随游戏名字号**（默认值，用户要求"简介和游戏名一样大"）。
 * 其余值 clamp 到 9~28。返回 0 只是"跟随"这个标记，真实字号用 effectiveCardDescFontSize 取。
 *
 * 为什么不用"默认同值"来达成一样大：那样用户把游戏名字号调大后，简介字号不会跟着变
 * （两个字段各自存值），得手动再调一次。用 0 = 跟随，才能一直保持一致。
 */
export function clampCardDescFontSize(value: number | string | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(CARD_DESC_SIZE_MIN, Math.min(CARD_DESC_SIZE_MAX, n));
}

/** 简介的**生效字号**：显式设了就用它，否则跟随游戏名字号（并受名字字号范围约束）。 */
export function effectiveCardDescFontSize(
  desc: number | string | null | undefined,
  titleSize: number | string | null | undefined,
): number {
  const d = clampCardDescFontSize(desc);
  return d > 0 ? d : clampCardFontSize(titleSize);
}
