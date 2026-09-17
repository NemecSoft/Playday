// 存档管理 IPC 命令：备份游戏存档。
//
// 备份动作本身由独立的 GameSaveHelper.exe 完成（生成自解压恢复包），Playday 只负责
// 把"游戏名 + 展开后的存档路径列表"传给它。完整设计见 docs/design/save-backup-tool.md。
//
// 游戏退出后做什么，由 settings.saveBackupMode 决定（三档，见 shared/models.ts）：
//   ask   —— 推 game_exited 给前端，弹"是否备份存档？"（默认）
//   auto  —— 直接静默备份（工具传 /q，不弹窗口；失败才通知）
//   never —— 不提示也不备份
// 判定放在**主进程**：前端只管"问不问用户"那一段，模式一旦是自动/永不，
// 不许因为前端没跑起来就漏掉（与"不能只靠前端拦"同一条原则）。
//
// ⚠️ 存档备份**不看用户等级**（2026-09-14 需求变更）：黄金版也能备份任何游戏的存档，
//    包括自己玩不了的钻石版游戏 —— 存档是玩家自己的东西，不该因为版本不同就拿不出来。
//    本文件原先有两处 canPlay 门禁（手动备份 + 退出后提示），都已删除。
//    "能不能玩"的门禁仍只在启动那一条路上（electron/core/process.ts），见
//    docs/design/user-level-detection.md。
import { ipcMain, BrowserWindow } from "electron";
import { getGame } from "../core/db";
import { readSettings } from "../core/settings";
import { launchSaveBackup } from "../core/gameSaveHelper";
import { resolvePath, subscribeGameExit } from "../core/process";
import { registerCommand } from "./registry";
import type { SaveBackupMode } from "../../shared/models";

/** 给所有窗口推一条通知（与 system.ts 的 show_notification 同一条事件通道）。 */
function notifyAllWindows(title: string, body: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("notification", { title, body });
  }
}

/**
 * 备份某游戏的存档 —— IPC 与"退出后自动备份"**共用**这一份校验与路径展开。
 * 返回 { ok } 只表示"工具已启动"，不代表备份已经成功（除非传了 quiet + onDone）。
 */
function backupGameSaveNow(
  gameId: string,
  opts: { quiet?: boolean; onDone?: (code: number | null) => void } = {},
): { ok: boolean; error?: string } {
  const game = gameId ? getGame(gameId) : undefined;
  if (!game) return { ok: false, error: "游戏不存在" };

  // 这里**没有等级门禁**（2026-09-14 需求）：黄金版也能备份任何游戏的存档，
  // 包括自己玩不了的钻石版游戏。原先那句"需要升级为钻石版网吧才能存档"已作废。
  const savePaths = game.savePaths ?? [];
  if (savePaths.length === 0) {
    return { ok: false, error: "该游戏未配置存档路径" };
  }

  // 把存档路径解析成绝对路径；通配符原样保留，由工具自己 FindFirstFile 匹配。
  // 故意不过滤"没有匹配文件"的路径：交给工具逐条报告，避免 App 静默丢掉一条路径。
  const resolved = savePaths.map((sp) => resolvePath(sp)).filter((p) => !!p);
  if (resolved.length === 0) {
    return { ok: false, error: "该游戏的存档路径解析后为空" };
  }

  return launchSaveBackup(game.name, resolved, opts);
}

export function registerSaveManagerIpc(ipc: typeof ipcMain) {
  // 游戏退出后的行为（三档，见文件头注释）。
  // 提示用户那一档才是"推事件给前端"；自动/永不两档都在主进程直接处理完。
  subscribeGameExit((payload) => {
    // 只有该游戏配置了存档路径时才需要管（没配存档路径的备份无意义）。
    if (!payload.hasSavePaths) return;
    // 这里**不再按等级过滤**（2026-09-14 需求）：存档备份不看用户等级，黄金版玩过的游戏
    // 退出后照常问"要不要备份"。原先那句是按"能玩才能备份"的旧规则写的，已作废。

    const mode: SaveBackupMode = readSettings().saveBackupMode ?? "ask";
    if (mode === "never") return;

    if (mode === "auto") {
      // 静默备份：成功不吭声，失败必须说 —— 静默失败最难受（用户以为备好了，其实没有）。
      const res = backupGameSaveNow(payload.gameId ?? "", {
        quiet: true,
        onDone: (code) => {
          // 0 = 成功；null = 进程都没起来（error 分支已经报过，这里不重复报）。
          if (code === 0 || code === null) return;
          notifyAllWindows(
            "存档自动备份失败",
            `《${payload.gameName}》的存档没有备份成功（工具退出码 ${code}），请手动备份一次。`,
          );
        },
      });
      if (!res.ok) notifyAllWindows("存档自动备份失败", res.error ?? "未知原因");
      return;
    }

    // ask（默认）：交给前端弹窗，用户选"是"再调 backup_game_save。
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send("game_exited", {
        gameId: payload.gameId,
        gameName: payload.gameName,
      });
    }
  });

  // 备份某游戏的存档：启动 GameSaveHelper.exe（不等待它退出）。
  // 入参：{ gameId }。返回 { ok } 只表示"工具已启动"。
  registerCommand(ipc, "backup_game_save", async (a: { gameId?: string }) =>
    backupGameSaveNow(a?.gameId ?? ""),
  );
}
