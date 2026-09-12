// 封面匹配规则的"可执行说明"。
// 用例里的名字取自真实库（赛菲莉娅 / 红色警戒2：共和国之辉 / 双点校园 …）。
// 末尾一组 parity 用例：网站端 server/coverMatch.mjs 必须与这里逐字同结果。
import { describe, expect, it } from "vitest";
import {
  coverCandidateNames,
  coverFormatPriority,
  extOf,
  isBetterCover,
  normalizeCoverName,
} from "./coverMatch";
import * as webMatch from "../server/coverMatch.mjs";

describe("normalizeCoverName：大小写 / 全角 / 标点 / 空格 都归一到同一个键", () => {
  it("括号、破折号、空格不影响匹配", () => {
    expect(normalizeCoverName("星际争霸 (2)")).toBe("星际争霸2");
    expect(normalizeCoverName("星际争霸-2")).toBe("星际争霸2");
    expect(normalizeCoverName("星际争霸")).toBe("星际争霸");
  });

  it("英文大小写与空格归一", () => {
    expect(normalizeCoverName("Two Point Campus")).toBe("twopointcampus");
    expect(normalizeCoverName("TWO  POINT  CAMPUS")).toBe("twopointcampus");
  });

  it("全角字母/数字转半角，全角空格被去掉", () => {
    expect(normalizeCoverName("ＦＵＬＬ　ＷＩＤＴＨ")).toBe("fullwidth");
    expect(normalizeCoverName("１２３")).toBe("123");
  });

  it("中文标点与书名号等一并去掉", () => {
    expect(normalizeCoverName("红色警戒2：共和国之辉")).toBe("红色警戒2共和国之辉");
    expect(normalizeCoverName("《巫师3》")).toBe("巫师3");
  });
});

describe("coverFormatPriority / isBetterCover", () => {
  it("格式优先级：动图 png > webp > gif > jpg > png > bmp", () => {
    expect(coverFormatPriority("png", true)).toBeGreaterThan(coverFormatPriority("webp", false));
    expect(coverFormatPriority("webp", false)).toBeGreaterThan(coverFormatPriority("gif", false));
    expect(coverFormatPriority("gif", false)).toBeGreaterThan(coverFormatPriority("jpg", false));
    expect(coverFormatPriority("jpg", false)).toBeGreaterThan(coverFormatPriority("png", false));
    expect(coverFormatPriority("png", false)).toBeGreaterThan(coverFormatPriority("bmp", false));
    expect(coverFormatPriority("txt", false)).toBe(0);
  });

  it("extOf：大小写归一、去掉目录部分", () => {
    expect(extOf("D:/x/Cover.JPG")).toBe("jpg");
    expect(extOf("D:\\x\\a.webp")).toBe("webp");
    expect(extOf("noext")).toBe("");
  });

  it("isBetterCover 只在优先级更高时替换（同级保持先到者，结果稳定）", () => {
    const png = { file: "a.png", isApng: false };
    const jpg = { file: "a.jpg", isApng: false };
    const apng = { file: "a.png", isApng: true };
    expect(isBetterCover(jpg, png)).toBe(true); // jpg 40 > png 20
    expect(isBetterCover(png, jpg)).toBe(false);
    expect(isBetterCover(apng, jpg)).toBe(true); // 动图 png 100
    expect(isBetterCover(jpg, jpg)).toBe(false); // 同级 → 不替换
  });
});

