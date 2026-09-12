// 邮件发送器（SMTP）：用 nodemailer 直发崩溃报告到收件人邮箱，带聚合限流。
// 对齐 QQ 邮箱 SMTP（smtp.qq.com:465 SSL，需发件账号 + 授权码，非登录密码）。
import * as fs from "fs";
import * as path from "path";
import { configRoot } from "./paths";
import type { CrashReport } from "./errorCollector";

// ErrorReportConfig 的单一事实来源是 shared/models.ts（原来是本文件手抄一份，
// 与 shared 的那份重复；加字段时极易只改一边）。
export type { ErrorReportConfig } from "../../shared/models";
import type { ErrorReportConfig } from "../../shared/models";

/** 限流状态文件：记录当天已发送封数 */
const RATE_FILE = () => path.join(configRoot(), "logs", "sent-crash.json");

interface RateState {
  date: string; // YYYY-MM-DD
  count: number;
  sentIds: string[];
}

function readRate(): RateState {
  try {
    const f = RATE_FILE();
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf-8"));
  } catch {
    /* ignore */
  }
  return { date: today(), count: 0, sentIds: [] };
}
function writeRate(s: RateState): void {
  try {
    fs.mkdirSync(path.dirname(RATE_FILE()), { recursive: true });
    fs.writeFileSync(RATE_FILE(), JSON.stringify(s, null, 2), "utf-8");
  } catch {
    /* ignore */
  }
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 是否允许发送（限流 + 同 id 去重） */
export function canSend(reportId: string, maxPerDay: number): boolean {
  const s = readRate();
  // 跨天重置
  if (s.date !== today()) {
    s.date = today();
    s.count = 0;
    s.sentIds = [];
  }
  if (s.sentIds.includes(reportId)) return false; // 同 id 已发过
  if (s.count >= maxPerDay) return false; // 超过当天上限
  return true;
}

/** 记录一次发送 */
export function markSent(reportId: string): void {
  const s = readRate();
  if (s.date !== today()) {
    s.date = today();
    s.count = 0;
    s.sentIds = [];
  }
  s.count += 1;
  s.sentIds.push(reportId);
  writeRate(s);
}

/** 把崩溃报告格式化成邮件文本 */
export function formatReportBody(report: CrashReport): string {
  return [
    `【Playday 崩溃报告】`,
    ``,
    `类型: ${report.type}`,
    `时间: ${report.timestamp}`,
    `应用版本: ${report.appVersion}`,
    `平台: ${report.platform} (${report.osRelease}) ${report.arch}`,
    `工作目录: ${report.cwd}`,
    ``,
    `错误信息: ${report.message}`,
    report.reason ? `崩溃原因: ${report.reason}` : "",
    ``,
    report.stack ? `--- 堆栈 ---\n${report.stack}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 发送崩溃报告到收件人邮箱。
 * 先限流判断（canSend），通过则用 nodemailer 发 SMTP 邮件。
 * 返回 { ok, error }。
 */
export async function sendCrashEmail(
  report: CrashReport,
  cfg: ErrorReportConfig,
): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.enabled) return { ok: false, error: "错误上报未启用" };
  if (!cfg.smtpUser || !cfg.smtpPass) {
    return { ok: false, error: "未配置发件邮箱/授权码" };
  }
  if (!canSend(report.id, cfg.maxPerDay)) {
    return { ok: false, error: "已达今日发送上限或重复报告" };
  }
  try {
    // 动态 require nodemailer（主进程已安装）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpPort === 465, // 465 = SSL，587 = STARTTLS
      auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    });
    await transporter.sendMail({
      from: cfg.smtpUser,
      to: cfg.toEmail,
      subject: `[Playday 崩溃] ${report.type} - ${report.message.slice(0, 40)}`,
      text: formatReportBody(report),
    });
    markSent(report.id);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `SMTP 发送失败: ${msg}` };
  }
}
