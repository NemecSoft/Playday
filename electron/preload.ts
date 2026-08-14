// 预加载脚本：在渲染进程和主进程之间架桥。
// 用 contextBridge 把 ipc 调用、事件订阅和安全命名变量暴露给渲染进程，
// 渲染进程不能直接 require electron，只能通过 window 上的桥接访问。
//
// 注意：preload 运行在 Electron 的沙箱环境（sandbox_bundle），**不能 require 自定义
// 相对路径模块**（如 ./config），否则加载失败导致 window.ipc 不注入。所以这里
// 直接把产品名作为常量内联（与 build.config.ts 的 APP_NAME 保持一致，改时需同步）。
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

// 产品名（必须与 build.config.ts 的 APP_NAME 一致；preload 沙箱里无法 import config）。
// 由于渲染进程窗口标题其实由主进程创建窗口时设置，这里主要用于 preload 暴露的
// electronConfig.appName，前端可用来显示"标题上/公告上的变量名"。
const APP_NAME = "YunGame";

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