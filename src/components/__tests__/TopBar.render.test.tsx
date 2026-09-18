// 顶栏的渲染测试。
//   · 标签栏分成**两个容器**（固定组不滚、游戏组自己滚）—— 游戏标签多了不能把固定三个
//     一起滚出视野，那三个是入口；
//   · 版本徽标**不在顶栏里**了：它 2026-09-15 挪到了右下角状态栏（见 TierBadge.render.test.tsx）。
//     这条特意钉住 —— 徽标当年就是因为"在顶栏不占位置、被标签栏从底下穿过去"才挪走的，
//     别哪天被顺手加回来。谁在顶栏、谁在状态栏，测试说了算。
//
// 用 renderToString（不执行 useEffect，所以窗口状态那几个 api 调用不会真发出去），
// 并把 i18n 的 t 换成 `[key:vars]` 形式 —— 断言的是"用了哪个 key / 哪段结构"，与语种无关。

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";

// 选项卡状态：默认只有三个固定标签；测游戏标签时改 `ui.state` 再渲染（afterEach 复位）。
const ui = vi.hoisted(() => ({
  state: {
    menuOpen: false,
    toggleMenu: () => {},
    closeMenu: () => {},
    openSettings: () => {},
    tabState: {
      tabs: [{ id: "home" }, { id: "data" }, { id: "tools" }],
      activeId: "home",
      history: ["home"],
      historyIndex: 0,
    },
    activateTab: () => {},
    closeTab: () => {},
  } as Record<string, unknown>,
}));
vi.mock("../../stores/uiStore", () => ({
  useUIStore: (sel: (s: Record<string, unknown>) => unknown) => sel(ui.state),
}));

// mock 的 t：带变量时输出 `[key:变量值]`（当前顶栏没有带变量的文案，留着备用）。
vi.mock("../../i18n", () => ({
  useI18n: () => ({
    t: (k: string, vars?: Record<string, string>) =>
      vars ? `[${k}:${Object.values(vars).join(",")}]` : `[${k}]`,
  }),
}));

vi.mock("../../api/client", () => ({
  api: {
    isMaximized: vi.fn().mockResolvedValue(false),
    isFullscreen: vi.fn().mockResolvedValue(false),
    maximizeWindow: vi.fn().mockResolvedValue(false),
    toggleFullscreen: vi.fn().mockResolvedValue(false),
    minimizeWindow: vi.fn(),
    closeWindow: vi.fn(),
  },
}));

// 子组件不是本次要测的东西，mock 掉免得把它们的依赖（store / 图片 / i18n）带进来。
vi.mock("../ThemeTopPicker", () => ({ default: () => null }));
vi.mock("../AboutModal", () => ({ default: () => null }));

import TopBar from "../TopBar";

function render(): string {
  return renderToString(<TopBar />);
}

describe("TopBar 徽标已挪走", () => {
  it("顶栏里**没有**版本徽标（它跟标签栏抢位置，现在在状态栏）", () => {
    const html = render();
    expect(html).not.toContain("tier-badge");
    expect(html).not.toContain("tier_badge");
  });
});

// 固定选项卡（2026-09-18 起只剩两个）：主页 → 工具。
// 原第三个「游戏资料」（详情页那套静态站点的总目录页）已移除 —— 见 src/utils/tabs.ts 的注释。
// 这条**故意钉"不再有 tab_data"**：它被移除是有原因的（重复入口），别哪天又被加回来。
describe("TopBar 顶部选项卡", () => {
  it("固定选项卡为 主页 → 工具，且不再有「游戏资料」", () => {
    const html = render();
    expect(html).toContain("[tab_home]");
    expect(html).toContain("[tab_tools]");
    expect(html).not.toContain("[tab_data]");
    expect(html.indexOf("[tab_home]")).toBeLessThan(html.indexOf("[tab_tools]"));
  });
});

// 游戏标签（2026-09-15 改版：每个游戏一个可关闭的标签）。
// 这里只钉"关闭入口只给游戏标签" —— 固定三个是入口，关掉就没地方点回来了。
describe("TopBar 游戏标签", () => {
  const backup = ui.state;
  afterEach(() => {
    ui.state = backup;
  });

  /** 摆成"固定三个 + n 个游戏标签"，返回渲染结果。 */
  function renderWithGames(n: number): string {
    const st = backup.tabState as { tabs: { id: string }[] };
    const games = Array.from({ length: n }, (_, i) => ({ id: `game:g${i}` }));
    ui.state = {
      ...backup,
      tabState: { ...st, tabs: [...st.tabs, ...games], activeId: games[0]?.id ?? "home" },
    };
    return render();
  }

  it("有游戏标签时：标签出来、且**只有它有**关闭按钮", () => {
    const html = renderWithGames(1);
    // 游戏不在库里（测试没喂 gamesStore）→ 标签显示占位文案，不显示空标签
    expect(html).toContain("[tab_game_unknown]");
    expect(html.split("topbar-tab-close").length - 1).toBe(1); // 顶部只该有这一个 ✕
  });

  it("只有固定标签时：一个关闭按钮都没有", () => {
    expect(render()).not.toContain("topbar-tab-close");
  });

  // 分组（2026-09-15：用户报"开多了后面的就显示不出来"）。
  // 固定三个必须**独立于游戏标签的滚动容器** —— 共用一个容器时，标签一多会连它们一起滚出
  // 视野，而它们是入口（"不可关"就是同一个理由）。这里只钉"分成了两个容器、谁在谁里面"，
  // 至于压窄/滚动都是 CSS 的事，靠真机量（单测量不到布局）。
  it("游戏标签与固定标签分在两个容器里：固定组不参与游戏组的滚动", () => {
    const html = renderWithGames(1);
    expect(html).toContain("topbar-tabs-sep"); // 两组之间有分隔线
    // 固定组：从固定容器起到分隔线为止，里面只有固定三个
    const fixedBlock = html.slice(
      html.indexOf("topbar-fixed-tabs"),
      html.indexOf("topbar-tabs-sep")
    );
    expect(fixedBlock).toContain("[tab_home]");
    expect(fixedBlock).toContain("[tab_tools]");
    expect(fixedBlock).not.toContain("[tab_game_unknown]");
    // 游戏组：从游戏容器起到结尾，里面只有游戏标签（标签 id 不进 DOM，只能按文案断言）
    const gameBlock = html.slice(html.indexOf("topbar-game-tabs"));
    expect(gameBlock).toContain("[tab_game_unknown]");
    expect(gameBlock).not.toContain("[tab_home]");
  });

  it("没有游戏标签时：不画分组分隔线（一条光杆竖线很难看）", () => {
    expect(render()).not.toContain("topbar-tabs-sep");
  });
});
