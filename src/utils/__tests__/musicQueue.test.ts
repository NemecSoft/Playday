// 背景音乐排队规则的"可执行说明"。
// 实现：src/utils/musicQueue.ts（播放本身在 src/stores/musicStore.ts）。
// 三种模式：随机（洗一轮 → 放完重洗）/ 顺序（到末尾回第一首）/ 单曲（自动播完重放）。
import { describe, expect, it } from "vitest";
import {
  currentTrackIndex,
  isMusicMode,
  isOrderValid,
  nextInQueue,
  orderFor,
  prevInQueue,
  reorderForMode,
  shuffleOrder,
} from "../musicQueue";

/** 造一个"确定但看起来随机"的 rng，便于断言。 */
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe("shuffleOrder：洗牌是排列，不是乱丢", () => {
  it("每首恰好出现一次（各种数量都对）", () => {
    for (const n of [0, 1, 2, 5, 57]) {
      const order = shuffleOrder(n, seededRng(42));
      expect(order).toHaveLength(n);
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });

  it("同样的随机源给出同样的顺序（可复现，便于排查）", () => {
    expect(shuffleOrder(10, seededRng(7))).toEqual(shuffleOrder(10, seededRng(7)));
  });
});

describe("isOrderValid：曲库一变就作废", () => {
  it("合法的排列通过", () => {
    expect(isOrderValid([2, 0, 1], 3)).toBe(true);
  });

  it("长度不对 / 有重复 / 越界 / 空库有残留 → 都算失效", () => {
    expect(isOrderValid([2, 0], 3)).toBe(false); // 少了
    expect(isOrderValid([0, 0, 1], 3)).toBe(false); // 重复
    expect(isOrderValid([0, 1, 3], 3)).toBe(false); // 越界
    expect(isOrderValid([1], 0)).toBe(false); // 库里已经没曲子了
    expect(isOrderValid([], 0)).toBe(true);
  });
});

describe("isMusicMode：config.json 里的值必须校验", () => {
  it("三个合法模式通过", () => {
    for (const m of ["shuffle", "sequential", "single"]) expect(isMusicMode(m), m).toBe(true);
  });

  it("大小写写错 / 空 / 数字 / null 一律不通过（调用方据此回退随机）", () => {
    for (const v of ["Shuffle", "loop", "", null, undefined, 1, {}]) {
      expect(isMusicMode(v), String(v)).toBe(false);
    }
  });
});

describe("orderFor：各模式的初始队列", () => {
  it("随机 = 洗牌后从第 0 位开始；顺序/单曲 = 0,1,2… 从第 0 位开始", () => {
    const r = orderFor(4, "shuffle", seededRng(3));
    expect(isOrderValid(r.order, 4)).toBe(true);
    expect(r.pos).toBe(0);
    expect(orderFor(4, "sequential")).toEqual({ order: [0, 1, 2, 3], pos: 0 });
    expect(orderFor(4, "single")).toEqual({ order: [0, 1, 2, 3], pos: 0 });
  });

  it("空目录：pos = -1，不抛错（前端据此不显示控件）", () => {
    expect(orderFor(0, "shuffle")).toEqual({ order: [], pos: -1 });
    expect(currentTrackIndex([], -1)).toBe(-1);
  });
});

describe("nextInQueue：随机循环", () => {
  it("一轮之内每首恰好放一次（不能重复也不能漏）", () => {
    const rng = seededRng(1234);
    let { order, pos } = orderFor(8, "shuffle", rng);
    const played: number[] = [];
    for (let i = 0; i < 8; i++) {
      played.push(currentTrackIndex(order, pos));
      ({ order, pos } = nextInQueue(order, pos, 8, "shuffle", { rng }));
    }
    expect([...played].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("放完一轮重新洗牌（回到第 0 位、并且还是合法排列）", () => {
    const rng = seededRng(99);
    const first = orderFor(5, "shuffle", rng);
    const atEnd = { order: first.order, pos: 4 };
    const wrapped = nextInQueue(atEnd.order, atEnd.pos, 5, "shuffle", { rng });
    expect(wrapped.pos).toBe(0);
    expect(isOrderValid(wrapped.order, 5)).toBe(true);
  });

  it("队列失效（比如换了音乐目录）→ 重排并从头开始，而不是报错/静默卡住", () => {
    const r = nextInQueue([0, 1, 2], 2, 5, "shuffle", { rng: seededRng(5) });
    expect(isOrderValid(r.order, 5)).toBe(true);
    expect(r.pos).toBe(0);
  });
});

describe("nextInQueue：顺序循环", () => {
  it("按顺序前进，到末尾回到第一首（整目录循环）", () => {
    expect(nextInQueue([0, 1, 2], 0, 3, "sequential").pos).toBe(1);
    expect(nextInQueue([0, 1, 2], 2, 3, "sequential")).toEqual({ order: [0, 1, 2], pos: 0 });
  });

  it("顺序模式不洗牌（order 原样保留）", () => {
    const order = [0, 1, 2, 3];
    expect(nextInQueue(order, 3, 4, "sequential").order).toEqual(order);
  });
});

describe("nextInQueue：单曲循环（自动播完 vs 手动下一首）", () => {
  it("自动放完 → 重放当前这首（位置不变）", () => {
    expect(nextInQueue([0, 1, 2], 1, 3, "single", { auto: true })).toEqual({
      order: [0, 1, 2],
      pos: 1,
    });
  });

  it("手动点下一首 → 真的换下一首（否则像卡住）", () => {
    expect(nextInQueue([0, 1, 2], 1, 3, "single", { auto: false }).pos).toBe(2);
  });

  it("自动在最后一首也停在原地（单曲循环不需要绕回）", () => {
    expect(nextInQueue([0, 1, 2], 2, 3, "single", { auto: true }).pos).toBe(2);
  });
});

describe("prevInQueue：上一首的不对称（随机不绕回、顺序/单曲绕回）", () => {
  it("随机：退回刚放过的那首；已经在第一首就停住（连按不绕到末尾）", () => {
    const order = [3, 1, 0, 2];
    expect(prevInQueue(order, 2, 4, "shuffle")).toEqual({ order, pos: 1 });
    expect(prevInQueue(order, 0, 4, "shuffle")).toEqual({ order, pos: 0 });
  });

  it("顺序 / 单曲：在第一首按上一首 → 绕到最后一首（列表循环的直觉）", () => {
    expect(prevInQueue([0, 1, 2], 0, 3, "sequential")).toEqual({ order: [0, 1, 2], pos: 2 });
    expect(prevInQueue([0, 1, 2], 0, 3, "single").pos).toBe(2);
  });

  it("空目录 / 队列失效的安全行为", () => {
    expect(prevInQueue([], -1, 0, "shuffle").pos).toBe(-1);
    expect(isOrderValid(prevInQueue([9], 0, 3, "shuffle", seededRng(3)).order, 3)).toBe(true);
  });
});

describe("reorderForMode：切模式不打断当前这首", () => {
  it("切到顺序：队列变 0,1,2…，pos 指向当前曲（继续放同一首）", () => {
    const r = reorderForMode([2, 0, 1], 0, 3, "sequential"); // 当前曲 = 索引 2
    expect(r.order).toEqual([0, 1, 2]);
    expect(currentTrackIndex(r.order, r.pos)).toBe(2);
  });

  it("切到随机：重洗，但 pos 仍指向当前曲（不会突然跳歌）", () => {
    const r = reorderForMode([0, 1, 2], 1, 3, "shuffle", seededRng(11)); // 当前曲 = 索引 1
    expect(isOrderValid(r.order, 3)).toBe(true);
    expect(currentTrackIndex(r.order, r.pos)).toBe(1);
  });

  it("切到单曲：队列顺序化但当前曲不变（随后的自动播完会重放它）", () => {
    const r = reorderForMode([2, 0, 1], 2, 3, "single"); // 当前曲 = 索引 1
    expect(currentTrackIndex(r.order, r.pos)).toBe(1);
  });

  it("当前没有曲目（首次加载前）→ 从头开始，不抛错", () => {
    expect(reorderForMode([], -1, 3, "sequential")).toEqual({ order: [0, 1, 2], pos: 0 });
    expect(reorderForMode([], -1, 0, "shuffle")).toEqual({ order: [], pos: -1 });
  });
});

describe("currentTrackIndex", () => {
  it("越界一律返回 -1（调用方据此判定「没法放」）", () => {
    expect(currentTrackIndex([5, 6], 0)).toBe(5);
    expect(currentTrackIndex([5, 6], 2)).toBe(-1);
    expect(currentTrackIndex([], 0)).toBe(-1);
  });
});
