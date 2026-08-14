// Game detail page (route /game/:id).
// Rich HTML content: play button, description, developer / release date /
// rating, how-to-play guide (HTML), screenshot gallery (GIF supported) and
// gameplay videos. Fully localized via i18n.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGamesStore } from "../stores/gamesStore";
import { useI18n } from "../i18n";
import { api } from "../api/client";
import { ArrowLeft, PlayCircle } from "lucide-react";
import { Button } from "../components/ui/button";

// 把秒数格式化成"时:分:秒"，比如 3661 秒 → "1:01:01"。
function formatDuration(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

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

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const games = useGamesStore((s) => s.games);

  const game = useMemo(() => games.find((g) => g.id === id), [games, id]);

  // 运行状态监控（详情页顶部显示"运行中/已退出/未运行"）。
  const run = useRunState(id ?? "");

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
  const gamePageUrl =
    game && serverUrl
      ? `${serverUrl}/games/${encodeURIComponent(game.name)}/index.html`
      : "";

  const backButton = (
    <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
      <ArrowLeft size={15} /> {t("details_back")}
    </Button>
  );

  if (!game) {
    return (
      <div className="h-full overflow-y-auto p-[16px_24px_48px]">
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
        {t("details_run_running")} {formatDuration(run.elapsedSec)}
      </span>
    );
  } else if (run.state === "stopped") {
    runBadge = (
      <span className="run-badge run-badge-stopped">
        {t("details_run_exited", { time: formatDuration(run.lastSessionSec) })}
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
  const detailTopbar = (
    <div className="flex items-center gap-2 border-b border-border bg-base px-5 py-3.5">
      {backButton}
      <div className="ml-auto">{runBadge}</div>
    </div>
  );

  if (htmlLoading) {
    return (
      <div className="h-full overflow-y-auto">
        {detailTopbar}
        <div className="flex items-center justify-center p-10 text-sm text-secondary-text">
          {t("details_loading")}
        </div>
      </div>
    );
  }

  if (htmlFound) {
    return (
      <div className="h-full overflow-y-auto">
        {detailTopbar}
        <iframe
          className="block h-[calc(100vh-56px)] w-full border-0 bg-white"
          title={`${game.name} page`}
          src={gamePageUrl}
          // Allow the embedded static page's own player (DPlayer / <video> /
          // YouTube embed) to enter fullscreen. Without this, the browser
          // blocks `requestFullscreen()` inside a cross-origin iframe.
          allowFullScreen
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
        />
      </div>
    );
  }

  // 404: no static page for this game.
  return (
    <div className="h-full overflow-y-auto">
      {detailTopbar}
      <div className="flex flex-col items-center p-10 text-center">
        <div className="mb-2 text-[72px] font-extrabold leading-none text-accent">404</div>
        <p className="m-0">{t("details_page404", { name: game.name })}</p>
        <p className="text-[13px] text-secondary-text">{t("details_page404hint")}</p>
      </div>
    </div>
  );
}
