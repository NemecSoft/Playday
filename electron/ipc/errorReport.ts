// 错误上报 / 崩溃报告 IPC 命令。
// 崩溃处理器窗口（UnityCrashHandler64 风格）调用这些命令：
//  - send_crash_report：把崩溃报告发到收件人邮箱（SMTP，带聚合限流）
//  - save_crash_locally：只写本地日志，不发送
import { ipcMain } from "electron";
import { sendCrashEmail, type ErrorReportConfig } from "../core/mailSender";
import type { CrashReport } from "../core/errorCollector";
import { getCrashReport } from "../windows";
import { readSettings } from "../core/settings";
import { registerCommand } from "./registry";

export function registerErrorReportIpc(ipc: typeof ipcMain) {
  // 崩溃处理器窗口读取当前崩溃报告（崩溃时由 windows.setCrashReport 存下）。
  registerCommand(
    ipc,
    "get_crash_report",
    async () => {
      return getCrashReport();
    },
    { log: true }
  );

  // 发送崩溃报告到收件人邮箱。cfg 覆盖用（若前端传了完整配置则用之，否则用设置里的）。
  registerCommand(
    ipc,
    "send_crash_report",
    async ({
      report,
      config,
    }: {
      report: CrashReport;
      config?: Partial<ErrorReportConfig>;
    }) => {
      const settings = readSettings();
      const base = settings.errorReport as ErrorReportConfig | undefined;
      const cfg: ErrorReportConfig = {
        enabled: base?.enabled ?? false,
        smtpHost: base?.smtpHost || "smtp.qq.com",
        smtpPort: base?.smtpPort ?? 465,
        smtpUser: base?.smtpUser || "",
        smtpPass: base?.smtpPass || "",
        toEmail: base?.toEmail || "97407198@qq.com",
        maxPerDay: base?.maxPerDay ?? 3,
        ...(config || {}),
      };
      return sendCrashEmail(report, cfg);
    },
    { field: "report", log: true }
  );

  // 只写本地日志（不发送邮件）。
  registerCommand(
    ipc,
    "save_crash_locally",
    async ({ report }: { report: CrashReport }) => {
      // 本地日志已在 errorCollector.saveCrashLog 写入；这里返回成功即可。
      return { ok: true };
    },
    { field: "report", log: true }
  );
}
