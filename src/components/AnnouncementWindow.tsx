// 公告窗口（独立引导窗口，类似微信登录界面）。
// 2026-08-17 简化版：
//   - 暂时去掉"真·异形（透明抠图）"样式（异形窗口 + 顶部 ann-crown 突起）
//   - 暂时去掉 Live2D 看板娘立绘
//   - 改为普通矩形面板（直接占满 BrowserWindow 内容区，圆角 + 深色背景）
//   - 保留荧光特效：announcement-aurora 极光动画、ann-enter-btn 发光按钮、announcement.html 里的 NEW 徽章/星星由用户文案控制
// 点"进入系统" → 调主进程 enter_system → 主进程关本窗口、建主窗口。
import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function AnnouncementWindow() {
  const [html, setHtml] = useState("");

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
  const handleEnter = () => {
    void api.enterSystem();
  };

  return (
    <div className="announcement-window">
      <div className="announcement-card">
        {/* 顶部：极光背景动画（保留荧光特效）。z-index 最低，铺在卡片下层。 */}
        <div className="announcement-aurora" aria-hidden="true" />

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
          <button
            type="button"
            className="ann-enter-btn"
            onClick={handleEnter}
          >
            进入系统
          </button>
        </div>
      </div>
    </div>
  );
}
