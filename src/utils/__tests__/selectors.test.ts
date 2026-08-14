// 游戏列表筛选 / 排序 / 分组的单元测试。对照 Playnite 的集合视图逻辑，
// 验证 filterGames / sortGames / groupGames 的行为。

import { describe, it, expect } from "vitest";
import { filterGames, sortGames, groupGames, type ViewOptions } from "../selectors";
import type { Game } from "../../types/models";

function makeGame(over: Partial<Game>): Game {
  return {
    id: `g-${over.name ?? Math.random()}`,
    name: over.name ?? "Test",
    installed: false,
    otherTasks: [],
    playCount: 0,
    playtime: 0,
    added: "2024-01-01",
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

const emptyOpts: ViewOptions = {
  searchQuery: "",
  showInstalledOnly: false,
  showHidden: false,
  showFavorites: false,
  platformFilter: "all",
  categoryFilter: "all",
  genreFilter: "all",
  developerFilter: "all",
  selectedTags: [],
};

describe("filterGames", () => {
  it("默认保留所有游戏（不含隐藏）", () => {
    const games = [makeGame({ name: "A" }), makeGame({ name: "B" })];
    expect(filterGames(games, emptyOpts)).toHaveLength(2);
  });

  it("过滤隐藏游戏", () => {
    const games = [makeGame({ name: "A", hidden: true }), makeGame({ name: "B" })];
    expect(filterGames(games, emptyOpts)).toHaveLength(1);
  });

  it("showFavorites 只保留收藏", () => {
    const games = [makeGame({ name: "A", favorite: true }), makeGame({ name: "B" })];
    const r = filterGames(games, { ...emptyOpts, showFavorites: true });
    expect(r.map((g) => g.name)).toEqual(["A"]);
  });

  it("按平台过滤", () => {
    const games = [
      makeGame({ name: "PC", platform: ["PC"] }),
      makeGame({ name: "PS5", platform: ["PlayStation 5"] }),
    ];
    const r = filterGames(games, { ...emptyOpts, platformFilter: "PC" });
    expect(r.map((g) => g.name)).toEqual(["PC"]);
  });

  it("按类型过滤", () => {
    const games = [makeGame({ name: "A", genre: ["RPG"] }), makeGame({ name: "B", genre: ["Shooter"] })];
    const r = filterGames(games, { ...emptyOpts, genreFilter: "RPG" });
    expect(r.map((g) => g.name)).toEqual(["A"]);
  });

  it("多标签 AND 过滤", () => {
    const games = [
      makeGame({ name: "A", tags: ["t1", "t2"] }),
      makeGame({ name: "B", tags: ["t1"] }),
    ];
    const r = filterGames(games, { ...emptyOpts, selectedTags: ["t1", "t2"] });
    expect(r.map((g) => g.name)).toEqual(["A"]);
  });

  it("搜索过滤", () => {
    const games = [makeGame({ name: "Warcraft" }), makeGame({ name: "StarCraft" })];
    const r = filterGames(games, { ...emptyOpts, searchQuery: "war" });
    expect(r.map((g) => g.name)).toEqual(["Warcraft"]);
  });
});

describe("sortGames", () => {
  it("按名称升序排序", () => {
    const games = [makeGame({ name: "Banana" }), makeGame({ name: "Apple" })];
    const r = sortGames(games, "name", "ascending");
    expect(r.map((g) => g.name)).toEqual(["Apple", "Banana"]);
  });

  it("按名称降序排序", () => {
    const games = [makeGame({ name: "Apple" }), makeGame({ name: "Banana" })];
    const r = sortGames(games, "name", "descending");
    expect(r.map((g) => g.name)).toEqual(["Banana", "Apple"]);
  });

  it("使用 sortName 而非 name 排序", () => {
    const games = [
      makeGame({ name: "The Witcher 3", sortName: "Witcher 3" }),
      makeGame({ name: "A Hat in Time", sortName: "Hat in Time" }),
    ];
    const r = sortGames(games, "name", "ascending");
    // sortName: "Hat in Time" < "Witcher 3"
    expect(r[0].name).toBe("A Hat in Time");
    expect(r[1].name).toBe("The Witcher 3");
  });

  it("按游玩时长降序排序", () => {
    const games = [makeGame({ name: "A", playtime: 10 }), makeGame({ name: "B", playtime: 100 })];
    const r = sortGames(games, "playtime", "descending");
    expect(r.map((g) => g.name)).toEqual(["B", "A"]);
  });

  it("按加入时间排序", () => {
    const games = [makeGame({ name: "Old", added: "2020-01-01" }), makeGame({ name: "New", added: "2024-01-01" })];
    const r = sortGames(games, "added", "ascending");
    expect(r.map((g) => g.name)).toEqual(["Old", "New"]);
  });

  it("排序不修改原数组", () => {
    const games = [makeGame({ name: "B" }), makeGame({ name: "A" })];
    sortGames(games, "name", "ascending");
    expect(games[0].name).toBe("B"); // 原数组顺序不变
  });
});

describe("groupGames", () => {
  it("groupBy none 返回单个分组", () => {
    const games = [makeGame({ name: "A" }), makeGame({ name: "B" })];
    const groups = groupGames(games, "none");
    expect(groups).toHaveLength(1);
    expect(groups[0].games).toHaveLength(2);
  });

  it("按平台分组", () => {
    const games = [
      makeGame({ name: "A", platform: ["PC"] }),
      makeGame({ name: "B", platform: ["PC"] }),
      makeGame({ name: "C", platform: ["PS5"] }),
    ];
    const groups = groupGames(games, "platform");
    const pc = groups.find((g) => g.key === "PC")!;
    expect(pc.games).toHaveLength(2);
    const ps = groups.find((g) => g.key === "PS5")!;
    expect(ps.games.map((g) => g.name)).toEqual(["C"]);
  });

  it("按收藏分组：收藏 / 其它", () => {
    const games = [
      makeGame({ name: "A", favorite: true }),
      makeGame({ name: "B", favorite: false }),
    ];
    const groups = groupGames(games, "favorite");
    const fav = groups.find((g) => g.key === "Favorites")!;
    const other = groups.find((g) => g.key === "Other")!;
    expect(fav.games.map((g) => g.name)).toEqual(["A"]);
    expect(other.games.map((g) => g.name)).toEqual(["B"]);
  });

  it("无平台游戏归入 Unknown", () => {
    const games = [makeGame({ name: "No Platform" })];
    const groups = groupGames(games, "platform");
    const unk = groups.find((g) => g.key === "Unknown")!;
    expect(unk.games.map((g) => g.name)).toEqual(["No Platform"]);
  });
});
