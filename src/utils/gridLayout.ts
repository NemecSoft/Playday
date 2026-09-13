// 网格布局（卡片宽度 / 列数）相关的共享工具。
//
// 单一数据源：**"一行放几列"的公式只在这里写一遍**。
// 之前这套算法散在两个地方——useVirtualGrid 算列数、GridView 的 Alt+滚轮夹上限，
// 两边只要不一致就会出现"滚到头却不是一行一个"这类问题，所以收敛到这里。
//
// 约定（两个模块都必须用这几个函数）：
//   列数 = floor((可用宽 + 间隙) / (最小列宽 + 间隙))
// 由它反推："一行一个"的临界最小列宽 = floor((可用宽 + 间隙) / 2 - 间隙) + 1。

/** 卡片最小宽度（比这更窄就看不清了）。它同时也是 Alt+滚轮 / 滑杆的下限。 */
export const CARD_WIDTH_MIN = 120;

/** 卡片左右间距的上限（再大卡片之间就断成两块了）。 */
export const CARD_GAP_MAX = 20;

/** 卡片左右间距（0~20，默认 8）。注意要按 ?? 处理：0 是合法值，不能当缺省。 */
export function clampCardGap(cardGap: number | null | undefined): number {
  return Math.max(0, Math.min(CARD_GAP_MAX, cardGap ?? 8));
}

/** 一列的最小宽度：用户配的 cardWidth，缺省/过小则兜底到 CARD_WIDTH_MIN。 */
export function minColumnWidth(cardWidth: number | null | undefined): number {
  return Math.max(CARD_WIDTH_MIN, cardWidth || 180);
}

/**
 * 当前可用宽度能放几列（可用宽 <= 0 时返回 0，表示"还没量到宽"）。
 * 卡片实际宽度由 CSS 的 1fr 拉伸决定，这里是"最少能放宽到多少"的约束。
 */
export function columnsForWidth(availWidth: number, gap: number, colWidth: number): number {
  if (availWidth <= 0) return 0;
  return Math.max(1, Math.floor((availWidth + gap) / (colWidth + gap)));
}

/**
 * "正好一行一个"所需的最小卡片宽度（随窗口宽度变化）。
 *
 * 为什么用它当 Alt+滚轮的上限，而不是直接拿窗口宽度当上限：
 * 直接拿窗口宽度的话，超过临界值之后还有一大段范围"继续滚但画面没变化"（死区）；
 * 用临界值当上限，滚到头就正好停在一行一个。
 */
export function singleColumnCardWidth(availWidth: number, gap: number): number {
  return Math.max(CARD_WIDTH_MIN, Math.floor((availWidth + gap) / 2 - gap) + 1);
}

/**
 * 滚动容器的"可用内容宽"：clientWidth 减去左右 padding。
 * 网格是铺在 padding 盒里面的，不减掉 padding 会多算出一列的量。
 */
export function contentWidthOf(el: HTMLElement): number {
  const style = getComputedStyle(el);
  const padX = parseFloat(style.paddingLeft || "0") + parseFloat(style.paddingRight || "0");
  return Math.max(0, el.clientWidth - padX);
}
