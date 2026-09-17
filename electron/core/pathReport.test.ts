// 路径报告（-log）的"可执行说明"：排版不能悄悄变形状 —— 它是拿来**两台机器 diff** 的，
// 格式一漂移，diff 就全是噪声。

import { describe, expect, it } from "vitest";
import { buildPathReport, isPathLogEnabled, padDisplay, type PathReportInput } from "./pathReport";

/** 一份报告输入：故意混三种情况（正常存在 / 缺失 / 未配置）。 */
const input = (over: Partial<PathReportInput> = {}): PathReportInput => ({
  time: new Date(2026, 8, 16, 9, 5, 3),
  version: "0.1.0",
  packaged: true,
  execPath: "X:\\YunGame\\Playnite\\PlayniteUI.exe",
  appRoot: "X:\\YunGame\\Playnite",
  dataRoot: "X:\\YunGame\\Playnite\\data",
  configFile: "X:\\YunGame\\Playnite\\config.json",
  resourcesPath: "X:\\YunGame\\Playnite\\resources",
  fields: [
    { field: "musicDir", raw: "D:/KwDownload/song", resolved: "D:\\KwDownload\\song", exists: true },
    { field: "runtimeDir", raw: "runtime", resolved: "X:\\YunGame\\Playnite\\runtime", exists: false },
    { field: "fontsDir", raw: "", resolved: null, exists: null },
  ],
  derived: [{ label: "权威库（源库）", value: "X:\\YunGame\\Playnite\\data\\Admin\\library.db", exists: true }],
  ...over,
});

const text = (over: Partial<PathReportInput> = {}) => buildPathReport(input(over)).join("\n");

describe("isPathLogEnabled：-log / --log 都认", () => {
  it("两种横线都算开（免得写错一种就静默不生效）", () => {
    expect(isPathLogEnabled(["exe", "-log"])).toBe(true);
    expect(isPathLogEnabled(["exe", "--log"])).toBe(true);
  });

  it("别的参数不算（精确匹配：-login / --check 不能被当成开关）", () => {
    expect(isPathLogEnabled(["exe"])).toBe(false);
    expect(isPathLogEnabled(["exe", "--check"])).toBe(false);
    expect(isPathLogEnabled(["exe", "-login"])).toBe(false);
  });
});

describe("padDisplay：中日韩字符按两格算（对齐是这份报告的用处所在）", () => {
  it("中文标签补到指定位宽", () => {
    expect(padDisplay("数据根", 12)).toBe(`数据根${" ".repeat(6)}`);
    expect(padDisplay("时间", 12)).toBe(`时间${" ".repeat(8)}`);
    expect(padDisplay("abc", 6)).toBe("abc   ");
  });

  it("超长不截断（宁可错行，也别吃掉信息）", () => {
    expect(padDisplay("abcdefgh", 4)).toBe("abcdefgh");
  });
});

describe("buildPathReport：原值 → 实际全路径 + 存在性", () => {
  it("头部先说清这台机器是谁（应用目录 / 数据根 / 配置文件）", () => {
    expect(text()).toMatch(/应用目录\s*：X:\\YunGame\\Playnite/);
    expect(text()).toMatch(/数据根\s*：X:\\YunGame\\Playnite\\data/);
    expect(text()).toMatch(/配置文件\s*：X:\\YunGame\\Playnite\\config\.json/);
  });

  it("字段两行：原值照抄配置、实际是解析后的全路径", () => {
    // 原值照抄 —— 一眼看出配置里写的是绝对还是相对（这才是两台机器能对照的原因）
    expect(text()).toMatch(/原值\s*：D:\/KwDownload\/song/);
    expect(text()).toMatch(/原值\s*：runtime/);
    // 实际是解析后的全路径 + 存在性
    expect(text()).toMatch(/实际\s*：D:\\KwDownload\\song\s*\[存在\]/);
    expect(text()).toMatch(/实际\s*：X:\\YunGame\\Playnite\\runtime\s*\[缺失\]/);
  });

  it("未配置的字段：说「未配置」，不冒充「缺失」", () => {
    const t = text();
    expect(t).toMatch(/实际\s*：（未配置）/);
    expect(t).not.toMatch(/（未配置）\s*\[缺失\]/);
  });

  it("字段顺序 = 传进来的顺序（两台机器跑同一份代码 → 顺序一致才 diff 得动）", () => {
    const t = text();
    expect(t.indexOf("musicDir")).toBeLessThan(t.indexOf("runtimeDir"));
    expect(t.indexOf("runtimeDir")).toBeLessThan(t.indexOf("fontsDir"));
  });

  it("派生路径单独一段（库/公告/日志这些配置里不写的东西也要报）", () => {
    expect(text()).toContain("派生路径");
    expect(text()).toMatch(/权威库（源库）\s*：X:\\YunGame\\Playnite\\data\\Admin\\library\.db/);
  });

  it("没有 resourcesPath 时不出现「资源目录」那行（开发态没这东西）", () => {
    expect(text({ resourcesPath: null })).not.toContain("资源目录");
    expect(text()).toContain("资源目录");
  });

  it("末尾给出对照方法（含固定名 paths-latest.log）", () => {
    expect(text()).toContain("paths-latest.log");
    expect(text()).toContain("diff");
  });

  it("行尾不留空格（diff 里看不见的空白最烦人）", () => {
    for (const line of buildPathReport(input())) expect(line).toBe(line.trimEnd());
  });
});
