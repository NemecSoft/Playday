// 顶层选项卡的纯逻辑单测（打开 / 关闭 / 激活 / 访问历史）。
// 这些规则错了都不报错、只是行为怪（关完标签 Alt+← 跳错、超上限把正看着的挤掉…），
// 所以每条都钉住，尤其是"边界"那几条。

import { describe, expect, it } from "vitest";
import {
  FIXED_TAB_IDS,
  MAX_GAME_TABS,
  activateTab,
  backTab,
  canGoBack,
  canGoForward,
  closeGameTabs,
  closeTab,
  forwardTab,
  gameIdOfTab,
  gameTabId,
  initialTabState,
  isFixedTabId,
  isGameTabId,
  openGameTab,
  type TabState,
} from "../tabs";

/** 当前激活的是哪个游戏（不是游戏标签则 null）——断言用。 */
const activeGame = (s: TabState) => gameIdOfTab(s.activeId) ?? null;
const gameTabIds = (s: TabState) => s.tabs.filter((t) => isGameTabId(t.id)).map((t) => t.id);

describe("初始状态", () => {
  it("两个固定选项卡都在，默认激活主页，历史只有主页", () => {
    const s = initialTabState();
    expect(s.tabs.map((t) => t.id)).toEqual(["home", "tools"]);
    expect(s.activeId).toBe("home");
    expect(s.history).toEqual(["home"]);
    expect(canGoBack(s)).toBe(false);
  });
});

describe("id 工具", () => {
  it("固定 / 游戏标签能分辨，游戏 id 能取回来（含 id 里带冒号的情况）", () => {
    expect(isFixedTabId("home")).toBe(true);
    expect(isFixedTabId(gameTabId("x"))).toBe(false);
    expect(isGameTabId(gameTabId("x"))).toBe(true);
    expect(gameIdOfTab(gameTabId("a:b:c"))).toBe("a:b:c");
    expect(gameIdOfTab("home")).toBeUndefined();
  });
});

describe("activateTab：激活并记访问历史", () => {
  it("切到固定标签会记进历史，Alt+← 能回上一个", () => {
    let s = initialTabState();
    s = activateTab(s, "tools");
    expect(s.activeId).toBe("tools");
    expect(s.history).toEqual(["home", "tools"]);
    s = backTab(s);
    expect(s.activeId).toBe("home");
    s = forwardTab(s);
    expect(s.activeId).toBe("tools");
  });

  it("反复激活同一个标签**不会撑大历史**（否则 Alt+← 就退不回真正的上一个了）", () => {
    let s = initialTabState();
    s = activateTab(s, "tools");
    const before = s.history.length;
    s = activateTab(s, "tools");
    s = activateTab(s, "tools");
    expect(s.history.length).toBe(before);
    expect(s.activeId).toBe("tools");
  });

  it("从历史中间切走 → 截断后面的分支（浏览器行为）", () => {
    // 2026-09-18：原先中间那一格借的是「游戏资料」固定选项卡，它已移除 —— 改用游戏标签当中间格。
    let s = initialTabState();
    s = openGameTab(s, "g1"); // home → game:g1
    s = activateTab(s, "tools"); // home → game:g1 → tools
    s = backTab(s); // 回到 game:g1（tools 还在历史里、还在前面）
    expect(canGoForward(s)).toBe(true);
    s = activateTab(s, "home"); // 从 game:g1 处切走 → tools 那条分支被截断
    expect(s.history).toEqual(["home", "game:g1", "home"]);
    expect(canGoForward(s)).toBe(false);
  });

  it("不存在的 id 不动状态", () => {
    const s = initialTabState();
    expect(activateTab(s, gameTabId("nope"))).toBe(s);
  });
});

describe("openGameTab：每游戏一个标签", () => {
  it("新游戏 → 追加到末尾并激活", () => {
    const s = openGameTab(initialTabState(), "g1");
    expect(s.tabs.map((t) => t.id)).toEqual(["home", "tools", "game:g1"]);
    expect(activeGame(s)).toBe("g1");
  });

  it("已经开着的游戏 → **只切换、不重复开**（也不该重载它的 iframe）", () => {
    let s = openGameTab(initialTabState(), "g1");
    s = openGameTab(s, "g2");
    const before = s.tabs.length;
    s = openGameTab(s, "g1");
    expect(s.tabs.length).toBe(before);
    expect(activeGame(s)).toBe("g1");
  });

  it(`游戏标签超过 ${MAX_GAME_TABS} 个 → 挤掉最久没访问的那个，**不动当前激活的**`, () => {
    let s = initialTabState();
    for (let i = 0; i < MAX_GAME_TABS; i++) s = openGameTab(s, `g${i}`);
    expect(gameTabIds(s).length).toBe(MAX_GAME_TABS);
    // 现在访问 g0（让 g1 成为最久没访问的），再开一个新的
    s = openGameTab(s, "g0");
    s = openGameTab(s, "new");
    expect(gameTabIds(s).length).toBe(MAX_GAME_TABS);
    expect(gameTabIds(s)).not.toContain("game:g1"); // 被挤掉的是 g1（除了 g0 外最早访问的）
    expect(gameTabIds(s)).toContain("game:new");
    expect(activeGame(s)).toBe("new");
  });
});

