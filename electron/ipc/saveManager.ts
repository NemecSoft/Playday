// 存档管理 IPC 命令：备份游戏存档。
//
// 备份动作本身由独立的 GameSaveHelper.exe 完成（生成自解压恢复包），Playday 只负责
// 把"游戏名 + 展开后的存档路径列表"传给它。完整设计见 docs/design/save-backup-tool.md。
//
// 注意：不传 /q —— 工具会自己开窗口显示进度、失败原因和"如何使用备份包"，
// 所以这里的返回值只表示"工具是否成功启动"，不代表备份已经成功。
import { ipcMain, BrowserWindow } from "electron";
import { getGame } from "../core/db";
import { getLibraries } from "../core/settings";
import { launchSaveBackup } from "../core/gameSaveHelper";
import { resolvePath, subscribeGameExit } from "../core/process";
import { registerCommand } from "./registry";

export function registerSaveManagerIpc(ipc: typeof ipcMain) {
  // 游戏退出后【不自动备份】，改为把"游戏刚退出、可考虑备份"推给所有窗口的渲染进程。
  // 前端监听 game_exited 事件 → 弹"是否备份存档？"确认框 → 用户选"是"再调 backup_game_save。
  // 这样避免游戏中自动备份因存档文件被锁定而失败，也避免每次都生成 exe 垃圾文件。
  subscribeGameExit((payload) => {
    // 只有该游戏配置了存档路径时才需要提示用户（没配存档路径的备份无意义）。
    if (!payload.hasSavePaths) return;
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send("game_exited", {
        gameId: payload.gameId,
        gameName: payload.gameName,
      });
    }
  });

  // 备份某游戏的存档：启动 GameSaveHelper.exe（不等待它退出）。
  // 入参：{ gameId }。返回 { ok } 只表示"工具已启动"。
  registerCommand(ipc, "backup_game_save", async (a: { gameId?: string }) => {
    const game = a?.gameId ? getGame(a.gameId) : undefined;
    if (!game) return { ok: false, error: "游戏不存在" };

    const savePaths = game.savePaths ?? [];
    if (savePaths.length === 0) {
      return { ok: false, error: "该游戏未配置存档路径" };
    }

    // 展开 {游戏库名} 占位符；通配符原样保留，由工具自己 FindFirstFile 匹配。
    // 故意不过滤"没有匹配文件"的路径：交给工具逐条报告，避免 App 静默丢掉一条路径。
    const libs = getLibraries();
    const resolved = savePaths.map((sp) => resolvePath(sp, libs)).filter((p) => !!p);
    if (resolved.length === 0) {
      return { ok: false, error: "该游戏的存档路径解析后为空" };
    }

    return launchSaveBackup(game.name, resolved);
  });
}
