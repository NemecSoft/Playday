// 用 react-dom/server 渲染 GameDetailPage，验证它在 render 期间不抛错。
// 之前用户反馈"点详情进详情页空白"——很可能是 render 抛错被卸载。
// 这个测试在 node 环境用 renderToString 渲染初始 loading 分支，能抓住 render 抛错。
// （renderToString 不执行 useEffect，所以 api 调用不会触发，走初始 htmlLoading=true。）

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import type { Game } from "../../types/models";
import { makeGame } from "../../test/factories";
// ⚠️ 等级必须用 vi.mock 摆，**不能**用 useAuthStore.setState：zustand v5 的 useStore 在
// renderToString 下取的是**初始快照**（getInitialState），setState 设的值 SSR 读不到 ——
// 实测 SSR 里永远是 {loaded:false, userLevel:3}。用 setState 的话"应有按钮"的用例永远红、
// "不应有按钮"的用例永远空过（假绿），两边都没在测东西。
// 判定函数 canPlay 仍是真实实现（页面直接从 shared/userLevel.ts 引入，这里不 mock 它）。
const auth = vi.hoisted(() => ({ state: { loaded: true, userLevel: 2 } }));
vi.mock("../../stores/authStore", () => ({
  useAuthStore: (sel: (s: { loaded: boolean; userLevel: number }) => unknown) => sel(auth.state),
}));

// ---- mock 依赖 ----
// 详情页 2026-09-15 起**不再是路由**：游戏 id 由选项卡当 prop 传进来（不再是 useParams），
// 所以这里不需要再 mock react-router-dom，改成渲染时传 gameId。
const TEST_GAME_ID = "test-id";
const mockGames: Game[] = [makeGame({ id: TEST_GAME_ID, name: "朽木难雕" })];

vi.mock("../../stores/gamesStore", () => ({
  useGamesStore: (sel: any) => sel({ games: mockGames, launchGame: vi.fn() }),
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
      html = renderToString(<GameDetailPage gameId={TEST_GAME_ID} />);
    } catch (e) {
      renderErr = e;
    }
    expect(renderErr).toBeNull();
    // backButton 存在（mock 的 t 返回 [details_back]）
    expect(html).toContain("details_back");
    expect(html).toContain("details_loading");
  });
});

// 顶栏正中「开始游戏」按钮的门禁（2026-09-15 需求）。
// 断言看图标类名（lucide-play），与 GameContextMenu 的渲染测试同一套办法：语种无关。
// 初始 loading 分支里不会有别的 lucide-play（运行徽标此刻是 unknown，不渲染图标）。
describe("GameDetailPage 顶栏「开始游戏」按钮", () => {
  const setGameLevel = (gameLevel: number) => {
    mockGames[0] = makeGame({ id: "test-id", name: "朽木难雕", gameLevel });
  };
  const render = (loaded: boolean, userLevel: number) => {
    auth.state = { loaded, userLevel }; // 1 = 黄金版，2 = 钻石版
    return renderToString(<GameDetailPage gameId={TEST_GAME_ID} />);
  };

  it("钻石版用户看钻石版游戏：有按钮", () => {
    setGameLevel(2);
    expect(render(true, 2)).toContain("lucide-play");
  });

  it("黄金版用户看钻石版游戏：不显示这个按钮", () => {
    setGameLevel(2);
    expect(render(true, 1)).not.toContain("lucide-play");
  });

  it("黄金版用户看黄金版游戏：有按钮", () => {
    setGameLevel(1);
    expect(render(true, 1)).toContain("lucide-play");
  });

  it("等级还没算完（loaded=false）：也不显示 —— 否则黄金版会先闪一下再消失", () => {
    setGameLevel(2);
    expect(render(false, 3)).not.toContain("lucide-play");
  });
});
