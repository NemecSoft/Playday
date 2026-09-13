// "库过旧"判定规则的"可执行说明"。
// 相关实现：electron/core/auth.ts 的 resolveLibraryAgeState()（读文件时间）+
//          shared/libraryAge.ts 的 evaluateLibraryAge()（判定，本文件测的就是它）。
import { describe, expect, it } from "vitest";
import { MAX_LIBRARY_AGE_DAYS, evaluateLibraryAge } from "./libraryAge";

const DAY = 86400000;
// 固定一个"现在"，避免测试跟着真实时间漂。
const NOW = Date.UTC(2026, 8, 13, 12, 0, 0);

const daysAgo = (n: number) => NOW - n * DAY;

describe("evaluateLibraryAge：什么时候锁", () => {
  it("阈值就是需求里那个 30 天（写死，不给开关）", () => {
    expect(MAX_LIBRARY_AGE_DAYS).toBe(30);
  });

  it("满 30 天 → 过旧（不允许进入系统）", () => {
    const r = evaluateLibraryAge(daysAgo(30), NOW);
    expect(r.outdated).toBe(true);
    expect(r.ageDays).toBe(30);
  });

  it("第 30 天以内 → 正常（含刚更新过）", () => {
    for (const d of [0, 1, 7, 29]) {
      const r = evaluateLibraryAge(daysAgo(d), NOW);
      expect(r.outdated, `${d} 天不该被判过旧`).toBe(false);
      expect(r.ageDays).toBe(d);
    }
  });

  it("不足一天按 0 天算（不是 -1 也不是 1）", () => {
    expect(evaluateLibraryAge(NOW - 3 * 3600000, NOW).ageDays).toBe(0);
  });

  it("再放久一点仍然是过旧，天数如实报出来（提示文案要用）", () => {
    const r = evaluateLibraryAge(daysAgo(45), NOW);
    expect(r.outdated).toBe(true);
    expect(r.ageDays).toBe(45);
  });
});

describe("evaluateLibraryAge：三条兜底都必须「不锁」", () => {
  it("读不到文件（库不存在/没权限）→ 不锁（否则新装机全被挡在门外）", () => {
    expect(evaluateLibraryAge(null, NOW)).toEqual({ mtimeMs: null, ageDays: null, outdated: false });
    expect(evaluateLibraryAge(undefined, NOW).outdated).toBe(false);
    expect(evaluateLibraryAge(Number.NaN, NOW).outdated).toBe(false);
  });

  it("文件时间在未来（系统时间被往前调过 / 拷来未来时间）→ 不锁", () => {
    const r = evaluateLibraryAge(NOW + 10 * DAY, NOW);
    expect(r.outdated).toBe(false);
    expect(r.ageDays).toBe(0);
  });

  it("边界：刚好 30 天整算过旧，差 1 毫秒不算（避免「少一天却锁人」）", () => {
    expect(evaluateLibraryAge(NOW - 30 * DAY, NOW).outdated).toBe(true);
    expect(evaluateLibraryAge(NOW - 30 * DAY + 1, NOW).outdated).toBe(false);
  });
});
