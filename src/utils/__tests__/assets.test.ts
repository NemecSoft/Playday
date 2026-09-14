// "图片字节形态"这个跨端契约的可执行说明（被测实现：src/utils/assets.ts 的 payloadToBytes）。
//
// 为什么值得锁：桌面端走 IPC 传**裸字节**（快，实测 43.1ms → 2.7ms），网站端走 HTTP JSON
// 只能传 **base64** —— 两边的 `data` 形态不同，而消费方只有这一处转换。谁哪天"顺手统一成
// 字符串"，桌面端就会悄悄退回慢路径（能跑，但滚动又开始卡），所以用测试把两条路都钉住。
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  readImage: vi.fn(),
  readImagesBatch: vi.fn(),
}));

vi.mock("../../api/client", () => ({
  api: {
    readImage: h.readImage,
    readImagesBatch: h.readImagesBatch,
    clearImageCache: vi.fn(async () => undefined),
  },
}));

import { ensureImageLoaded, payloadToBytes, preloadImages } from "../assets";

beforeEach(() => {
  h.readImage.mockReset();
  h.readImagesBatch.mockReset();
  // jsdom 不实现 createObjectURL / revokeObjectURL，用假地址顶上。
  const url = URL as unknown as {
    createObjectURL: () => string;
    revokeObjectURL: () => void;
  };
  let n = 0;
  url.createObjectURL = () => `blob:mock-${++n}`;
  url.revokeObjectURL = () => undefined;
});

const BYTES = [0, 1, 2, 127, 128, 253, 254, 255];

function base64Of(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

describe("payloadToBytes", () => {
  it("桌面端：Uint8Array 原样返回（不再逐字节拷贝）", () => {
    const raw = new Uint8Array(BYTES);
    const out = payloadToBytes(raw);
    expect(out).toBe(raw); // 同一个对象 —— 省掉一次全量拷贝
    expect([...out]).toEqual(BYTES);
  });

  it("网站端：base64 字符串解出同样的字节（含 >=128 的字节）", () => {
    expect([...payloadToBytes(base64Of(BYTES))]).toEqual(BYTES);
  });

  it("两种形态结果一致（同一个 Blob 内容）", () => {
    expect([...payloadToBytes(new Uint8Array(BYTES))]).toEqual([...payloadToBytes(base64Of(BYTES))]);
  });

  it("空数据两边都不炸", () => {
    expect(payloadToBytes(new Uint8Array([])).length).toBe(0);
    expect(payloadToBytes("").length).toBe(0);
  });
});

describe("preloadImages", () => {
  const ok = () => ({ data: new Uint8Array([1, 2, 3]), mime: "image/jpeg" });

  it("每张图只读一次 —— 走批量 IPC，不再额外单图读一遍", async () => {
    // 回归守卫（2026-09-14 修）：这里曾经对每个路径又调了一次 loadOne()，注释写的是
    // "标记在飞"，实际是真的又取了一遍 —— 同一张图被单图 IPC + 批量 IPC 各读一次，
    // 预载的耗时、IPC 流量、内存全部翻倍。断言"单图 IPC 一次都没被调用"钉住它。
    const paths = ["D:/c/a.jpg", "D:/c/b.jpg", "D:/c/c.jpg"];
    h.readImagesBatch.mockResolvedValue([ok(), ok(), ok()]);
    await preloadImages(paths);
    expect(h.readImagesBatch).toHaveBeenCalledTimes(1);
    expect(h.readImage).not.toHaveBeenCalled();
  });

  it("卡片抢在预载前面开始读的路径，预载不会再读一遍", async () => {
    // 不变式：同一张图、同一时刻只有一条读取在飞。视口里的卡片先发了单图请求，
    // 随后的预载必须认出"这张已经在读了"，而不是又用批量读一次。
    const p = "D:/c/race.jpg";
    h.readImage.mockResolvedValue({ data: new Uint8Array([9]), mime: "image/jpeg" });
    const pending = ensureImageLoaded(p); // 不 await：模拟卡片已经发出请求
    await preloadImages([p]);
    await pending; // 等单图那条读完之后再断言
    expect(h.readImage).toHaveBeenCalledTimes(1); // 单图这条路读了一次
    expect(h.readImagesBatch).not.toHaveBeenCalled(); // 批量这条路一次都没走
  });

  it("同一路径重复只取一次，远端地址不参与本地读取", async () => {
    h.readImagesBatch.mockResolvedValue([ok()]);
    await preloadImages(["D:/c/dup.jpg", "D:/c/dup.jpg", "", undefined, "https://x/y.jpg"]);
    expect(h.readImagesBatch).toHaveBeenCalledTimes(1);
    expect(h.readImagesBatch.mock.calls[0][0]).toEqual(["D:/c/dup.jpg"]);
  });
});
