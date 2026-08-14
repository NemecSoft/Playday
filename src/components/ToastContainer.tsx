// 简单 toast 通知容器：监听主进程 push 的 "notification" 事件，4 秒自动消失。

import { useEffect, useState } from "react";

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
        }, 4000);
      }
    );
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="fixed bottom-[18px] right-[18px] z-[2000] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          className="min-w-[220px] rounded-md border border-border-strong border-l-[3px] border-l-accent bg-panel p-3 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
          key={t.id}
        >
          <div className="mb-0.5 font-semibold">{t.title}</div>
          {t.body && <div className="text-xs text-secondary-text">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}