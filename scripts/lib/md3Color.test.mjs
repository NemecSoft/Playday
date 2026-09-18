// 锁住 MD3 色调体系的数学性质。
//
// 为什么要锁：主题配色是"看起来差不多就行"的东西，很容易被人凭手感改坏
// （以前 fix-contrast 那套 ±2 硬拖就是这么来的，越修越脏）。
// 这里断言的全是**可证伪的性质**：tone 与 OKLCH 的换算、改 tone 必须保色相、
// 修对比度必须是"刚好够"（多挪一档就不达标 —— 证明它没浪费色相空间）。
import { describe, expect, it } from "vitest";
import chroma from "chroma-js";
import {
  contrast,
  fitTone,
  fitToneSeparation,
  lToTone,
  atHue,
  toneOf,
  toneToL,
  withTone,
} from "./md3Color.mjs";

describe("MD3 色调体系", () => {
  it("tone ↔ OKLCH 的 L 可逆，且端点对得上纯黑/纯白", () => {
    for (const t of [0, 8, 20, 40, 50, 60, 80, 90, 100]) {
      expect(lToTone(toneToL(t))).toBeCloseTo(t, 6);
    }
    expect(toneOf("#ffffff")).toBeCloseTo(100, 3);
    expect(toneOf("#000000")).toBeCloseTo(0, 3);
    // 中灰：MD3 的 tone 50 应当落在 #777 附近（L* 50）
    expect(Math.abs(toneOf("#777777") - 50)).toBeLessThan(1);
  });

  it("改 tone 保色相（这是「越修越脏」的解药）", () => {
    const seed = "#9e1b32"; // 中国风的酒红
    const [, , hue0] = chroma(seed).oklch();
    for (const tone of [20, 40, 60, 80, 95]) {
      const [, c1, hue1] = chroma(withTone(seed, tone)).oklch();
      // 只在彩度还站得住的时候比色相。实测（本种子）：tone 20/40/60/80 的彩度 0.098~0.164、
      // 色相漂移 ≤1.3°（8bit 量化的正常抖动）；而 tone 95 的彩度只剩 0.023 —— 那种"几乎无色"
      // 的状态下色相本来就无意义（量化误差就能晃到 2.8°），所以按彩度设一条护栏。
      if (c1 > 0.05) expect(Math.abs(hue1 - hue0)).toBeLessThan(2); // 色相不许跑
      // tone 要落到位：容差 1（hex 是 8bit，往返本身有约 0.4 tone 的量化误差）
      expect(Math.abs(toneOf(withTone(seed, tone)) - tone)).toBeLessThan(1);
    }
  });

  it("原 tone 进去再出来是同一个色（幂等）", () => {
    // 不逐字节比 hex：往返要过 OKLCH → 8bit hex，允许亚感知的量化误差（ΔE < 0.5）
    for (const c of ["#9e1b32", "#2d7ff9", "#c8a44e", "#808080"]) {
      expect(chroma.deltaE(c, withTone(c, toneOf(c)))).toBeLessThan(0.5);
    }
  });

  it("出界的高 tone 亮色会被压回色域，但 tone 仍然到位", () => {
    // 纯红拉到 tone 85 已经超出 sRGB（高 tone + 高彩度装不下）
    const out = withTone("#ff0000", 85);
    expect(Math.abs(toneOf(out) - 85)).toBeLessThan(1); // 退彩度之后明度仍准确
    // 且真的落回 sRGB（判据自备：再进一次 OKLCH，明度没被 hex 夹取改动过）
    expect(Math.abs(chroma(out).oklch()[0] - toneToL(85))).toBeLessThan(0.006);
  });

  it("灰阶（彩度 0、色相 NaN）不会算出 NaN", () => {
    expect(withTone("#808080", 90)).toMatch(/^#[0-9a-f]{6}$/);
    expect(withTone("#808080", 10)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("修对比度是「刚好够」：多挪一档就不达标", () => {
    const text = "#666666"; // 深底上的灰字，约 2.6:1
    const bgs = ["#1a1a1a"];
    expect(contrast(text, bgs[0])).toBeLessThan(4.5); // 前提：它确实不达标
    const { color, tone, moved } = fitTone(text, bgs, 4.5);
    expect(moved).toBeGreaterThan(0);
    expect(contrast(color, bgs[0])).toBeGreaterThanOrEqual(4.5);
    // 回退一档就不达标 → 证明停在了"刚好够"，没有白挪色相空间
    const prev = withTone(text, tone - Math.sign(tone - toneOf(text)) * 1);
    expect(contrast(prev, bgs[0])).toBeLessThan(4.5);
  });

  it("白字压在亮色按钮上：往亮走无解时改走变暗（回归测试）", () => {
    // 曾经的 bug：toneOf('#FFFFFF') 算出 100.0001，而循环第一句是 `tone > 100 → break`，
    // 于是第一步就退出、"变暗"那条路根本没走，10 个配色被误判成"无解"。
    const { color, moved } = fitTone("#FFFFFF", ["#1D9BF0"], 4.5);
    expect(moved).toBeGreaterThan(0);
    expect(contrast(color, "#1D9BF0")).toBeGreaterThanOrEqual(4.5);
    expect(toneOf(color)).toBeLessThan(50); // 只有变暗才够 —— 还是白的就是没修
  });

  it("修边框的色调间距：推离背景一档以上", () => {
    const { color, tone } = fitToneSeparation("#f0e6cf", ["#f5efe1", "#faf6ea"], 10);
    for (const b of ["#f5efe1", "#faf6ea"]) {
      expect(Math.abs(tone - toneOf(b))).toBeGreaterThanOrEqual(10);
    }
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("语义色归位固定色相：tone/彩度留着，色相换成 MD3 的", () => {
    const mint = "#00E5A8"; // 赛博朋克拿它当 success，但色相离 accent（青）太近
    const fixed = atHue(mint, 145);
    const [, , hue] = chroma(fixed).oklch();
    expect(Math.abs(hue - 145)).toBeLessThan(3); // 色相落到 MD3 的绿
    expect(Math.abs(toneOf(fixed) - toneOf(mint))).toBeLessThan(2); // 明度基本没动
    expect(chroma.deltaE(mint, fixed)).toBeGreaterThan(5); // 观感上确实换了个色
  });
});
