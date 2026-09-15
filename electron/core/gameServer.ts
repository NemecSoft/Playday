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
import { resolveFontRequest } from "./fonts";
import { resolveMusicRequest } from "./music";
import { resolveVendorRequest } from "./vendorAssets";
import { findVideoPoster, scanVideos } from "./videoLibrary";
import { buildVideoSection, injectVideoSection } from "./gameDetailInject";
import {
  buildDetailThemeStyle,
  getDetailTheme,
  injectDetailTheme,
} from "./detailTheme";

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
    // 背景音乐（.mp3 等必须给正确类型：octet-stream 有的解码器会拒绝播）
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".wma": "audio/x-ms-wma",
  };
  return map[ext] || "application/octet-stream";
}

// 把 `dir` 参数规范成根目录下的一个相对文件夹名。
// 兼容页面发来的各种形式：`/games/Kenshi剑士/`、`games/Kenshi剑士`、`/Kenshi剑士`。
function normalizeDir(dir: string): string {
  let rel = dir.replace(/^\/+|\/+$/g, "");
  if (rel.startsWith("games/")) rel = rel.slice("games/".length);
  else if (rel === "games") rel = "";
  return rel;
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

    // 应用自带字体：`/fonts/<文件名>` → 生效的 fonts 目录下的那个文件。
    // 为什么要走这里而不是让前端直接读 file://：开发态页面是 http://localhost:5173，
    // Chromium 不允许 http 页面加载 file:// 子资源（字体也算），所以统一由本服务器提供；
    // 这条路由必须带 CORS 头（字体是跨源请求），见 serveFileAt 的 cors 选项。
    if (pathname.startsWith("/fonts/")) {
      const full = resolveFontRequest(pathname.slice("/fonts/".length));
      if (!full) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      serveFileAt(full, req, res, { cors: true });
      return;
    }

    // 背景音乐：`/music/<相对路径>` → 配置的音乐目录下那个文件。
    // 同样必须带 CORS 头（开发态页面在 http://localhost:5173）；Range 由 serveFileAt 支持，
    // 所以进度条可以拖动、不必整首下完再播。
    if (pathname.startsWith("/music/")) {
      const full = resolveMusicRequest(pathname.slice("/music/".length));
      if (!full) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      serveFileAt(full, req, res, { cors: true });
      return;
    }

    // 随包第三方前端资源：`/vendor/<文件名>` → vendor 目录下那个文件（内置播放器 DPlayer）。
    // 详情页与它**同源**（页面就是这个服务器发的），所以不需要 CORS 头。
    // 只放行裸文件名 + 扩展名白名单，见 vendorAssets.ts。
    if (pathname.startsWith("/vendor/")) {
      const full = resolveVendorRequest(pathname.slice("/vendor/".length));
      if (!full) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      serveFileAt(full, req, res);
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

// 静态文件服务（按"根目录 + 相对路径"）：支持 Range 请求（视频拖动播放关键），读文件流式返回。
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
  // 游戏详情页首页：注入「游戏视频」区块后再发（见 core/gameDetailInject.ts）。
  // 更深层的 index.html（游戏自己页面里的子目录）不动 —— 那不是详情页首页。
  if (isGameDetailIndex(root, filePath)) {
    serveGameDetailIndex(filePath, req, res);
    return;
  }
  serveFileAt(filePath, req, res);
}

/** 是否是"某个游戏的详情页首页"：相对详情根目录正好是 `<一级目录>/index.html`。 */
function isGameDetailIndex(root: string, filePath: string): boolean {
  if (path.basename(filePath).toLowerCase() !== "index.html") return false;
  const rel = path.relative(root, filePath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return false;
  return rel.split(path.sep).length === 2;
}

/**
 * 发详情页首页，并在页面里注入「视频」区块。
 *
 * 需求：视频丢进 `<详情根>/<游戏名>/videos/` 后，要在**页面内往下罗列**出来，
 * 有子目录就按子目录分组（详情页是跨源 iframe，前端塞不进去，只能在发文件这一步做）。
 *
 * 几个刻意的选择：
 *   · 不缓存（Cache-Control: no-store）：视频是运行期丢进目录的，缓存住就会出现
 *     "明明加了文件、页面里却没有"这种最难查的问题；页面本身只有几 KB，现读现拼没成本。
 *   · 不做 Range：那是留给音视频拖进度用的，HTML 文档用不上。
 *   · 语言从页面 URL 的 `?lang=` 取（前端拼 iframe 地址时带上），注入文案与界面语言一致。
 */
function serveGameDetailIndex(filePath: string, req: http.IncomingMessage, res: http.ServerResponse): void {
  let html: string;
  try {
    if (!fs.statSync(filePath).isFile()) throw new Error("not a file");
    html = fs.readFileSync(filePath, "utf-8");
  } catch {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }
  const lang = new URL(req.url || "/", "http://127.0.0.1").searchParams.get("lang");
  const videosDir = path.join(path.dirname(filePath), "videos");
  const scan = scanVideos(videosDir);
  // 主题：渲染层通过 IPC set_detail_theme 送来的"当前生效配色"（见 core/detailTheme.ts）。
  // 没送过（或送的是空）时这里拿到 null → 两处注入都退化成"什么都不做"，页面保持原样。
  const theme = getDetailTheme();
  const out = injectDetailTheme(
    injectVideoSection(
      html,
      buildVideoSection({
        scan,
        lang,
        // 与视频同名的图片（1.mp4 + 1.jpg）直接当预览封面；没有则由页面脚本抓帧。
        posterFor: (rel) => findVideoPoster(videosDir, rel),
        // 内置播放器的进度条/高亮跟随当前主题的强调色。
        accent: theme?.vars["--accent"] ?? null,
      })
    ),
    buildDetailThemeStyle(theme)
  );
  const buf = Buffer.from(out, "utf-8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
  });
  res.end(buf);
}

// 静态文件服务（按绝对路径）。
// opts.cors：带上 `Access-Control-Allow-Origin: *` —— 只有字体路由需要
// （开发态页面在 http://localhost:5173，字体文件是跨源请求，没有这个头会被浏览器拦掉）。
function serveFileAt(
  filePath: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  opts: { cors?: boolean } = {},
): void {
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
  const cors = opts.cors ? { "Access-Control-Allow-Origin": "*" } : {};

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
        ...cors,
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
    ...cors,
  });
  fs.createReadStream(filePath).pipe(res);
}

// `/api/videos` 接口：列出某游戏 videos/ 目录下的视频（含子文件夹分组）。
// 扫描细节（哪些算视频、怎么分组/排序）在 core/videoLibrary.ts —— 与详情页前端用的
// `get_game_videos`（ipc/gameVideos.ts）共用同一份，避免"接口列得出、界面列不出"。
function handleVideosApi(root: string, dir: string, res: http.ServerResponse): void {
  const rel = normalizeDir(dir);
  // 防路径穿越：不允许 ..、空目录或绝对路径。
  if (!rel || rel.split(/[\\/]/).some((s) => s === "..") || path.isAbsolute(rel)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "forbidden" }));
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(scanVideos(path.join(root, rel, "videos"))));
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
