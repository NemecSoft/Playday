// 存档备份工具（GameSaveHelper.exe）接入层。
//
// 背景：Playday 原先在 electron/core/nsis.ts 里自己拼 NSIS 脚本 + 调 makensis
// 生成自解压 exe。现改为直接调用独立的 GameSaveHelper.exe（自带 NSIS 发行包、
// 恢复包模板与界面），不再自己编译。完整设计见 docs/design/save-backup-tool.md。
//
// 调用形式（方式一，路径由 App 传入）：
//   GameSaveHelper.exe <游戏名> "路径1" "路径2" ...
// 不传 /q：工具出窗口，失败原因与"如何使用备份包"都由它呈现。
// 不传 /out:：输出位置由工具自己的 settings.json 决定（默认桌面）。

import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { gameSaveHelperExePath } from "./paths";

// 拼装命令行参数：第 1 个是游戏名，其余是存档路径（含通配符，由工具自己匹配）。
// 单独抽成纯函数，便于排查"到底传了什么"。
export function buildBackupArgs(gameName: string, savePaths: string[]): string[] {
  return [gameName, ...savePaths];
}

// 解析 GameSaveHelper.exe 的路径并校验文件存在。
// 返回 { path } 或 { error }，让调用方把 error 直接透给前端。
export function resolveHelperExe(): { path: string } | { error: string } {
  const configured = gameSaveHelperExePath();
  if (!configured) {
    return { error: "未配置存档备份工具路径（config.json → settings.gameSaveHelperPath）" };
  }
  if (!fs.existsSync(configured)) {
    return { error: `存档备份工具不存在：${configured}` };
  }
  return { path: configured };
}

// 启动备份工具（不等待它退出）。
// 工具会打开窗口并在用户关闭前一直存活，所以 detached + unref，不阻塞主进程。
// cwd 设为 exe 所在目录：保证工具找得到自己的 template\ / settings.json / logs\。
export function launchSaveBackup(
  gameName: string,
  savePaths: string[]
): { ok: boolean; error?: string } {
  const resolved = resolveHelperExe();
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const exePath = resolved.path;
  try {
    const child = spawn(exePath, buildBackupArgs(gameName, savePaths), {
      cwd: path.dirname(exePath),
      detached: true,
      stdio: "ignore",
    });
    child.on("error", (err) => {
      console.error("[gameSaveHelper] 启动备份工具失败:", exePath, err.message);
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `启动存档备份工具失败：${msg}` };
  }
}
