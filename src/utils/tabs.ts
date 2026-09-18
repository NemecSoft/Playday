/**
 * 顶层选项卡的**纯逻辑**（打开 / 关闭 / 激活 / 访问历史）。
 *
 * 为什么单独一个模块：这套规则以前只是"一个 activeTab 字符串"；2026-09-15 改成
 * **浏览器式动态列表**（每个游戏一个可关闭的标签）之后，规则一下多了好几条 ——
 * 关闭当前标签该退到哪、超上限挤掉谁、Alt+← 按什么顺序回 —— 这些都是
 * **写错了也不报错**（只是行为怪）的地方，所以抽成零依赖纯函数 + 单测，store 只当壳。
 *
 * 三个固定选项卡（主页 / 游戏资料 / 工具）**永远在、不可关**：它们是入口，
 * 关掉就没地方点回来了。游戏标签是动态的、可关、有数量上限。
 */

/** 固定选项卡的 id（顺序即顶栏显示顺序）。 */
// 2026-09-18 用户："主界面把选项卡的游戏资料去掉" —— 原先还有第三个固定选项卡「游戏资料」，
// 它嵌的是详情页那套静态站点的**总目录页**（一面卡片墙）。现在主页网格 + 按数据现拼的详情页
// 已经覆盖了这件事，那面墙成了重复入口，所以从**单一来源**（这里）去掉，而不是在顶栏隐藏它。
// 注意：`src/components/views/GameDataView.tsx` 与 `src/utils/gameDataUrl.ts` 暂时留着（已无引用），
// 要清就一起清掉，别只删一个。
export const FIXED_TAB_IDS = ["home", "tools"] as const;
export type FixedTabId = (typeof FIXED_TAB_IDS)[number];

/** 某个游戏的详情标签：id 形如 `game:<gameId>`。 */
export type GameTabId = `game:${string}`;
export type TabId = FixedTabId | GameTabId;

/**
 * 最多同时开几个游戏标签。
 * 每个标签是一个**常驻 iframe**（详情页要一直活着，切回来才不重新加载），
 * 不设上限的话开几十个会一直占内存 —— 超了就挤掉"最久没访问"的那个。
 */
export const MAX_GAME_TABS = 10;

export interface AppTab {
  id: TabId;
}

export interface TabState {
  /** 打开的选项卡（顺序即显示顺序；固定三个永远在最前）。 */
  tabs: AppTab[];
  activeId: TabId;
  /** 浏览器式**访问历史**：访问过的选项卡 id（旧→新），`historyIndex` 指向当前那一格。 */
  history: TabId[];
  historyIndex: number;
}

/** 不变式（后面的逻辑都靠它）：`history` 里的每个 id 一定也在 `tabs` 里。 */

export function isFixedTabId(id: TabId): id is FixedTabId {
  return (FIXED_TAB_IDS as readonly string[]).includes(id);
}

export function isGameTabId(id: TabId): id is GameTabId {
  return id.startsWith("game:");
}

export function gameTabId(gameId: string): GameTabId {
  return `game:${gameId}`;
}

/** 游戏标签 → 游戏 id（不是游戏标签时返回 undefined）。 */
export function gameIdOfTab(id: TabId): string | undefined {
  return isGameTabId(id) ? id.slice("game:".length) : undefined;
}

export function initialTabState(): TabState {
  return {
    tabs: FIXED_TAB_IDS.map((id) => ({ id })),
    activeId: "home",
    history: ["home"],
    historyIndex: 0,
  };
}

/** 激活一个选项卡，并把这次访问**记进历史**（从历史中间切走 = 截断后面的分支）。 */
export function activateTab(state: TabState, id: TabId): TabState {
  if (!state.tabs.some((t) => t.id === id)) return state; // 不存在的 id 不理
  // 已经是"当前这一格" → 只保证 activeId 对上，**不新增历史项**
  // （否则反复点同一个标签会把历史撑满，Alt+← 就退不回真正的上一个了）
  if (state.history[state.historyIndex] === id) {
    return state.activeId === id ? state : { ...state, activeId: id };
  }
  const history = [...state.history.slice(0, state.historyIndex + 1), id];
  return { ...state, activeId: id, history, historyIndex: history.length - 1 };
}

