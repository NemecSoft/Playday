// Playday 网站端后端服务器（Node 内置 http，零额外依赖）。
//
// 用途：把 Playday 以"网站"形式部署——浏览器访问，能看游戏库、详情、封面、登录，
// 但不能启动游戏（桌面端才有 spawn 进程能力）。
//
// 数据：直接复用桌面端同一份数据（library.db / config.json / CoverImages / Game_Details），
// 通过 YUNGAME_DATA_DIR 环境变量指定数据根（默认取 server/../dev-data）。
//
// 启动：node server/server.mjs  （或双击 deploy-web.bat）
// 访问：http://localhost:8080
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveServerPaths } from "./paths.mjs";
import {
  COVER_IMAGE_EXTS,
  coverCandidateNames,
  extOf,
  isBetterCover,
  normalizeCoverName,
} from "./coverMatch.mjs";
import { devDataDir } from "../scripts/lib/devData.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
// 数据根：环境变量优先，否则用规则表（path-modes.json 的 dev 段）里那一份。
// 别再写死目录名 —— 曾经写死过，数据目录一挪，网站端就**静默**读不到库了
// （桌面端还好好的，只有网站端封面/详情全空）。取路径的逻辑见 scripts/lib/devData.mjs。
const DATA_DIR = process.env.YUNGAME_DATA_DIR || devDataDir();
const DIST_DIR = path.join(ROOT, "dist"); // 前端构建产物（vite build 输出）
// 所有数据目录都从 config.json 解析（settings.coverImagesDir / gameDetailsDir / libraryDir；
// 公告与权威库从 libraryDir 推导），与桌面端同一套语义 —— 见 server/paths.mjs。
// 以前这里把 CoverImages / Game_Details / announcements / library 全写死，
// 桌面端配了自定义目录网站端读不到（"配了没用"）。
// 注意：目录在启动时确定，改配置后需重启网站端。
const paths = resolveServerPaths({ dataRoot: DATA_DIR, appRoot: ROOT });
const DB_PATH = paths.dbPath;
const COVER_DIR = paths.coverDir;
const DETAILS_DIR = paths.detailsDir;
const PORT = Number(process.env.PORT || 8080);

// ---- 打开 sql.js（读同一份 library.db）----
import initSqlJs from "sql.js";
let db = null;
async function openDb() {
  if (db) return db;
  const SQL = await initSqlJs({
    // sql.js 的 Node 版会自动找到 wasm；这里给个兜底定位
    locateFile: (file) =>
      path.join(ROOT, "node_modules", "sql.js", "dist", file),
  });
  const buf = fs.readFileSync(DB_PATH);
  db = new SQL.Database(new Uint8Array(buf));
  return db;
}

// ---- 封面匹配（`games.cover_image` 列已废弃，不再读它）----
// 封面来源 = 运行期扫封面目录 + 按游戏名匹配同名文件，与桌面端 electron/core/covers.ts
// 同一套规则（规则本体在 shared/coverMatch.ts，本文件用的是同语义镜像 server/coverMatch.mjs）。
// 以前这里直接读 cover_image 列 —— 那个列已不再写入（导出时置空），于是新导入的游戏
// 在网站上全是空封面。
let coverIndexCache = { dir: "", mtime: 0, byName: /** @type {Map<string,string>|null} */ (null) };

/** 扫封面目录建"规范化名 → 文件绝对路径"索引；目录未变则复用。 */
function coverIndex() {
  const dir = COVER_DIR;
  let mtime = 0;
  try {
    mtime = Math.floor(fs.statSync(dir).mtimeMs / 1000);
  } catch {
    mtime = 0;
  }
  if (coverIndexCache.byName && coverIndexCache.dir === dir && coverIndexCache.mtime === mtime) {
    return coverIndexCache.byName;
  }
  const byName = new Map();
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      if (!COVER_IMAGE_EXTS.includes(extOf(e.name))) continue;
      const key = normalizeCoverName(path.parse(e.name).name);
      if (!key) continue;
      const full = path.join(dir, e.name);
      const cur = byName.get(key);
      // 网站端不做 APNG 嗅探（要读文件头，收益小）：同格式时保持先到者。
      if (
        !cur ||
        isBetterCover({ file: e.name, isApng: false }, { file: path.basename(cur), isApng: false })
      ) {
        byName.set(key, full);
      }
    }
  } catch {
    // 目录不存在 → 空索引（该游戏就没有封面，正常结果）
  }
  coverIndexCache = { dir, mtime, byName };
  return byName;
}

