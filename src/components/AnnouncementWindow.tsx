// 公告窗口（独立引导窗口，类似微信登录界面）。
// 采用"真·异形（透明抠图）"样式：窗口背景透明（主进程 transparent:true），
// 前端画一个四周透明、带圆角/装饰的异形面板 + 右下角看板娘立绘，
// 透明像素透出桌面，窗口形状随面板轮廓走。
// 点"进入系统" → 调主进程 enter_system → 主进程关本窗口、建主窗口。
import { useEffect, useState } from "react";
import { api } from "../api/client";
import Live2DMascot from "./Live2DMascot";

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
    <div className="ann-window">
      {/* 异形面板：四周透明、带圆角与顶部/底部装饰突起 */}
      <div className="ann-shape">
        {/* 顶部装饰突起（营造异形轮廓） */}
        <div className="ann-crown" aria-hidden="true" />

        {/* Live2D 看板娘：每次启动随机一个角色，自动注入 #waifu */}
        <Live2DMascot />

        {/* 内容区 */}
        <div className="ann-content">
          <div className="ann-scroll">
            <div
              className="ann-html"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>

        {/* 底部"进入系统"按钮 */}
        <div className="ann-footer">
          <button type="button" className="ann-enter-btn" onClick={handleEnter}>
            进入系统
          </button>
        </div>
      </div>
    </div>
  );
}