/** 打开某游戏的详情标签：**已经开着就只切换**（不重复开、也不重载它的 iframe）。 */
export function openGameTab(state: TabState, gameId: string): TabState {
  const id = gameTabId(gameId);
  if (state.tabs.some((t) => t.id === id)) return activateTab(state, id);

  let base = state;
  if (state.tabs.filter((t) => isGameTabId(t.id)).length >= MAX_GAME_TABS) {
    // 超上限：挤掉**最久没访问**的游戏标签（历史里最早出现的那个）。
    // 当前激活的那个不动 —— 不能把用户正看着的标签挤掉。
    const lru =
      state.history.find((h) => isGameTabId(h) && h !== state.activeId) ??
      state.tabs.find((t) => isGameTabId(t.id))!.id;
    base = closeTab(state, lru);
  }
  return activateTab({ ...base, tabs: [...base.tabs, { id }] }, id);
}

/** 关闭选项卡。固定选项卡不可关（它们是入口）。 */
export function closeTab(state: TabState, id: TabId): TabState {
  if (isFixedTabId(id) || !state.tabs.some((t) => t.id === id)) return state;

  const tabs = state.tabs.filter((t) => t.id !== id);
  const removedAt = state.history.lastIndexOf(id);
  const history = state.history.filter((h) => h !== id);

  // 关掉的是历史里"当前这一格或它之前"的那格 → index 要跟着前移，
  // 否则会指到错的那一格上（表现为：关完标签后 Alt+← 跳动不对）。
  let index = state.historyIndex;
  if (removedAt >= 0 && removedAt <= index) index -= 1;
  index = Math.max(0, Math.min(index, history.length - 1));

  // 关的就是当前标签 → 退到历史里的前一格（浏览器行为）；否则当前不变。
  const activeId = state.activeId === id ? (history[index] ?? "home") : state.activeId;
  return { tabs, activeId, history, historyIndex: index };
}

/**
 * 一次关掉多个游戏标签（顶栏右键菜单的两个入口都走这里）。
 * - 传 `keepId` = **"关闭其它"**（留下这一个）；不传 = **"关闭全部游戏标签"**。
 * - 固定三个**永远不动**（它们本来就不可关）。
 *
 * 实现上是**逐个调用 closeTab**，而不是自己 filter 一遍 tabs/history：
 * 历史裁剪、`historyIndex` 前移、以及"关掉当前标签该退到哪"这三条规则只在 `closeTab`
 * 里有一份。在这里再写一遍迟早会漂 —— 而且漂了不报错，表现是"关完标签 Alt+← 跳错"
 * 这种没人会立刻发现的行为。
 */
export function closeGameTabs(state: TabState, keepId?: TabId): TabState {
  return state.tabs
    .filter((t) => isGameTabId(t.id) && t.id !== keepId)
    .map((t) => t.id)
    .reduce(closeTab, state);
}

/** Alt+←：按**访问顺序**回上一个选项卡（不新增历史项）。 */
export function backTab(state: TabState): TabState {
  if (state.historyIndex <= 0) return state;
  const historyIndex = state.historyIndex - 1;
  return { ...state, historyIndex, activeId: state.history[historyIndex] };
}

/** Alt+→：回到下一个（先 Alt+← 退过才有的走）。 */
export function forwardTab(state: TabState): TabState {
  if (state.historyIndex >= state.history.length - 1) return state;
  const historyIndex = state.historyIndex + 1;
  return { ...state, historyIndex, activeId: state.history[historyIndex] };
}

export function canGoBack(state: TabState): boolean {
  return state.historyIndex > 0;
}

export function canGoForward(state: TabState): boolean {
  return state.historyIndex < state.history.length - 1;
}