/** 给一个 game 对象补 coverImage（纯运行期匹配，不读已废弃的库列）。 */
function withCover(game) {
  const byName = coverIndex();
  if (!byName.size) return game;
  for (const name of coverCandidateNames(game)) {
    const key = normalizeCoverName(name);
    if (!key) continue;
    const p = byName.get(key);
    if (p) return { ...game, coverImage: p };
  }
  return { ...game, coverImage: undefined };
}

// ---- 封面读取（read_image / read_images_batch 共用）----
// 数据库存的 cover_image 是本地绝对路径（可能在 CoverImages 里），这里取
// 文件名到 CoverImages 目录里找真实文件，读成 base64 返回给前端解码成 blob。
// mime 按扩展名推断，避免把 png 内容标成 jpeg 导致某些浏览器显示异常。
function readCoverFile(p) {
  try {
    if (!p) return null;
    const file = path.basename(p);
    const full = path.join(COVER_DIR, file);
    if (!fs.existsSync(full)) return null;
    const buf = fs.readFileSync(full);
    const ext = path.extname(file).toLowerCase();
    const mime = MIME[ext]?.split(";")[0] || "image/jpeg";
    return { data: buf.toString("base64"), mime };
  } catch {
    return null;
  }
}

// ---- 行 → 前端 Game 对象（复用主进程 rowToGame 的字段映射）----
function rowToGame(r) {
  const str = (v) => (v == null ? "" : String(v));
  const num = (v) => (typeof v === "number" ? v : Number(v) || 0);
  const bool = (v) => num(v) === 1;
  const arr = (v) => {
    if (v == null) return [];
    // 已经是数组（数据库 JSON 列直接返回数组，或上游已解析过）：原样返回。
    if (Array.isArray(v)) return v;
    // 字符串：尝试 JSON 解析（TEXT 列存的 JSON 文本，如 '["RPG"]'）。
    // JSON 解析失败说明不是合法 JSON，按分隔符兜底拆（兼容逗号/分号/竖线）。
    try {
      const p = JSON.parse(String(v));
      return Array.isArray(p) ? p : [];
    } catch {
      const s = String(v).trim();
      if (!s) return [];
      return s.split(/[,;|、，；]/).map((x) => x.trim()).filter(Boolean);
    }
  };
  return {
    id: str(r.id),
    name: str(r.name),
    sortName: r.sort_name ? str(r.sort_name) : undefined,
    localizedNames: (() => { try { return JSON.parse(str(r.localized_names)) || []; } catch { return []; } })(),
    alternateNames: arr(r.alternate_names),
    gameId: r.game_id ? str(r.game_id) : undefined,
    installed: bool(r.installed),
    installDirectory: r.install_directory ? str(r.install_directory) : undefined,
    playTask: r.play_task ? str(r.play_task) : undefined,
    otherTasks: arr(r.other_tasks),
    lastPlayed: r.last_played ? str(r.last_played) : undefined,
    playtime: num(r.playtime),
    // 注意：这里**不读** r.cover_image（该列已废弃、不再写入）。封面由 withCover()
    // 在运行期按文件名匹配补上，见上面的 coverIndex()。
    backgroundColor: r.background_color ? str(r.background_color) : undefined,
    description: r.description ? str(r.description) : undefined,
    developer: r.developer ? str(r.developer) : undefined,
    publisher: r.publisher ? str(r.publisher) : undefined,
    releaseDate: r.release_date ? str(r.release_date) : undefined,
    // 社区评分：卡片"人气火爆"角标用它（> HOT_SCORE_MIN 才亮，见 src/utils/hotBadge.ts）。
    // 桌面端走 electron/core/db.ts 的同名字段；两端字段必须一致，否则网站端没有火苗。
    communityScore: r.community_score == null ? undefined : num(r.community_score),
    platforms: arr(r.platforms),
    genre: arr(r.genre),
    tags: arr(r.tags),
    category: r.category ? str(r.category) : undefined,
    hidden: bool(r.hidden),
    favorite: bool(r.favorite),
    gameLevel: num(r.game_level),
    preLaunchScript: r.pre_launch_script ? str(r.pre_launch_script) : undefined,
    postLaunchScript: r.post_launch_script ? str(r.post_launch_script) : undefined,
    actions: (() => { try { return JSON.parse(str(r.actions)) || []; } catch { return []; } })(),
    modified: r.modified ? str(r.modified) : undefined,
  };
}

