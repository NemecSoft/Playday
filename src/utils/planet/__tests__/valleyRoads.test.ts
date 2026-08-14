import { describe, it, expect } from "vitest";
import { generateValleyRoads } from "../valleyRoads";

describe("generateValleyRoads", () => {
  it("默认生成 3 条道路，且点数 > 0", () => {
    const r = generateValleyRoads(100);
    expect(r.points.length).toBeGreaterThan(50);
    expect(r.halfWidth).toBeGreaterThan(0);
  });

  it("所有道路点都在地图范围内（半径 < half+5）", () => {
    const half = 90;
    const r = generateValleyRoads(half);
    for (const p of r.points) {
      expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(half + 5);
    }
  });
});