// 预加载脚本：在渲染进程和主进程之间架桥。
// 用 contextBridge 把 ipc 调用、事件订阅和安全命名变量暴露给渲染进程，
// 渲染进程不能直接 require electron，只能通过 window 上的桥接访问。
//
// 注意：preload 运行在 Electron 的沙箱环境（sandbox_bundle），**不能 require 自定义
// 相对路径模块**（如 ./config / ../build.config），否则加载失败导致 window.ipc 不注入。
// 实测（2026-09-15 真机探针）：sandboxed=true、require("./sibling.js") 报
// "module not found"、而 ipcRenderer.sendSync 可用 —— 所以产品名只能同步问主进程。
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

// 产品名：唯一来源是 build.config.ts 的 APP_NAME，由主进程的 "get_app_name" 同步回值。
// 为什么用 sendSync 而不是 invoke：这是模块加载期就要用的值，异步取会让
// electronConfig.appName 先空后有值（窗口标题 / 状态栏的版本徽标会闪一下）。
// 兜底：没注册 handler 时 sendSync 返回 undefined（**不抛异常**）→ 退化成空串；
// 最坏情况只是"名字没显示"，绝不会让 window.ipc 注入失败（那会整个界面崩）。
const APP_NAME = ipcRenderer.sendSync("get_app_name") || "";

// 暴露 ipc 桥接：渲染进程用 window.ipc.invoke("命令名", 参数) 调主进程。
// 同时暴露 on(channel, listener) 用于订阅主进程发来的事件（如 notification）。
contextBridge.exposeInMainWorld("ipc", {
  invoke: (channel: string, args?: unknown) => ipcRenderer.invoke(channel, args),
  send: (channel: string, args?: unknown) => ipcRenderer.send(channel, args),
  // 订阅主进程事件：payload 在 event.payload 字段（与 Tauri listen 保持一致）。
  on: (channel: string, listener: (payload: unknown) => void) => {
    const wrapped = (_e: IpcRendererEvent, payload: unknown) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    // 返回取消订阅函数。
    return () => ipcRenderer.off(channel, wrapped);
  },
});

// 暴露安全的命名配置：渲染进程用 window.electronConfig.appName 显示产品名。
contextBridge.exposeInMainWorld("electronConfig", {
  appName: APP_NAME,
});