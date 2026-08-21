// useVirtualGrid: windowed rendering for a grouped cover-card grid.
//
// Problem it solves:
//   The games grid renders every card in the (possibly 1000+) library at once.
//   Even though covers load lazily (useLazyImage), thousands of DOM nodes stay
//   mounted, which makes scrolling janky and bloats memory. Virtualizing the
//   grid keeps only the rows near the viewport in the DOM.
//
// Design:
//   A grouped grid has two kinds of rows — a *group header* followed by one or
//   more *card rows* (cols cards each). We flatten every group into this flat
//   row list and window it with a single useVirtualizer over the scroll
//   container. Column count is derived from the container width + card width so
//   row height (16:9 cover + title + gap) is deterministic and measurable.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import type { Group } from "../utils/selectors";
import type { Game } from "../types/models";

/** A single windowable row: either a group header or a row of cards. */
export type VirtualGridRow =
  | { type: "header"; key: string; label: string; count: number }
  | { type: "cards"; key: string; games: Game[] };

export interface VirtualizedItem {
  /** The flattened row to render. */
  row: VirtualGridRow;
  /** Start pixel offset within the scroll container. */
  offset: number;
  /** Row index in the flattened list (used for dynamic measurement). */
  index: number;
}

export interface UseVirtualGridOptions {
  /** The groups produced by groupGames(). */
  groups: Group[];
  /** Configured card width (px). Used as the minimum column width. */
  cardWidth: number;
  /** Configured horizontal gap between cards (px). */
  cardGap: number;
  /** Configured vertical gap between card rows (px). */
  cardRowGap?: number;
  /** Height of the title line + padding below a cover, added to row height. */
  titleHeight?: number;
  /** Vertical space reserved below each group header (gap between groups). */
  groupGap?: number;
  /** Height of a group header row. */
  headerHeight?: number;
}

export interface UseVirtualGridResult {
  /** Ref to attach to the scroll container (.content). */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Columns per row for the current container width. */
  cols: number;
  /** Height of a card row (cover height + title + padding). */
  rowHeight: number;
  /** Total pixel height of all rows (sets the scroll spacer). */
  totalSize: number;
  /** The windowed rows with their offsets, ready to render. */
  items: VirtualizedItem[];
  /** useVirtualizer instance (exposes scrollToIndex / getVirtualItems). */
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  /** All flattened rows (unwindowed), for lookups if needed. */
  allRows: VirtualGridRow[];
  /** For a given card row key, the global card index where it starts
   *  (sum of game counts in all preceding cards rows). Useful for showing
   *  a debug badge on each card. */
  rowStartIndex: Map<string, number>;
  /** 写入某行卡片的"真实测量高度"（含卡片 padding-bottom，即含卡片间间距）。
   *  由 GridView 在该行 mount 后用 ResizeObserver 测到并调用；虚拟列表据此
   *  把该行高度从"公式估算"校正为"真实渲染高度"，解决公式漏算 alt-names 等
   *  导致下一行封面压住上一行文字的问题。 */
  measureRow: (rowKey: string, height: number) => void;
}

