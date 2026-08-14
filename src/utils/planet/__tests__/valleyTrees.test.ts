import { describe, it, expect } from "vitest";
import { generateValleyTrees } from "../valleyTrees";
import { generateValleyRoads } from "../valleyRoads";

describe("generateValleyTrees", () => {
  it("生成指定数量的树", () => {
    const trees = generateValleyTrees({ count: 50, half: 100 });
    expect(trees.length).toBe(50);
  });

  it("树都在地图内（不超出范围）", () => {
    const trees = generateValleyTrees({ count: 80, half: 100 });
    for (const t of trees) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(100);
      expect(Math.abs(t.z)).toBeLessThanOrEqual(100);
    }
  });

  it("树不在道路上（保持一定距离）", () => {
    const roads = generateValleyRoads(100, 3);
    const trees = generateValleyTrees({ count: 100, half: 100, roads });
    for (const tree of trees) {
      let minD = Infinity;
      for (const p of roads.points) {
        const d = Math.hypot(tree.x - p.x, tree.z - p.z);
        if (d < minD) minD = d;
      }
      expect(minD).toBeGreaterThan(roads.halfWidth);
    }
  });
});