describe("closeTab：可关的只有游戏标签", () => {
  it("固定选项卡关不掉", () => {
    const s = initialTabState();
    expect(closeTab(s, "home")).toBe(s);
    // 2026-09-18：「游戏资料」固定选项卡已移除（见 tabs.ts 注释），这条断言随之去掉。
    expect(closeTab(s, "tools")).toBe(s);
  });

  it("关掉**当前**游戏标签 → 退到历史里的前一格（不是随便挑一个）", () => {
    let s = initialTabState();
    s = openGameTab(s, "g1"); // home → g1
    s = activateTab(s, "tools"); // home → g1 → tools
    s = activateTab(s, gameTabId("g1")); // … → g1
    s = closeTab(s, gameTabId("g1"));
    expect(s.tabs.map((t) => t.id)).toEqual(["home", "tools"]);
    expect(s.activeId).toBe("tools"); // 历史里 g1 的前一格
  });

  it("关掉**非当前**标签 → 当前不变、历史里也清掉", () => {
    let s = initialTabState();
    s = openGameTab(s, "g1");
    s = openGameTab(s, "g2");
    s = closeTab(s, gameTabId("g1"));
    expect(activeGame(s)).toBe("g2");
    expect(s.history).not.toContain(gameTabId("g1"));
  });

  it("关掉当前标签后退回的那一格**一定还开着**（历史是 tabs 的子集）", () => {
    let s = initialTabState();
    s = openGameTab(s, "g1");
    s = openGameTab(s, "g2");
    s = closeTab(s, gameTabId("g2"));
    expect(s.tabs.some((t) => t.id === s.activeId)).toBe(true);
  });
});

describe("closeGameTabs：一键关其它 / 关全部（顶栏右键菜单）", () => {
  /** 固定两个 + g1/g2/g3（当前激活 g3）。 */
  const withThree = () => {
    let s = initialTabState();
    s = openGameTab(s, "g1");
    s = openGameTab(s, "g2");
    s = openGameTab(s, "g3");
    return s;
  };

  it("传 keepId = 关闭其它：只留那一个，固定两个一个不少", () => {
    const s = closeGameTabs(withThree(), gameTabId("g2"));
    expect(gameTabIds(s)).toEqual([gameTabId("g2")]);
    // 从**单一来源**取，而不是写死是哪个：这条断言要证明的是"固定标签一个都没被关掉"。
    // （2026-09-18 移除「游戏资料」时，这里写死的三个值成了唯一漏改的地方 —— 别再写死了。）
    expect(s.tabs.filter((t) => isFixedTabId(t.id)).map((t) => t.id)).toEqual([
      ...FIXED_TAB_IDS,
    ]);
  });

  it("不传 = 关闭全部游戏标签：清空后**退到一个固定标签**（不能停在已关掉的标签上）", () => {
    const s = closeGameTabs(withThree());
    expect(gameTabIds(s)).toEqual([]);
    expect(s.history.every((h) => !isGameTabId(h))).toBe(true);
    expect(isFixedTabId(s.activeId)).toBe(true);
    // 不变式：激活的一定还开着
    expect(s.tabs.some((t) => t.id === s.activeId)).toBe(true);
  });

  it("关掉的是**当前**那个也安全（关闭的是激活标签 → 按 closeTab 的规则退到前一格）", () => {
    const s = closeGameTabs(withThree(), gameTabId("g1")); // 当前是 g3，被关掉
    expect(gameTabIds(s)).toEqual([gameTabId("g1")]);
    expect(s.activeId).toBe(gameTabId("g1"));
  });

  it("没有游戏标签时不动状态（同一个对象返回，不白触发一次渲染）", () => {
    const s = initialTabState();
    expect(closeGameTabs(s)).toBe(s);
    expect(closeGameTabs(s, gameTabId("g1"))).toBe(s);
  });
});

describe("Alt+← / Alt+→ 的边界", () => {
  it("到头了不动（不越界、不报错）", () => {
    const s = initialTabState();
    expect(backTab(s)).toBe(s);
    expect(forwardTab(s)).toBe(s);
    expect(canGoBack(s)).toBe(false);
    expect(canGoForward(s)).toBe(false);
  });
});
