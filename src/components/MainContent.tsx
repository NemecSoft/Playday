// Main content area: renders the open tabs.
//
// 选项卡 2026-09-15 改版成**浏览器式动态列表**：主页 / 游戏资料 / 工具 三个固定标签，
// 加上"每个游戏一个可关闭的详情标签"。规则（打开 / 关闭 / 激活 / 访问历史）全在
// `src/utils/tabs.ts`（纯函数 + 单测），这里只管渲染。
//
// 挂载策略：**首次进入才挂载、之后常驻**（切走只隐藏，不卸载）。
//   为什么常驻：主页要保住滚动位置、游戏资料要保住搜索词、游戏详情要保住 iframe
//     （卸载 = 那一页重新加载；需求明确要求"再点回来内容还在"）。
//   为什么首次才挂：游戏资料那页 376 KB + 1280 张懒加载封面，而每个详情页各自要起一次
//     本地服务器 —— 开屏把所有标签全挂上会明显拖慢启动。
//
// ⚠️ 隐藏用 `invisible`（visibility:hidden）+ `absolute inset-0`，**不是 display:none**：
//   主页的网格是**虚拟列表**（按容器尺寸测量行高），display:none 会让它量到 0，
//   切回来有行高错位的风险；visibility:hidden 保留布局盒，测量与滚动位置都稳。
//   配合 absolute，同一时刻只有一个标签占版面（否则两个 flex-1 会把高度劈成两半）。

import { useEffect, useState } from "react";
import Toolbar from "./Toolbar";
import GamesView from "./views/GamesView";
import NewsView from "./views/NewsView";
import ToolsView from "./views/ToolsView";
import GameDataView from "./views/GameDataView";
import GameDetailPage from "../pages/GameDetailPage";
import { useGamesStore } from "../stores/gamesStore";
import { useUIStore } from "../stores/uiStore";
import { gameIdOfTab, type TabId } from "../utils/tabs";

/** 一个标签的内容：按 id 分派。 */
function TabPanel({
  tabId,
  loading,
  activePage,
}: {
  tabId: TabId;
  loading: boolean;
  activePage: string;
}) {
  // 游戏标签：详情页（游戏 id 由标签传进去）。
  const gameId = gameIdOfTab(tabId);
  if (gameId) return <GameDetailPage gameId={gameId} />;

  if (tabId === "data") return <GameDataView />;
  if (tabId === "tools") return <ToolsView />;
  // 主页里的"最近新增"子页（activePage 是主页的内部状态，不是顶层标签）。
  if (activePage === "news") return <NewsView />;

  // 主页（默认分支）
  return (
    <>
      <Toolbar />
      {loading ? (
        <div className="grid h-full place-items-center">
          <div className="size-[26px] animate-spin rounded-full border-[3px] border-border border-t-accent" />
        </div>
      ) : (
        <GamesView />
      )}
    </>
  );
}

export default function MainContent() {
  const loading = useGamesStore((s) => s.loading);
  const activePage = useGamesStore((s) => s.activePage);
  const openTabs = useUIStore((s) => s.tabState.tabs);
  const activeId = useUIStore((s) => s.tabState.activeId);

  // 进过的标签才挂载；进过就一直留着（见文件头说明）。
  // ⚠️ 被**关掉**的标签必须同时从已挂载列表里去掉 —— 否则它的 iframe 会一直活着
  // （内存泄漏，而且标签上限 `MAX_GAME_TABS` 就形同虚设：挤掉的标签还占着资源）。
  const [mountedIds, setMountedIds] = useState<TabId[]>(["home"]);
  useEffect(() => {
    setMountedIds((prev) => {
      const open = new Set(openTabs.map((t) => t.id));
      const kept = prev.filter((id) => open.has(id));
      return kept.includes(activeId) ? kept : [...kept, activeId];
    });
  }, [openTabs, activeId]);

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {mountedIds.map((id) => {
        const active = id === activeId;
        return (
          <div
            key={id}
            // 隐藏的标签对读屏器也隐藏；`invisible` 同时让里面的可聚焦元素失焦，
            // 所以不会出现"焦点跑到看不见的标签里"。
            aria-hidden={active ? undefined : true}
            className={`absolute inset-0 flex flex-col overflow-hidden ${
              active ? "" : "invisible pointer-events-none"
            }`}
          >
            <TabPanel tabId={id} loading={loading} activePage={activePage} />
          </div>
        );
      })}
    </main>
  );
}
