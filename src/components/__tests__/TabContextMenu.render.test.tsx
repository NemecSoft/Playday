// 顶栏标签右键菜单：**哪些项该出现**（2026-09-15 需求：一键关"其它 / 全部"游戏标签）。
//
// 断言方式与 GameContextMenu.render.test.tsx 一致：不看文案（那是 i18n 的事），看**图标**——
// lucide 渲染出来带 `lucide-x` / `lucide-circle-x` / `lucide-trash-2` 类名，语种无关、稳定。
// （`lucide-circle-x` 里**不含** `lucide-x` 这个子串，所以两个断言不会互相误判。）
//
// 用 renderToString 不跑 effect；标签列表用 vi.mock 摆。

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";

const FIXED = [{ id: "home" }, { id: "data" }, { id: "tools" }];
const ui = vi.hoisted(() => ({
  state: {
    tabState: {
      tabs: [{ id: "home" }, { id: "data" }, { id: "tools" }],
      activeId: "home",
      history: ["home"],
      historyIndex: 0,
    },
    closeTab: () => {},
    closeGameTabs: () => {},
  } as Record<string, unknown>,
}));
vi.mock("../../stores/uiStore", () => ({
  useUIStore: (sel: (s: Record<string, unknown>) => unknown) => sel(ui.state),
}));
vi.mock("../../i18n", () => ({
  useI18n: () => ({ t: (k: string) => `[${k}]` }),
}));

import TabContextMenu from "../TabContextMenu";
import type { TabId } from "../../utils/tabs";

const backup = ui.state;
afterEach(() => {
  ui.state = backup;
});

/** 摆成"固定三个 + n 个游戏标签"，在 tabId 上右键，返回渲染结果。 */
function render(n: number, tabId: TabId): string {
  // mock 的对象是"形状像 tabState 的普通对象"，这里取回真实形状再用。
  const st = backup.tabState as {
    tabs: { id: string }[];
    activeId: string;
    history: string[];
    historyIndex: number;
  };
  const games = Array.from({ length: n }, (_, i) => ({ id: `game:g${i}` }));
  ui.state = { ...backup, tabState: { ...st, tabs: [...FIXED, ...games] } };
  return renderToString(
    <TabContextMenu tabId={tabId} x={10} y={20} onClose={() => {}} />
  );
}

describe("TabContextMenu 出现哪些项", () => {
  it("游戏标签上右键 + 有多个游戏标签：三项齐全", () => {
    const html = render(3, "game:g1");
    expect(html).toContain("lucide-x"); // 关闭此标签
    expect(html).toContain("lucide-circle-x"); // 关闭其它游戏标签
    expect(html).toContain("lucide-trash-2"); // 关闭全部游戏标签
  });

  it("只剩它一个游戏标签时：**没有**「关闭其它」（关了就剩不下谁）", () => {
    const html = render(1, "game:g0");
    expect(html).toContain("lucide-x");
    expect(html).not.toContain("lucide-circle-x");
    expect(html).toContain("lucide-trash-2");
  });

  it("固定标签上右键：只有「关闭全部」—— 它自己不可关（是入口）", () => {
    const html = render(2, "home");
    expect(html).not.toContain("lucide-x");
    expect(html).not.toContain("lucide-circle-x");
    expect(html).toContain("lucide-trash-2");
  });

  it("一个游戏标签都没有：整个菜单不渲染（没一项可用，弹个空框像 bug）", () => {
    expect(render(0, "home")).toBe("");
  });
});