// ---- API 处理：cmd → 数据 ----
async function handleApi(cmd, body) {
  const d = await openDb();
  switch (cmd) {
    case "get_games": {
      const rows = d.exec("SELECT * FROM games")[0];
      if (!rows) return [];
      const cols = rows.columns;
      return rows.values
        .map((v) => rowToGame(Object.fromEntries(cols.map((c, i) => [c, v[i]]))))
        .map(withCover);
    }
    case "get_game": {
      const id = body?.id ?? "";
      const r = d.exec("SELECT * FROM games WHERE id = $id", { $id: id })[0];
      if (!r || r.values.length === 0) return null;
      const cols = r.columns;
      // 把每行数组转成 { 列名: 值 } 的对象，交给 rowToGame 转为前端 Game 对象。
      // 注意：Object.fromEntries 需要 [key, value] 二元数组，这里补上列名 c 作为 key。
      const row = Object.fromEntries(cols.map((c, i) => [c, r.values[0][i]]));
      return withCover(rowToGame(row));
    }
    case "get_settings": {
      // 每次请求重新读：桌面端的 config.json 在 <主程序目录> 下，不在数据根里。
      // 这里以前读 <数据根>/config.json —— 等于读了个不存在/过期的文件，
      // 站点上的语言、主题、路径配置全都不是真配置。
      return resolveServerPaths({ dataRoot: DATA_DIR, appRoot: ROOT }).settings;
    }
    case "get_announcement": {
      const f = paths.announcementsFile;
      return fs.existsSync(f) ? fs.readFileSync(f, "utf-8") : "";
    }
    case "read_image": {
      // 单图读取：与 read_images_batch 同一套逻辑，兼容前端 loadOne() 的按需单图加载。
      const p = body?.path ?? "";
      if (!p) return null;
      return readCoverFile(p);
    }
    case "read_images_batch": {
      const paths = Array.isArray(body?.paths) ? body.paths : [];
      return paths.map(readCoverFile);
    }
    case "get_game_html_page": {
      // 与桌面端 electron/ipc/gameHtml.ts **同一口径**（2026-09-18 改）：
      //   判据是"**游戏目录**在不在"，不是"磁盘上有没有 index.html" ——
      //   详情页已改成按数据现拼（见下面的 sendDetailPage），1285 个静态页全删了；
      //   还看文件的话网站端会把每个游戏都判成"没有资料"，界面上就是一句
      //   "《xxx》的详情内容正在建设中"。
      // 返回 { path, dir }：dir 是实际命中的目录名（可能命中游戏 id），前端要用它拼 iframe 地址，
      // 不能拿游戏名猜 —— 形状与桌面端保持一致（旧版这里返回裸路径字符串，前端拿不到 dir）。
      for (const key of [body?.gameId, body?.gameName]) {
        if (!key) continue;
        // 只认"单个目录名"：带路径分隔符的一律不认（这是个本地服务，但别留穿越口子）
        if (/[\\/]/.test(key) || key === "." || key === "..") continue;
        const dir = path.join(DETAILS_DIR, key);
        try {
          if (fs.statSync(dir).isDirectory()) {
            return { path: path.join(dir, "index.html"), dir: key };
          }
        } catch {
          /* 这个候选不存在，试下一个（id 没命中就试游戏名） */
        }
      }
      return null;
    }
    // 桌面端独有/需要写文件的功能，网站端返回不可用（或空）。
    case "launch_game":
    case "launch_game_path":
    case "test_script":
      return { launched: false, error: "网站版不支持启动游戏" };
    case "get_app_info":
      return { appName: "Playday", version: "web" };
    default:
      // 未知命令：尝试返回默认（避免前端崩溃）
      return null;
  }
}

