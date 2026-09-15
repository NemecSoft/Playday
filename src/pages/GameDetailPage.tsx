// Game detail page (route /game/:id).
// Rich HTML content: play button, description, developer / release date /
// rating, how-to-play guide (HTML), screenshot gallery (GIF supported) and
// gameplay videos. Fully localized via i18n.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useGamesStore } from "../stores/gamesStore";
import { useUIStore } from "../stores/uiStore";
import { useI18n } from "../i18n";
import { api, type GameVideoItem } from "../api/client";
import { useMusicStore } from "../stores/musicStore";
import { useSettingsStore } from "../stores/settingsStore";
import { formatClock } from "../utils/clock";
// 主题变了要重载 iframe（详情页颜色是服务器发 HTML 时注入的，见 electron/core/detailTheme.ts）
import { DETAIL_THEME_EVENT } from "../utils/themeApply";
import { ArrowLeft, Play, PlayCircle, Wrench, Archive } from "lucide-react";
import { Button } from "../components/ui/button";
import { useAuthStore } from "../stores/authStore";
// 能不能玩某游戏 = 唯一判据（与主进程共用同一份实现，见 docs/design/user-level-detection.md）
import { canPlay } from "../../shared/userLevel";

// 运行时长按"计时器"风格显示（分钟补零）：1:01:01 / 00:12。
// 进位与补零规则在 utils/clock.ts —— 音乐面板的播放进度用的是同一套（那边不补零）。
const runClock = (sec: number) => formatClock(sec, { padMinutes: true });

