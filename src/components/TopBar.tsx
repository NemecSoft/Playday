// Browser-style top bar:
//   [☰]  [主页 | 游戏资料 | 工具] │ [游戏A ×] [游戏B ×] …  ……  [主题] [⛶ ─ □ ×]
//
// - Left: a hamburger/menu button that opens a dropdown (Settings, About).
//   This replaces the old standalone TitleBar.
// - Middle: top-level tabs —— **两组**：固定的三个（不压缩、不滚动）+ 游戏标签
//   （可压缩、可横向滚动），中间一条分隔线。原因见 renderTab 上面那段注释。
// - Far right: theme picker + window controls (fullscreen / minimize / maximize / close).
//
// ⚠️ 版本徽标（品牌 + 黄金版 / 钻石版）**已从顶栏挪到右下角状态栏**（2026-09-15）：
//    它原来绝对居中、不占位置，标签一多就从它底下穿过去 —— 那是结构性的遮挡，调间距解决不了。
//    现在在 src/components/TierBadge.tsx，渲染位置在 StatusBar 的背景音乐右边。
//
// ⚠️ 右上角原来还有一个 `YunGame——<用户表里的门店名>` 胶囊，按需求**已整块去掉**
//    （不想让门店名显示在界面上，所以直接不渲染，不是 CSS 隐藏）。
//    · 门店名的"按 IP 解析版本"逻辑仍在 utils/edition.ts（暂时没有调用方）；
//    · 门店名现在只出现在中央徽章的 hover 提示里（排查"命中了哪家店"时有用）；
//    · 将来要恢复右上角展示：把 .topbar-edition 的 JSX 和 CSS 从 git 历史取回即可。
//
// The whole bar is draggable for the frameless window; interactive controls
// set `-webkit-app-region: no-drag` so clicks still work.

import { useEffect, useRef, useState } from "react";
import {
  Menu,
  Square,
  Copy,
  X,
  Settings as SettingsIcon,
  Info,
  Home,
  BookOpen,
  Wrench,
  Gamepad2,
} from "lucide-react";
import { api } from "../api/client";
import { useI18n } from "../i18n";
import { useGamesStore } from "../stores/gamesStore";
import { useUIStore } from "../stores/uiStore";
import {
  gameIdOfTab,
  isFixedTabId,
  isGameTabId,
  type AppTab,
  type FixedTabId,
  type TabId,
} from "../utils/tabs";
import AboutModal from "./AboutModal";
import TabContextMenu from "./TabContextMenu";
import ThemeTopPicker from "./ThemeTopPicker";

/**
 * 固定选项卡（主页 / 工具）的图标与文案 key。
 * 它们的**顺序**不在这里 —— 顺序由 `src/utils/tabs.ts` 的 FIXED_TAB_IDS 决定，
 * 顶栏只照着 `tabState.tabs` 渲染；游戏标签是动态的，排在它们后面。
 *
 * 2026-09-18：原来的第三个固定选项卡「游戏资料」（静态总目录页）已移除，
 * 见 `src/utils/tabs.ts` 的注释 —— 那一项只在那边删，不要在这里"打补丁"隐藏。
 */
const FIXED_TAB_META: Record<FixedTabId, { labelKey: string; icon: typeof Home }> = {
  home: { labelKey: "tab_home", icon: Home },
  tools: { labelKey: "tab_tools", icon: Wrench },
};