describe("coverCandidateNames：候选名顺序 = 匹配优先级", () => {
  it("顺序是 zh-CN → zh-TW → 其它多语言 → 别名 → 主名", () => {
    expect(
      coverCandidateNames({
        name: "Starcraft II",
        localizedNames: [
          { language: "en-US", name: "StarCraft II" },
          { language: "zh-TW", name: "星海爭霸II" },
          { language: "zh-CN", name: "星际争霸2" },
        ],
        alternateNames: ["星际争霸 II", "星海争霸2"],
      }),
    ).toEqual(["星际争霸2", "星海爭霸II", "StarCraft II", "星际争霸 II", "星海争霸2", "Starcraft II"]);
  });

  it("去重（按 trim 后的原文）且跳过空白名", () => {
    expect(
      coverCandidateNames({
        name: "赛菲莉娅",
        localizedNames: [
          { language: "zh-CN", name: "赛菲莉娅" },
          { language: "zh-TW", name: "   " },
        ],
        alternateNames: ["赛菲莉娅"],
      }),
    ).toEqual(["赛菲莉娅"]);
  });

  it("缺字段不炸（网站端 rowToGame 可能给 undefined）", () => {
    expect(coverCandidateNames({ name: "双点校园" })).toEqual(["双点校园"]);
    expect(coverCandidateNames({})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parity：网站端 server/coverMatch.mjs 必须与桌面端逐字同结果。
// （网站端以前根本不匹配封面，只读已废弃的 cover_image 列 → 新游戏全是空封面。）
// ---------------------------------------------------------------------------
describe("parity：网站端 server/coverMatch.mjs 与桌面端一致", () => {
  const NAMES = [
    "星际争霸 (2)",
    "星际争霸-2",
    "星际争霸",
    "红色警戒2：共和国之辉",
    "《巫师3》",
    "Two Point Campus",
    "TWO  POINT  CAMPUS",
    "ＦＵＬＬ　ＷＩＤＴＨ",
    "１２３",
    "赛菲莉娅",
    "..\\奇怪/名字.png",
    "",
    "   ",
  ];
  const GAMES = [
    {
      name: "Starcraft II",
      localizedNames: [
        { language: "en-US", name: "StarCraft II" },
        { language: "zh-TW", name: "星海爭霸II" },
        { language: "zh-CN", name: "星际争霸2" },
      ],
      alternateNames: ["星际争霸 II", "星海争霸2"],
    },
    { name: "双点校园" },
    { name: "赛菲莉娅", localizedNames: [{ language: "zh-CN", name: "赛菲莉娅" }], alternateNames: ["赛菲莉娅"] },
    {},
  ];
  const FILES = ["a.png", "a.jpg", "a.webp", "a.bmp", "a", "D:/x/A.JPG"];

  it("normalizeCoverName 结果一致", () => {
    const diff = NAMES.filter((n) => normalizeCoverName(n) !== webMatch.normalizeCoverName(n)).map(
      (n) => `${JSON.stringify(n)}: ${normalizeCoverName(n)} vs ${webMatch.normalizeCoverName(n)}`,
    );
    expect(diff).toEqual([]);
  });

  it("extOf / coverFormatPriority 结果一致", () => {
    const diff: string[] = [];
    for (const f of FILES) {
      if (extOf(f) !== webMatch.extOf(f)) diff.push(`extOf(${f}): ${extOf(f)} vs ${webMatch.extOf(f)}`);
    }
    for (const ext of ["png", "jpg", "jpeg", "webp", "gif", "bmp", "txt"]) {
      for (const apng of [true, false]) {
        if (coverFormatPriority(ext, apng) !== webMatch.coverFormatPriority(ext, apng)) {
          diff.push(`priority(${ext},${apng})`);
        }
      }
    }
    expect(diff).toEqual([]);
  });

  it("coverCandidateNames / isBetterCover 结果一致", () => {
    const diff: string[] = [];
    for (const g of GAMES) {
      const a = JSON.stringify(coverCandidateNames(g));
      const b = JSON.stringify(webMatch.coverCandidateNames(g));
      if (a !== b) diff.push(`candidates: ${a} vs ${b}`);
    }
    for (const a1 of FILES) {
      for (const b1 of FILES) {
        for (const apng of [true, false]) {
          const x = isBetterCover({ file: a1, isApng: apng }, { file: b1, isApng: false });
          const y = webMatch.isBetterCover({ file: a1, isApng: apng }, { file: b1, isApng: false });
          if (x !== y) diff.push(`isBetterCover(${a1},${b1},${apng}): ${x} vs ${y}`);
        }
      }
    }
    expect(diff).toEqual([]);
  });
});
