import { describe, it, expect } from "vitest";
import { fibonacciSphere, fibonacciSphereInBand } from "../fibonacciSphere";

describe("fibonacciSphere", () => {
  it("生成指定数量的点，且都在半径球面上", () => {
    const pts = fibonacciSphere(100, 5);
    expect(pts.length).toBe(100);
    for (const p of pts) {
      const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      expect(r).toBeCloseTo(5, 2);
    }
  });

  it("点之间不重复", () => {
    const pts = fibonacciSphere(500, 1);
    const keys = new Set(
      pts.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`)
    );
    expect(keys.size).toBe(500);
  });
});

describe("fibonacciSphereInBand", () => {
  it("所有点落在给定纬度带内", () => {
    const minLat = 0.2; // 北纬约 11 度
    const maxLat = 1.2; // 北纬约 69 度
    const pts = fibonacciSphereInBand(50, 1, minLat, maxLat);
    expect(pts.length).toBe(50);
    for (const p of pts) {
      const lat = Math.asin(p.y); // 纬度 = asin(y)，因为半径 1
      expect(lat).toBeGreaterThanOrEqual(minLat - 1e-6);
      expect(lat).toBeLessThanOrEqual(maxLat + 1e-6);
    }
  });
});
