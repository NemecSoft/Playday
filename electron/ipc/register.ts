// 统一注册所有 IPC 命令的入口。后续每个阶段（games/covers/auth/admin…）
// 都会在这里追加一行 registerXxxIpc(ipcMain)，命令实现分散到 ipc/ 各文件。
//
// 注意：不要重复注册同一个命令名（Electron 的 ipcMain.handle 重复会抛错）。
// Task 3 起，所有游戏库/设置/插件命令统一在 registerGamesIpc 里注册，
// 故这里只调它，不再单独注册 get_games / save_settings 等。
import { ipcMain } from "electron";
import { registerGamesIpc } from "./games";
import { registerCoversIpc } from "./covers";
import { registerAuthIpc } from "./auth";
import { registerAnnouncementIpc } from "./announcement";
import { registerGameHtmlIpc } from "./gameHtml";
import { registerSystemIpc } from "./system";
import { registerSaveManagerIpc } from "./saveManager";
import { registerTrainerIpc } from "./trainer";
import { registerSavesIpc } from "./saves";
import { registerErrorReportIpc } from "./errorReport";
import { registerZoomIpc } from "./zoom";

export function registerIpc() {
  registerGamesIpc(ipcMain);
  registerCoversIpc(ipcMain);
  registerAuthIpc(ipcMain);
  registerAnnouncementIpc(ipcMain);
  registerGameHtmlIpc(ipcMain);
  registerSystemIpc(ipcMain);
  registerSaveManagerIpc(ipcMain);
  registerTrainerIpc(ipcMain);
  registerSavesIpc(ipcMain);
  registerErrorReportIpc(ipcMain);
  registerZoomIpc();
}
