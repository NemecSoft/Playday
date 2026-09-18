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
import {
  clampCardGap,
  columnsForScaledWidth,
  contentWidthOf,
  gridReferenceWidth,
  minColumnWidth,
  rowHeightFor,
} from "../utils/gridLayout";

/** A single windowable row: either a group header or a row of cards. */
export type VirtualGridRow =
  | {
      type: "header";
      key: string;
      /** 分组原始 key（点击折叠时回传）。 */
      groupKey: string;
      label: string;
      count: number;
      /** 该组当前是否折叠（决定箭头方向）。 */
      collapsed: boolean;
    }
  | {
      type: "cards";
      key: string;
      groupKey: string;
      games: Game[];
      /** 是否是该组的最后一行（画下边框 + 下圆角，给分组框封底）。 */
      isLastInGroup: boolean;
      /** 组内第几行（从 0 开始）。斑马纹按它的奇偶铺底；分组标题行不参与计数。 */
      seq: number;
    };

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
  /**
   * 侧栏展开时多占的宽度（px，由 Sidebar 实测上报）。
   * 列数按"把它加回来"的参照宽度算 —— 侧栏开合/拖动只让卡片等比缩放，不重排列数
   * （见 utils/gridLayout 的 columnsForScaledWidth）。默认 0 = 没有侧栏。
   */
  sidebarOccupiedWidth?: number;
  /** Configured vertical gap between card rows (px). */
  cardRowGap?: number;
  /** Height of the title line + padding below a cover, added to row height. */
  titleHeight?: number;
  /**
   * 逐行的"标题区高度"（不传就用统一的 titleHeight）。
   *
   * 为什么要有它：卡片文字区的高度是**每行都不一样**的（有没有英文原名副标题、
   * 有没有简介）。统一预留会让没内容的行偏高，首帧后被 ResizeObserver 实测改回来 ——
   * 改行高 = 改总高度 = 下面所有行的位置一起变，拖动滚动条时就是"一跳一跳"。
   * 逐行算准，实测与估算一致，滚动中途就不会再改行高。
   * 传进来的函数**引用要稳定**（调用方用 useCallback），否则拍平 memo 每次渲染都重算。
   */
  titleHeightFor?: (row: VirtualGridRow) => number;
  /** Vertical space reserved below each group header (gap between groups). */
  groupGap?: number;
  /** Height of a group header row. */
  headerHeight?: number;
  /** 已折叠的分组 key 集合。折叠时不生成该组的卡片行（标题行保留）。 */
  collapsedGroups?: ReadonlySet<string>;
}

