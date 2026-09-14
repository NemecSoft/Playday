// 图片字节缓存的可执行说明。被测实现：electron/core/imageCache.ts。
// ⚠️ 不得 import electron（见 vitest.config.mts）。
import { describe, expect, it } from "vitest";
import { createByteLruCache } from "./imageCache";

const KB = 1024;

describe("createByteLruCache", () => {
  it("没超上限时全部留住", () => {
    const c = createByteLruCache<string>(10 * KB);
    c.set("a", "A", 3 * KB);
    c.set("b", "B", 3 * KB);
    expect(c.get("a")).toBe("A");
    expect(c.get("b")).toBe("B");
    expect(c.count()).toBe(2);
    expect(c.bytes()).toBe(6 * KB);
    expect(c.evicted()).toBe(0);
  });

  it("超上限时按 LRU 逐出最久未用的（get 算触碰）", () => {
    const c = createByteLruCache<string>(10 * KB);
    c.set("a", "A", 4 * KB);
    c.set("b", "B", 4 * KB);
    c.get("a"); // 触碰 a → 最久未用变成 b
    c.set("c", "C", 4 * KB); // 超上限，逐出 b
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe("A");
    expect(c.get("c")).toBe("C");
    expect(c.bytes()).toBe(8 * KB);
    expect(c.evicted()).toBe(1);
  });

  it("同 key 重设会替换旧的字节数（不会重复计数）", () => {
    const c = createByteLruCache<string>(10 * KB);
    c.set("a", "A1", 4 * KB);
    c.set("a", "A2", 2 * KB);
    expect(c.get("a")).toBe("A2");
    expect(c.bytes()).toBe(2 * KB);
    expect(c.count()).toBe(1);
  });

  it("单条就超上限时把自己逐出（宁可缓存失效，也不越界）", () => {
    const c = createByteLruCache<string>(4 * KB);
    c.set("big", "X", 8 * KB);
    expect(c.get("big")).toBeUndefined();
    expect(c.bytes()).toBe(0);
    expect(c.count()).toBe(0);
  });

  it("这正是主进程原来缺的那道闸：连续灌 300 份、总量恒定不超上限", () => {
    // 复现真实场景：每张 ~334KB，上限 96MB → 灌 300 张（≈100MB）后必须稳定在上限内
    const cap = 96 * KB * KB;
    const c = createByteLruCache<number>(cap);
    for (let i = 0; i < 300; i++) c.set(`p${i}`, i, 334 * KB);
    expect(c.bytes()).toBeLessThanOrEqual(cap);
    expect(c.evicted()).toBeGreaterThan(0);
    // 最近写入的一定还在（LRU 语义）
    expect(c.get("p299")).toBe(299);
  });

  it("clear 清空但不改累计逐出计数", () => {
    const c = createByteLruCache<string>(2 * KB);
    c.set("a", "A", 2 * KB);
    c.set("b", "B", 2 * KB); // 逐出 a
    c.clear();
    expect(c.count()).toBe(0);
    expect(c.bytes()).toBe(0);
    expect(c.evicted()).toBe(1);
  });
});
