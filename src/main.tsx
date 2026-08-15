import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AnnouncementWindow from "./components/AnnouncementWindow";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  restoreLibraryTheme,
  restoreStyle,
  getStoredThemeId,
  storeThemeId,
  storeStyleId,
} from "./utils/themeApply";
import { themeLibrary } from "./utils/themeLibrary";
import { styleLibrary } from "./utils/styleLibrary";
// 初始化 i18next（导入以执行其副作用）。
import "./i18n/config";
import { i18n as i18nInstance, type LanguageCode } from "./i18n/config";
import "./styles/global.css";
// 主题令牌（配色变量），在 global.css 里被引用。
import "./styles/tokens.css";

// TanStack Query 客户端。
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

function showBoot(msg: string, keep = true) {
  const el = document.getElementById("boot");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  if (keep) el.dataset.keep = "1";
}

// 出错时把错误信息显示在 boot 屏上，便于排查。
window.addEventListener("error", (e) => {
  showBoot("JS ERROR: " + (e.error?.message || e.message || "unknown"));
  document.title = "ERR: " + (e.error?.message || e.message || "unknown");
});
window.addEventListener("unhandledrejection", (e) => {
  // 打印完整堆栈（含出错的 Promise 来源），便于定位是哪个调用抛的错。
  const reason: unknown = e.reason;
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  showBoot("JS REJECTION: " + msg);
  document.title = "REJ: " + msg;
  console.error("[unhandledrejection] ", reason);
  if (stack) console.error("[unhandledrejection] stack:\n" + stack);
});

try {
  // 启动时把上次的调色板/风格恢复到 :root（CSS 变量驱动多主题），避免首帧闪烁。
  // 用 localStorage 快速恢复（同步、不阻塞渲染）。
  // 等拿到后端 settings 后，如果 settings 里的 themeId/styleId 存在且与
  // localStorage 不一致，再以后端为准覆盖（config.json 是权威持久化）。
  restoreLibraryTheme(themeLibrary);
  restoreStyle(styleLibrary);

  // 启动时序（避免"先闪英文再切中文"）：
  // 1) 在 React 渲染之前，先同步从后端拿到用户设置。
  // 2) 立刻用该语言同步切换 i18n。
  // 3) 把预加载的 settings 写入 store，避免 App.tsx 里的 loadSettings 再次 invoke。
  void (async () => {
    const FALLBACK_LANG: LanguageCode = "zh-CN";
    let initialLang: LanguageCode = FALLBACK_LANG;
    let preloadedSettings: unknown = null;
    try {
      // 用适配层 invoke 拿到设置（设置 1.5s 上限：万卡住不至于让白屏时间过长）。
      const { invoke } = await import("./api/ipc");
      const settingsPromise = invoke<{ language?: string }>("get_settings");
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("get_settings timeout")), 1500)
      );
      const settings = await Promise.race([settingsPromise, timeout]);
      if (settings && typeof settings.language === "string") {
        initialLang = settings.language as LanguageCode;
      }
      preloadedSettings = settings;
    } catch {
      // invoke 失败或超时：用 fallback（zh-CN）渲染。
    }
    try {
      i18nInstance.changeLanguage(initialLang);
    } catch {
      /* ignore */
    }
    if (preloadedSettings) {
      try {
        const s = preloadedSettings as {
          themeId?: string;
          styleId?: string;
        };
        // 主题/风格以 config.json（后端）为准：settings 里有值就用它覆盖
        // localStorage，并重新应用（这样打包版 file:// 下 localStorage 丢了
        // 也不影响，重启后从 config.json 恢复）。
        if (s.themeId) {
          storeThemeId(s.themeId);
          const entry = themeLibrary.find((t) => t.id === s.themeId);
          if (entry) {
            restoreLibraryTheme(themeLibrary, entry.gradientClass);
          }
        }
        if (s.styleId) {
          storeStyleId(s.styleId);
          const st = styleLibrary.find((x) => x.id === s.styleId);
          if (st) restoreStyle([st]);
        }

        const { useSettingsStore, applyCardTextStyles } = await import(
          "./stores/settingsStore"
        );
        useSettingsStore.setState({
          settings: preloadedSettings as never,
          loaded: true,
        });
        // 立即把卡片字号/加粗应用到根 CSS 变量，避免首屏用默认字号再切换。
        applyCardTextStyles(preloadedSettings as Partial<typeof preloadedSettings>);
      } catch {
        /* ignore */
      }
    }

    // 根据窗口类型决定渲染哪个界面：
    //  - ?window=announcement → 公告窗口（独立引导窗口）
    //  - 其它 → 主界面（客户端/管理端共用一个 App，靠 ?window 区分）
    const isAnnouncement =
      new URLSearchParams(window.location.search).get("window") ===
      "announcement";

    // 渲染根组件。
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          {isAnnouncement ? <AnnouncementWindow /> : <App />}
        </QueryClientProvider>
      </React.StrictMode>
    );

    // 渲染完成后隐藏 boot 屏。
    const timer = setInterval(() => {
      const rootEl = document.getElementById("root");
      const bootEl = document.getElementById("boot");
      if (!rootEl || !bootEl) return;
      if (bootEl.dataset.keep) {
        clearInterval(timer);
        return;
      }
      if (rootEl.childElementCount > 0) {
        bootEl.classList.add("hidden");
        clearInterval(timer);
      }
    }, 100);
    setTimeout(() => {
      const rootEl = document.getElementById("root");
      const bootEl = document.getElementById("boot");
      if (bootEl && !bootEl.dataset.keep && rootEl && rootEl.childElementCount > 0) {
        bootEl.classList.add("hidden");
      }
    }, 5000);
    // 窗口标题用主进程注入的可配置 appName（build.config.ts 的 APP_NAME）。
    document.title = window.electronConfig?.appName || "Playday";
  })();
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  showBoot("MOUNT ERR: " + msg);
}
