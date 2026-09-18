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
import { api } from "./api/client"; // 详情页请求"应用内最大化"时要调窗口命令（见下面的 message 监听）
import TopBar from "./components/TopBar";
import AppBody from "./components/AppBody";
import StatusBar from "./components/StatusBar";
import LoginScreen from "./components/LoginScreen";

import LaunchActionModal from "./components/LaunchActionModal";
import SettingsModal from "./components/settings/SettingsModal";
import ToastContainer from "./components/ToastContainer";
import LaunchingBanner from "./components/LaunchingBanner";
import ImageProgressBar from "./components/ImageProgressBar";
import GameExitBackupPrompt from "./components/GameExitBackupPrompt";
import ZoomIndicator from "./components/ZoomIndicator";
import { useSettingsStore } from "./stores/settingsStore";
import { useGamesStore } from "./stores/gamesStore";
import { useLibraryStore } from "./stores/libraryStore";
import { useAuthStore } from "./stores/authStore";
import { useUIStore } from "./stores/uiStore";
import { useCommunityStore } from "./utils/community/store";
import { useMusicStore } from "./stores/musicStore";
import DanmakuOverlay from "./components/community/DanmakuOverlay";
import ActivityToast from "./components/community/ActivityToast";
import { applyUiFont, applyUiFontScale, uiFontsState } from "./utils/uiFont";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useI18n, type LanguageCode } from "./i18n";

