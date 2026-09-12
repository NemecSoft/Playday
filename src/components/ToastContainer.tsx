// 顶部提示条容器：监听主进程 push 的 "notification" 事件，**5 秒**自动消失。
//
// 为什么放**顶部**而不是底部角落：目前所有通知都是"操作失败"（无法启动 / 等级不足 /
// 备份失败），而玩家刚点完"开始游戏"，视线在屏幕中部 —— 放底部很容易被忽略，
// 表现就像"点了没反应"（这正是当初加这些提示要解决的问题）。
// 位置略低于顶部中央的"正在启动"横幅（.launching-banner 在 top:14px），避免两者叠在一起。
// 长错误（如带完整路径的启动失败）靠 max-w + break-words 换行，不撑出屏幕；
// 容器 pointer-events-none —— 它只是通知，不该挡住在下面的搜索框/按钮。

import { useEffect, useState } from "react";

/** 停留时长：足够读完一条带长路径的错误。 */
const TOAST_MS = 5000;

interface Toast {
  id: number;
  title: string;
  body: string;
}

let idCounter = 0;

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    // 桌面端：通过 preload 暴露的 window.ipc.on 订阅主进程事件。
    // 网站端没有 window.ipc，跳过（Web 通知后续可用 EventSource 实现）。
    if (!window.ipc?.on) return;
    const unsubscribe = window.ipc.on(
      "notification",
      (raw: unknown) => {
        const payload = raw as { title?: string; body?: string };
        const id = ++idCounter;
        setToasts((t) => [
          ...t,
          { id, title: payload.title || "", body: payload.body || "" },
        ]);
        setTimeout(() => {
          setToasts((t) => t.filter((x) => x.id !== id));
        }, TOAST_MS);
      }
    );
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="pointer-events-none fixed left-1/2 top-[64px] z-[2000] flex w-full max-w-[720px] -translate-x-1/2 flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          className="pointer-events-none min-w-[220px] max-w-full break-words rounded-md border border-border-strong border-l-[3px] border-l-accent bg-panel p-3 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
          key={t.id}
        >
          <div className="mb-0.5 font-semibold">{t.title}</div>
          {t.body && <div className="text-xs text-secondary-text">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}