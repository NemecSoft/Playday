// Browser-style top bar:
//   [Settings]  [Home | Videos | Tools]  ......  [黄金版/钻石版]  [⛶ ─ □ ×]
//
// - Left: a hamburger/menu button that opens a dropdown (Settings, About).
//   This replaces the old standalone TitleBar.
// - Middle: top-level tabs (Home / Videos / Tools).
// - Center: the current version badge (黄金版 / 钻石版), with a "稀有度高光"
//   animation every 10s (样式与动效在 global.css 的 .topbar-tier)。
// - Far right: window controls (fullscreen / minimize / maximize / close).
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
  Clapperboard,
  Wrench,
  Crown,
  Gem,
} from "lucide-react";
import { api } from "../api/client";
import { useI18n } from "../i18n";
import { useAuthStore } from "../stores/authStore";
import { useUIStore, type ActiveTab } from "../stores/uiStore";
import AboutModal from "./AboutModal";
import ThemeTopPicker from "./ThemeTopPicker";

const TABS: { key: ActiveTab; labelKey: string; icon: typeof Home }[] = [
  { key: "home", labelKey: "tab_home", icon: Home },
  { key: "videos", labelKey: "tab_videos", icon: Clapperboard },
  { key: "tools", labelKey: "tab_tools", icon: Wrench },
];

export default function TopBar() {
  const { t } = useI18n();
  // 当前用户等级（黄金/钻石）——顶部中央的版本标识用它。
  // 注意：这里**不再订阅 currentUser**。它原来只用于右上角胶囊与徽章悬停提示里的
  // 门店名，两处按需求都去掉了；留着会白白订阅一次 store、还会让人以为哪处在用。
  const userLevel = useAuthStore((s) => s.userLevel);

  const menuOpen = useUIStore((s) => s.menuOpen);
  const toggleMenu = useUIStore((s) => s.toggleMenu);
  const closeMenu = useUIStore((s) => s.closeMenu);
  const openSettings = useUIStore((s) => s.openSettings);
  const activeTab = useUIStore((s) => s.activeTab);
  const setTab = useUIStore((s) => s.setTab);

  const menuRef = useRef<HTMLDivElement>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

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

      {/* Middle: top-level tabs */}
      <nav
        className="topbar-tabs"
        aria-label="Main tabs"
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {TABS.map(({ key, labelKey, icon: Icon }) => (
          <button
            key={key}
            className={`topbar-tab ${activeTab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            <Icon size={15} />
            <span>{t(labelKey)}</span>
          </button>
        ))}
      </nav>

      {/* Right of the tabs: theme picker (all presets, one-click switch) */}
      <ThemeTopPicker />

      {/* 顶部中央：当前版本标识（黄金版 / 钻石版）—— 原系统就在这个位置用图标+文字显示，
          我们也照做（绝对居中，不参与左右两组的流式排布）。
          等级由主进程按用户表 IP 判定（docs/design/user-level-detection.md）：
          1 = 黄金版、≥2 = 钻石版（3 是 config 的调试覆盖值，同样显示钻石版）。

          每 10 秒来一次的"稀有度高光"动效全在 CSS 里（global.css 的 .tier-sheen /
          tier-glow / tier-icon-pop），这里只需要挂一个空的裁切容器：
          它负责把扫光裁在徽章内部，不给徽章加 overflow:hidden（那会裁掉文字光晕）。

          ⚠️ 刻意**不加 title 提示**：以前悬停会弹出"钻石版 · 某某电竞酒店"，
          按需求去掉（鼠标放上去不该显示任何东西）。 */}
      <div
        className={`topbar-tier ${userLevel >= 2 ? "diamond" : "gold"}`}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <span className="tier-sheen" aria-hidden="true" />
        {userLevel >= 2 ? <Gem size={14} /> : <Crown size={14} />}
        <span>{userLevel >= 2 ? t("tier_diamond") : t("tier_gold")}</span>
      </div>

      {/* 右上角：原来这里是 `YunGame——<门店名>` 胶囊，按需求整块去掉
          （不让门店名出现在界面上）。保留这块位置给窗口按钮即可，
          版本信息由上方居中的徽章承担。 */}

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
    </header>
  );
}