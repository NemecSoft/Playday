import { describe, it, expect } from "vitest";
import { layoutCaves } from "../valleyLayout";
import type { Game } from "../../../types/models";

function makeGame(id: string): Game {
  return {
    id, name: id, installed: false, otherTasks: [], playCount: 0, playtime: 0,
    added: "", modified: "", category: [], genre: [], developer: [], publisher: [],
    tags: [], series: [], ageRating: [], region: [], source: [], features: [],
    hidden: false, favorite: false, platform: [], userScoreSet: false,
    manualGame: false, actions: [], links: [], featuresEnabled: false, gameLevel: 1,
    preLaunchEnabled: false, postLaunchEnabled: false, postExitEnabled: false,
  };
}

describe("layoutCaves", () => {
  it("返回每个游戏一个山洞坐标", () => {
    const games = [makeGame("a"), makeGame("b"), makeGame("c")];
    const spots = layoutCaves(games);
    expect(spots.length).toBe(3);
    expect(spots.map((s) => s.gameId)).toEqual(["a", "b", "c"]);
  });

  it("坐标都在地图范围内（±90）", () => {
    const games = Array.from({ length: 20 }, (_, i) => makeGame(`g${i}`));
    const spots = layoutCaves(games);
    for (const s of spots) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(90);
      expect(Math.abs(s.z)).toBeLessThanOrEqual(90);
    }
  });

  it("山洞之间互不重叠（间距 > 4）", () => {
    const games = Array.from({ length: 20 }, (_, i) => makeGame(`g${i}`));
    const spots = layoutCaves(games);
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const dx = spots[i].x - spots[j].x;
        const dz = spots[i].z - spots[j].z;
        expect(Math.hypot(dx, dz)).toBeGreaterThan(4);
      }
    }
  });
});