// ---- MIME ----
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

/**
 * 现拼某游戏的详情页（2026-09-18）。
 *
 * 背景：详情页从"每个游戏一个静态 index.html"改成"按数据现拼"了 —— 1285 个静态页已删除。
 * 这条路由以前是"从磁盘读文件"，删完就全站 404，详情页整片空白（用户实测："详情页现在没内容"）。
 *
 * 与桌面端的关系：桌面端是 electron/core/gameServer.ts 的 buildDetailPage（TS，打进 asar），
 * 网站端是零依赖的 .mjs，两者互相 import 不了，所以数据装配各有一份。**但版面只有一份** ——
 * 壳页（`<详情根>/_shared/shell.html`）与 detail.js / detail.css 是两端共用的，这里只负责
 * 把库里的那一行和目录里的截图摆进三处占位符，所以两端观感一致。
 *
 * 封面只给名字、让页面自己试扩展名：服务器不必为了一个文件名去扫整个封面目录（那是全库操作）。
 */
/**
 * 找某游戏的封面文件 → `/CoverImages/<文件名>`；没有就返回空串。
 *
 * 与桌面端 electron/core/gameServer.ts 的 findCoverUrl 同一口径（那边用 shared/coverMatch.ts 的
 * COVER_IMAGE_EXTS，这里是零依赖 .mjs 拿不到，所以把后缀名单写在这儿 —— 改一处要改两处，
 * 名单本身极少变）。为什么不做"页面自己拼后缀试 4 次"：那样每个游戏 3 个 404，控制台刷屏。
 */
const COVER_EXTS = ["jpg", "jpeg", "png", "webp"];
function findCoverUrl(gameName) {
  for (const ext of COVER_EXTS) {
    const file = `${gameName}.${ext}`;
    try {
      if (fs.statSync(path.join(COVER_DIR, file)).isFile()) {
        return "/CoverImages/" + encodeURIComponent(file);
      }
    } catch {
      /* 这个后缀没有，试下一个 */
    }
  }
  return "";
}

