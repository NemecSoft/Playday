// 游戏详情页本地 HTTP 服务器。
// 移植自原 Rust 的 game_server.rs。用 Node 内置 http 模块实现静态文件托管 +
// 一个 `/api/videos` 动态接口（列出某游戏 videos/ 文件夹下的视频）。
//
// 为什么用 Node 内置 http 而不引 express：项目后端保持零原生依赖（绿色存储、
// 绿色打包），http 模块足以覆盖静态服务 + Range 视频分段播放 + MIME 推断，
// 无需额外安装 express。语义对齐原 axum + ServeDir。

import * as http from "http";
import * as fs from "fs";
import * as path from "path";

// 作为视频的文件扩展名（列出时用）。
const VIDEO_EXTS = [".mp4", ".webm", ".ogv", ".mov", ".m4v", ".mkv", ".flv", ".avi"];

// 根据扩展名猜 MIME 类型。
function mimeFromExt(file: string): string {
  const ext = path.extname(file).toLowerCase();
  const map: Record<string, string> = {
    ".html": "text/html",
    ".htm": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ogv": "video/ogg",
    ".mov": "video/quicktime",
    ".m4v": "video/mp4",
    ".mkv": "video/x-matroska",
    ".flv": "video/x-flv",
    ".avi": "video/x-msvideo",
    ".txt": "text/plain",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
  };
  return map[ext] || "application/octet-stream";
}

// 是否属于视频文件。
function isVideo(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return VIDEO_EXTS.includes(ext);
}

// 把 `dir` 参数规范成根目录下的一个相对文件夹名。
// 兼容页面发来的各种形式：`/games/Kenshi剑士/`、`games/Kenshi剑士`、`/Kenshi剑士`。
function normalizeDir(dir: string): string {
  let rel = dir.replace(/^\/+|\/+$/g, "");
  if (rel.startsWith("games/")) rel = rel.slice("games/".length);
  else if (rel === "games") rel = "";
  return rel;
}

// 生成"自然排序"键：数字段补零到定宽，让字符串比较时按数值排（实况2 < 实况10）。
function naturalKey(s: string): string {
  let out = "";
  let digits = "";
  for (const ch of s) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
    } else {
      if (digits) {
        out += digits.padStart(12, "0");
        digits = "";
      }
      out += ch;
    }
  }
  if (digits) out += digits.padStart(12, "0");
  return out;
}

// 本机运行的 HTTP 服务器句柄。
let server: http.Server | null = null;
let baseUrl = "";

// 启动服务器：绑定 127.0.0.1 的随机端口，静态托管 Game_Details/ 目录。
// 返回 base URL（如 http://127.0.0.1:4321）；失败返回空字符串。
export async function startGameServer(root: string): Promise<string> {
  if (server) return baseUrl; // 已启动，直接复用
  server = http.createServer((req, res) => {
    // 用 URL 解析请求路径和查询参数。
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    const dir = url.searchParams.get("dir") || "";

    // 动态接口：列出某游戏 videos/ 文件夹下的视频。
    if (pathname === "/api/videos") {
      handleVideosApi(root, dir, res);
      return;
    }

    // 静态文件：`/games/<游戏名>/<相对路径>` → `root/<游戏名>/<相对路径>`。
    if (!pathname.startsWith("/games/")) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const rel = pathname.slice("/games/".length);
    // 防路径穿越：不允许 .. 或绝对路径段，保证不越出 Game_Details/ 目录。
    if (!rel || rel.split(/[\\/]/).some((s) => s === "..")) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    serveFile(root, rel, req, res);
  });

  return new Promise<string>((resolve) => {
    server!.listen(0, "127.0.0.1", () => {
      const addr = server!.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve(baseUrl);
    });
  });
}

// 静态文件服务：支持 Range 请求（视频拖动播放关键），读文件流式返回。
function serveFile(root: string, rel: string, req: http.IncomingMessage, res: http.ServerResponse): void {
  let filePath = path.join(root, rel);
  // 目录访问：尝试补 index.html。
  try {
    if (fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
  } catch {
    /* ignore */
  }
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }
  if (!stat.isFile()) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const mime = mimeFromExt(filePath);
  const size = stat.size;
  const range = req.headers.range;

  // 处理 Range（支持单段，如 bytes=0-1023）。
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : size - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= size) end = size - 1;
      if (start > end || start >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        "Content-Type": mime,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
      });
      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
      return;
    }
  }

  // 无 Range：整个文件返回。
  res.writeHead(200, {
    "Content-Type": mime,
    "Content-Length": size,
    "Accept-Ranges": "bytes",
  });
  fs.createReadStream(filePath).pipe(res);
}

// `/api/videos` 接口：列出某游戏 videos/ 目录下的视频（含子文件夹分组）。
function handleVideosApi(root: string, dir: string, res: http.ServerResponse): void {
  const rel = normalizeDir(dir);
  // 防路径穿越：不允许 ..、空目录或绝对路径。
  if (!rel || rel.split(/[\\/]/).some((s) => s === "..") || path.isAbsolute(rel)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "forbidden" }));
    return;
  }
  const videosRoot = path.join(root, rel, "videos");
  const rootFiles: string[] = [];
  const dirs: { name: string; files: string[] }[] = [];
  try {
    for (const entry of fs.readdirSync(videosRoot, { withFileTypes: true })) {
      const name = entry.name;
      if (entry.isFile() && isVideo(name)) {
        rootFiles.push(name);
      } else if (entry.isDirectory()) {
        const files: string[] = [];
        try {
          for (const se of fs.readdirSync(path.join(videosRoot, name), { withFileTypes: true })) {
            if (se.isFile() && isVideo(se.name)) files.push(`${name}/${se.name}`);
          }
        } catch {
          /* ignore */
        }
        if (files.length) dirs.push({ name, files });
      }
    }
  } catch {
    // videos 目录不存在
  }
  rootFiles.sort((a, b) => naturalKey(a).localeCompare(naturalKey(b)));
  dirs.sort((a, b) => naturalKey(a.name).localeCompare(naturalKey(b.name)));
  for (const d of dirs) d.files.sort((a, b) => naturalKey(a).localeCompare(naturalKey(b)));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ root: rootFiles, dirs }));
}

// 返回服务器 base URL（未启动返回空）。
export function getGameServerBaseUrl(): string {
  return baseUrl;
}

// 关闭服务器（应用退出时调用）。
export function stopGameServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}
