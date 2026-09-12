// 测试用的实体工厂。
//
// 为什么需要：Game 有 30+ 个必填字段，测试里手写字面量会随着字段增减反复报错
// （本轮把 Game 收敛成单一来源后，4 个测试文件的字面量立刻全红），而且手写极易漏字段
// 导致测试"用不完整的数据"验证逻辑。统一从这里造对象，只覆盖关心的字段。
//
// 约定：默认值要"中性且完整"（数组给 []、布尔给 false、数字给 0），
// 需要特定默认值的测试文件可以再包一层。
import type { Game } from "../types/models";

let seq = 0;

/** 造一个字段完整的 Game；传 overrides 覆盖需要的字段。 */
export function makeGame(overrides: Partial<Game> = {}): Game {
  seq += 1;
  return {
    id: `game-${seq}`,
    name: "Test Game",
    localizedNames: [],
    alternateNames: [],
    installed: true,
    otherTasks: [],
    playCount: 0,
    playtime: 0,
    lastSessionSeconds: 0,
    added: "2024-01-01T00:00:00.000Z",
    modified: "2024-01-01T00:00:00.000Z",
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
    links: [],
    actions: [],
    featuresEnabled: false,
    screenshots: [],
    videos: [],
    gameLevel: 1,
    preLaunchEnabled: false,
    postLaunchEnabled: false,
    postExitEnabled: false,
    ...overrides,
  };
}
