// 应用自带字体（fonts 目录）的 IPC 命令。
//
// 渲染进程启动时问一次：有哪些字体、默认是哪款、每个字体的可访问 URL。
// 拿到后前端注入 @font-face 并把界面字体设过去（见 src/utils/uiFont.ts）。
//
// 只返回**实际存在**的文件：fonts 目录不存在 / 目录里没有字体文件 → found:false，
// 前端就保持系统字体（需求：fonts 文件夹不存在时才用系统字体）。

import { ipcMain } from "electron";
import { fontDirInfo } from "../core/fonts";
import { getGameServerBaseUrl, startGameServer } from "../core/gameServer";
import { gamesHtmlDir } from "../core/paths";
import { registerCommand } from "./registry";

export interface UiFontFile {
  /** CSS font-family 名（= 文件名去掉扩展名）。 */
  family: string;
  fileName: string;
  /** 供 @font-face 使用的完整 URL（本地 HTTP 服务器上的 /fonts/<文件名>）。 */
  url: string;
}

export interface UiFontsResult {
  /** fonts 目录存在且里面有可用字体。 */
  found: boolean;
  /** 实际使用的字体目录（排查"到底读的哪个目录"，没有则为空串）。 */
  dir: string;
  /** 默认字体（fonts\字酷堂清楷 简.ttf）的 family；找不到为空串。 */
  defaultFamily: string;
  fonts: UiFontFile[];
}

export function registerFontsIpc(ipc: typeof ipcMain) {
  registerCommand(ipc, "get_ui_fonts", async (): Promise<UiFontsResult> => {
    const info = fontDirInfo();
    if (!info.dir || info.files.length === 0) {
      return { found: false, dir: info.dir ?? "", defaultFamily: "", fonts: [] };
    }

    // 字体由本地 HTTP 服务器提供（就是详情页用的那个，惰性启动、随机端口）。
    // 起不来就只能回退系统字体 —— 宁可没自带字体，也不能让界面起不来。
    let base = getGameServerBaseUrl();
    if (!base) {
      try {
        base = await startGameServer(gamesHtmlDir());
      } catch (e) {
        console.error("[fonts] 本地服务器启动失败，改用系统字体:", e);
        base = "";
      }
    }
    if (!base) {
      return { found: false, dir: info.dir, defaultFamily: "", fonts: [] };
    }

    return {
      found: true,
      dir: info.dir,
      defaultFamily: info.defaultFamily,
      fonts: info.files.map((f) => ({
        family: f.family,
        fileName: f.fileName,
        // 文件名可能含空格与中文，必须编码（服务器侧会 decodeURIComponent）。
        url: `${base}/fonts/${encodeURIComponent(f.fileName)}`,
      })),
    };
  });
}
