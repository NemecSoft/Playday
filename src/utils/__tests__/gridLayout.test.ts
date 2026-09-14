// 网格布局公式的"可执行说明"（被测实现：src/utils/gridLayout.ts）。
//
// 由来：用户报"点开侧边栏，一行 5 个变成 4 个"——列数原本是按容器**实测**宽度算的，
// 侧栏一开内容区就窄 296px，于是列数掉了、卡片在眼前重排。
// 现在列数按"侧栏没打开时该有多宽"（参照宽度）算：侧栏开合/拖动只让卡片等比缩放。
// 下面几条锁的就是这个行为，以及它的下限（缩到看不清才允许回流）。
import { describe, expect, it } from "vitest";
import {
  CARD_WIDTH_MIN,
  columnsForScaledWidth,
  columnsForWidth,
  gridReferenceWidth,
  minColumnWidth,
  rowHeightFor,
} from "../gridLayout";

// 贴近生产的一组值：config.json 里 cardWidth=320、cardGap=20，侧栏宽 296。
const GAP = 20;
const COL_W = minColumnWidth(320); // = 320
const SIDEBAR = 296;

describe("参照宽度：把侧栏多占的加回来", () => {
  it("容器宽 + 侧栏多占的宽度", () => {
    expect(gridReferenceWidth(1404, SIDEBAR)).toBe(1404 + SIDEBAR);
  });

  it("没有侧栏（0）/ 负数 / 还没量到宽度时都不乱算", () => {
    expect(gridReferenceWidth(1700, 0)).toBe(1700);
    expect(gridReferenceWidth(1700, -5)).toBe(1700);
    expect(gridReferenceWidth(0, SIDEBAR)).toBe(0); // 还没量到宽 → 保持 0，调用方据此不渲染
  });
});

describe("侧栏开合不改变一行几个（只缩放）", () => {
  const refOpen = 1700; // 侧栏收起时的内容宽
  const refClosed = refOpen - SIDEBAR; // 侧栏展开后：少了侧栏那 296

  it("收起时 5 列，展开后仍是 5 列（这正是用户报的那个 bug 的反面）", () => {
    expect(columnsForScaledWidth(refOpen, 0, GAP, COL_W)).toBe(5);
    expect(columnsForScaledWidth(refClosed, SIDEBAR, GAP, COL_W)).toBe(5);
    // 反证：不加参照宽度、直接按实测宽算，就会掉到 4 列 —— 那是改动前的行为。
    expect(columnsForWidth(refClosed, GAP, COL_W)).toBe(4);
  });

  it("卡片等比缩小：列数不变，卡宽与行高一起变小", () => {
    const cardWidthOf = (container: number, cols: number) => (container - GAP * (cols - 1)) / cols;
    expect(cardWidthOf(refClosed, 5)).toBeLessThan(cardWidthOf(refOpen, 5));
    // 行高公式也跟着 colWidth 走 → 封面保持 16:9，高度自动缩小
    expect(rowHeightFor(refClosed, 5, GAP, 46, 8)).toBeLessThan(rowHeightFor(refOpen, 5, GAP, 46, 8));
  });

  it("拖动侧栏（占用宽度连续变化）时列数始终稳定", () => {
    const cols = [0, 100, 200, 296, 400, 600].map((occupied) =>
      columnsForScaledWidth(1700 - occupied, occupied, GAP, COL_W),
    );
    expect(cols).toEqual([5, 5, 5, 5, 5, 5]);
  });
});

describe("缩到看不清才允许回流（下限 = CARD_WIDTH_MIN）", () => {
  it("参照宽算出 3 列、但实际卡宽 < 120 → 退回真实宽度正常换行", () => {
    // 参照宽 700 → 3 列；实际卡宽 (380-40)/3 ≈ 113 < 120 → 不硬撑
    expect(columnsForScaledWidth(380, 320, GAP, 180)).toBe(2);
  });

  it("实际卡宽刚好等于 120 时不算越界（边界含等号）", () => {
    // 参照宽 700 → 3 列；实际卡宽 (400-40)/3 = 120 → 保持
    expect(columnsForScaledWidth(400, 300, GAP, 180)).toBe(3);
  });

  it("已经只有 1 列时直接返回（没什么可缩的）", () => {
    expect(columnsForScaledWidth(300, 300, GAP, COL_W)).toBe(1);
  });

  it("还没量到宽度 → 0 列（调用方据此不生成卡片行）", () => {
    expect(columnsForScaledWidth(0, SIDEBAR, GAP, COL_W)).toBe(0);
  });

  it("下限用的是 CARD_WIDTH_MIN，不是用户配的 cardWidth", () => {
    // 若错用 cardWidth（320）当下限，侧栏一开就会原样复现重排 —— 因为 1fr 拉伸后的
    // 实际卡宽本来就会小于配置值。这里锁住"CARD_WIDTH_MIN 才是缩放下限"。
    expect(CARD_WIDTH_MIN).toBe(120);
    expect(columnsForScaledWidth(1404, SIDEBAR, GAP, COL_W)).toBe(5); // 实际卡宽 ≈ 265 > 120
  });
});

describe("没有侧栏时与改动前完全一致（回归保护）", () => {
  it("占用为 0 时结果恒等于 columnsForWidth", () => {
    for (const w of [400, 900, 1404, 1700, 2560]) {
      for (const colWidth of [120, 180, 320, 480]) {
        expect(columnsForScaledWidth(w, 0, GAP, colWidth)).toBe(columnsForWidth(w, GAP, colWidth));
      }
    }
  });
});