export default function TopBar() {
  const { t } = useI18n();
  const menuOpen = useUIStore((s) => s.menuOpen);
  const toggleMenu = useUIStore((s) => s.toggleMenu);
  const closeMenu = useUIStore((s) => s.closeMenu);
  const openSettings = useUIStore((s) => s.openSettings);
  // 选项卡（2026-09-15 改版：动态列表，每个游戏一个可关闭的标签）。
  const tabState = useUIStore((s) => s.tabState);
  const activateTab = useUIStore((s) => s.activateTab);
  const closeTab = useUIStore((s) => s.closeTab);
  // 游戏标签显示游戏名 —— 从游戏库取（单一来源：标签里不再存一份名字）。
  const games = useGamesStore((s) => s.games);

  const menuRef = useRef<HTMLDivElement>(null);
  // 游戏标签的滚动容器（激活标签要滚进视野，见下面的 useEffect）。
  const gameTabsRef = useRef<HTMLElement>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  // 标签的右键菜单（一键关"其它 / 全部"游戏标签）：记下"右键的是哪个标签 + 弹在哪"。
  // 只在这里存状态，菜单内容与规则在 TabContextMenu。
  const [tabMenu, setTabMenu] = useState<{ tabId: TabId; x: number; y: number } | null>(
    null
  );

  // Window state for the maximize/restore & fullscreen toggle buttons.
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const refreshWindowState = async () => {
    try {
      const [max, fs] = await Promise.all([api.isMaximized(), api.isFullscreen()]);
      setIsMaximized(max);
      setIsFullscreen(fs);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void refreshWindowState();
    // Keep state in sync even if the window is changed by other means
    // (Win+Up, double-click, Esc to exit fullscreen).
    window.addEventListener("yungame:window-state", refreshWindowState);
    window.addEventListener("focus", refreshWindowState);

    // F11 toggles fullscreen (familiar desktop shortcut).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        void onFullscreenToggle();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("yungame:window-state", refreshWindowState);
      window.removeEventListener("focus", refreshWindowState);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMaximizeToggle = async () => {
    const max = await api.maximizeWindow();
    setIsMaximized(max);
  };

  const onFullscreenToggle = async () => {
    // 真正的全屏：优先用原生 requestFullscreen（OS 级全屏，会自动隐藏任务栏、
    // 占满整个显示器），失败时 fallback 到主进程 IPC 的 toggle_fullscreen。
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
        return;
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
        return;
      }
    } catch {
      // requestFullscreen 失败（如无用户手势）时 fallback 到主进程 IPC。
      const fs = await api.toggleFullscreen();
      setIsFullscreen(fs);
    }
  };

  const onClose = () => {
    void api.closeWindow();
  };

  const onDoubleClick = () => {
    // Double-clicking the empty title bar toggles maximize (modern window
    // behavior). Fullscreen is left alone so it doesn't fight maximize.
    if (isFullscreen) return;
    void onMaximizeToggle();
  };

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen, closeMenu]);

  // 激活的游戏标签**滚进视野**（2026-09-15）。
  // 起因：标签栏横向可滚但滚动条是隐形的，开满 10 个之后从主页/侧栏点开的标签会落在
  // 滚动区外面 —— 用户看到的是"我点了详情，顶栏却没反应"（其实标签开了，只是看不见）。
  // block:"nearest" 是必须的：默认的 block:"start" 会连整页一起往上拽一下。
  useEffect(() => {
    gameTabsRef.current
      ?.querySelector(".topbar-tabwrap.active")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    // tabs.length 也要盯着：超上限时挤掉最久没访问的那个，激活标签可能因此换位。
  }, [tabState.activeId, tabState.tabs.length]);

  // 选项卡分**两组**渲染（2026-09-15）：
  //   固定组（主页/游戏资料/工具）—— 不压缩、不滚动，永远钉在最左边；
  //   游戏组 —— 可压缩、可横向滚动。
  // 为什么必须是两个容器：只用一个滚动容器时，标签一多会把固定三个一起滚出视野，
  // 而它们是**入口**，滚没了就没地方点回主页了（固定标签不许关闭也是同一个理由）。
  const fixedTabs = tabState.tabs.filter((tab) => isFixedTabId(tab.id));
  const gameTabs = tabState.tabs.filter((tab) => isGameTabId(tab.id));

  // 一个标签的渲染。固定/游戏两组结构一样，只有"可不可关""文案从哪来"不同，所以共用。
  const renderTab = (tab: AppTab) => {
    const gameId = gameIdOfTab(tab.id);
    const meta = isFixedTabId(tab.id) ? FIXED_TAB_META[tab.id] : null;
    // 固定标签走 i18n；游戏标签用游戏名（游戏已不在库里就退化成占位文案）。
    const label = meta
      ? t(meta.labelKey)
      : (gameId ? games.find((g) => g.id === gameId)?.name : "") ||
        t("tab_game_unknown");
    const Icon = meta ? meta.icon : Gamepad2;
    return (
      <span
        key={tab.id}
        className={`topbar-tabwrap${tabState.activeId === tab.id ? " active" : ""}`}
        // 右键 → 一键关"其它 / 全部"游戏标签（开满 10 个之后一个个点 ✕ 太烦）。
        // preventDefault 挡掉系统菜单；坐标用 clientX/clientY（菜单是 fixed 定位，要视口坐标）。
        onContextMenu={(e) => {
          e.preventDefault();
          setTabMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
        }}
      >
        <button
          className="topbar-tab"
          onClick={() => activateTab(tab.id)}
          title={label}
        >
          <Icon size={15} />
          {/* 标签变窄时由它自己出省略号（顶栏再挤也不会把顶栏撑变形）。
              完整名字在按钮的 title 里，鼠标停一下就能看到。 */}
          <span className="topbar-tab-label">{label}</span>
        </button>
        {/* 关闭入口**只给游戏标签**：固定三个是入口，关掉就没地方点回来了。
            关闭必须是**另一个真 button** —— 按钮里嵌按钮是非法 HTML。 */}
        {gameId && (
          <button
            className="topbar-tab-close"
            title={t("tab_close")}
            aria-label={t("tab_close")}
            onClick={() => closeTab(tab.id)}
          >
            <X size={11} />
          </button>
        )}
      </span>
    );
  };

  return (
    <header className="topbar" onDoubleClick={onDoubleClick}>
      {/* Far left: settings / app menu (circle 2 in the reference image) */}
      <div
        className="topbar-left"
        ref={menuRef}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button
          className="topbar-menu-btn"
          aria-label={t("titlebar_menu")}
          title={t("titlebar_menu")}
          onClick={toggleMenu}
        >
          <Menu size={16} />
        </button>
        {menuOpen && (
          <div className="titlebar-menu">
            <button
              className="titlebar-menu-item"
              onClick={() => openSettings()}
            >
              <SettingsIcon size={14} />
              <span>{t("titlebar_menu_settings")}</span>
            </button>
            <button
              className="titlebar-menu-item"
              onClick={() => {
                setAboutOpen(true);
                closeMenu();
              }}
            >
              <Info size={14} />
              <span>{t("titlebar_menu_about")}</span>
            </button>
          </div>
        )}
        {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      </div>

      {/* Middle / 左：固定选项卡（主页 / 游戏资料 / 工具）
          —— **不压缩、不滚动**，永远钉在最左边（见下面 gameTabs 的说明）。 */}
      <nav
        className="topbar-tabs topbar-fixed-tabs"
        aria-label="Main tabs"
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {fixedTabs.map(renderTab)}
      </nav>

      {/* 固定组与游戏组的分隔线 —— 没有游戏标签时不画（一条光杆竖线很难看）。 */}
      {gameTabs.length > 0 && <span className="topbar-tabs-sep" aria-hidden="true" />}

      {/* Middle / 右：游戏标签（动态、可关、可压缩、可横向滚动） */}
      <nav
        className="topbar-tabs topbar-game-tabs"
        aria-label="Game tabs"
        ref={gameTabsRef}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {gameTabs.map(renderTab)}
      </nav>

      {/* Right of the tabs: theme picker (all presets, one-click switch) */}
      <ThemeTopPicker />

      {/* 右上角：原来这里是 `YunGame——<门店名>` 胶囊，按需求整块去掉
          （不让门店名出现在界面上）。
          版本徽标（品牌 + 黄金版/钻石版）也**在 2026-09-15 从这里挪走** ——
          它原来是绝对居中、不占位置的，动态标签栏一多就从它底下穿过去（结构性遮挡）。
          现在在右下角状态栏（StatusBar 里、背景音乐右边），见 src/components/TierBadge.tsx。 */}

      {/* Far right: window controls: [Fullscreen] [Minimize] [Maximize] [Close] */}
      <div
        className="window-controls"
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button
          className="win-fullscreen"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          onClick={() => void onFullscreenToggle()}
        >
          <span className="win-icon win-icon-fullscreen">⛶</span>
        </button>
        <button title="Minimize" onClick={() => void api.minimizeWindow()}>
          <span className="win-icon win-icon-min">─</span>
        </button>
        <button
          title={isMaximized ? "Restore" : "Maximize"}
          onClick={() => void onMaximizeToggle()}
        >
          {isMaximized ? <Copy size={13} /> : <Square size={13} />}
        </button>
        <button className="close" title="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {/* 标签的右键菜单。fixed 定位、不在文档流里，所以放在 header 里也不会改变顶栏布局。 */}
      {tabMenu && (
        <TabContextMenu {...tabMenu} onClose={() => setTabMenu(null)} />
      )}
    </header>
  );
}