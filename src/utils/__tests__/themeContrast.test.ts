// 主题配色可读性守卫。
//
// 由来：明亮主题下侧栏标签"整列字都是糊的"——根因是界面文字误用了卡片文字色
// （暖白 #fff8e7 盖在白底上）。这类问题肉眼只在切到某个主题时才暴露，所以在这里
// 用对比度算一遍：主题表面色（background/card）与各级文字色必须拉开足够反差。
//
// 阈值参考 WCAG 2.1：正文 4.5:1、大字/次要文字 3:1。dim（提示/计数）放宽到 2.6:1，
// 因为设计上它就是"弱化"层级，但仍必须"看得见"。
import { describe, expect, it } from "vitest";
import { themeLibrary } from "../themeLibrary";

/** #RGB / #RRGGBB → [r,g,b]，非法值返回 null（跳过该检查项）。 */
function parseHex(hex: string | undefined): [number, number, number] | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** WCAG 相对亮度。 */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 两色对比度（1~21）。任一色解析失败返回 null。 */
function contrast(a?: string, b?: string): number | null {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  const la = luminance(ca);
  const lb = luminance(cb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

interface Rule {
  字段: "textPrimary" | "textSecondary" | "textDim";
  最低: number;
}

// 基础主题（明亮 / 暗黑）是内置主力，按 WCAG 正文标准要求。
const STRICT: Rule[] = [
  { 字段: "textPrimary", 最低: 4.5 },
  { 字段: "textSecondary", 最低: 3.0 },
  { 字段: "textDim", 最低: 2.6 },
];

// 社区主题是自动抓取转换来的、数量多（40+），它们的 textDim 普遍落在 1.7~2.6:1
// （提示/计数层级，不理想但可接受）。阈值卡到 2.6 会让守卫变成噪音、没人会去修，
// 所以这一档只保证"不再变差"：主文字仍要求 4.5，次要/提示放宽到可见下限。
const FLOOR: Rule[] = [
  { 字段: "textPrimary", 最低: 4.5 },
  { 字段: "textSecondary", 最低: 2.4 },
  { 字段: "textDim", 最低: 1.7 },
];

describe("主题配色对比度", () => {
  it("每个主题的 3 级文字色在背景/卡片上都可读", () => {
    const bad: string[] = [];
    for (const theme of themeLibrary) {
      const p = theme.palette as unknown as Record<string, string | undefined>;
      const rules = theme.category === "基础" ? STRICT : FLOOR;
      // 卡片是最常见的"文字承载面"，和背景一起都查。
      for (const surface of ["background", "card"] as const) {
        for (const rule of rules) {
          const ratio = contrast(p[rule.字段], p[surface]);
          if (ratio === null) continue; // 非 hex（如 rgba）跳过，不做误判
          if (ratio < rule.最低) {
            bad.push(
              `${theme.id}（${theme.zh}）${rule.字段} vs ${surface}: ${ratio.toFixed(2)}:1 < ${rule.最低}`,
            );
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("明亮主题下卡片文字色在浅底上确实不可读（所以界面文字不能用它）", () => {
    const light = themeLibrary.find((t) => t.id === "p-light");
    expect(light).toBeTruthy();
    // 同时断言"界面文字用主题令牌"这条约定：卡片文字色（暖白）在浅底上本就不可读，
    // 所以它绝不该被用作界面文字的颜色 —— 真正的防线在 CSS 里，这里只留个提醒。
    const cardTextOnWhite = contrast("#fff8e7", light!.palette.card);
    expect(cardTextOnWhite).not.toBeNull();
    expect(cardTextOnWhite!).toBeLessThan(1.6);
  });
});
