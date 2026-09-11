// 崩溃处理器窗口（对齐 UnityCrashHandler64）：应用崩溃时弹出，
// 显示崩溃摘要，用户可点"发送崩溃报告"（SMTP 发到收件人邮箱）或"仅本地查看"。
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { CrashReport } from "../types/models";

export default function CrashHandlerWindow() {
  const [report, setReport] = useState<CrashReport | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // 读取主进程存的崩溃报告（ipc:get_crash_report）。
  useEffect(() => {
    api
      .callCrashReport()
      .then((r) => setReport(r))
      .catch(() => setReport(null));
  }, []);

  const send = async () => {
    if (!report) return;
    setSending(true);
    setResult(null);
    try {
      const res = await api.sendCrashReport(report);
      setResult(res.ok ? "已发送，感谢反馈！" : `发送失败：${res.error || "未知错误"}`);
    } catch (e) {
      setResult("发送失败：" + String(e));
    } finally {
      setSending(false);
    }
  };

  const saveLocally = async () => {
    if (!report) return;
    try {
      await api.saveCrashLocally(report);
    } catch {
      /* ignore */
    }
    setResult("已保存到本地日志（logs/ 目录）。");
  };

  return (
    <div className="crash-window">
      <div className="crash-icon">⚠</div>
      <h1 className="crash-title">Playday 发生错误</h1>
      <p className="crash-desc">
        应用遇到问题。你可以把崩溃报告发送给开发者（邮件），或保存到本地日志。
      </p>

      {report ? (
        <div className="crash-report">
          <div className="crash-type">类型：{report.type}</div>
          <div className="crash-msg">{report.message}</div>
          {report.reason && <div className="crash-msg">原因：{report.reason}</div>}
          <div className="crash-meta">
            {report.appVersion} · {report.platform} {report.arch} · {report.timestamp}
          </div>
          {report.stack && <pre className="crash-stack">{report.stack.slice(0, 1500)}</pre>}
        </div>
      ) : (
        <div className="crash-report crash-empty">无法读取崩溃详情。</div>
      )}

      <div className="crash-actions">
        <button className="crash-btn crash-btn-primary" onClick={() => void send()} disabled={sending || !report}>
          {sending ? "发送中…" : "发送崩溃报告"}
        </button>
        <button className="crash-btn" onClick={() => void saveLocally()} disabled={!report}>
          仅本地查看
        </button>
      </div>

      {result && <div className="crash-result">{result}</div>}
    </div>
  );
}
