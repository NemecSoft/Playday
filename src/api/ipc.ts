// Playday 前端传输层：统一封装"桌面端(Electron IPC) / 网站端(HTTP)"两套通道。
//
// 目标是"一套代码，双端运行"：
//  - 桌面端：preload 通过 contextBridge 暴露 window.ipc（Electron IPC）
//  - 网站端：没有 window.ipc，改为 fetch 到同一个 channel 名的 HTTP 路由
//
// 前端 stores/components 统一从本文件 import invoke / call，不关心底层走哪条通道。
// 这样 Electron 主进程和 Node 网站后端用同一套 channel 语义，前端代码零改动。

declare global {
  interface Window {
    ipc?: {
      invoke: (channel: string, args?: unknown) => Promise<unknown>;
      send: (channel: string, args?: unknown) => void;
      // on 返回"取消订阅"函数（preload.ts 里 return () => ipcRenderer.off(...)）。
      // 以前这里声明成 void，导致调用 unsubscribe() 报 TS2349「不可调用」。
      on?: (channel: string, listener: (payload: unknown) => void) => () => void;
    };
    electronConfig?: {
      appName: string;
    };
  }
}

// 判断当前是否在 Electron（桌面端）：有 window.ipc 就走 IPC。
export function isDesktop(): boolean {
  return typeof window !== "undefined" && !!window.ipc;
}

// 调主进程/后端命令并拿返回值。
// cmd 是命令名（桌面端对应 ipcMain.handle 的 channel，网站端对应 /api/<cmd> 路由），必须完全一致。
// args 是传给后端的参数（对象包装风格），由两端 handler 自己解析。
export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (window.ipc) {
    // 桌面端：Electron IPC
    return window.ipc.invoke(cmd, args) as Promise<T>;
  }
  // 网站端：HTTP POST /api/<cmd>
  return fetch(`/api/${encodeURIComponent(cmd)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args ?? {}),
  }).then((r) => {
    if (!r.ok) {
      return r.json().then((e) => Promise.reject(new Error(e?.error || `HTTP ${r.status}`)));
    }
    return r.json() as Promise<T>;
  });
}

// invoke 的别名，供调用方更直观地表达"这是发一条命令、等一个结果"。
export function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(cmd, args);
}