export function useVirtualGrid({
  groups,
  cardWidth,
  cardGap,
  cardRowGap = 8,
  titleHeight = 46,
  groupGap = 22,
  headerHeight = 28,
}: UseVirtualGridOptions): UseVirtualGridResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // 水平间距：卡片左右之间，用 cardGap（上限 20）。
  // 注意用 ?? 而不是 ||：cardGap 为 0 时不能回退成 8，否则间距永远缩不小。
  const gap = Math.max(0, Math.min(20, cardGap ?? 8));
  // 垂直间距：卡片行与行之间的上下间距，用独立的 cardRowGap（上限 60）。
  // 同样用 ??：cardRowGap=0 时按真实 0 处理，否则"调到 0 却还是很大"。
  const rowGap = Math.max(0, Math.min(60, cardRowGap ?? 8));
  const minColWidth = Math.max(120, cardWidth || 180);

  // Track the scroll container's *content-box* width so we can derive the
  // column count. clientWidth includes padding; the grid lives inside the
  // padding box, so subtract the horizontal padding for an exact fit.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const style = getComputedStyle(el);
      const padX =
        parseFloat(style.paddingLeft || "0") +
        parseFloat(style.paddingRight || "0");
      setContainerWidth(Math.max(0, el.clientWidth - padX));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = useMemo(() => {
    if (containerWidth <= 0) return 0;
    return Math.max(1, Math.floor((containerWidth + gap) / (minColWidth + gap)));
  }, [containerWidth, gap, minColWidth]);

  // 一行卡片的高度：封面（16:9）+ 标题 + 垂直行间距。
  // 垂直间距用 rowGap（cardRowGap），与水平间距 cardGap 相互独立。
  const rowHeight = useMemo(() => {
    if (cols <= 0) return 0;
    const colWidth = (containerWidth - gap * (cols - 1)) / cols;
    return Math.round(colWidth * (9 / 16)) + titleHeight + rowGap;
  }, [containerWidth, cols, gap, titleHeight, rowGap]);

  // A header row reserves the visible header height PLUS the trailing group gap,
  // so the next group starts with the same breathing room as the old
  // .group-section { margin-bottom } provided.
  const headerRowHeight = headerHeight + groupGap;

  // Flatten groups into header + card rows. Recompute whenever any input that
  // affects row count or height changes.
  const { allRows, rowMeta, rowStartIndex } = useMemo(() => {
    const flat: VirtualGridRow[] = [];
    const meta: number[] = [];
    const starts = new Map<string, number>();
    let cardIndex = 0;
    for (const group of groups) {
      flat.push({
        type: "header",
        key: `h:${group.key}`,
        label: group.label,
        count: group.games.length,
      });
      meta.push(headerRowHeight);
      if (cols > 0 && group.games.length > 0) {
        for (let i = 0; i < group.games.length; i += cols) {
          const key = `r:${group.key}:${i}`;
          flat.push({
            type: "cards",
            key,
            games: group.games.slice(i, i + cols),
          });
          meta.push(rowHeight);
          starts.set(key, cardIndex);
          cardIndex += Math.min(cols, group.games.length - i);
        }
      }
    }
    return { allRows: flat, rowMeta: meta, rowStartIndex: starts };
  }, [groups, cols, rowHeight, headerRowHeight]);

  // useVirtualizer needs the actual scroll element. Pass a getter so it can
  // resolve the ref on every internal measurement cycle (it does measureElement
  // and observe the scroll element after mount).
  const getScrollElement = useCallback(() => scrollRef.current, []);

  // 真实测量高度缓存：key = 行 key，value = { height, index }。
  // GridView 用 ResizeObserver 测得真实卡片高度后写入，虚拟列表据此把该行
  // 高度从"公式估算"校正为"真实渲染高度"。这解决公式漏算 alt-names 等导致
  // 下一行封面压住上一行文字的问题。
  const rowHeightCache = useRef<Map<string, { height: number; index: number }>>(new Map());

  // 当卡片高度公式的输入（cardRowGap / titleHeight）变化时，所有缓存的高度
  // 都作废（因为卡片间距变了），清空让 GridView 重新测量。
  useEffect(() => {
    rowHeightCache.current.clear();
  }, [cardRowGap, titleHeight]);

  const virtualizer = useVirtualizer({
    count: allRows.length,
    getScrollElement,
    estimateSize: useCallback(
      // 行高优先级：真实测量高度 > 公式估算高度（rowMeta）。
      // 有了真实测量兜底后，行高就精确等于卡片实际渲染高度（含 padding-bottom 间距），
      // 不再受"公式漏算某区块"影响。初次未测量时先用公式值，避免跳变。
      (i: number) => {
        const key = allRows[i]?.key;
        if (key) {
          const cached = rowHeightCache.current.get(key);
          if (cached) return cached.height;
        }
        return rowMeta[i] || rowHeight || 100;
      },
      [allRows, rowMeta, rowHeight],
    ),
    overscan: 6,
  });

  // 写入一行卡片的真实测量高度，并让虚拟列表重新计算该行位置（只重测这一行）。
  // 若高度没变就不触发重测，避免不必要的 reflow。
  // 用 resizeItem(index, size) 精确只更新这一行，而不是全量 measure()。
  const measureRow = useCallback(
    (rowKey: string, height: number) => {
      if (!Number.isFinite(height) || height <= 0) return;
      const cached = rowHeightCache.current.get(rowKey);
      if (cached && Math.abs(cached.height - height) < 0.5) return; // 高度没变，跳过
      const index = allRows.findIndex((r) => r.key === rowKey);
      if (index === -1) return;
      rowHeightCache.current.set(rowKey, { height, index });
      // resizeItem 是虚拟列表公开的"重设某一行大小"方法，等价于测量后更新该行尺寸。
      virtualizer.resizeItem(index, height);
    },
    [allRows, virtualizer],
  );

  // Force the virtualizer to re-measure after mount and whenever the scroll
  // element changes. Without this, if `getScrollElement` returned null on the
  // first commit (ref not yet attached) the virtualizer can stay stuck with
  // totalSize=0 and a stale getVirtualItems() until something else triggers a
  // remeasure — manifesting as "only the first few rows render".
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) virtualizer.measure();
  }, [virtualizer]);

  // When `allRows` (count) changes — e.g. column count updates and rows are
  // re-flatted — make sure the virtualizer re-resolves offsets.
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, allRows.length, rowHeight, headerRowHeight]);

  // NOTE: do NOT memoize `getVirtualItems()` here. The virtualizer is an
  // external store that triggers re-renders on scroll/resize, but the items
  // list itself depends on the current scroll offset, which changes without
  // any of our React deps changing. Computing it inline during render keeps
  // the visible window in sync with the scrollbar.
  const vItems = virtualizer.getVirtualItems();
  const items: VirtualizedItem[] = vItems.map((v) => ({
    row: allRows[v.index],
    offset: v.start,
    index: v.index,
  }));

  return {
    scrollRef,
    cols,
    rowHeight,
    totalSize: virtualizer.getTotalSize(),
    items,
    virtualizer,
    allRows,
    rowStartIndex,
    measureRow,
  };
}