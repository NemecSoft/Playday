// 游戏本地视频（详情目录下的 videos/ 文件夹）相关 IPC 命令。
//
// 视频放置约定：<游戏详情目录>/<游戏名>/videos/ 下的视频文件，可再分子文件夹分组
// （如 videos/实况/、videos/攻略/）。只要把文件丢进去，详情页顶栏的"视频"按钮
// 就会出现数量、点开即播 —— 不需要改数据库、不需要改详情页 HTML。
//
// 目录如何解析：走 core/gameDirs.ts（优先游戏 id 子目录，其次游戏名），与
// 详情页 / 修改器 / 应用存档同一套规则。
//
// 为什么不让前端直接调 HTTP 的 `/api/videos`：
//   1) 那个接口要求调用方自己拼 `/games/<目录名>/`，而前端并不知道命中的是 id 还是
//      游戏名（详情页 iframe 就吃了这个亏：目录按 id 命名时会 404）；
//   2) 它返回的是原始文件名，前端还得自己按 URL 规则编码（文件名里有空格、中文、!）。
// 这里由主进程解析目录，并把**可直接塞进 <video src> 的相对路径**算好返回。
//
// 播放：走详情页那个本地 HTTP 服务器（core/gameServer.ts），它支持 Range 请求，
// 所以进度条能拖动、不用整片下完。放不了的封装（mkv/flv/avi 等）标记
// playable=false，前端改用"用系统播放器打开"（shell.openPath）。
//
// 说明：本功能只在 Electron 桌面端有意义（要读本机文件、要拉起播放器），
//       Web 端（server.mjs）不注册这些命令 —— 前端拿到 null 会兜底成空列表。

import { ipcMain, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import { resolveGameVideoDir } from "../core/gameDirs";
import {
  flattenVideos,
  isWebPlayable,
  scanVideos,
  type ScannedVideo,
} from "../core/videoLibrary";
import { registerCommand } from "./registry";

/** 返回给前端的单条视频。 */
export interface GameVideoItem extends ScannedVideo {
  /** 相对"游戏目录"的路径且已做 URL 段编码（如 `videos/%E5%AE%9E%E5%86%B5/1.mp4`）。 */
  urlPath: string;
  /** 绝对路径（"用系统播放器打开"要用）。 */
  absPath: string;
  /** 能否被内置播放器直接播；false → 前端提示可能需外部播放器。 */
  playable: boolean;
}

/** 把相对 videos 目录的路径编码成 URL 路径（逐段编码：分隔符 / 必须留着）。 */
function encodeRelPath(rel: string): string {
  return rel.split("/").map(encodeURIComponent).join("/");
}

export function registerGameVideosIpc(ipc: typeof ipcMain) {
  // 列出某游戏 videos/ 目录下的视频（含子文件夹分组、自然序）。
  // 没有 videos 目录或里面没视频 → { found:false, items:[] }（不是错误）。
  registerCommand(
    ipc,
    "get_game_videos",
    async ({ gameId, gameName }: { gameId?: string; gameName?: string }) => {
      const hit = resolveGameVideoDir(gameId ?? "", gameName ?? "");
      if (!hit) return { found: false, dirName: "", dir: "", items: [] as GameVideoItem[] };
      // URL 前缀 = **实际命中的视频目录名**（`视频攻略&游戏实况` / 兜底的 `videos`），
      // 不能写死 "videos" —— 目录改名后这里会整片 404（详情页注入那份同理，
      // 见 gameDetailInject.ts 的 videoDirName）。渲染层再拼成
      // `${serverUrl}/games/${encodeURIComponent(dirName)}/${urlPath}`。
      const urlPrefix = `${encodeRelPath(hit.videoDirName)}/`;
      const items: GameVideoItem[] = flattenVideos(scanVideos(hit.path)).map((v) => ({
        ...v,
        urlPath: `${urlPrefix}${encodeRelPath(v.rel)}`,
        absPath: path.join(hit.path, v.rel),
        playable: isWebPlayable(v.rel),
      }));
      return { found: items.length > 0, dirName: hit.gameDirName, dir: hit.path, items };
    },
    { field: "gameId", log: true }
  );

  // 用系统默认播放器打开某个视频（浏览器放不了的封装走这条路）。
  // shell.openPath 用"系统关联的播放器"，不引入任何内置解码依赖。
  registerCommand(
    ipc,
    "open_video_external",
    async ({ path: file }: { path?: string }) => {
      const p = file ?? "";
      if (!p) return { opened: false, error: "视频路径为空" };
      if (!fs.existsSync(p)) return { opened: false, error: `视频文件不存在：${p}` };
      const err = await shell.openPath(p);
      // openPath 成功返回空串，失败返回错误说明。
      return err ? { opened: false, error: err } : { opened: true };
    },
    { field: "path", log: true }
  );
}
