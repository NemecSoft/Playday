// Cross-component UI state (modals, menus, tabs) so any view can trigger them
// without prop drilling.
//
// 选项卡（2026-09-15 改版）：从"一个 activeTab 字符串"变成**浏览器式动态列表** ——
// 主页 / 游戏资料 / 工具 三个固定标签 + 每个游戏一个可关闭的详情标签。
// ⚠️ 规则本身（打开/关闭/激活/访问历史）全在 `src/utils/tabs.ts`（纯函数 + 单测）；
//    这个 store 只当壳，把纯函数的结果塞进来。别在这里再写一套判断。

import { create } from "zustand";
import {
  activateTab as activate,
  backTab as goBack,
  closeGameTabs as closeGames,
  closeTab as close,
  forwardTab as goForward,
  initialTabState,
  openGameTab as openGame,
  type TabId,
  type TabState,
} from "../utils/tabs";

interface UIState {
  /** Whether the settings modal is open. */
  settingsOpen: boolean;

  /** Whether the app menu (TitleBar leading) is open. */
  menuOpen: boolean;

  /** 顶层选项卡：打开列表 + 当前 + 访问历史（规则见 src/utils/tabs.ts）。 */
  tabState: TabState;

  openSettings: () => void;
  closeSettings: () => void;

  toggleMenu: () => void;
  closeMenu: () => void;

  /** 激活某个选项卡（会记进访问历史）。 */
  activateTab: (id: TabId) => void;
  /** 打开某游戏的**详情选项卡**（已经开着就只切换，不重复开）。 */
  openGameTab: (gameId: string) => void;
  /** 关闭某个选项卡（固定选项卡不可关）。 */
  closeTab: (id: TabId) => void;
  /**
   * 一次关掉多个游戏标签（顶栏标签的右键菜单）：
   * 传 `keepId` = 关闭其它、不传 = 关闭全部游戏标签。固定三个不动。
   */
  closeGameTabs: (keepId?: TabId) => void;
  /** Alt+← / Alt+→：按**访问顺序**回上一个 / 下一个选项卡。 */
  backTab: () => void;
  forwardTab: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  settingsOpen: false,
  menuOpen: false,
  tabState: initialTabState(),

  openSettings: () => set({ settingsOpen: true, menuOpen: false }),
  closeSettings: () => set({ settingsOpen: false }),

  toggleMenu: () => set((s) => ({ menuOpen: !s.menuOpen })),
  closeMenu: () => set({ menuOpen: false }),

  activateTab: (id) => set((s) => ({ tabState: activate(s.tabState, id) })),
  openGameTab: (gameId) => set((s) => ({ tabState: openGame(s.tabState, gameId) })),
  closeTab: (id) => set((s) => ({ tabState: close(s.tabState, id) })),
  closeGameTabs: (keepId) => set((s) => ({ tabState: closeGames(s.tabState, keepId) })),
  backTab: () => set((s) => ({ tabState: goBack(s.tabState) })),
  forwardTab: () => set((s) => ({ tabState: goForward(s.tabState) })),
}));
