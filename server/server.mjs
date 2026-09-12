// Playday 网站端后端服务器（Node 内置 http，零额外依赖）。
//
// 用途：把 Playday 以"网站"形式部署——浏览器访问，能看游戏库、详情、封面、登录，
// 但不能启动游戏（桌面端才有 spawn 进程能力）。
//
// 数据：直接复用桌面端同一份数据（library.db / config.json / CoverImages / Game_Details），
// 通过 YUNGAME_DATA_DIR 环境变量指定数据根（默认取 server/../release/data）。
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.YUNGAME_DATA_DIR || path.join(ROOT, "release", "data");
const DIST_DIR = path.join(ROOT, "dist"); // 前端构建产物（vite build 输出）
// 所有数据目录都从 config.json 解析（settings.coverImagesDir / gameDetailsDir /
// announcementsDir / libraryDir），与桌面端同一套语义 —— 见 server/paths.mjs。
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
      const gameId = body?.gameId ?? "";
      const f = path.join(DETAILS_DIR, `${gameId}.html`);
      return fs.existsSync(f) ? f : "";
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

  // 3) 游戏详情静态页：/Game_Details/<file>
  if (pathname.startsWith("/Game_Details/")) {
    const file = pathname.slice("/Game_Details/".length);
    const safe = path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, "");
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
