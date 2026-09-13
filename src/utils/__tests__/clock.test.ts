// 时间格式化的"可执行说明"。实现：src/utils/clock.ts
// 两个使用者：详情页的运行时长（补零的计时器风格）与音乐面板的播放进度（不补零的媒体风格）。
import { describe, expect, it } from "vitest";
import { formatClock } from "../clock";

describe("formatClock：秒 → 显示文本", () => {
  it("不足 1 小时：默认不补零（媒体时长），padMinutes 时补零（计时器）", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(65, { padMinutes: true })).toBe("01:05");
    expect(formatClock(5)).toBe("0:05");
  });

  it("超过 1 小时才出现小时位，且分钟/秒补零", () => {
    expect(formatClock(3661)).toBe("1:01:01");
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3599)).toBe("59:59");
  });

  it("非法值一律按 0 处理（界面里绝不出现 -1:-1 / NaN:NaN）", () => {
    expect(formatClock(-5)).toBe("0:00");
    expect(formatClock(Number.NaN)).toBe("0:00");
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe("0:00");
  });

  it("小数向下取整（进度条拖到 6.9 秒不该显示 6:60）", () => {
    expect(formatClock(6.9)).toBe("0:06");
    expect(formatClock(59.9)).toBe("0:59");
  });
});
