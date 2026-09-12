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
  // 服务器维护状态（Status=0 = 该等级维护中）：维护时提示 + 只能退出，不能进系统。
  const [maintenance, setMaintenance] = useState(false);
  const [level, setLevel] = useState(0);

  // 一启动就问一次维护状态：主进程按"当前等级那一行"的 Status 判定。
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
  // 主进程会在进入前再判一次维护状态；被拒时这里切到维护态，避免用户点了没反应。
  const handleEnter = async () => {
    const r = await api.enterSystem();
    if (r && r.ok === false && r.reason === "maintenance") {
      setMaintenance(true);
      if (typeof r.level === "number") setLevel(r.level);
    }
  };

  return (
    <div className="announcement-window">
      <div className="announcement-card">
        {/* 顶部：极光背景动画（保留荧光特效）。z-index 最低，铺在卡片下层。 */}
        <div className="announcement-aurora" aria-hidden="true" />

        {/* 维护提示：压在公告之上，必须一眼看到（需求：自动提示服务器在维护，不能进入系统）。
            按等级说明 —— 黄金版定期维护时钻石版照常营业。 */}
        {maintenance && (
          <div className="ann-maintenance" role="alert">
            <AlertTriangle size={16} />
            <div>
              <div className="ann-maintenance-title">{t("maintenance_title")}</div>
              <div className="ann-maintenance-body">
                {t("maintenance_body")}
                {level > 0 ? `（${level >= 2 ? t("tier_diamond") : t("tier_gold")}）` : ""}
              </div>
            </div>
          </div>
        )}

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
          {maintenance ? (
            // 维护中：只给"退出"（需求：不能进入系统，直接退出）
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
