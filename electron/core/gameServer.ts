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
import { activeCoverDir, resolveCoverRequest } from "./coverAssets";
import { COVER_IMAGE_EXTS } from "../../shared/coverMatch";
import { getGames } from "./db";
import { findVideoDir, findVideoPoster, scanVideos } from "./videoLibrary";
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
// 正在启动中的那一次：并发调用必须拿到**同一个 Promise**。
// 这里以前写的是 `if (server) return baseUrl` —— server 已经创建但还没绑定完成时
// baseUrl 仍是空串，于是第二个调用者当场拿到 ""；而详情页和「游戏资料」页开机都会
// 同时要地址（开发态 React 严格模式还会双跑一次 effect），谁后到谁就永远拼不出 URL、
// 页面一直空白 —— 用户报的"详情页有时打不开"就是这个（2026-09-18 修）。
let starting: Promise<string> | null = null;

// 启动服务器：绑定 127.0.0.1 的**随机空闲端口**（listen(0)，由系统分配，不存在
// "端口被别的程序占了"这回事），静态托管 Game_Details/ 目录。
// 返回 base URL（如 http://127.0.0.1:4321）；启动失败会 reject（调用方自己兜底）。
export async function startGameServer(root: string): Promise<string> {
  if (baseUrl) return baseUrl; // 已就绪，直接复用
  if (starting) return starting; // 正在启动 → 复用同一次（并发安全）
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

    // 封面图：`/CoverImages/<文件名>` → 配置的封面目录下那个文件。
    // 详情页的封面**唯一来源**就是这里（页面里不再复制 `<游戏目录>/images/cover.*`）——
    // 见 core/coverAssets.ts 顶部说明。路径与网站端 server/server.mjs 的同名路由一致，
    // 所以同一份生成的页面在两个端都能显示。页面与本服务器同源 → 不需要 CORS。
    if (pathname.startsWith("/CoverImages/")) {
      const full = resolveCoverRequest(pathname.slice("/CoverImages/".length));
      if (!full) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      serveFileAt(full, req, res);
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

  // 绑定失败（权限 / 端口异常）必须 reject：调用方拿到错误还能重试，
  // 而"永远 pending"会让详情页一直停在加载态、连个提示都没有。
  starting = new Promise<string>((resolve, reject) => {
    server!.once("error", (err) => {
      server = null;
      starting = null;
      reject(err);
    });
    server!.listen(0, "127.0.0.1", () => {
      const addr = server!.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve(baseUrl);
    });
  });
  return starting;
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
    html = buildDetailPage(filePath);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }
  const lang = new URL(req.url || "/", "http://127.0.0.1").searchParams.get("lang");
  // 视频目录按候选探测：`视频攻略&游戏实况`（2026-09-17 起的新名）优先、`videos`（旧名）兜底，
  // 见 core/videoLibrary.ts 的 VIDEO_DIR_NAMES。**注进 HTML 的 URL 前缀必须用实际命中的名字**
  // （页面地址是 /games/<游戏目录>/index.html，相对链接就落在它下面），所以下面要带 videoDirName。
  const videoHit = findVideoDir(path.dirname(filePath));
  const videosDir = videoHit?.path ?? "";
  const scan = scanVideos(videosDir);
  // 主题：渲染层通过 IPC set_detail_theme 送来的"当前生效配色"（见 core/detailTheme.ts）。
  // 没送过（或送的是空）时这里拿到 null → 两处注入都退化成"什么都不做"，页面保持原样。
  const theme = getDetailTheme();
  const out = injectDetailTheme(
    injectVideoSection(
      html,
      buildVideoSection({
        scan,
        // 没有视频目录时 scan 必为空、buildVideoSection 会直接返回空串，这个名字用不到。
        videoDirName: videoHit?.name ?? "",
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

/**
 * 详情页：**按数据现拼**（2026-09-18 用户："不要直接生成1285个页面，而是根据数据和框架，
 * 每次动态生成。不然，我加一个游戏，又要你写一遍页面"）。
 *
 * 落点就在"发页面"这一步 —— 主题注入、视频区块注入都在这条链上，一起生效：
 *   库里的这一行数据 → 壳页（三处占位符）→ 注入主题 → 注入视频区块 → 发出
 * 版面与选项卡由 <详情根>/_shared/detail.js 在浏览器里画（6 套，随机一套）。
 *
 * 为什么封面只给"名字"、让页面自己试扩展名：服务器不必为了一个文件名去扫整个封面目录
 * （那是全库操作）；页面按 .jpg/.jpeg/.png/.webp 试四次即可，命不中就退化成没有封面。
 */
/**
 * 找某游戏的封面文件 → `/CoverImages/<文件名>`；没有就返回空串。
 *
 * 为什么由服务器解析、而不是让页面按名字拼几种后缀去试（原做法）：
 *   试错的代价是**每个游戏 3 个 404**（控制台刷满 "CoverImages/xxx.png 404"，看着像程序坏了）。
 *   这里只做 4 次 stat（不是扫目录 —— 原注释担心的"全库操作"依然没发生），一次就给出准的。
 * 扩展名与"哪些文件算封面"同一份定义：shared/coverMatch.ts 的 COVER_IMAGE_EXTS。
 */
function findCoverUrl(gameName: string): string {
  const dir = activeCoverDir();
  for (const ext of COVER_IMAGE_EXTS) {
    const file = `${gameName}.${ext}`;
    try {
      if (fs.statSync(path.join(dir, file)).isFile()) {
        return "/CoverImages/" + encodeURIComponent(file);
      }
    } catch {
      /* 这个后缀没有，试下一个 */
    }
  }
  return "";
}

function buildDetailPage(filePath: string): string {
  const gameDir = path.dirname(filePath);
  const dirName = path.basename(gameDir);
  const shellPath = path.join(path.dirname(gameDir), "_shared", "shell.html");
  const shell = fs.readFileSync(shellPath, "utf-8");

  // 按目录名找库里这一行（详情目录以游戏名命名）；找不到就退化成只有目录名的页面，不报错。
  const g = getGames().find((x) => x.name === dirName) ?? null;

  let shots: string[] = [];
  try {
    shots = fs
      .readdirSync(path.join(gameDir, "images"))
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
  } catch {
    /* 没有 images/ 目录 = 没有截图 */
  }

  const data = {
    name: g?.name ?? dirName,
    origin: g?.originName ?? "",
    region: g?.region ?? [],
    genre: g?.genre ?? [],
    tags: g?.tags ?? [],
    platform: g?.platform ?? [],
    series: g?.series ?? [],
    developer: g?.developer ?? [],
    publisher: g?.publisher ?? [],
    version: g?.version ?? "",
    description: g?.description ?? "",
    cover: g?.name ?? dirName, // 旧字段：留着兼容老页面，新页面用下面的 coverUrl
    coverUrl: findCoverUrl(g?.name ?? dirName), // 已经解析好的、**确实存在**的那一个封面 URL（没有则空串）
    shots,
  };

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const title = `${data.name} · 游戏介绍`;
  const desc = String(data.description || "").replace(/\s+/g, " ").slice(0, 160);
  // 顺序要紧：先填 TITLE/DESC（它们是 HTML 文本），最后塞 DATA（JSON，不能过 HTML 转义）。
  // 两处讲究：
  //   · 全局替换（/g）：壳页里若还有别处出现占位符（注释、说明文字），也得一并填掉；
  //   · 替换值用**函数**给：字符串形式里 `$&` / `$'` 会被当成替换模式，而简介里完全可能
  //     出现 `$` —— 那是静默改内容，用函数返回就不受这套规则影响。
  return shell
    .replace(/\{\{TITLE\}\}/g, esc(title))
    .replace(/\{\{DESC\}\}/g, esc(desc))
    .replace(/\{\{DATA\}\}/g, () => JSON.stringify(data));
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
  // 同样按候选探测（`视频攻略&游戏实况` 优先、`videos` 兜底）；都没有 → 空结果。
  const hit = findVideoDir(path.join(root, rel));
  res.end(JSON.stringify(scanVideos(hit?.path ?? "")));
}

// 返回服务器 base URL（未启动返回空）。
export function getGameServerBaseUrl(): string {
  return baseUrl;
}

// 关闭服务器（应用退出时调用）。
// baseUrl / starting 一并清掉：不清的话下次 startGameServer 会直接返回**已经失效的旧地址**
// （那个端口早就没了），前端就又是一个打不开的空白页。
export function stopGameServer(): void {
  if (server) {
    server.close();
    server = null;
  }
  baseUrl = "";
  starting = null;
}
