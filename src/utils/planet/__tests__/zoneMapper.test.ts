import { describe, it, expect } from "vitest";
import { mapGamesToZones, matchZone } from "../zoneMapper";
import { ZONE_ORDER } from "../types";
import type { Game } from "../../../types/models";

// 构造最小 Game 对象
function makeGame(over: Partial<Game>): Game {
  return {
    id: "g1",
    name: "Test",
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

describe("matchZone", () => {
  it("射击游戏归射击场", () => {
    const g = makeGame({ name: "Call of Duty", genre: ["Shooter", "Action"] });
    expect(matchZone(g)).toBe("shooter");
  });

  it("恐怖游戏归恐怖谷", () => {
    const g = makeGame({ name: "恐怖黎明", genre: ["Action"] });
    expect(matchZone(g)).toBe("horror");
  });

  it("赛车游戏归赛车场", () => {
    const g = makeGame({ name: "Need for Speed", genre: ["Racing"] });
    expect(matchZone(g)).toBe("racing");
  });

  it("没命中的归未分类", () => {
    const g = makeGame({ name: "不知道是啥", genre: [] });
    expect(matchZone(g)).toBe("other");
  });

  it("多分区取第一个命中的（按 ZONE_ORDER 优先级）", () => {
    const g = makeGame({ name: "恐怖射击赛车", genre: [] });
    // horror 在 ZONE_ORDER 里排在 shooter 前，所以归 horror
    expect(matchZone(g)).toBe("horror");
  });
});

describe("mapGamesToZones", () => {
  it("返回 7 个分区，游戏被正确归位", () => {
    const games = [
      makeGame({ id: "a", name: "丧尸围城", genre: ["Horror"] }),
      makeGame({ id: "b", name: "CS", genre: ["Shooter"] }),
      makeGame({ id: "c", name: "无类型", genre: [] }),
    ];
    const zones = mapGamesToZones(games);
    expect(zones.length).toBe(7);
    expect(zones.map((z) => z.id)).toEqual(ZONE_ORDER);
    const horror = zones.find((z) => z.id === "horror")!;
    const shooter = zones.find((z) => z.id === "shooter")!;
    const other = zones.find((z) => z.id === "other")!;
    expect(horror.games.map((g) => g.id)).toEqual(["a"]);
    expect(shooter.games.map((g) => g.id)).toEqual(["b"]);
    expect(other.games.map((g) => g.id)).toEqual(["c"]);
  });

  it("没有游戏的分区 games 为空数组", () => {
    const zones = mapGamesToZones([]);
    expect(zones.length).toBe(7);
    for (const z of zones) expect(z.games).toEqual([]);
  });
});
