// 公告窗口（独立引导窗口，类似微信登录界面）。
// 2026-08-17 简化版：
//   - 暂时去掉"真·异形（透明抠图）"样式（异形窗口 + 顶部 ann-crown 突起）
//   - 暂时去掉 Live2D 看板娘立绘
//   - 改为普通矩形面板（直接占满 BrowserWindow 内容区，圆角 + 深色背景）
//   - 保留荧光特效：announcement-aurora 极光动画、ann-enter-btn 发光按钮、announcement.html 里的 NEW 徽章/星星由用户文案控制
// 点"进入系统" → 调主进程 enter_system → 主进程关本窗口、建主窗口。
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api } from "../api/client";
import { useI18n } from "../i18n";

export default function AnnouncementWindow() {
  const { t } = useI18n();
  const [html, setHtml] = useState("");
  // 两道"进系统"门禁（判定都在主进程，这里查只是为了早点提示并锁住按钮）：
  //   ① 服务器维护中（Status=0 = 该等级维护中）
  //   ② 游戏库过旧（权威库超过 30 天没变化 = 本机版本太老，得找管理员要新版）
  const [maintenance, setMaintenance] = useState(false);
  const [level, setLevel] = useState(0);
  const [outdated, setOutdated] = useState(false);
  const [ageDays, setAgeDays] = useState<number | null>(null);

  // 一启动就把两个门禁状态各问一次（两个请求并行，不互相等）。
  useEffect(() => {
    let alive = true;
    api
      .getServerStatus()
      .then((s) => {
        if (!alive) return;
        setMaintenance(s.maintenance);
        setLevel(s.level);
      })
      .catch(() => {
        /* 取不到就按正常营业（主进程进入时还会再拦一次） */
      });
    api
      .getLibraryAge()
      .then((a) => {
        if (!alive) return;
        setOutdated(a.outdated);
        setAgeDays(a.ageDays);
      })
      .catch(() => {
        /* 取不到就按"库正常"（主进程进入时还会再拦一次） */
      });
    return () => {
      alive = false;
    };
  }, []);

  // 从主进程读取公告 HTML。
  useEffect(() => {
    let alive = true;
    api
      .getAnnouncement()
      .then((r) => {
        if (!alive) return;
        const body = r.html && r.html.trim().length > 0 ? r.html : "";
        setHtml(
          body ||
            '<div class="announcement-hero"><h1>Welcome</h1><p>Your game library, reimagined.</p></div>',
        );
      })
      .catch(() => {
        /* 用默认欢迎页 */
      });
    return () => {
      alive = false;
    };
  }, []);

  // 点击"进入系统" → 通知主进程创建主窗口。
  // 主进程会在进入前把两道门禁再判一次；被拒时这里切到对应状态，避免用户点了没反应。
  const handleEnter = async () => {
    const r = await api.enterSystem();
    if (!r || r.ok !== false) return;
    if (r.reason === "maintenance") {
      setMaintenance(true);
      if (typeof r.level === "number") setLevel(r.level);
      return;
    }
    if (r.reason === "outdated") {
      setOutdated(true);
      if (typeof r.ageDays === "number") setAgeDays(r.ageDays);
    }
  };

  // 任一门禁命中 → 不允许进入系统，底部只给"退出"。
  const blocked = maintenance || outdated;

  return (
    <div className="announcement-window">
      <div className="announcement-card">
        {/* 顶部：极光背景动画（保留荧光特效）。z-index 最低，铺在卡片下层。 */}
        <div className="announcement-aurora" aria-hidden="true" />

        {/* 拦截提示条：压在公告之上，必须一眼看到（需求：不能进入系统时要说清楚原因）。
            两种命中情况共用同一套样式，最多显示一条（都命中时先报维护——那是服务器状态，
            过旧是本机版本问题，两者处理方式不同：等待 / 找管理员要新版）。 */}
        {maintenance ? (
          <GateBanner
            title={t("maintenance_title")}
            body={`${t("maintenance_body")}${
              level > 0 ? `（${level >= 2 ? t("tier_diamond") : t("tier_gold")}）` : ""
            }`}
          />
        ) : outdated ? (
          <GateBanner
            title={t("outdated_title")}
            body={t("outdated_body", { days: ageDays ?? 0 })}
          />
        ) : null}

        {/* 内容区：公告 HTML（用户在 announcements/announcement.html 里写的 NEW 徽章/星星都会保留） */}
        <div className="announcement-body">
          <div className="announcement-scroll">
            <div
              className="ann-html"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>

        {/* 底部"进入系统"按钮（荧光发光样式保留） */}
        <div className="announcement-footer">
          {blocked ? (
            // 被门禁拦住（维护中 / 库过旧）：只给"退出"（需求：不能进入系统，直接退出）
            <button type="button" className="ann-enter-btn ann-exit-btn" onClick={() => void api.quit()}>
              {t("maintenance_exit")}
            </button>
          ) : (
            <button type="button" className="ann-enter-btn" onClick={() => void handleEnter()}>
              进入系统
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 公告窗口顶部的"拦截条"：维护中 / 库过旧共用。
 * 样式在 global.css 的 .ann-gate（红警示色 + 压在公告内容之上）。
 */
function GateBanner({ title, body }: { title: string; body: string }) {
  return (
    <div className="ann-gate" role="alert">
      <AlertTriangle size={16} />
      <div>
        <div className="ann-gate-title">{title}</div>
        <div className="ann-gate-body">{body}</div>
      </div>
    </div>
  );
}