async function sendDetailPage(res, dirName) {
  const shellPath = path.join(DETAILS_DIR, "_shared", "shell.html");
  let shell;
  try {
    shell = fs.readFileSync(shellPath, "utf-8");
  } catch (e) {
    console.error("[detail] 读不到壳页（缺少 _shared/shell.html）：", shellPath, e?.message ?? e);
    res.writeHead(500);
    res.end("detail shell not found");
    return;
  }

  let g = null;
  try {
    const d = await openDb();
    const r = d.exec("SELECT * FROM games WHERE name = $n", { $n: dirName })[0];
    if (r && r.values.length) {
      const row = Object.fromEntries(r.columns.map((c, i) => [c, r.values[0][i]]));
      g = withCover(rowToGame(row));
    }
  } catch (e) {
    // 库里没这一行就退化成"只有目录名"的页面，不报错（与桌面端同口径）。
    console.warn("[detail] 查库失败，退化成目录名页面:", dirName, e?.message ?? e);
  }

  let shots = [];
  try {
    shots = fs
      .readdirSync(path.join(DETAILS_DIR, dirName, "images"))
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
    coverUrl: findCoverUrl(g?.name ?? dirName), // 已解析好、**确实存在**的那一个封面 URL（没有则空串）
    shots,
  };

  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const title = `${data.name} · 游戏介绍`;
  const desc = String(data.description || "").replace(/\s+/g, " ").slice(0, 160);
  // 顺序要紧：先填 TITLE/DESC（HTML 文本，要转义），最后塞 DATA（JSON，不能过 HTML 转义）。
  // 全局替换 + 函数式替换值：理由见桌面端 core/gameServer.ts 的 buildDetailPage（同一条坑）。
  const html = shell
    .replace(/\{\{TITLE\}\}/g, esc(title))
    .replace(/\{\{DESC\}\}/g, esc(desc))
    .replace(/\{\{DATA\}\}/g, () => JSON.stringify(data));
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    // 与桌面端同口径：不缓存，改完数据刷新即见。
    "Cache-Control": "no-store",
  });
  res.end(html);
}

function sendFile(res, filePath, fallbackIndex = false) {
  let p = filePath;
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    p = path.join(p, "index.html");
  }
  if (!fs.existsSync(p) && fallbackIndex) {
    p = path.join(DIST_DIR, "index.html");
  }
  if (!fs.existsSync(p)) {
    res.writeHead(404).end("Not Found");
    return;
  }
  const ext = path.extname(p).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}

// ---- 服务器 ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  // 1) API 路由：POST /api/<cmd>
  if (pathname.startsWith("/api/")) {
    const cmd = pathname.slice("/api/".length);
    let body = {};
    if (req.method === "POST") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString("utf-8");
      try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    }
    try {
      const result = await handleApi(cmd, body);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: String(e && e.message || e) }));
    }
    return;
  }

  // 2) 封面图：/CoverImages/<file>
  if (pathname.startsWith("/CoverImages/")) {
    const file = pathname.slice("/CoverImages/".length);
    const safe = path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, "");
    sendFile(res, path.join(COVER_DIR, safe));
    return;
  }

  // 3) 游戏详情页：/Game_Details/<游戏目录>[/index.html]
  //    `/<一级目录>/index.html`（或直接 `<一级目录>/`）= 详情页首页 → **现拼**（见 sendDetailPage）；
  //    更深层的路径（images/、视频、字体…）照旧按磁盘发。
  //    以前这里一律从磁盘读文件 —— 静态页删掉之后详情页整片空白，就是因为首页也没了。
  if (pathname.startsWith("/Game_Details/")) {
    const file = pathname.slice("/Game_Details/".length);
    const safe = path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, "");
    const parts = safe.split(/[\\/]/).filter(Boolean);
    if (parts.length === 1 || (parts.length === 2 && parts[1].toLowerCase() === "index.html")) {
      void sendDetailPage(res, parts[0]);
      return;
    }
    sendFile(res, path.join(DETAILS_DIR, safe));
    return;
  }

  // 4) 前端构建产物（dist/）
  sendFile(res, path.join(DIST_DIR, pathname === "/" ? "index.html" : pathname.slice(1)), true);
});

server.listen(PORT, () => {
  console.log("");
  console.log("==============================================");
  console.log("  Playday 网站版已启动");
  console.log(`  访问:  http://localhost:${PORT}`);
  console.log(`  数据:  ${DATA_DIR}`);
  console.log(`  配置:  ${paths.configFile}${fs.existsSync(paths.configFile) ? "" : "  (不存在，用默认)"}`);
  console.log(`  库:    ${paths.dbPath}`);
  console.log(`  封面:  ${paths.coverDir}`);
  console.log(`  详情:  ${paths.detailsDir}`);
  console.log(`  公告:  ${paths.announcementsFile}`);
  console.log("  (网站版不支持启动游戏，其余功能可用)");
  console.log("==============================================");
});
