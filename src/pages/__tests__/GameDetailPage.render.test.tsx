// 用 react-dom/server 渲染 GameDetailPage，验证它在 render 期间不抛错。
// 之前用户反馈"点详情进详情页空白"——很可能是 render 抛错被卸载。
// 这个测试在 node 环境用 renderToString 渲染初始 loading 分支，能抓住 render 抛错。
// （renderToString 不执行 useEffect，所以 api 调用不会触发，走初始 htmlLoading=true。）

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import type { Game } from "../../types/models";

// ---- mock 依赖 ----
const mockNavigate = vi.fn();
const mockGames: Game[] = [
  {
    id: "test-id",
    name: "朽木难雕",
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
  },
];

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "test-id" }),
  useNavigate: () => mockNavigate,
}));

vi.mock("../../stores/gamesStore", () => ({
  useGamesStore: (sel: any) => sel({ games: mockGames }),
}));

vi.mock("../../i18n", () => ({
  useI18n: () => ({
    t: (k: string, vars?: Record<string, string>) =>
      vars ? `[${k}:${Object.values(vars).join(",")}]` : `[${k}]`,
  }),
}));

vi.mock("../../api/client", () => ({
  api: {
    getGameHtmlPage: vi.fn().mockResolvedValue({ name: "", found: false }),
    getGameServerUrl: vi.fn().mockResolvedValue(""),
  },
}));

import GameDetailPage from "../GameDetailPage";

describe("GameDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("render 不抛错（初始 loading 分支）", () => {
    let html = "";
    let renderErr: unknown = null;
    try {
      html = renderToString(<GameDetailPage />);
    } catch (e) {
      renderErr = e;
    }
    expect(renderErr).toBeNull();
    // backButton 存在（mock 的 t 返回 [details_back]）
    expect(html).toContain("details_back");
    expect(html).toContain("details_loading");
  });
});
