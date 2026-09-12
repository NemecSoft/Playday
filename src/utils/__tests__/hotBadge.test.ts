// 「火爆」角标判定的单元测试：边界值（阈值本身）与"没填过"的情况最容易写错。

import { describe, it, expect } from "vitest";
import { isHotGame, HOT_SCORE_MIN } from "../hotBadge";

describe("isHotGame", () => {
  it("超过阈值才算（阈值本身不算——是大于，不是大于等于）", () => {
    expect(isHotGame({ communityScore: HOT_SCORE_MIN })).toBe(false);
    expect(isHotGame({ communityScore: HOT_SCORE_MIN + 1 })).toBe(true);
  });

  it("没填过评分（undefined / null 落成 undefined）一律不算", () => {
    expect(isHotGame({})).toBe(false);
    expect(isHotGame({ communityScore: undefined })).toBe(false);
  });

  it("0 分与负分不算；非数字（脏数据）不算", () => {
    expect(isHotGame({ communityScore: 0 })).toBe(false);
    expect(isHotGame({ communityScore: -5 })).toBe(false);
    expect(isHotGame({ communityScore: Number.NaN })).toBe(false);
    expect(isHotGame({ communityScore: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it("高分（如 120）算火爆", () => {
    expect(isHotGame({ communityScore: 120 })).toBe(true);
  });
});
