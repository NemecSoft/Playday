// 库同步判定规则的"可执行说明"。
// 相关实现：electron/core/db.ts 的 openDb()（复制前先问这里的 shouldSyncDatabase）。
import { describe, expect, it } from "vitest";
import { sameFileStamp, shouldSyncDatabase } from "./librarySync";

const A = { size: 1810432, mtimeMs: 1789000000000 };
const B = { size: 1810432, mtimeMs: 1789000000000 };

describe("sameFileStamp", () => {
  it("大小 + 时间都相同才算一致", () => {
    expect(sameFileStamp(A, B)).toBe(true);
    expect(sameFileStamp(A, { ...B, size: A.size + 1 })).toBe(false); // 尺寸变了
    expect(sameFileStamp(A, { ...B, mtimeMs: A.mtimeMs + 1 })).toBe(false); // 时间变了（哪怕 1ms）
  });

  it("缺失任一侧 → 不一致（要复制）", () => {
    expect(sameFileStamp(null, B)).toBe(false);
    expect(sameFileStamp(A, null)).toBe(false);
    expect(sameFileStamp(null, null)).toBe(false);
  });

  it("回归：亚毫秒小数 vs 落盘取整必须判为一致（否则优化永不生效）", () => {
    // 实测：源 1789149671377.9846 / 复制后 1789149671378
    expect(sameFileStamp({ size: 10, mtimeMs: 1789149671377.9846 }, { size: 10, mtimeMs: 1789149671378 })).toBe(true);
    // 但差 1 毫秒以上仍要判为不同（宁可多复制，不能漏更新）
    expect(sameFileStamp({ size: 10, mtimeMs: 1789149671377.9846 }, { size: 10, mtimeMs: 1789149671379 })).toBe(false);
  });
});

describe("shouldSyncDatabase：跳过条件", () => {
  it("两边一致 → 跳过复制（性能优化的核心路径）", () => {
    expect(shouldSyncDatabase(A, B)).toBe(false);
  });

  it("副本不存在 → 复制", () => {
    expect(shouldSyncDatabase(A, null)).toBe(true);
  });

  it("权威库被更新过（时间或尺寸变了）→ 复制", () => {
    expect(shouldSyncDatabase({ ...A, mtimeMs: A.mtimeMs + 1000 }, B)).toBe(true);
    expect(shouldSyncDatabase({ ...A, size: A.size + 2048 }, B)).toBe(true);
  });

  it("没有权威库 → 不复制（沿用现有副本；首次运行在别处建空库）", () => {
    expect(shouldSyncDatabase(null, B)).toBe(false);
    expect(shouldSyncDatabase(null, null)).toBe(false);
  });

  it("回归：如果复制时没带 mtime（副本被打成'现在'），判定必然要求再复制一次", () => {
    const runtimeJustCopiedNaively = { size: A.size, mtimeMs: A.mtimeMs + 5000 };
    expect(shouldSyncDatabase(A, runtimeJustCopiedNaively)).toBe(true);
  });
});
