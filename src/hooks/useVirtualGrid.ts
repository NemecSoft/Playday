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
}

export interface UseVirtualGridOptions {
  /** The groups produced by groupGames(). */
  groups: Group[];
  /** Configured card width (px). Used as the minimum column width. */
  cardWidth: number;
  /** Configured gap between cards (px). */
  cardGap: number;
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
}

export function useVirtualGrid({
  groups,
  cardWidth,
  cardGap,
  titleHeight = 46,
  groupGap = 22,
  headerHeight = 28,
}: UseVirtualGridOptions): UseVirtualGridResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const gap = Math.max(0, Math.min(20, cardGap || 8));
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

  // Cover is 16:9 + the card's 6px padding top/bottom, plus title + row gap.
  const rowHeight = useMemo(() => {
    if (cols <= 0) return 0;
    const colWidth = (containerWidth - gap * (cols - 1)) / cols;
    return Math.round(colWidth * (9 / 16)) + titleHeight + gap;
  }, [containerWidth, cols, gap, titleHeight]);

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

  const virtualizer = useVirtualizer({
    count: allRows.length,
    getScrollElement,
    estimateSize: useCallback(
      (i: number) => rowMeta[i] || rowHeight || 100,
      [rowMeta, rowHeight],
    ),
    overscan: 6,
  });

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
  };
}