import { isMusicMode } from "./utils/musicQueue";

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
  const uiFontScale = useSettingsStore((s) => s.settings.uiFontScale);
  const { setLang } = useI18n();

  useEffect(() => {
    loadSettings();
    loadPlatforms();
    loadGames();
    loadStats();
    loadAuth();
  }, [loadSettings, loadPlatforms, loadGames, loadStats, loadAuth]);

  // 界面字体（改动即时生效，不用重启）：
  //   显式选过字体 → 用它；
  //   没选 → 用应用自带字体（fonts\字酷堂清楷 简.ttf）；
  //   自带字体也没有（fonts 目录不存在/找不到默认文件）→ 回退系统字体。
  // 这里写的是内联 CSS 变量（优先级最高），所以自带字体盖过主题自带的字体；
  // 字体清单与 @font-face 见 src/utils/uiFont.ts。
  useEffect(() => {
    const chosen = fontFamily && fontFamily.trim() ? fontFamily.trim() : uiFontsState().defaultFamily;
    applyUiFont(chosen);
  }, [fontFamily]);

  // 字体大小（百分比）：只放大文字，界面尺寸不动（见 src/utils/uiFont.ts）。
  useEffect(() => {
    applyUiFontScale(uiFontScale);
  }, [uiFontScale]);

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
  // 通用快捷键（滚动到顶/底、翻页、Alt+←/→ 后退前进）：
  // 全局一处注册，网格/列表/侧栏/详情页/设置弹窗都生效（滚谁由"焦点 → 指针"决定）。
  // Alt+←/→ 现在按**选项卡访问历史**回退/前进（见 hooks/useGlobalShortcuts.ts）。
  useGlobalShortcuts();

  // —— 背景音乐 ——
  // 三件事分开接线（都在设置里可控）：
  //   ① 换音乐目录 → 重新拉曲库；
  //   ② 开关 → 播/停（等曲库拉完再播，否则"刚进来有 0 首"会导致不播）；
  //   ③ 音量 → 同步到 <audio>。
  // 自动播放是需求：进入主界面（本组件挂载）就开始放。播放逻辑见 src/stores/musicStore.ts。
  const musicEnabled = useSettingsStore((s) => s.settings.musicEnabled);
  const musicVolume = useSettingsStore((s) => s.settings.musicVolume);
  const musicDir = useSettingsStore((s) => s.settings.musicDir);
  const musicMode = useSettingsStore((s) => s.settings.musicMode);
  const musicLoaded = useMusicStore((s) => s.loaded);
  useEffect(() => {
    void useMusicStore.getState().load();
  }, [musicDir]);
  useEffect(() => {
    const ms = useMusicStore.getState();
    if (musicEnabled && musicLoaded) ms.play();
    else ms.pause();
  }, [musicEnabled, musicLoaded]);
  useEffect(() => {
    useMusicStore.getState().setVolume(musicVolume ?? 50);
  }, [musicVolume]);
  useEffect(() => {
    // ④ 播放模式：设置 → store（单曲/顺序/随机）。config.json 是外部可改的，
    //    非法值一律回退随机。只在真的不一致时才写 —— 否则"面板里切一下模式"
    //    会先写 store、再被设置回流重排一次队列（多洗一次牌）。
    const want = isMusicMode(musicMode) ? musicMode : "shuffle";
    if (useMusicStore.getState().mode !== want) useMusicStore.getState().setMode(want);
  }, [musicMode]);
  const lastLaunchedId = useGamesStore((s) => s.lastLaunchedId);
  const clearLastLaunched = useGamesStore((s) => s.clearLastLaunched);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const closeSettings = useUIStore((s) => s.closeSettings);
  // 刚启动的游戏 → 打开它的详情选项卡（见下面 lastLaunchedId 那段）。
  const openGameTab = useUIStore((s) => s.openGameTab);
  const games = useGamesStore((s) => s.games);
  const communityEnabled = useSettingsStore((s) => s.settings.communityEnabled);

  // 刚启动的游戏 → 打开它的**详情选项卡**（玩的同时能看攻略，Steam / Playnite 那样）。
  // 2026-09-15 改版：详情从"路由"换成"选项卡"，所以这里开标签而不是 navigate。
  useEffect(() => {
    if (lastLaunchedId) {
      openGameTab(lastLaunchedId);
      clearLastLaunched();
    }
  }, [lastLaunchedId, openGameTab, clearLastLaunched]);

  // 详情页 / 游戏资料页 iframe 里的标签云点击 → 主页筛选：
  // 那些静态页通过 parent.postMessage 广播 { type: "playday-filter-by-tag", tag }，
  // 这里收到后把主页筛选条件设为该标签（单一标签），并切回主页。
  // 两个来源：① 游戏详情页（路由 /game/:id）；② 「游戏资料」选项卡里的总目录页跳进去的游戏页
  // （同一批 HTML、同一段脚本）—— 所以这个监听是**全局**的。
  // 详情页点开视频 → **应用内最大化**（2026-09-18 用户："点击视频，是要默认弹出为应用内最大化
  // 播放，而不是变成一个大的视频播放，也就是，不要动原来的视频播放排列"）。
  // 分工：页面内的放大（搬进整页覆盖层）由详情页自己完成（gameDetailInject.ts 的 enterMaximized），
  // 这里只负责把**窗口**最大化 —— 两件一起才叫"应用内最大化"。
  //
  // ⚠️ 必须先问 isMaximized：`maximize_window` 是**切换**语义（最大化 ↔ 还原），
  //    窗口本来就最大化时直接调它会把窗口**还原** —— gamesStore.ts 里专门留过这条教训。
  useEffect(() => {
    const onMaximize = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.type !== "playday-maximize") return;
      void (async () => {
        try {
          if (await api.isMaximized()) return; // 已经是最大化 → 什么都不做
          await api.maximizeWindow();
        } catch {
          /* 拿不到窗口就当没这回事（网站端没有这条命令） */
        }
      })();
    };
    window.addEventListener("message", onMaximize);
    return () => window.removeEventListener("message", onMaximize);
  }, []);

  useEffect(() => {
    const onTagFilter = (e: MessageEvent) => {
      const d = e.data;
      if (d && d.type === "playday-filter-by-tag" && typeof d.tag === "string") {
        // 设为主页标签筛选（维度=标签、单一标签值，清空搜索），并跳回主页
        useGamesStore.setState({ facet: "tag", facetValues: [d.tag], searchQuery: "" });
        // ⚠️ 还必须**切回「主页」选项卡**（2026-09-15 加）：选项卡由 uiStore 的
        // tabState.activeId 决定、不跟着路由走，只 navigate("/") 的话在「游戏资料」里
        // 点标签会"整屏没反应"。从详情页点标签时本来就在主页，这一句是无害的幂等操作。
        useUIStore.getState().activateTab("home");
        navigate("/");
      }
    };
    window.addEventListener("message", onTagFilter);
    return () => window.removeEventListener("message", onTagFilter);
  }, [navigate]);

  // 社区氛围：游戏库加载后初始化（传入游戏名列表供"正在玩"更贴合真实），
  // 并跟随设置开关启停。
  useEffect(() => {
    if (games.length > 0) {
      useCommunityStore.getState().init(games.map((g) => g.name));
    }
  }, [games]);
  useEffect(() => {
    useCommunityStore.getState().setEnabled(communityEnabled);
  }, [communityEnabled]);

  return (
    <div className="app">
      <TopBar />
      {/* 外壳 = 路由内容 + 底部状态栏。状态栏属于"主界面"而不是某个页面：
          放在这里，主页/详情页（/game/:id）都能看到 IP、门店名、小技巧和音乐控件。
          （以前它挂在 AppBody 里，一进详情页整条就消失了。）
          .app-shell 是 flex 纵向 + flex:1 + overflow:hidden（见 global.css）。 */}
      <div className="app-shell">
        <RoutesErrorBoundary>
          <Routes>
            <Route path="/" element={<AppBody />} />
            {/* 「游戏详情」**不再是路由**（2026-09-15）：改成"每个游戏一个选项卡"，
                见 docs/design/main-tabs.md。老的 #/game/xxx 深链接由下面的
                path="*" 兜底回主页，不会白屏。 */}
            {/* 兜底：任何未匹配路径回到主页，避免空白。
                注意：v7 里把 <Navigate> 直接作为 path="*" element 报"pure is not invalid"，
                v6 没有这个问题。 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RoutesErrorBoundary>
        <StatusBar />
      </div>
      <ToastContainer />
      {/* 社区氛围：顶部弹幕 + 活动流 toast（可设置关闭） */}
      <DanmakuOverlay />
      <ActivityToast />
      <LaunchingBanner />
      <ImageProgressBar />
      {/* Ctrl+滚轮缩放指示气泡（浏览器式：110% − + 重置）。 */}
      <ZoomIndicator />
      {/* 游戏退出后弹"是否备份存档"确认框（监听 game_exited 事件）。 */}
      <GameExitBackupPrompt />
      <AnimatePresence>
        {settingsOpen && <SettingsModal key="settings" onClose={closeSettings} />}
        <LaunchActionModal key="launch-action" />
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
            {/* 字号用 Tailwind 的 text-[Npx] 类而不是内联 fontSize：
                内联样式构建期覆盖不到，改"字体大小"设置时这里不会跟着变。 */}
            <div className="text-[48px]" style={{ fontWeight: 800, marginBottom: 8 }}>
              出错了
            </div>
            <p style={{ opacity: 0.75, marginBottom: 16 }}>
              路由渲染时发生异常，已被捕获。点下方按钮返回主页。
            </p>
            <pre
              className="text-[12px]"
              style={{
                background: "rgba(0,0,0,0.06)",
                padding: 12,
                borderRadius: 8,
                overflow: "auto",
                textAlign: "left",
                marginBottom: 16,
              }}
            >
              {String(e?.message || e)}
              {e?.stack ? (
                <div
                  className="text-[10px]"
                  style={{ marginTop: 8, opacity: 0.7, whiteSpace: "pre-wrap" }}
                >
                  {e.stack}
                </div>
              ) : null}
            </pre>
            <button
              type="button"
              onClick={() => (window.location.hash = "#/")}
              className="text-[13px]"
              style={{
                padding: "8px 20px",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 8,
                background: "var(--accent, #2d7ff9)",
                color: "var(--text-primary)",
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
