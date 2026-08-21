// 存档管理 IPC 命令：备份-恢复游戏存档。
// 备份产物是 NSIS 自解压 exe（双击即恢复，可带走）。
import { ipcMain, BrowserWindow } from "electron";
import * as path from "path";
import { getGame } from "../core/db";
import { getLibraries } from "../core/settings";
import { collectSavePath, backupFileName, desktopPath } from "../core/saveManager";
import { compileBackupToExe, nsisAvailable, type NsisEntry } from "../core/nsis";
import { subscribeGameExit } from "../core/process";
import { registerCommand } from "./registry";

export function registerSaveManagerIpc(ipc: typeof ipcMain) {
  // 检测 NSIS 编译器是否可用（生成 exe 的前提）。
  registerCommand(ipc, "nsis_available", async () => nsisAvailable());

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

  // 列出某游戏的存档路径及匹配结果（供 UI 展示 / 编辑预览）。
  // 中间件按 field="gameId" 解包：兼容对象 { gameId } 和 spread 传字符串。
  registerCommand(ipc, "backup_preview", async ({ gameId }: { gameId?: string }) => {
    const id = gameId;
    const game = id ? getGame(id) : undefined;
    if (!game) return { ok: false, error: "游戏不存在" };
    const libs = getLibraries();
    const result = (game.savePaths ?? []).map((sp) => collectSavePath(sp, libs));
    return { ok: true, gameName: game.name, paths: result };
  }, { field: "gameId" });

  // 执行备份：生成自解压 exe，默认放用户桌面。
  // 入参：{ gameId, outDir? }。outDir 缺省用桌面。
  registerCommand(
    ipc,
    "backup_game_save",
    async (a: { gameId?: string; outDir?: string }) => {
      const game = a?.gameId ? getGame(a.gameId) : undefined;
      if (!game) return { ok: false, error: "游戏不存在" };
      const libs = getLibraries();
      const savePaths = game.savePaths ?? [];
      if (savePaths.length === 0) {
        return { ok: false, error: "该游戏未配置存档路径（需管理端配置 savePaths）" };
      }

      // 预检：只保留有匹配文件的路径（避免 makensis 因 File 找不到文件而失败）
      const entries: NsisEntry[] = [];
      const skipped: string[] = [];
      for (const sp of savePaths) {
        const col = collectSavePath(sp, libs);
        if (col.matches.length > 0) {
          entries.push({ savePath: sp, resolved: col.resolved, collect: col });
        } else {
          skipped.push(col.resolved);
        }
      }
      if (entries.length === 0) {
        return { ok: false, error: "没有匹配到任何存档文件（检查存档路径是否存在/匹配）" };
      }

      const fileName = backupFileName(game.name);
      const outDir = a?.outDir && a.outDir.trim() ? a.outDir.trim() : desktopPath();
      const outFile = path.join(outDir, fileName);

      try {
        const finalPath = compileBackupToExe({ entries, gameName: game.name, outFile });
        return {
          ok: true,
          file: finalPath,
          fileName,
          skippedPaths: skipped, // 无匹配被跳过的路径（供 UI 提示）
        };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    }
  );
}
