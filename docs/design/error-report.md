# 错误收集与崩溃报告（Error Report / Crash Reporter）设计

## 一、需求背景

Playday 是 Electron 桌面应用。当前只把 JS 错误**显示在本地 boot 屏**（`src/main.tsx` 的 `window.onerror`），没有**上报到开发者邮箱**。用户希望：应用出错/崩溃时，能把错误**发送到邮箱**（如 `97407198@qq.com`），便于远程排查。

用户特别要求：主进程崩溃时，**像 UnityCrashHandler64 那样**——崩溃后弹出一个独立的崩溃处理器窗口，收集崩溃信息，用户可点"发送崩溃报告"把日志发到邮箱。

## 二、需求确认

1. **发送方式**：**SMTP 直发**（QQ 邮箱 smtp.qq.com，需发件账号 + 授权码），从 Electron 主进程发信到收件人邮箱。
2. **收集范围**：**主进程崩溃/未捕获异常**（对齐 UnityCrashHandler64 的崩溃上报场景），也覆盖渲染进程崩溃（render-process-gone）。
3. **发送频率**：**聚合限流**——错误聚合成一条邮件，每天最多发 N 封（如 3 封/天），避免刷屏。
4. 目标收件人：`97407198@qq.com`（可在配置里改）。

## 三、总体流程

```
主进程/渲染进程出错（崩溃、未捕获异常）
      │
      ▼
错误收集器（collector）捕获并记录（含堆栈 + 系统信息 + 版本 + 时间）
      │
      ▼
弹出"崩溃处理器"窗口（UnityCrashHandler64 风格）
   ├── 显示崩溃摘要
   ├── [发送崩溃报告]：SMTP 发到收件人邮箱
   └── [仅本地查看/不发送]：只写本地日志
      │
      ▼
发送 → 聚合限流（当天最多 N 封，多条错误合并一封）
```

## 四、主进程崩溃检测（collector）

主进程监听（`electron/core/errorCollector.ts`）：
- `process.on("uncaughtException", cb)` —— 主进程未捕获异常
- `process.on("unhandledRejection", cb)` —— 主进程未处理 Promise
- `app.on("render-process-gone", (e, wc, details))` —— 渲染进程崩溃（reason: crashed/killed/oom）
- `child-process-gone` / `utility-process-gone` —— 子进程崩溃

收集信息：
```ts
interface CrashReport {
  id: string;              // 唯一 id
  type: "main-exception" | "main-rejection" | "renderer-gone" | "child-gone";
  message: string;         // 错误信息
  stack?: string;          // 堆栈
  reason?: string;         // 崩溃原因（render-process-gone 的 reason）
  appVersion: string;      // 应用版本
  platform: string;        // win32 / darwin 等
  osRelease: string;       // 系统版本
  arch: string;            // x64 / arm64
  timestamp: string;       // ISO 时间
  userAgent?: string;      // 渲染 UA
  cwd: string;             // 工作目录
  extra?: Record<string, unknown>; // 附加信息
}
```

## 五、崩溃处理器窗口（CrashHandlerWindow，UnityCrashHandler64 风格）

- 主进程崩溃时，`main.ts` 创建**独立的小窗口**（类似 UnityCrashHandler64）。
- 窗口只包含崩溃处理 UI（非主界面）：崩溃摘要 + 两个按钮。
- **要点**：主进程 `uncaughtException` 后应用可能不稳定，窗口要**独立渲染、最小逻辑**；优先用 `crash` 事件 + 独立 BrowserWindow。
- 按钮：
  - **发送崩溃报告** → 触发 SMTP 发送（异步），发送成功显示"已发送"，失败显示错误。
  - **仅本地查看** → 写本地日志（`<数据根>/logs/crash-<id>.log`），关闭窗口。

## 六、SMTP 发送（sender）

用 QQ 邮箱 SMTP 直发（Playday 主进程）：
- 服务器：`smtp.qq.com`，端口 465（SSL）或 587（STARTTLS）
- 认证：发件账号（QQ 邮箱）+ **授权码**（QQ 邮箱设置里生成，非登录密码）
- 收件人：`97407198@qq.com`（可配置）
- 内容：崩溃报告（类型/信息/堆栈/版本/系统/时间）+ 应用名/版本标识

**技术实现**：
- 方案：用 `nodemailer`（Node 标准 SMTP 库）——最稳定，支持 QQ SMTP 的 465/SSL。需安装依赖。
- 若不想加依赖：手写 Node SMTP 客户端（socket + 465 SSL + AUTH LOGIN），工作量较大。**优先 nodemailer**。

## 七、聚合限流（rate-limit）

- 同一崩溃报告 id 只发一次。
- **每天最多发 N 封**（默认 3，可配）：当天第 N+1 封起排队/丢弃，次日重置。
- 多条错误**合并**成一封（如果同一天多崩溃，聚合成一封含多条摘要）。
- 限流状态持久化（`<数据根>/logs/sent-crash.json`，记录当天发送计数）。

## 八、配置（config.json）

`AppSettings` 新增错误上报配置：
```ts
// 错误上报/崩溃报告
errorReport: {
  enabled: boolean;        // 是否启用（默认 false，隐私考虑）
  smtpHost: string;        // 默认 smtp.qq.com
  smtpPort: number;        // 默认 465
  smtpUser: string;        // 发件 QQ 邮箱
  smtpPass: string;        // 授权码（非登录密码）
  toEmail: string;         // 收件人（默认 97407198@qq.com）
  maxPerDay: number;       // 每天最多发送封数（默认 3）
}
```

## 九、实现步骤

1. **依赖**：安装 `nodemailer`。
2. **collector**：`electron/core/errorCollector.ts` 监听 uncaughtException / unhandledRejection / render-process-gone，收集 CrashReport 并写入本地日志。
3. **崩溃窗口**：`electron/windows.ts` 加 `createCrashHandlerWindow(report)`；`electron/ipc/errorReport.ts` 注册 `send_crash_report` / `save_crash_locally` IPC。
4. **sender**：`electron/core/mailSender.ts` 用 nodemailer 发 SMTP 邮件（聚合限流）。
5. **前端崩溃窗口 UI**：`src/components/CrashHandlerWindow.tsx`（?window=crash 渲染）。
6. **配置**：AppSettings 加 `errorReport`，前后端同步。
7. **接线**：`main.ts` 注册 collector；主进程未捕获异常时创建崩溃窗口。

## 十、风险与注意
- **隐私**：崩溃报告含本地路径/堆栈，默认**关闭**（errorReport.enabled=false），用户主动配置才启用。
- **授权码**：QQ 邮箱授权码是敏感信息，存 config.json（与其它设置同级），提醒用户不要泄露。
- **崩溃后稳定性**：`uncaughtException` 后创建窗口可能不稳，崩溃窗口保持**最小、独立**。
- **不阻塞**：SMTP 发送异步，不阻塞应用退出；发送失败只记日志。
- **重复崩溃**：限流 + 同 id 去重，避免崩溃循环刷爆邮箱。
