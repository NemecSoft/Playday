// 封面相关 IPC 命令（Task 4）：移植自原 Rust 的 commands/covers.rs。
// 前端加载封面优先用 read_images_batch（一次要回多张图的字节和类型）。
//
// 用 registerCommand 中间件层统一解包参数，不再手写 typeof 判断——
// 早期 read_image 只接字符串，但前端始终按对象包装调用，导致参数错位、
// realpathSync 抛错被吞、所有封面返回 null 显示破图。现在由中间件统一解包。

import { ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import { coverImagesDir } from "../core/paths";
import { applyCoversToLibrary, isInCoverDir } from "../core/covers";
import { createByteLruCache } from "../core/imageCache";
import { getGames } from "../core/db";
import type { Game } from "../core/models";
import { registerCommand } from "./registry";

// 进程级图片字节缓存：原路径 → {data(裸字节), mime}。避免同一张图反复读盘。
//
// 这里解决两件事：
//   1) **必须封顶**：以前是个只增不减的 Map、而且存的是 base64 字符串 —— 实测（1369 张封面、
//      原始 448MB）滚完整个库会让主进程常驻 ≈675MB（300 张时 RSS 已 34MB → 182MB）。
//      大堆换来的是主 GC 停顿，用户感觉就是"滚动中间明显卡一下"。现在按总字节数走 LRU。
//   2) **存裸字节而不是 base64**：桌面端直接把它发给渲染进程（结构化克隆），省掉 33% 体积
//      和渲染进程的 atob + 逐字节拷贝（实测落地成本 43.1ms → 2.7ms，见 docs/design/cover-images.md）。
//      网站端仍走 base64（HTTP JSON 传不了二进制，见 server/server.mjs，那边保持原样）。
const IMAGE_CACHE_CAP_BYTES = 96 * 1024 * 1024;
const imageCache = createByteLruCache<{ data: Buffer; mime: string }>(IMAGE_CACHE_CAP_BYTES);

function mimeFromExt(p: string): string {
  const ext = path.extname(p).slice(1).toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

// 文件字节 → 返回值形态。桌面端给**裸字节**（Buffer 经 IPC 到渲染进程就是 Uint8Array）。
// 旧注释说"base64 比裸字节数组更省 IPC 体积"——那是手写序列化的年代；现在 Electron 走结构化
// 克隆，裸字节既没有 33% 膨胀，也省掉渲染进程里一次全量拷贝。
function toPayload(bytes: Buffer, p: string): { data: Buffer; mime: string } {
  return { data: bytes, mime: mimeFromExt(p) };
}

// 只允许读"当前配置的封面目录"下的图片，避免任意路径泄露。
// 判断逻辑统一在 core/covers.ts isInCoverDir（与"封面是否有效"共用同一事实来源，
// 否则会出现"文件存在但读不出来"，或"换了封面目录后老路径仍然被沿用"的错位）。
function isAllowed(p: string): boolean {
  return isInCoverDir(p);
}

// 读单张图（带缓存）。无效/不允许/缺失的路径返回 null（合法业务结果，不是异常）。
function readImageBytes(p: string | undefined): { data: Buffer; mime: string } | null {
  if (!p) return null;
  const cached = imageCache.get(p);
  if (cached) return cached;
  if (!isAllowed(p)) return null;
  try {
    const bytes = fs.readFileSync(p);
    const payload = toPayload(bytes, p);
    // 第三参数是"这条占多少字节"，缓存据此按总量逐出（见 core/imageCache.ts）。
    imageCache.set(p, payload, payload.data.length);
    return payload;
  } catch {
    return null;
  }
}

export function registerCoversIpc(ipc: typeof ipcMain) {
  // 重新扫描目录、给所有游戏套封面（读时计算，不写回库），返回游戏列表 + 摘要。
  registerCommand(ipc, "scan_covers", async () => {
    const { games, result } = applyCoversToLibrary();
    return {
      games,
      outcome: {
        matched: result.matched,
        coverFiles: result.coverFiles,
        considered: result.considered,
        dirExists: result.dirExists,
        dirPath: result.dirPath,
      },
    };
  });

  // 返回 CoverImages 目录信息 + 文件清单（不碰库，给设置页用）。
  registerCommand(ipc, "get_cover_dir_info", async () => {
    const dir = coverImagesDir();
    const dirExists = fs.existsSync(dir) && fs.statSync(dir).isDirectory();
    const images: string[] = [];
    let coverFiles = 0;
    if (dirExists) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isFile()) {
          images.push(e.name);
          coverFiles++;
        }
      }
      images.sort();
    }
    return { dirPath: dir, dirExists, coverFiles, images };
  });

  // 单张图读取（带缓存）。返回 {data: base64, mime}。
  // 参数由中间件解包：前端对象包装 { path }，也兼容直接传路径字符串。
  registerCommand(
    ipc,
    "read_image",
    async (args: { path?: string } | string) => {
      // 中间件 unwrap="auto" + field="path" 会把两种风格都变成含 path 字段的对象或原值，
      // 这里再兜一层：兼容中间件传对象或字符串两种情况。
      const p = typeof args === "string" ? args : args?.path;
      return readImageBytes(p);
    },
    { unwrap: "auto", field: "path" }
  );

  // 批量读图（前端首选）：入参路径列表，返回同序的 Vec<Option<{data,mime}>>，
  // 无效/不允许/缺失的路径返回 null。
  // 兼容数组（spread）和包装对象 { paths } 两种入参。
  registerCommand(
    ipc,
    "read_images_batch",
    async (args: { paths?: string[] } | string[]) => {
      const paths = Array.isArray(args) ? args : args?.paths ?? [];
      return paths.map(readImageBytes);
    },
    { unwrap: "auto", field: "paths" }
  );

  // 清图片字节缓存（诊断/重扫后调用）。
  registerCommand(ipc, "clear_image_cache", async () => {
    const n = imageCache.count();
    imageCache.clear();
    return n;
  });
}
