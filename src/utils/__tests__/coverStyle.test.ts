// 封面风格规则的"可执行说明"：非法配置必须回退原图，且每个风格的滤镜值钉住。
import { describe, expect, it } from "vitest";
import { COVER_STYLES, DEFAULT_COVER_STYLE, clampCoverStyle, coverStyleFilter } from "../coverStyle";

describe("clampCoverStyle：配置值 → 合法风格", () => {
  it("五个合法值原样通过", () => {
    for (const s of COVER_STYLES) expect(clampCoverStyle(s)).toBe(s);
  });

  it("非法 / 缺失 / 非字符串 一律回退原图（老配置里没这个字段）", () => {
    expect(clampCoverStyle(undefined)).toBe(DEFAULT_COVER_STYLE);
    expect(clampCoverStyle(null)).toBe(DEFAULT_COVER_STYLE);
    expect(clampCoverStyle("")).toBe(DEFAULT_COVER_STYLE);
    expect(clampCoverStyle("mono")).toBe(DEFAULT_COVER_STYLE); // 曾讨论过、最终没做的黑白
    expect(clampCoverStyle(3)).toBe(DEFAULT_COVER_STYLE);
    expect(clampCoverStyle({})).toBe(DEFAULT_COVER_STYLE);
  });
});

describe("coverStyleFilter：风格 → CSS filter", () => {
  it("原图不处理", () => {
    expect(coverStyleFilter("none")).toBe("none");
    expect(coverStyleFilter(undefined)).toBe("none");
  });

  it("每个风格都有自己的滤镜（不是空串，也不是彼此相同）", () => {
    const vals = COVER_STYLES.filter((s) => s !== "none").map((s) => coverStyleFilter(s));
    for (const v of vals) expect(v.length).toBeGreaterThan(0);
    expect(new Set(vals).size).toBe(vals.length); // 互不重复
  });

  it("钉住具体滤镜（防止被顺手改掉）", () => {
    expect(coverStyleFilter("vivid")).toBe("saturate(1.25) contrast(1.08)");
    expect(coverStyleFilter("sepia")).toBe("sepia(0.55) saturate(1.05) contrast(1.02)");
    expect(coverStyleFilter("contrast")).toBe("contrast(1.35) saturate(1.1)");
  });
});
