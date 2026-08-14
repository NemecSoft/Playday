// 搜索功能的单元测试。对照 Playnite 的 SearchViewModel 测试思路，
// 验证 matchSearch / gameNameVariants / pinyinInitials 的行为。

import { describe, it, expect } from "vitest";
import { matchSearch, gameNameVariants, pinyinInitials } from "../search";
import type { Game } from "../../types/models";

function makeGame(over: Partial<Game>): Game {
  return {
    id: "g",
    name: "Test Game",
    installed: false,
    otherTasks: [],
    playCount: 0,
    playtime: 0,
    added: "",
    modified: "",
    category: [],
    genre: [],
    developer: [],
    publisher: [],
    tags: [],
    series: [],
    ageRating: [],
    region: [],
    source: [],
    features: [],
    hidden: false,
    favorite: false,
    platform: [],
    userScoreSet: false,
    manualGame: false,
    actions: [],
    links: [],
    featuresEnabled: false,
    gameLevel: 1,
    preLaunchEnabled: false,
    postLaunchEnabled: false,
    postExitEnabled: false,
    ...over,
  };
}

describe("pinyinInitials", () => {
  it("中文转拼音首字母：星际争霸 -> xjzb", () => {
    expect(pinyinInitials("星际争霸")).toBe("xjzb");
  });

  it("非中文原样保留小写", () => {
    expect(pinyinInitials("ABC")).toBe("abc");
  });

  it("空字符串返回空", () => {
    expect(pinyinInitials("")).toBe("");
  });
});

describe("gameNameVariants", () => {
  it("包含主名、本地化名、别名，并去重", () => {
    const g = makeGame({
      name: "StarCraft",
      localizedNames: [{ language: "zh-CN", name: "星际争霸" }],
      alternateNames: ["星际争霸", "SC"],
    });
    const variants = gameNameVariants(g);
    expect(variants).toContain("StarCraft");
    expect(variants).toContain("星际争霸");
    expect(variants).toContain("SC");
    // 去重：星际争霸只出现一次
    expect(variants.filter((v) => v === "星际争霸")).toHaveLength(1);
  });

  it("sortName 也算一个变体", () => {
    const g = makeGame({ name: "The Witcher 3", sortName: "Witcher 3" });
    expect(gameNameVariants(g)).toContain("Witcher 3");
  });
});

describe("matchSearch", () => {
  it("空查询匹配所有（返回 true）", () => {
    const g = makeGame({ name: "Anything" });
    expect(matchSearch(g, "")).toBe(true);
    expect(matchSearch(g, "   ")).toBe(true);
  });

  it("子串匹配显示名", () => {
    // 中文显示名优先
    const g = makeGame({
      name: "StarCraft",
      localizedNames: [{ language: "zh-CN", name: "星际争霸" }],
    });
    expect(matchSearch(g, "星际")).toBe(true);
  });

  it("拼音首字母匹配中文名（星际争霸 -> xjzb）", () => {
    const g = makeGame({
      name: "StarCraft",
      localizedNames: [{ language: "zh-CN", name: "星际争霸" }],
    });
    expect(matchSearch(g, "xjzb")).toBe(true);
  });

  it("不匹配返回 false", () => {
    const g = makeGame({
      name: "StarCraft",
      localizedNames: [{ language: "zh-CN", name: "星际争霸" }],
    });
    expect(matchSearch(g, "不存在的名字")).toBe(false);
    expect(matchSearch(g, "zzzzzz")).toBe(false);
  });

  it("英文名回退：无中文名时匹配英文", () => {
    const g = makeGame({ name: "Warcraft" });
    expect(matchSearch(g, "warcraft")).toBe(true);
    expect(matchSearch(g, "craft")).toBe(true);
  });
});
