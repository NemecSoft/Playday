// 背景音乐的 IPC 命令。
//
// 前端启动时问一次：音乐目录在哪、有哪些曲子、每首的播放 URL。
// 播放本身在渲染进程用 <audio> 做（随机循环、上/下一首都是前端的事，
// 见 src/stores/musicStore.ts）；主进程只负责"找文件 + 发文件"。
//
// 目录不存在 / 没有音频文件 → tracks 为空，前端就不显示音乐控件（不是报错）。

import { ipcMain } from "electron";
import { musicDirInfo } from "../core/music";
import { getGameServerBaseUrl, startGameServer } from "../core/gameServer";
import { gamesHtmlDir } from "../core/paths";
import { registerCommand } from "./registry";

export interface MusicTrack {
  /** 显示用标题（文件名去掉扩展名）。 */
  name: string;
  /** 相对音乐目录的路径（用于排查与去重）。 */
  rel: string;
  /** 可直接喂给 <audio src> 的 URL（走本地服务器，支持 Range）。 */
  url: string;
}

export interface MusicLibraryResult {
  /** 解析出来的音乐目录（"配了但不存在"也如实返回，便于排查）。 */
  dir: string;
  exists: boolean;
  tracks: MusicTrack[];
}

export function registerMusicIpc(ipc: typeof ipcMain) {
  registerCommand(ipc, "get_music_library", async (): Promise<MusicLibraryResult> => {
    const info = musicDirInfo();
    if (info.files.length === 0) {
      return { dir: info.dir, exists: info.exists, tracks: [] };
    }

    // 音频由本地 HTTP 服务器提供（与详情页/字体共用同一个服务器，惰性启动）。
    let base = getGameServerBaseUrl();
    if (!base) {
      try {
        base = await startGameServer(gamesHtmlDir());
      } catch (e) {
        console.error("[music] 本地服务器启动失败，本次不提供背景音乐:", e);
        base = "";
      }
    }
    if (!base) return { dir: info.dir, exists: info.exists, tracks: [] };

    return {
      dir: info.dir,
      exists: info.exists,
      tracks: info.files.map((f) => ({
        name: f.title,
        rel: f.rel,
        // 逐段编码：`/` 要保留（子目录），文件名里的空格/中文/`%` 全部编码。
        // 服务器侧统一 decodeURIComponent，所以两端不会错位。
        url: `${base}/music/${f.rel.split("/").map(encodeURIComponent).join("/")}`,
      })),
    };
  });
}
