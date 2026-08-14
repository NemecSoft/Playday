// 封面相关 IPC 命令（Task 4）：移植自原 Rust 的 commands/covers.rs。
// 前端加载封面优先用 read_images_batch（一次要回多张图的字节和类型）。

import { ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import { coverImagesDir } from "../core/paths";
import { applyCoversToDb } from "../core/covers";
import { getGames } from "../core/db";
import type { Game } from "../core/models";

// 进程级图片字节缓存：原路径 → {data(base64), mime}。避免同一张图反复读盘。
const imageCache = new Map<string, { data: string; mime: string }>();

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

// 把文件字节转成 base64 + mime（对齐原 Rust：base64 比裸字节数组更省 IPC 体积）。
function toPayload(bytes: Buffer, p: string): { data: string; mime: string } {
  return { data: bytes.toString("base64"), mime: mimeFromExt(p) };
}

// 只允许读 CoverImages 和内部 images 目录下的图片，避免任意路径泄露。
function isAllowed(p: string): boolean {
  let canonical: string;
  try {
    canonical = fs.realpathSync(p);
  } catch {
    return false;
  }
  const cover = coverImagesDir();
  return canonical.startsWith(cover);
}

export function registerCoversIpc(ipc: typeof ipcMain) {
  // 重新扫描目录、给所有游戏套封面并写回库，返回更新后的游戏列表 + 摘要。
  ipc.handle("scan_covers", async () => {
    const { games, result } = applyCoversToDb();
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
  ipc.handle("get_cover_dir_info", async () => {
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
  // 参数格式兼容两种风格：
  //   - 直接传字符串路径（Electron spread 风格）
  //   - 传包装对象 { path }（Tauri invoke 风格，与 src/api/client.ts 的 call<T>("read_image", { path }) 一致）
  // 早期版本只接 (p: string)，但客户端始终按对象包装，导致 p 实际是 { path } 对象、
  // fs.realpathSync 抛错被 catch 吞掉、所有封面都返回 null -> 前端一直显示破图。
  ipc.handle("read_image", async (_e, arg: string | { path: string }) => {
    const p = typeof arg === "string" ? arg : arg?.path;
    if (!p) return null;
    const cached = imageCache.get(p);
    if (cached) return cached;
    if (!isAllowed(p)) return null;
    try {
      const bytes = fs.readFileSync(p);
      const payload = toPayload(bytes, p);
      imageCache.set(p, payload);
      return payload;
    } catch {
      return null;
    }
  });

  // 批量读图（前端首选）：入参路径列表，返回同序的 Vec<Option<{data,mime}>>，
  // 无效/不允许/缺失的路径返回 null。
  // 同样兼容 spread（string[]）和包装对象 { paths: string[] } 两种入参。
  ipc.handle("read_images_batch", async (_e, arg: string[] | { paths: string[] }) => {
    const paths = Array.isArray(arg) ? arg : arg?.paths ?? [];
    return paths.map((p) => {
      const cached = imageCache.get(p);
      if (cached) return cached;
      if (!isAllowed(p)) return null;
      try {
        const bytes = fs.readFileSync(p);
        const payload = toPayload(bytes, p);
        imageCache.set(p, payload);
        return payload;
      } catch {
        return null;
      }
    });
  });

  // 清图片字节缓存（诊断/重扫后调用）。
  ipc.handle("clear_image_cache", async () => {
    const n = imageCache.size;
    imageCache.clear();
    return n;
  });
}
