import { describe, it, expect } from "vitest";
import { generateValleyHeightMap } from "../valleyTerrain";

describe("generateValleyHeightMap", () => {
  it("生成正确尺寸的高度图", () => {
    const m = generateValleyHeightMap(64, 100);
    expect(m.heights.length).toBe(64 * 64);
    expect(m.half).toBe(100);
  });

  it("中心区域比边缘低（山谷被山脉围合）", () => {
    const m = generateValleyHeightMap(64, 100);
    const c = m.heights[32 * 64 + 32]; // 中心
    const e = m.heights[0 * 64 + 0]; // 角落（边缘）
    expect(c).toBeLessThan(e);
  });
});