export interface UseVirtualGridResult {
  /** Ref to attach to the scroll container (.content). */
  scrollRef: React.RefObject<HTMLDivElement>;
  /** Columns per row for the current container width. */
  cols: number;
  /** 算列数用的**参照宽度**（侧栏占的宽度已加回）。Alt+滚轮的"一行一个"上限也用它，
   *  保证与列数同一把尺子（见 utils/gridLayout 的 gridReferenceWidth）。 */
  referenceWidth: number;
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
  sidebarOccupiedWidth = 0,
  cardRowGap = 8,
  titleHeight = 46,
  titleHeightFor,
  groupGap = 22,
  headerHeight = 28,
  collapsedGroups,
}: UseVirtualGridOptions): UseVirtualGridResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // 水平间距：卡片左右之间，用 cardGap（上限 20）。
  // 注意用 ?? 而不是 ||：cardGap 为 0 时不能回退成 8，否则间距永远缩不小。
  const gap = clampCardGap(cardGap);
  // 垂直间距：卡片行与行之间的上下间距，用独立的 cardRowGap（上限 60）。
  // 同样用 ??：cardRowGap=0 时按真实 0 处理，否则"调到 0 却还是很大"。
  const rowGap = Math.max(0, Math.min(60, cardRowGap ?? 8));
  const minColWidth = minColumnWidth(cardWidth);

  // Track the scroll container's *content-box* width so we can derive the
  // column count. clientWidth includes padding; the grid lives inside the
  // padding box, so subtract the horizontal padding for an exact fit.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setContainerWidth(contentWidthOf(el));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 参照宽度 = 当前实测宽 + 侧栏多占的宽（≈ 侧栏没打开时该有多宽）。
  const referenceWidth = useMemo(
    () => gridReferenceWidth(containerWidth, sidebarOccupiedWidth),
    [containerWidth, sidebarOccupiedWidth],
  );

  // 列数按参照宽度算：侧栏开合/拖动只让卡片等比缩放，不改变"一行几个"。
  const cols = useMemo(
    () => columnsForScaledWidth(containerWidth, sidebarOccupiedWidth, gap, minColWidth),
    [containerWidth, sidebarOccupiedWidth, gap, minColWidth],
  );

  // 一行卡片的高度：封面（16:9）+ 标题 + 垂直行间距。
  // 垂直间距用 rowGap（cardRowGap），与水平间距 cardGap 相互独立。
  // 公式在 utils/gridLayout 里（纯函数、有单测）—— 它和列数是同一条缩放链：
  // 列数不变而容器变窄时 colWidth 变小、行高跟着变小（"只缩放"里的缩放）。
  const rowHeight = useMemo(
    () => rowHeightFor(containerWidth, cols, gap, titleHeight, rowGap),
    [containerWidth, cols, gap, titleHeight, rowGap],
  );

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
      const collapsed = collapsedGroups?.has(group.key) ?? false;
      flat.push({
        type: "header",
        key: `h:${group.key}`,
        groupKey: group.key,
        label: group.label,
        count: group.games.length,
        collapsed,
      });
      meta.push(headerRowHeight);
      // 已折叠的组不生成卡片行 —— 行数变少后虚拟列表会重新测量，
      // 折叠/展开因此天然生效，不需要额外的显隐逻辑。
      if (!collapsed && cols > 0 && group.games.length > 0) {
        const rowCount = Math.ceil(group.games.length / cols);
        for (let i = 0; i < group.games.length; i += cols) {
          const key = `r:${group.key}:${i}`;
          const seq = Math.floor(i / cols);
          const row: VirtualGridRow = {
            type: "cards",
            key,
            groupKey: group.key,
            games: group.games.slice(i, i + cols),
            isLastInGroup: seq === rowCount - 1,
            seq,
          };
          flat.push(row);
          // 逐行估算：整行高仍旧走 gridLayout 的同一个公式，只是标题区换成这一行真的有的部分。
          meta.push(
            rowHeightFor(
              containerWidth,
              cols,
              gap,
              titleHeightFor ? titleHeightFor(row) : titleHeight,
              rowGap,
            ),
          );
          starts.set(key, cardIndex);
          cardIndex += Math.min(cols, group.games.length - i);
        }
      }
    }
    return { allRows: flat, rowMeta: meta, rowStartIndex: starts };
  }, [groups, cols, containerWidth, gap, rowGap, titleHeight, titleHeightFor, headerRowHeight, collapsedGroups]);

  // useVirtualizer needs the actual scroll element. Pass a getter so it can
  // resolve the ref on every internal measurement cycle (it does measureElement
  // and observe the scroll element after mount).
  const getScrollElement = useCallback(() => scrollRef.current, []);

  // 真实测量高度缓存：key = 行 key，value = { height, index }。
  // GridView 用 ResizeObserver 测得真实卡片高度后写入，虚拟列表据此把该行
  // 高度从"公式估算"校正为"真实渲染高度"。这解决公式漏算 alt-names 等导致
  // 下一行封面压住上一行文字的问题。
  const rowHeightCache = useRef<Map<string, { height: number; index: number }>>(new Map());

  // 滚动中暂存实测高度，等滚动停手 SCROLL_SETTLE_MS 之后再统一写回。
  //
  // 为什么要拖这一下：写回一行的高度 = 改这一行 + 改总高度 → 滚动条拇指长度、以及
  // 下面所有行的 translateY 都在用户手指底下变一次。拖动右侧滚动条时那就是"一跳一跳"。
  // 滚动期间先攒着（此时行按逐行估算的高度排布，本来就基本一致），停手后一次性补上。
  const pendingHeightsRef = useRef<Map<string, number>>(new Map());
  const lastScrollAtRef = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      lastScrollAtRef.current = Date.now();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

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

  // 真正把实测高度写回去（只重设这一行，不做全量 measure()）。
  const applyMeasuredHeight = useCallback(
    (rowKey: string, height: number) => {
      const index = allRows.findIndex((r) => r.key === rowKey);
      if (index === -1) return;
      rowHeightCache.current.set(rowKey, { height, index });
      // resizeItem 是虚拟列表公开的"重设某一行大小"方法，等价于测量后更新该行尺寸。
      virtualizer.resizeItem(index, height);
    },
    [allRows, virtualizer],
  );

  // 写入一行卡片的真实测量高度，并让虚拟列表重新计算该行位置（只重测这一行）。
  // 若高度没变就不触发重测，避免不必要的 reflow。
  //
  // **滚动中只攒不写**：写回一行的高度会同时改总高度，滚动条拇指和下面所有行的位置
  // 都会在用户手指底下动一下（拖动滚动条时最明显）。所以滚动期间先记进 pending，
  // 滚动停手 SCROLL_SETTLE_MS 之后再统一写回 —— 那时用户的手已经离开滚动条了。
  const SCROLL_SETTLE_MS = 140;
  const measureRow = useCallback(
    (rowKey: string, height: number) => {
      if (!Number.isFinite(height) || height <= 0) return;
      const cached = rowHeightCache.current.get(rowKey);
      if (cached && Math.abs(cached.height - height) < 0.5) return; // 高度没变，跳过
      if (Date.now() - lastScrollAtRef.current < SCROLL_SETTLE_MS) {
        pendingHeightsRef.current.set(rowKey, height);
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
        flushTimerRef.current = setTimeout(() => {
          flushTimerRef.current = null;
          const pending = pendingHeightsRef.current;
          pendingHeightsRef.current = new Map();
          for (const [key, h] of pending) applyMeasuredHeight(key, h);
        }, SCROLL_SETTLE_MS);
        return;
      }
      applyMeasuredHeight(rowKey, height);
    },
    [applyMeasuredHeight],
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
    referenceWidth,
    rowHeight,
    totalSize: virtualizer.getTotalSize(),
    items,
    virtualizer,
    allRows,
    rowStartIndex,
    measureRow,
  };
}