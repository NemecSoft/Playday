// Root application shell: loads settings & data, wires the title bar and
// optional login screen.

import { Component, useEffect, useState, type ReactNode, type ErrorInfo } from "react";
import { AnimatePresence } from "framer-motion";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import TopBar from "./components/TopBar";
import AppBody from "./components/AppBody";
import LoginScreen from "./components/LoginScreen";

import LaunchActionModal from "./components/LaunchActionModal";
import SettingsModal from "./components/settings/SettingsModal";
import ToastContainer from "./components/ToastContainer";
import LaunchingBanner from "./components/LaunchingBanner";
import ImageProgressBar from "./components/ImageProgressBar";
import GameDetailPage from "./pages/GameDetailPage";
import { useSettingsStore } from "./stores/settingsStore";
import { useGamesStore } from "./stores/gamesStore";
import { useLibraryStore } from "./stores/libraryStore";
import { useAuthStore } from "./stores/authStore";
import { useUIStore } from "./stores/uiStore";
import { useI18n, type LanguageCode } from "./i18n";

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load);
  const loadPlatforms = useSettingsStore((s) => s.loadPlatforms);
  const loadGames = useGamesStore((s) => s.load);
  const loadStats = useLibraryStore((s) => s.loadStats);
  const loadAuth = useAuthStore((s) => s.load);
  const language = useSettingsStore((s) => s.settings.language);
  const loginEnabled = useSettingsStore((s) => s.settings.loginEnabled);
  const loggedIn = useSettingsStore((s) => s.settings.loggedIn);
  const fontFamily = useSettingsStore((s) => s.settings.fontFamily);
  const { setLang } = useI18n();

  useEffect(() => {
    loadSettings();
    loadPlatforms();
    loadGames();
    loadStats();
    loadAuth();
  }, [loadSettings, loadPlatforms, loadGames, loadStats, loadAuth]);

  // Apply the user-selected font instantly (no restart). Setting the inline
  // CSS variable overrides each theme's default --font-ui.
  useEffect(() => {
    const el = document.documentElement;
    if (fontFamily && fontFamily.trim()) {
      el.style.setProperty("--font-ui", `${fontFamily.trim()}, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif`);
    } else {
      el.style.removeProperty("--font-ui");
    }
  }, [fontFamily]);

  // Sync the persisted language to the i18n context (instant switching).
  useEffect(() => {
    setLang(language as LanguageCode);
  }, [language, setLang]);

  // Show the login screen first when enabled and not yet logged in.
  const needsLogin = loginEnabled && !loggedIn;

  if (needsLogin) {
    return <LoginScreen onLogin={() => undefined} />;
  }

  // 用 v6 风格的 <HashRouter><Routes>。v7 的 <Routes>/useRoutes 在 Web 端会触发
  // "t.pure is not invalid" 内部错误（已知 v7 问题，AppShell 等带 hook 的 Route
  // element 会触发 route.pure 检查），改回 v6 稳定可靠。
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}

/** Inner component: lives inside HashRouter so it can use react-router hooks.
 *  Wires up global UI (top bar, body, toast, image progress) and reacts to
 *  "game just launched" by navigating to the detail page. */
function AppShell() {
  const navigate = useNavigate();
  const lastLaunchedId = useGamesStore((s) => s.lastLaunchedId);
  const clearLastLaunched = useGamesStore((s) => s.clearLastLaunched);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const closeSettings = useUIStore((s) => s.closeSettings);

  // When a game has just been launched, jump to its detail page so the user
  // can read the guide / instructions while playing (Steam / Playnite-style).
  useEffect(() => {
    if (lastLaunchedId) {
      navigate(`/game/${lastLaunchedId}`);
      clearLastLaunched();
    }
  }, [lastLaunchedId, navigate, clearLastLaunched]);

  return (
    <div className="app">
      <TopBar />
      <RoutesErrorBoundary>
        <Routes>
          <Route path="/" element={<AppBody />} />
          <Route path="/game/:id" element={<GameDetailPage />} />
          {/* 兜底：任何未匹配路径回到主页，避免空白。
              注意：v7 里把 <Navigate> 直接作为 path="*" element 报"pure is not invalid"，
              v6 没有这个问题。 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RoutesErrorBoundary>
      <ToastContainer />
      <LaunchingBanner />
      <ImageProgressBar />
      <AnimatePresence>
        {settingsOpen && <SettingsModal onClose={closeSettings} />}
        <LaunchActionModal />
      </AnimatePresence>
    </div>
  );
}

/**
 * 包裹路由。任何路由组件（包括 GameDetailPage）render 期间抛错都会被
 * 捕获并显示降级 UI，避免整个应用被卸载成一片空白。
 * 降级 UI 显示错误信息和"返回主页"按钮。
 */
class RoutesErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 诊断：完整打印错误对象与组件栈。某些浏览器 minify 后 stack 挤在一行，
    // 用 console.error 展开对象而不是只打字符串，方便点开看完整信息。
    console.error("[RoutesErrorBoundary] 路由渲染抛错（完整错误对象）：");
    console.error(error);
    console.error("[RoutesErrorBoundary] 组件栈：");
    console.error(info.componentStack);
  }

  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <div
          style={{
            flex: 1,
            display: "grid",
            placeItems: "center",
            padding: 24,
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 560 }}>
            <div style={{ fontSize: 48, fontWeight: 800, marginBottom: 8 }}>
              出错了
            </div>
            <p style={{ opacity: 0.75, marginBottom: 16 }}>
              路由渲染时发生异常，已被捕获。点下方按钮返回主页。
            </p>
            <pre
              style={{
                background: "rgba(0,0,0,0.06)",
                padding: 12,
                borderRadius: 8,
                overflow: "auto",
                fontSize: 12,
                textAlign: "left",
                marginBottom: 16,
              }}
            >
              {String(e?.message || e)}
              {e?.stack ? (
                <div style={{ marginTop: 8, fontSize: 10, opacity: 0.7, whiteSpace: "pre-wrap" }}>
                  {e.stack}
                </div>
              ) : null}
            </pre>
            <button
              type="button"
              onClick={() => (window.location.hash = "#/")}
              style={{
                padding: "8px 20px",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 8,
                background: "var(--accent, #2d7ff9)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              返回主页
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
