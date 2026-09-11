// 错误收集器（Error Collector）：收集主进程崩溃/未捕获异常、渲染进程崩溃，
// 生成统一的 CrashReport，写入本地日志，并交给崩溃处理器窗口展示/上报。
// 对齐 UnityCrashHandler64 的"崩溃后弹窗上报"场景。
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { configRoot } from "./paths";
// CrashReport 类型单一事实来源在 shared/models.ts，这里复用。
export type { CrashReport } from "../../shared/models";
import type { CrashReport } from "../../shared/models";

/** 生成本地日志目录并返回路径 */
function logsDir(): string {
  const dir = path.join(configRoot(), "logs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 生成一个 CrashReport */
function makeReport(
  type: CrashReport["type"],
  message: string,
  stack?: string,
  reason?: string,
): CrashReport {
  return {
    id: `crash-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    type,
    message,
    stack,
    reason,
    appVersion: app.getVersion?.() || "unknown",
    platform: process.platform,
    osRelease: process.getSystemVersion?.() || process.platform,
    arch: process.arch,
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
  };
}

/** 把崩溃报告写入本地日志文件（幂等，便于本地排查） */
export function saveCrashLog(report: CrashReport): string {
  const file = path.join(logsDir(), `${report.id}.log`);
  const text = [
    `[${report.timestamp}]`,
    `type: ${report.type}`,
    `appVersion: ${report.appVersion}`,
    `platform: ${report.platform} (${report.osRelease}) ${report.arch}`,
    `cwd: ${report.cwd}`,
    `message: ${report.message}`,
    report.reason ? `reason: ${report.reason}` : "",
    report.stack ? `\n--- stack ---\n${report.stack}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  try {
    fs.writeFileSync(file, text, "utf-8");
  } catch {
    // 写日志失败不影响后续
  }
  return file;
}

/**
 * 注册全局错误收集：
 *  - process.on('uncaughtException')：主进程未捕获异常（严重）
 *  - process.on('unhandledRejection')：主进程未处理 Promise
 *  - app.on('render-process-gone')：渲染进程崩溃
 *
 * 回调由外部注入（main.ts 用它决定是否弹崩溃处理窗口），避免本文件耦合窗口逻辑。
 */
export function registerErrorCollector(
  onCrash: (report: CrashReport) => void,
): void {
  process.on("uncaughtException", (err) => {
    const report = makeReport(
      "main-exception",
      err?.message || String(err),
      err?.stack,
    );
    saveCrashLog(report);
    onCrash(report);
  });

  process.on("unhandledRejection", (reason) => {
    const r = reason as { message?: string; stack?: string };
    const report = makeReport(
      "main-rejection",
      r?.message || String(reason),
      r?.stack,
    );
    saveCrashLog(report);
    onCrash(report);
  });

  app.on("render-process-gone", (_e, _wc, details) => {
    const report = makeReport(
      "renderer-gone",
      `渲染进程崩溃: ${details.reason}`,
      undefined,
      details.reason,
    );
    saveCrashLog(report);
    onCrash(report);
  });
}
