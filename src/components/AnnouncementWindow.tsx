// 公告窗口（独立引导窗口，类似微信的登录界面）。
// 这是独立 BrowserWindow 加载的专用页面：显示公告内容 + "进入系统"按钮。
// 点了"进入系统" → 调主进程 enter_system → 主进程关闭本窗口并创建主窗口。
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
        <div className="announcement-body">
          <div className="announcement-scroll">
            <div
              className="announcement-content"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
        <div className="announcement-footer">
          <button
            type="button"
            className="announcement-enter-btn"
            onClick={handleEnter}
          >
            进入系统
          </button>
        </div>
      </div>
    </div>
  );
}
