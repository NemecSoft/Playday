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
 * 网格列数的**参照宽度**：把侧边栏当前多占的宽度加回来。
 *
 * 由来：列数是按容器实测宽度算的，而侧边栏一开一合会直接改变内容区宽度 ——
 * 于是"一行 5 个"会因为点开侧栏变成 4 个：卡片在眼前重排，看着像错乱。
 * 用"侧边栏没打开时该有多宽"当参照来算列数，侧栏开合就只让卡片等比缩放
 * （卡宽由 CSS 的 1fr 决定、行高公式又跟着卡宽走，缩放是自动的）。
 *
 * `sidebarOccupied` 传的是"**多占**了多少"（展开态 root 宽 − 收起态 root 宽），
 * 不是侧栏总宽 —— 那个常驻的 toggle 按钮在两种状态下都占位置，加回来就多算了。
 */
export function gridReferenceWidth(containerWidth: number, sidebarOccupied: number): number {
  if (containerWidth <= 0) return containerWidth;
  return containerWidth + Math.max(0, sidebarOccupied || 0);
}

/**
 * 按参照宽度算列数，带一个"缩到看不清就允许回流"的下限。
 *
 * 两个最小宽度是**不同**的东西，别合并成一个：
 *   colWidth（= minColumnWidth(cardWidth)）—— 决定"参照宽度下该有几列"；
 *   CARD_WIDTH_MIN —— 决定"卡片还能缩多小"，缩不下去才回到真实宽度正常换行。
 * 若拿 colWidth 当下限，那"侧栏一开就换行"会原样复现：因为 1fr 拉伸后的实际卡宽
 * 本来就会小于用户配的 cardWidth（配置是"一行放几个"的依据，不是"卡不允许更小"）。
 */
export function columnsForScaledWidth(
  containerWidth: number,
  sidebarOccupied: number,
  gap: number,
  colWidth: number,
): number {
  const cols = columnsForWidth(gridReferenceWidth(containerWidth, sidebarOccupied), gap, colWidth);
  if (cols <= 1) return cols;
  const actualCardWidth = (containerWidth - gap * (cols - 1)) / cols;
  if (actualCardWidth >= CARD_WIDTH_MIN) return cols;
  // 已经缩到最小可读宽度以下：退回真实宽度，让它正常换行（宁可换行，也不要小到看不清）。
  return columnsForWidth(containerWidth, gap, colWidth);
}

/**
 * 一行卡片的高度：封面（16:9，高由列宽决定）+ 标题区 + 垂直行距。
 *
 * 它和列数是同一条缩放链的下一环：列数不变而容器变窄 → colWidth 变小 → 行高跟着变小。
 * 这就是"侧栏开合只缩放不重排"里"缩放"那一半，所以放在这里跟列数一起被单测锁住，
 * 而不是散在 useVirtualGrid 的 useMemo 里（那样没法测，也容易和后加的东西脱节）。
 */
export function rowHeightFor(
  containerWidth: number,
  cols: number,
  gap: number,
  titleHeight: number,
  rowGap: number,
): number {
  if (cols <= 0) return 0;
  const colWidth = (containerWidth - gap * (cols - 1)) / cols;
  return Math.round(colWidth * (9 / 16)) + titleHeight + rowGap;
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