// 详情页顶部"运行状态"后台轮询。
//
// 为什么在这里轮询而不是放在全局 store：后端在进程退出时已经把"最近一次运行
// 时长"持久化到数据库（game.last_session_seconds）。所以哪怕用户点返回离开详情
// 页、再点详情进来，重新 mount 时调一次 get_run_state 就能从数据库读到准确的
// 时长，天然满足"后台服务式监控"——不需要一个常驻的全局定时器。
//
// running 状态下，每隔 1 秒轮询后端拿 elapsedSec；同时用本地秒表做平滑累加，
// 这样即使某次网络抖动漏了 1 秒，界面上计时也不会跳变。
function useRunState(gameId: string) {
  const [state, setState] = useState<"running" | "stopped" | "never" | "unknown">("unknown");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [lastSessionSec, setLastSessionSec] = useState(0);
  const lastBackendElapsed = useRef<number | null>(null);
  const lastBackendAt = useRef<number | null>(null);

  useEffect(() => {
    if (!gameId) {
      setState("never");
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    // 一次轮询：拉后端状态，并校准本地秒表。
    const poll = async () => {
      try {
        const r = await api.getRunState(gameId);
        if (cancelled) return;
        const now = Date.now();
        // 记录后端返回的 elapsedSec 及当前时刻，用于 running 状态的本地平滑计时。
        if (r.state === "running") {
          lastBackendElapsed.current = r.elapsedSec;
          lastBackendAt.current = now;
          setElapsedSec(r.elapsedSec);
          setState("running");
        } else if (r.state === "stopped") {
          setState("stopped");
          setLastSessionSec(r.lastSessionSec);
        } else {
          setState("never");
        }
      } catch {
        // 轮询失败就保持现状，下次再试。
      }
    };

    void poll();
    // running 状态下的平滑计时：每秒基于后端基线 + 已过时间自增，界面不跳变。
    const tick = () => {
      if (lastBackendElapsed.current != null && lastBackendAt.current != null) {
        const delta = (Date.now() - lastBackendAt.current) / 1000;
        setElapsedSec(Math.floor(lastBackendElapsed.current + delta));
      }
    };
    timer = setInterval(() => {
      void poll();
      tick();
    }, 1000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [gameId]);

  return { state, elapsedSec, lastSessionSec };
}

/**
 * 游戏详情页。
 *
 * 2026-09-15 起它**不再是路由**（原来 `/game/:id` 会把主页整块替换掉 —— 用户反馈
 * "点详情就把主页挡住了"）—— 现在它是「每个游戏一个选项卡」里的内容，游戏 id 由标签
 * 传进来，关掉标签即回收。见 docs/design/main-tabs.md。
 */
export default function GameDetailPage({ gameId }: { gameId: string }) {
  // 组件内部沿用 `id` 这个名字：来源从"路由参数"变成"标签 props"，
  // 下面几十处 `id` 引用不用动。
  const id = gameId;
  const activateTab = useUIStore((s) => s.activateTab);
  const { t } = useI18n();
  const games = useGamesStore((s) => s.games);
  const launchGame = useGamesStore((s) => s.launchGame);
  // 界面语言：拼详情页 URL 时带上（`?lang=`），服务器据此生成注入区块的文案。
  const language = useSettingsStore((s) => s.settings.language);

  const game = useMemo(() => games.find((g) => g.id === id), [games, id]);

  // 顶栏正中「开始游戏」按钮是否显示（2026-09-15 需求）：
  //   loaded   —— 等级算完之前 authStore.userLevel 暂定是 3（宽松），只看 canPlay 会让
  //               黄金版用户先看到按钮、再消失（闪一下）。所以必须等 loaded。
  //   canPlay  —— 判定只走唯一事实来源（与主进程同一份）：黄金版看钻石版游戏**不渲染**。
  // 为什么订阅 userLevel 后在渲染期算、而不写进 zustand 选择器：同一个组件实例会在不同
  // 详情页之间复用（只变路由 id），选择器的缓存结果未必跟着 game 变 —— 这样算没有那个坑。
  const authLoaded = useAuthStore((s) => s.loaded);
  const userLevel = useAuthStore((s) => s.userLevel);
  const canLaunchGame = authLoaded && !!game && canPlay(userLevel, game.gameLevel);

  // 运行状态监控（详情页顶部显示"运行中/已退出/未运行"）。
  const run = useRunState(id ?? "");

  // 修改器：列表 + 下拉开合。修改器目录 = <详情目录>/<游戏名>/修改器/*.exe。
  const [trainers, setTrainers] = useState<{ name: string; exePath: string; icon: string }[]>([]);
  const [trainersOpen, setTrainersOpen] = useState(false);
  const [trainersLoading, setTrainersLoading] = useState(false);
  const [trainersErr, setTrainersErr] = useState(false);
  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    setTrainers([]);
    setTrainersErr(false);
    setTrainersLoading(true);
    api
      .getTrainers(game.id, game.name)
      .then((list) => {
        if (!cancelled) setTrainers(list);
      })
      .catch(() => {
        if (!cancelled) setTrainersErr(true);
      })
      .finally(() => {
        if (!cancelled) setTrainersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [game?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 点击某个修改器 exe：直接启动，不校验等级、不计时长。
  const launchTrainer = async (exePath: string) => {
    try {
      await api.launchTrainer(exePath);
    } catch (e) {
      console.error("启动修改器失败:", e);
    }
  };

  // 应用存档：与修改器同逻辑，目录换成"游戏存档"（<详情目录>/<游戏名>/游戏存档/*.exe）。
  const [saves, setSaves] = useState<{ name: string; exePath: string; icon: string }[]>([]);
  const [savesOpen, setSavesOpen] = useState(false);
  const [savesLoading, setSavesLoading] = useState(false);
  const [savesErr, setSavesErr] = useState(false);
  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    setSaves([]);
    setSavesErr(false);
    setSavesLoading(true);
    api
      .getGameSaves(game.id, game.name)
      .then((list) => {
        if (!cancelled) setSaves(list);
      })
      .catch(() => {
        if (!cancelled) setSavesErr(true);
      })
      .finally(() => {
        if (!cancelled) setSavesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [game?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 点击某个存档 exe：直接启动应用，不校验等级、不计时长。
  const launchSave = async (exePath: string) => {
    try {
      await api.launchSave(exePath);
    } catch (e) {
      console.error("应用存档失败:", e);
    }
  };

  // 用系统默认播放器打开某个视频文件。
  // 内置播放器放不了的封装（mkv/flv/avi…）走这条路 —— 不引入任何解码依赖，
  // 交给人装在机器上的播放器（网吧机器一般都有）。
  const openExternal = async (absPath: string) => {
    try {
      const r = await api.openVideoExternal(absPath);
      if (!r.opened) console.error("系统播放器打开失败:", r.error);
    } catch (e) {
      console.error("系统播放器打开失败:", e);
    }
  };

  // Every game links to its standalone static detail page
  // (Game_Details/<游戏名>/index.html), served by the `yungame-game://` custom
  // scheme so the webview natively loads css/js/images and handles anchors.
  // If none exists, show a 404.
  const [htmlFound, setHtmlFound] = useState(false);
  const [htmlLoading, setHtmlLoading] = useState(true);
  const [serverUrl, setServerUrl] = useState("");
  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    setHtmlLoading(true);
    api
      .getGameHtmlPage(game.name)
      .then((r) => {
        if (!cancelled) {
          setHtmlFound(r.found);
          setHtmlLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHtmlFound(false);
          setHtmlLoading(false);
        }
      });
    api
      .getGameServerUrl()
      .then((u) => {
        if (!cancelled) setServerUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [game?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Absolute URL for the game's page, served by the local HTTP server.
  // 带 `?lang=`：服务器会用这个语言生成注入的「游戏视频」区块文案，保证与界面一致。
  // （页面旁的其它内容由详情页自己的模板决定，不受影响。）
  const gamePageUrl =
    game && serverUrl
      ? `${serverUrl}/games/${encodeURIComponent(game.name)}/index.html?lang=${encodeURIComponent(
          language || "zh-CN"
        )}`
      : "";

  // —— 本地视频（详情目录下的 videos/ 文件夹）——
  // 视频**罗列在详情页 HTML 里**（服务器发页面时注入「游戏视频」区块，按 videos/ 的
  // 子目录分组，见 electron/core/gameDetailInject.ts）—— 不弹浮层、不放在页面外面。
  // 这里只负责两件事：
  //   ① 顶栏显示数量，点一下把页面滚到那个区块（跨源 iframe 父页面滚不了它的内容，得请它自己滚）；
  //   ② 页面里的视频开始/停止播放时让背景音乐让位/恢复。
  //      iframe 是跨源的，父页面收不到 <video> 事件，只能靠注入脚本 postMessage 通知我们。
  const [videos, setVideos] = useState<GameVideoItem[]>([]);
  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    setVideos([]);
    api
      .getGameVideos(game.id, game.name)
      .then((r) => {
        if (!cancelled) setVideos(r.items);
      })
      .catch(() => {
        // 没有视频（或读不到）都不是错误：按钮不显示即可，页面照常。
      });
    return () => {
      cancelled = true;
    };
  }, [game?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 详情页里的视频：开始播 → 背景音乐让位；暂停/放完 → 恢复。
  // playday-video-external：mkv/flv/avi 这类内置播放器解不了的，页面会点名要系统播放器打开
  // （它自己在 iframe 里拉不起系统播放器，只能请主界面代劳）。
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; rel?: string } | null;
      if (!d || typeof d.type !== "string") return;
      const ms = useMusicStore.getState();
      if (d.type === "playday-video-play") {
        ms.duckForVideo();
      } else if (d.type === "playday-video-stop") {
        ms.unduckAfterVideo();
      } else if (d.type === "playday-video-external" && typeof d.rel === "string") {
        const hit = videos.find((v) => v.rel === d.rel);
        if (!hit) return;
        // 系统播放器是个独立窗口，我们感知不到它何时关 —— 只暂停，不自动恢复。
        ms.duckForVideo({ resume: false });
        void openExternal(hit.absPath);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [videos]);

  // 详情页 iframe 的引用。
  // 注：顶栏那个「视频」按钮已按 2026-09-14 需求移除 —— 视频区块由服务器注入到详情页
  // HTML 里（gameDetailInject），页面自己就显示，app 侧再来一个按钮是重复的
  // （原按钮唯一的作用就是"滚到那个区块"）。
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // 主题换过几次 —— 只用来当 iframe 的 key，用来**重载**详情页。
  // 为什么必须重载：页面颜色是服务器发 HTML 那一步注入的（见 electron/core/detailTheme.ts），
  // 已经在看的这个 iframe 不会自己变色。代价说清楚：重载会丢掉页面里的滚动位置、
  // 正在播的视频也会停 —— 但切主题是用户主动做的事，本来就期待"整屏跟着变"，
  // 不重载反而是"我换了主题它没反应"，那样更像 bug。
  const [themeRev, setThemeRev] = useState(0);
  useEffect(() => {
    const onTheme = () => setThemeRev((n) => n + 1);
    window.addEventListener(DETAIL_THEME_EVENT, onTheme);
    return () => window.removeEventListener(DETAIL_THEME_EVENT, onTheme);
  }, []);

  // 「返回」= **切回主页选项卡**（不是关掉本标签）：需求明确"详情内容留着，
  // 再点回来时页面还在"（标签常驻，iframe 不重载）。要关掉就点标签上那个 ×。
  const backButton = (
    <Button variant="ghost" size="sm" onClick={() => activateTab("home")}>
      <ArrowLeft size={15} /> {t("details_back")}
    </Button>
  );

  if (!game) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-[16px_24px_48px]">
        {backButton}
        <div className="p-10 text-center text-dim">{t("details_notFound")}</div>
      </div>
    );
  }

  // 详情页顶部运行状态标签：
  //  - running → "运行中 00:12:34"（实时计时，秒表样式）
  //  - stopped → "游戏已退出 · 最近共运行 00:12:34"
  //  - never   → "游戏未运行"
  // 不显示 unknown（首次轮询未返回时留空，避免闪烁）。
  let runBadge: ReactNode = null;
  if (run.state === "running") {
    runBadge = (
      <span className="run-badge run-badge-running">
        <PlayCircle size={13} />
        {t("details_run_running")} {runClock(run.elapsedSec)}
      </span>
    );
  } else if (run.state === "stopped") {
    runBadge = (
      <span className="run-badge run-badge-stopped">
        {t("details_run_exited", { time: runClock(run.lastSessionSec) })}
      </span>
    );
  } else if (run.state === "never") {
    runBadge = (
      <span className="run-badge run-badge-never">
        {t("details_run_never")}
      </span>
    );
  }

  // Every game links to Game_Details/<游戏名>/index.html:
  //  - loading  → brief spinner
  //  - found    → back button + the page (iframe)
  //  - missing  → back button + a 404 page
  // 修改器下拉内容：列出所有 exe（带图标），点某个直接启动；没有则显示"暂无修改器"。
  const trainerDropdown = (
    <div className="trainer-dropdown">
      {trainersLoading && (
        <div className="trainer-item trainer-item-dim">{t("details_loading")}</div>
      )}
      {!trainersLoading && trainersErr && (
        <div className="trainer-item trainer-item-dim">{t("details_trainers_loadError")}</div>
      )}
      {!trainersLoading && !trainersErr && trainers.length === 0 && (
        <div className="trainer-item trainer-item-dim">{t("details_trainers_none")}</div>
      )}
      {!trainersLoading &&
        !trainersErr &&
        trainers.map((tr) => (
          <button
            key={tr.exePath}
            className="trainer-item trainer-item-btn"
            onClick={() => void launchTrainer(tr.exePath)}
          >
            {tr.icon ? (
              <img className="trainer-item-icon" src={tr.icon} alt="" />
            ) : (
              <Wrench className="trainer-item-icon trainer-item-icon-fallback" size={15} />
            )}
            <span className="trainer-item-name">{tr.name}</span>
            <span className="trainer-item-launch">{t("details_trainers_launch")}</span>
          </button>
        ))}
    </div>
  );

  // 应用存档下拉：列出"游戏存档"目录下的所有 exe，点某个直接应用；没有则显示"暂无存档"。
  const savesDropdown = (
    <div className="trainer-dropdown">
      {savesLoading && (
        <div className="trainer-item trainer-item-dim">{t("details_loading")}</div>
      )}
      {!savesLoading && savesErr && (
        <div className="trainer-item trainer-item-dim">{t("details_saves_loadError")}</div>
      )}
      {!savesLoading && !savesErr && saves.length === 0 && (
        <div className="trainer-item trainer-item-dim">{t("details_saves_none")}</div>
      )}
      {!savesLoading &&
        !savesErr &&
        saves.map((sv) => (
          <button
            key={sv.exePath}
            className="trainer-item trainer-item-btn"
            onClick={() => void launchSave(sv.exePath)}
          >
            {sv.icon ? (
              <img className="trainer-item-icon" src={sv.icon} alt="" />
            ) : (
              <Archive className="trainer-item-icon trainer-item-icon-fallback" size={15} />
            )}
            <span className="trainer-item-name">{sv.name}</span>
            <span className="trainer-item-launch">{t("details_saves_launch")}</span>
          </button>
        ))}
    </div>
  );

  const detailTopbar = (
    // relative：给下面那个"绝对居中"的「开始游戏」按钮当定位基准。
    <div className="relative flex items-center gap-2 border-b border-border bg-base px-5 py-3.5">
      {backButton}
      {/* 视频：**app 侧不显示按钮**（2026-09-14 需求）—— 视频区块由服务器注入到详情页
          HTML 里，页面自己会显示。`videos` 状态仍保留：页面里的 <video> 播放/停止时
          要靠它通知主界面让背景音乐让位（见上面的 postMessage 处理）。
          注：游戏**没有**详情页 HTML 时也就没有视频区块（视频只存在于 HTML 里）。 */}
      {/* 修改器按钮：**只有真的有修改器才显示**（"修改器"目录里至少有一个 .exe）。
          目录不存在、目录为空、或扫描失败（都会得到空列表）时都不显示 —— 否则是个
          点开只有"暂无修改器"的无效入口。数据来自 get_game_trainers。 */}
      {trainers.length > 0 && (
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTrainersOpen((v) => !v)}
            className="flex items-center gap-1.5"
          >
            <Wrench size={15} /> {t("details_trainers")}
          </Button>
          {trainersOpen && trainerDropdown}
        </div>
      )}
      {/* 应用存档按钮：与修改器同一条规则 —— "游戏存档"目录里没有 .exe 就不显示。 */}
      {saves.length > 0 && (
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSavesOpen((v) => !v)}
            className="flex items-center gap-1.5"
          >
            <Archive size={15} /> {t("details_saves")}
          </Button>
          {savesOpen && savesDropdown}
        </div>
      )}
      {/* 「开始游戏」（2026-09-15 需求）：**绝对居中** —— 不靠 flex 顺序，左边
          「返回 / 修改器 / 应用存档」有几个都不影响它落在正中间。
          显示条件见上面 canLaunchGame（黄金版看钻石版游戏不渲染这个按钮）。
          行为（用户要求"不要太严格"）：游戏运行中也照旧可点，点了就是再启动一次。 */}
      {canLaunchGame && (
        <Button
          size="sm"
          className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5"
          onClick={() => void launchGame(game.id)}
        >
          <Play size={15} fill="currentColor" /> {t("details_play")}
        </Button>
      )}
      <div className="ml-auto">{runBadge}</div>
    </div>
  );

  // 三种状态：加载中 / 找到资料页（iframe）/ 没找到（404）。
  // 先把"内容"算出来，最后统一挂播放浮层 —— 浮层必须是 iframe 的兄弟节点才能盖住它，
  // 所以不能只塞进某个分支里（否则 404 的游戏就播不了视频）。
  let content: ReactNode;
  if (htmlLoading) {
    content = (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {detailTopbar}
        <div className="flex items-center justify-center p-10 text-sm text-secondary-text">
          {t("details_loading")}
        </div>
      </div>
    );
  } else if (htmlFound) {
    // 高度用 flex 撑满（而不是写死 100vh 减一个数）：外壳里除了顶栏还有底部状态栏，
    // 原来那个 calc(100vh-56px) 既漏算了顶栏、也没给状态栏留位置，底部会被裁掉。
    content = (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {detailTopbar}
        <iframe
          ref={iframeRef}
          // key = 主题版本：换主题时重建它 → 重新请求页面（拿到注入后的新配色）。
          key={themeRev}
          // 底色用 --bg-base 而不是 bg-white：深色主题下，页面自身绘制出来之前
          // 那一下白底很扎眼（详情页现在会被注入成深色的）。
          className="block min-h-0 w-full flex-1 border-0 bg-base"
          title={`${game.name} page`}
          src={gamePageUrl}
          // Allow the embedded static page's own player (DPlayer / <video> /
          // YouTube embed) to enter fullscreen. Without this, the browser
          // blocks `requestFullscreen()` inside a cross-origin iframe.
          // 只写 allow、不写 allowFullScreen（2026-09-15）：两个同时写时 React 会警告
          // "Allow attribute will take precedence over 'allowfullscreen'."，而 allow 里的
          // fullscreen 本来就是同一个权限、且优先级更高 —— 删掉冗余那个**不改变任何行为**
          // （一直是 allow 生效），只是让控制台干净。
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
        />
      </div>
    );
  } else {
    // 404: no static page for this game（没有详情页 HTML 就没有视频区块 ——
    // 视频是服务器注入进 HTML 的，app 侧自 2026-09-14 起不再单独展示视频）。
    content = (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {detailTopbar}
        <div className="flex flex-col items-center p-10 text-center">
          <div className="mb-2 text-[72px] font-extrabold leading-none text-accent">404</div>
          <p className="m-0">{t("details_page404", { name: game.name })}</p>
          <p className="text-[13px] text-secondary-text">{t("details_page404hint")}</p>
        </div>
      </div>
    );
  }

  return <>{content}</>;
}
