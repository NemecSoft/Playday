// Browser-style top bar:
//   [Settings]  [Home | Videos | Tools]  ............  [YunGame - Gold]  [− □ ×]
//
// - Left: a hamburger/menu button that opens a dropdown (Settings, Regenerate
//   Tags, Reload). This replaces the old standalone TitleBar.
// - Middle: top-level tabs (Home / Videos / Tools).
// - Right of the tabs: the resolved current-user edition label
//   (e.g. "YunGame——黄金版").
// - Far right: window controls (minimize / maximize / close).
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
} from "lucide-react";
import { api } from "../api/client";
import { useI18n } from "../i18n";
import { useAuthStore } from "../stores/authStore";
import { useUIStore, type ActiveTab } from "../stores/uiStore";
import { resolveEditionName } from "../utils/edition";
import AboutModal from "./AboutModal";
import ThemeTopPicker from "./ThemeTopPicker";

const TABS: { key: ActiveTab; labelKey: string; icon: typeof Home }[] = [
  { key: "home", labelKey: "tab_home", icon: Home },
  { key: "videos", labelKey: "tab_videos", icon: Clapperboard },
  { key: "tools", labelKey: "tab_tools", icon: Wrench },
];

export default function TopBar() {
  const { t } = useI18n();
  const currentUser = useAuthStore((s) => s.currentUser);

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

  // Build the edition label (right side). Always a non-empty Chinese label,
  // never the literal "Playnite" / "Guest".
  const rawName = currentUser?.name?.trim() ?? "";
  const isGuest =
    !currentUser ||
    currentUser.kind === "guest" ||
    rawName === "" ||
    rawName === "Guest";

  let titleText = isGuest
    ? t("default_edition")
    : resolveEditionName(rawName, currentUser!.level);

  const PREFIX = "YunGame——";
  if (!titleText.startsWith("YunGame")) {
    titleText = PREFIX + titleText;
  }

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

      {/* Right of the tabs: edition label (circle 1 in the reference image) */}
      <div className="topbar-edition" title={titleText}>
        {titleText}
      </div>

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