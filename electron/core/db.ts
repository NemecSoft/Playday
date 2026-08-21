// 数据库核心：用 sql.js（SQLite 的 WebAssembly 版，纯 wasm 无需原生编译）
// 替代原 Rust 的 rusqlite。所有业务数据（游戏库/用户/设置）都存在这里，
// 路径由 paths.ts 解析（exe 同级 library/library.db）。
//
// 关键点：
//  1. sql.js 是异步初始化的，所以 openDb() 必须 await。
//  2. wasm 在内存里运行数据库，必须显式 export 成二进制写回文件才算持久化。
//  3. 每次写操作后调用 persist() 把内存里的库导出成 .db 文件。

import * as fs from "fs";
import * as path from "path";
import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import {
  databasePath,
  adminDatabasePath,
  runtimeDatabasePath,
  isAdminMode,
} from "./paths";
import type { AppUser, CurrentUser, Game, GameLibrary, LibraryStats } from "./models";

// 全局的 sql.js 静态对象（init 一次复用）。
let SQL: SqlJsStatic | null = null;
// 当前打开的数据库连接。
let db: Database | null = null;

// 建表语句。和原 Rust 的 schema 字段一一对应。
const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    origin_name TEXT,
    localized_names TEXT,
    alternate_names TEXT,
    game_id TEXT,
    installed INTEGER,
    install_directory TEXT,
    play_task TEXT,
    other_tasks TEXT,
    last_played TEXT,
    play_count INTEGER,
    last_activity TEXT,
    playtime INTEGER,
    last_session_seconds INTEGER,
    last_session_ended_at TEXT,
    added TEXT,
    modified TEXT,
    category TEXT,
    genre TEXT,
    developer TEXT,
    publisher TEXT,
    tags TEXT,
    series TEXT,
    age_rating TEXT,
    region TEXT,
    source TEXT,
    features TEXT,
    release_date TEXT,
    community_score INTEGER,
    critic_score INTEGER,
    user_score INTEGER,
    hidden INTEGER,
    favorite INTEGER,
    background_image TEXT,
    cover_image TEXT,
    icon TEXT,
    description TEXT,
    notes TEXT,
    version TEXT,
    platform TEXT,
    emulator TEXT,
    completion_status TEXT,
    user_score_set INTEGER,
    manual_game INTEGER,
    plugin_id TEXT,
    links TEXT,
    actions TEXT,
    features_enabled INTEGER,
    guide TEXT,
    screenshots TEXT,
    videos TEXT,
    game_library TEXT,
    game_level INTEGER,
    pre_launch_script TEXT,
    pre_launch_enabled INTEGER,
    post_launch_script TEXT,
    post_launch_enabled INTEGER,
    post_exit_script TEXT,
    post_exit_enabled INTEGER,
    save_paths TEXT,
    monitor_exe TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    account TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    level INTEGER,
    kind TEXT,
    ip_address TEXT,
    created_at TEXT,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS game_libraries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT
);

CREATE TABLE IF NOT EXISTS platform (
    id TEXT PRIMARY KEY,
    name TEXT,
    specification_id TEXT,
    icon TEXT
);
`;

// 初始化 sql.js 并打开（或创建）数据库文件。
export async function openDb(): Promise<Database> {
  if (db) return db;

  // 只 init 一次。
  if (!SQL) {
    // locateFile 告诉 sql.js 去哪加载 wasm 文件。
    // 打包后 sql.js 在 app.asar/node_modules/sql.js/dist 下，主进程 __dirname 是
    // app.asar/dist-electron/electron/core/，所以要从 core/ 上三级到 asar 根再进 node_modules。
    // 开发态 __dirname 是 工程根/dist-electron/electron/core/，上三级正好到工程根，也成立。
    // 多给几个候选路径，任何一个存在就用哪个，避免 asar / 外置两种布局都兼容不了。
    SQL = await initSqlJs({
      locateFile: (file: string) => {
        const candidates = [
          // 上三级：打包态 app.asar/node_modules、开发态 工程根/node_modules
          path.join(__dirname, "..", "..", "..", "node_modules", "sql.js", "dist", file),
          // 上两级：某些布局下 sql.js 被平铺到 dist-electron 同级
          path.join(__dirname, "..", "..", "node_modules", "sql.js", "dist", file),
          // 兜底：当前工作目录下的 node_modules
          path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
        ];
        for (const c of candidates) {
          if (fs.existsSync(c)) return c;
        }
        return file;
      },
    });
  }

  const dbPath = databasePath();

  // 客户端启动缓存机制：权威库在 <数据根>/Admin/library.db（管理端修改后下发），
  // 运行时库在 <数据根>/library/library.db。客户端每次启动先看权威库在不在，
  // 在就把它复制成新的运行时库，再用运行时库。这样下发更新不影响正在运行的客户端，
  // 重启后自动用最新下发版本。管理端直接用权威库，不走复制。
  if (!isAdminMode()) {
    const adminPath = adminDatabasePath();
    const runPath = runtimeDatabasePath();
    try {
      if (fs.existsSync(adminPath)) {
        const dir = path.dirname(runPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(adminPath, runPath);
      }
      // Admin 库不存在（纯客户端、从未下发过）：回退用现有运行时库，不复制。
    } catch (e) {
      // 复制失败（如文件被占用）不致命：继续用现有运行时库。
      console.error("[db] 从 Admin 复制运行时库失败:", e);
    }
  } else {
    // 管理端：直接操作权威库 <数据根>/Admin/library.db。
    // 首次迁移：如果权威库还不存在，但现有运行时库（老库）在，就把老库提升为权威，
    // 避免"从旧版升级到双库机制"后管理端打开一个空库而丢掉已有游戏数据。
    try {
      const adminPath = adminDatabasePath();
      const runPath = runtimeDatabasePath();
      if (!fs.existsSync(adminPath) && fs.existsSync(runPath)) {
        const dir = path.dirname(adminPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(runPath, adminPath);
      }
    } catch (e) {
      console.error("[db] 首次提升老库为权威库失败:", e);
    }
  }

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(dbPath)) {
    // 已有文件：读入内存。注意 sql.js 需要 Uint8Array。
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(new Uint8Array(fileBuffer));
  } else {
    // 首次：建空库并跑建表语句。
    db = new SQL.Database();
    db.run(SCHEMA);
    persist();
  }

  // 确保表存在（文件存在但可能缺某些表）。
  db.run(SCHEMA);
  // 迁移：旧库可能缺 save_paths 列（存档管理新增），补上。
  migrateAddColumns();
  return db;
}

// 对已存在的旧库做增量列迁移：确保新加的列存在。
// 用 PRAGMA table_info 检查，缺列则 ALTER TABLE ADD COLUMN。
function migrateAddColumns(): void {
  try {
    if (!db) return;
    const cols = db.exec("PRAGMA table_info(games)")[0]?.values.map((r) => r[1]) ?? [];
    if (!cols.includes("save_paths")) {
      db.run("ALTER TABLE games ADD COLUMN save_paths TEXT");
      persist();
    }
    if (!cols.includes("monitor_exe")) {
      db.run("ALTER TABLE games ADD COLUMN monitor_exe TEXT");
      persist();
    }
  } catch (e) {
    console.error("[db] 迁移 save_paths/monitor_exe 列失败:", e);
  }
}

// 把内存里的库导出成二进制并写回磁盘，实现"持久化"。
export function persist(): void {
  if (!db) return;
  const data = db.export();
  const dbPath = databasePath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// 关闭数据库连接（退出前调用）。
export function closeDb(): void {
  if (db) {
    persist();
    db.close();
    db = null;
  }
}

// 一个通用的"读多行并转成对象数组"的帮助函数。
function allRows<T>(sql: string, params: Record<string, unknown> = {}): T[] {
  if (!db) throw new Error("数据库未打开，请先调用 openDb()");
  const stmt = db.prepare(sql);
  stmt.bind(params as never);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

// 一个通用的"读单行"的帮助函数。
function oneRow<T>(sql: string, params: Record<string, unknown> = {}): T | null {
  const rows = allRows<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// ===== 游戏库 CRUD =====

export function getGames(): Game[] {
  const rows = allRows<Record<string, unknown>>("SELECT * FROM games");
  return rows.map((r) => rowToGame(r));
}

export function getGame(id: string): Game | null {
  const row = oneRow<Record<string, unknown>>("SELECT * FROM games WHERE id = $id", { $id: id });
  return row ? rowToGame(row) : null;
}

/**
 * 规范化"库占位符路径"，保证存库的都是合法格式 `{库名}\相对路径\文件`。
 *
 * 用户在管理端填启动路径时，占位符 `{Gamelibrary1}` 后面可能随手多敲/少敲斜杠或
 * 混用正反斜杠，例如：
 *   `{Gamelibrary1}\game1\game.exe`  ✅（本来就对，保留）
 *   `{Gamelibrary1}game1/game.exe`   ❌（少一个 \，/ 混用）
 *   `{Gamelibrary1}//game1\\game.exe`❌（重复斜杠）
 *   `{Gamelibrary1}/game1\game.exe`  ❌（/ 开头）
 * 本函数统一归一化成 `{Gamelibrary1}\game1\game.exe`。
 * 只处理以 `{...}` 占位符开头的路径；普通绝对路径（D:\Games\...）原样不动。
 */
function normalizeLibPath(input?: string | null): string | null {
  if (!input) return null;
  let s = input.trim();
  if (!s) return null;
  // 只规范以 {占位符} 开头的库路径
  const m = s.match(/^\{[^}]+\}/);
  if (!m) return s;
  const placeholder = m[0];
  let rest = s.slice(placeholder.length);
  // 去掉 rest 开头的 ./ .\ / \ 等冗余符号
  rest = rest.replace(/^[\\/\.]+/, "");
  // 内部统一成反斜杠，并去掉重复分隔符
  rest = rest.replace(/[\\/]+/g, "\\");
  rest = rest.replace(/^\\+/, "");
  if (!rest) return placeholder; // 只有占位符没有后续路径
  return `${placeholder}\\${rest}`;
}

export function upsertGame(game: Game): void {
  if (!db) throw new Error("数据库未打开");
  // 统一规范化库占位符路径：installDirectory 和每个 action 的 path / workingDir。
  // 这样无论从管理端、客户端还是脚本入口保存，入库的都是 {占位符}\相对路径 合法格式，
  // 不会再有 ".\Gamelibrary\..." 和 "{Gamelibrary1}\..." 两套写法不一致的问题。
  game.installDirectory = normalizeLibPath(game.installDirectory) ?? undefined;
  if (Array.isArray(game.actions)) {
    game.actions = game.actions.map((a) => ({
      ...a,
      path: normalizeLibPath(a.path) ?? undefined,
      workingDir: normalizeLibPath(a.workingDir) ?? undefined,
    }));
  }
  const now = new Date().toISOString();
  const values = {
    $id: game.id,
    $name: game.name,
    $origin_name: game.originName ?? null,
    $localized_names: JSON.stringify(game.localizedNames ?? []),
    $alternate_names: JSON.stringify(game.alternateNames ?? []),
    $game_id: game.gameId ?? null,
    $installed: game.installed ? 1 : 0,
    $install_directory: game.installDirectory ?? null,
    $play_task: game.playTask ?? null,
    $other_tasks: JSON.stringify(game.otherTasks ?? []),
    $last_played: game.lastPlayed ?? null,
    $play_count: game.playCount ?? 0,
    $last_activity: game.lastActivity ?? null,
    $playtime: game.playtime ?? 0,
    $last_session_seconds: game.lastSessionSeconds ?? 0,
    $last_session_ended_at: game.lastSessionEndedAt ?? null,
    $added: game.added ?? now,
    $modified: now,
    $category: JSON.stringify(game.category ?? []),
    $genre: JSON.stringify(game.genre ?? []),
    $developer: JSON.stringify(game.developer ?? []),
    $publisher: JSON.stringify(game.publisher ?? []),
    $tags: JSON.stringify(game.tags ?? []),
    $series: JSON.stringify(game.series ?? []),
    $age_rating: JSON.stringify(game.ageRating ?? []),
    $region: JSON.stringify(game.region ?? []),
    $source: JSON.stringify(game.source ?? []),
    $features: JSON.stringify(game.features ?? []),
    $release_date: game.releaseDate ?? null,
    $community_score: game.communityScore ?? null,
    $critic_score: game.criticScore ?? null,
    $user_score: game.userScore ?? null,
    $hidden: game.hidden ? 1 : 0,
    $favorite: game.favorite ? 1 : 0,
    $background_image: game.backgroundImage ?? null,
    $cover_image: game.coverImage ?? null,
    $icon: game.icon ?? null,
    $description: game.description ?? null,
    $notes: game.notes ?? null,
    $version: game.version ?? null,
    $platform: JSON.stringify(game.platform ?? []),
    $emulator: game.emulator ?? null,
    $completion_status: game.completionStatus ?? null,
    $user_score_set: game.userScoreSet ? 1 : 0,
    $manual_game: game.manualGame ? 1 : 0,
    $plugin_id: game.pluginId ?? null,
    $links: JSON.stringify(game.links ?? []),
    $actions: JSON.stringify(game.actions ?? []),
    $features_enabled: game.featuresEnabled ? 1 : 0,
    $guide: game.guide ?? null,
    $screenshots: JSON.stringify(game.screenshots ?? []),
    $videos: JSON.stringify(game.videos ?? []),
    $game_library: game.gameLibrary ?? null,
    $game_level: game.gameLevel ?? 1,
    $pre_launch_script: game.preLaunchScript ?? null,
    $pre_launch_enabled: game.preLaunchEnabled ? 1 : 0,
    $post_launch_script: game.postLaunchScript ?? null,
    $post_launch_enabled: game.postLaunchEnabled ? 1 : 0,
    $post_exit_script: game.postExitScript ?? null,
    $post_exit_enabled: game.postExitEnabled ? 1 : 0,
    $save_paths: JSON.stringify(game.savePaths ?? []),
    $monitor_exe: game.monitorExe ?? null,
  };
  db.run(
    `INSERT INTO games (
      id, name, origin_name, localized_names, alternate_names, game_id, installed,
      install_directory, play_task, other_tasks, last_played, play_count, last_activity,
      playtime, last_session_seconds, last_session_ended_at, added, modified, category,
      genre, developer, publisher, tags, series, age_rating, region, source, features,
      release_date, community_score, critic_score, user_score, hidden, favorite,
      background_image, cover_image, icon, description, notes, version, platform,
      emulator, completion_status, user_score_set, manual_game, plugin_id, links,
      actions, features_enabled, guide, screenshots, videos, game_library, game_level,
      pre_launch_script, pre_launch_enabled, post_launch_script, post_launch_enabled,
      post_exit_script, post_exit_enabled, save_paths, monitor_exe
    ) VALUES (
      $id, $name, $origin_name, $localized_names, $alternate_names, $game_id, $installed,
      $install_directory, $play_task, $other_tasks, $last_played, $play_count, $last_activity,
      $playtime, $last_session_seconds, $last_session_ended_at, $added, $modified, $category,
      $genre, $developer, $publisher, $tags, $series, $age_rating, $region, $source, $features,
      $release_date, $community_score, $critic_score, $user_score, $hidden, $favorite,
      $background_image, $cover_image, $icon, $description, $notes, $version, $platform,
      $emulator, $completion_status, $user_score_set, $manual_game, $plugin_id, $links,
      $actions, $features_enabled, $guide, $screenshots, $videos, $game_library, $game_level,
      $pre_launch_script, $pre_launch_enabled, $post_launch_script, $post_launch_enabled,
      $post_exit_script, $post_exit_enabled, $save_paths, $monitor_exe
    )
    ON CONFLICT(id) DO UPDATE SET
      name=$name, origin_name=$origin_name, localized_names=$localized_names,
      alternate_names=$alternate_names, game_id=$game_id, installed=$installed,
      install_directory=$install_directory, play_task=$play_task, other_tasks=$other_tasks,
      last_played=$last_played, play_count=$play_count, last_activity=$last_activity,
      playtime=$playtime, last_session_seconds=$last_session_seconds,
      last_session_ended_at=$last_session_ended_at, added=$added, modified=$modified,
      category=$category, genre=$genre, developer=$developer, publisher=$publisher,
      tags=$tags, series=$series, age_rating=$age_rating, region=$region, source=$source,
      features=$features, release_date=$release_date, community_score=$community_score,
      critic_score=$critic_score, user_score=$user_score, hidden=$hidden, favorite=$favorite,
      background_image=$background_image, cover_image=$cover_image, icon=$icon,
      description=$description, notes=$notes, version=$version, platform=$platform,
      emulator=$emulator, completion_status=$completion_status, user_score_set=$user_score_set,
      manual_game=$manual_game, plugin_id=$plugin_id, links=$links, actions=$actions,
      features_enabled=$features_enabled, guide=$guide, screenshots=$screenshots,
      videos=$videos, game_library=$game_library, game_level=$game_level,
      pre_launch_script=$pre_launch_script, pre_launch_enabled=$pre_launch_enabled,
      post_launch_script=$post_launch_script, post_launch_enabled=$post_launch_enabled,
      post_exit_script=$post_exit_script, post_exit_enabled=$post_exit_enabled,
      save_paths=$save_paths, monitor_exe=$monitor_exe`,
    values as never
  );
  persist();
}

export function deleteGame(id: string): void {
  if (!db) throw new Error("数据库未打开");
  db.run("DELETE FROM games WHERE id = $id", { $id: id });
  persist();
}

// 批量更新多个游戏的封面路径。这是给启动时的封面匹配用的：
// 如果像 upsertGame 那样一张一张写，每张都要把整个内存库导出写盘一次，
// 几百张封面就是几百次全库序列化，启动会非常慢。
// 这里改为循环执行 UPDATE 但只在最后 persist() 一次，把写盘从"每张一次"降到"总共一次"。
export function updateCoverImages(entries: Array<{ id: string; coverImage: string }>): void {
  if (!db) throw new Error("数据库未打开");
  if (!entries || entries.length === 0) return;
  const stmt = db.prepare("UPDATE games SET cover_image = $cover, modified = $m WHERE id = $id");
  const now = new Date().toISOString();
  for (const e of entries) {
    stmt.bind({ $id: e.id, $cover: e.coverImage, $m: now } as never);
    stmt.step();
    stmt.reset();
  }
  stmt.free();
  persist();
}

export function updateGamePlaytime(id: string, playtime: number, lastPlayed?: string): void {
  if (!db) throw new Error("数据库未打开");
  db.run("UPDATE games SET playtime=$playtime, last_played=$lastPlayed, modified=$m WHERE id=$id", {
    $id: id,
    $playtime: playtime,
    $lastPlayed: lastPlayed ?? new Date().toISOString(),
    $m: new Date().toISOString(),
  });
  persist();
}

export function updateGameLastSession(id: string, seconds: number, endedAt?: string): void {
  if (!db) throw new Error("数据库未打开");
  db.run(
    "UPDATE games SET last_session_seconds=$s, last_session_ended_at=$e, modified=$m WHERE id=$id",
    { $id: id, $s: seconds, $e: endedAt ?? new Date().toISOString(), $m: new Date().toISOString() }
  );
  persist();
}

export function setGameFavorite(id: string, favorite: boolean): void {
  if (!db) throw new Error("数据库未打开");
  db.run("UPDATE games SET favorite=$f, modified=$m WHERE id=$id", {
    $id: id,
    $f: favorite ? 1 : 0,
    $m: new Date().toISOString(),
  });
  persist();
}

export function setGameHidden(id: string, hidden: boolean): void {
  if (!db) throw new Error("数据库未打开");
  db.run("UPDATE games SET hidden=$h, modified=$m WHERE id=$id", {
    $id: id,
    $h: hidden ? 1 : 0,
    $m: new Date().toISOString(),
  });
  persist();
}

export function libraryStats(): LibraryStats {
  // 性能优化：原来这里是 getGames() 把 1271 个游戏全部 SELECT * 再逐行转对象做统计，
  // 很浪费。改成用单条 SQL 聚合查询直接算总数/已装/收藏/隐藏/总时长，
  // 平台和类型分布也只用一条 GROUP BY，避免把整张表搬到内存。
  if (!db) {
    return {
      totalGames: 0, installedGames: 0, installedPct: 0, totalPlaytime: 0,
      totalSize: 0, favoriteGames: 0, hiddenGames: 0, platformBreakdown: [], genreBreakdown: [],
    };
  }
  let totalGames = 0;
  let installedGames = 0;
  let totalPlaytime = 0;
  let favoriteGames = 0;
  let hiddenGames = 0;

  const agg = db.exec(
    `SELECT COUNT(*) AS total,
            SUM(installed) AS installed,
            SUM(playtime) AS playtime,
            SUM(favorite) AS favorite,
            SUM(hidden) AS hidden
     FROM games`
  );
  if (agg[0] && agg[0].values.length > 0) {
    const r = agg[0].values[0];
    totalGames = Number(r[0]) || 0;
    installedGames = Number(r[1]) || 0;
    totalPlaytime = Number(r[2]) || 0;
    favoriteGames = Number(r[3]) || 0;
    hiddenGames = Number(r[4]) || 0;
  }

  // 平台/类型分布：platform 和 genre 列存的是 JSON 数组字符串。
  // 只把这两列读出来按项计数（不读整行、不转成完整 Game 对象），开销很小。
  const parseArr = (v: unknown): string[] => {
    if (!v) return [];
    try {
      const p = JSON.parse(String(v));
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  };
  const platformMap = new Map<string, number>();
  const genreMap = new Map<string, number>();
  const rows = allRows<Record<string, unknown>>("SELECT platform, genre FROM games");
  for (const r of rows) {
    for (const p of parseArr(r.platform)) platformMap.set(p, (platformMap.get(p) || 0) + 1);
    for (const g of parseArr(r.genre)) genreMap.set(g, (genreMap.get(g) || 0) + 1);
  }
  const platformBreakdown = [...platformMap.entries()].map(([name, count]) => ({ name, count }));
  const genreBreakdown = [...genreMap.entries()].map(([name, count]) => ({ name, count }));

  return {
    totalGames,
    installedGames,
    installedPct: totalGames ? Math.round((installedGames / totalGames) * 100) : 0,
    totalPlaytime,
    totalSize: 0, // 体积有需要再扫描文件计算
    favoriteGames,
    hiddenGames,
    platformBreakdown,
    genreBreakdown,
  };
}

// ===== 用户 CRUD =====

export function upsertUser(u: AppUser): void {
  if (!db) throw new Error("数据库未打开");
  db.run(
    `INSERT INTO users (id, account, password_hash, name, level, kind, ip_address, created_at, deleted_at)
     VALUES ($id, $account, $password_hash, $name, $level, $kind, $ip, $created_at, $deleted_at)
     ON CONFLICT(id) DO UPDATE SET
       account=$account, password_hash=$password_hash, name=$name, level=$level,
       kind=$kind, ip_address=$ip, created_at=$created_at, deleted_at=$deleted_at`,
    {
      $id: u.id,
      $account: u.account,
      $password_hash: u.passwordHash,
      $name: u.name,
      $level: u.level,
      $kind: u.kind,
      $ip: u.ipAddress,
      $created_at: u.createdAt,
      $deleted_at: u.deletedAt ?? null,
    } as never
  );
  persist();
}

// 按账号查用户（用于账号登录）。
export function getUserByAccount(account: string): AppUser | null {
  const row = oneRow<Record<string, unknown>>("SELECT * FROM users WHERE account = $account AND (deleted_at IS NULL OR deleted_at = '')", {
    $account: account,
  });
  return row ? rowToUser(row) : null;
}

// 按 IP 查用户（用于企业用户匹配）。
export function getUserByIp(ip: string): AppUser | null {
  const rows = allRows<Record<string, unknown>>("SELECT * FROM users WHERE kind='enterprise' AND (deleted_at IS NULL OR deleted_at = '')");
  // 企业用户按"配置里的 IP 段"匹配，这里先做精确匹配，具体策略由登录逻辑决定。
  for (const r of rows) {
    const u = rowToUser(r);
    if (u.ipAddress === ip) return u;
  }
  return null;
}

export function listUsers(): AppUser[] {
  const rows = allRows<Record<string, unknown>>("SELECT * FROM users WHERE deleted_at IS NULL OR deleted_at = ''");
  return rows.map((r) => rowToUser(r));
}

// 列出所有用户（含软删除的），管理端用来展示"可恢复"的已删用户。
export function listAllUsers(): AppUser[] {
  const rows = allRows<Record<string, unknown>>("SELECT * FROM users");
  return rows.map((r) => rowToUser(r));
}

// 恢复一个被软删除的用户（清空 deleted_at）。
export function restoreUser(id: string): AppUser | null {
  if (!db) throw new Error("数据库未打开");
  db.run("UPDATE users SET deleted_at=NULL WHERE id=$id", { $id: id });
  persist();
  return getUserById(id);
}

// 按 id 查用户（含软删除的）。
export function getUserById(id: string): AppUser | null {
  const row = oneRow<Record<string, unknown>>("SELECT * FROM users WHERE id = $id", { $id: id });
  return row ? rowToUser(row) : null;
}

export function deleteUser(id: string): void {
  if (!db) throw new Error("数据库未打开");
  db.run("UPDATE users SET deleted_at=$t WHERE id=$id", {
    $id: id,
    $t: new Date().toISOString(),
  });
  persist();
}

// 用企业用户列表整体替换库里现有的 kind=enterprise 用户（重新导入时先清旧的）。
// 返回实际写入的数量。
export function replaceEnterpriseUsers(users: AppUser[]): number {
  if (!db) throw new Error("数据库未打开");
  db.run("DELETE FROM users WHERE kind='enterprise'");
  let n = 0;
  for (const u of users) {
    db.run(
      `INSERT INTO users (id, account, password_hash, name, level, kind, ip_address, created_at, deleted_at)
       VALUES ($id, $account, $password_hash, $name, $level, $kind, $ip, $created_at, $deleted_at)`,
      {
        $id: u.id,
        $account: u.account,
        $password_hash: u.passwordHash,
        $name: u.name,
        $level: u.level,
        $kind: u.kind,
        $ip: u.ipAddress,
        $created_at: u.createdAt,
        $deleted_at: u.deletedAt ?? null,
      } as never
    );
    n++;
  }
  persist();
  return n;
}

// ===== 游戏库（按根目录组织） CRUD =====

export function getGameLibraries(): GameLibrary[] {
  const rows = allRows<Record<string, unknown>>("SELECT * FROM game_libraries");
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    path: r.path ? String(r.path) : "",
  }));
}

export function upsertGameLibrary(lib: GameLibrary): void {
  if (!db) throw new Error("数据库未打开");
  db.run(
    `INSERT INTO game_libraries (id, name, path) VALUES ($id, $name, $path)
     ON CONFLICT(id) DO UPDATE SET name=$name, path=$path`,
    { $id: lib.id, $name: lib.name, $path: lib.path } as never
  );
  persist();
}

export function deleteGameLibrary(id: string): void {
  if (!db) throw new Error("数据库未打开");
  db.run("DELETE FROM game_libraries WHERE id = $id", { $id: id });
  persist();
}

// ===== 行转对象（把 0/1 还原成布尔，JSON 字符串还原成数组） =====

function rowToGame(r: Record<string, unknown>): Game {
  const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
  const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
  const bool = (v: unknown): boolean => num(v) === 1;
  const arr = (v: unknown): string[] => {
    if (!v) return [];
    try {
      const p = JSON.parse(str(v));
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  };
  return {
    id: str(r.id),
    name: str(r.name),
    originName: r.origin_name ? str(r.origin_name) : undefined,
    localizedNames: (() => {
      try {
        return JSON.parse(str(r.localized_names)) as Game["localizedNames"];
      } catch {
        return [];
      }
    })(),
    alternateNames: arr(r.alternate_names),
    gameId: r.game_id ? str(r.game_id) : undefined,
    installed: bool(r.installed),
    installDirectory: r.install_directory ? str(r.install_directory) : undefined,
    playTask: r.play_task ? str(r.play_task) : undefined,
    otherTasks: arr(r.other_tasks),
    lastPlayed: r.last_played ? str(r.last_played) : undefined,
    playCount: num(r.play_count),
    lastActivity: r.last_activity ? str(r.last_activity) : undefined,
    playtime: num(r.playtime),
    lastSessionSeconds: num(r.last_session_seconds),
    lastSessionEndedAt: r.last_session_ended_at ? str(r.last_session_ended_at) : undefined,
    added: str(r.added),
    modified: str(r.modified),
    category: arr(r.category),
    genre: arr(r.genre),
    developer: arr(r.developer),
    publisher: arr(r.publisher),
    tags: arr(r.tags),
    series: arr(r.series),
    ageRating: arr(r.age_rating),
    region: arr(r.region),
    source: arr(r.source),
    features: arr(r.features),
    releaseDate: r.release_date ? str(r.release_date) : undefined,
    communityScore: r.community_score === null ? undefined : num(r.community_score),
    criticScore: r.critic_score === null ? undefined : num(r.critic_score),
    userScore: r.user_score === null ? undefined : num(r.user_score),
    hidden: bool(r.hidden),
    favorite: bool(r.favorite),
    backgroundImage: r.background_image ? str(r.background_image) : undefined,
    coverImage: r.cover_image ? str(r.cover_image) : undefined,
    icon: r.icon ? str(r.icon) : undefined,
    description: r.description ? str(r.description) : undefined,
    notes: r.notes ? str(r.notes) : undefined,
    version: r.version ? str(r.version) : undefined,
    platform: arr(r.platform),
    emulator: r.emulator ? str(r.emulator) : undefined,
    completionStatus: r.completion_status ? str(r.completion_status) : undefined,
    userScoreSet: bool(r.user_score_set),
    manualGame: bool(r.manual_game),
    pluginId: r.plugin_id ? str(r.plugin_id) : undefined,
    links: (() => {
      try {
        return JSON.parse(str(r.links)) as Game["links"];
      } catch {
        return [];
      }
    })(),
    actions: (() => {
      try {
        return JSON.parse(str(r.actions)) as Game["actions"];
      } catch {
        return [];
      }
    })(),
    featuresEnabled: bool(r.features_enabled),
    guide: r.guide ? str(r.guide) : undefined,
    screenshots: arr(r.screenshots),
    videos: (() => {
      try {
        return JSON.parse(str(r.videos)) as Game["videos"];
      } catch {
        return [];
      }
    })(),
    gameLibrary: r.game_library ? str(r.game_library) : undefined,
    gameLevel: num(r.game_level) || 1,
    preLaunchScript: r.pre_launch_script ? str(r.pre_launch_script) : undefined,
    preLaunchEnabled: bool(r.pre_launch_enabled),
    postLaunchScript: r.post_launch_script ? str(r.post_launch_script) : undefined,
    postLaunchEnabled: bool(r.post_launch_enabled),
    postExitScript: r.post_exit_script ? str(r.post_exit_script) : undefined,
    postExitEnabled: bool(r.post_exit_enabled),
    savePaths: (() => {
      try {
        const p = JSON.parse(str(r.save_paths));
        if (!Array.isArray(p)) return undefined;
        // 兼容两种存储：旧版 [{id,path}]（取 path）与新版 ["path"]（直接用）。
        // 统一返回纯字符串数组（简洁存储，不存 id）。
        return p
          .map((x: unknown) => (typeof x === "string" ? x : (x as { path?: string })?.path))
          .filter((x: unknown): x is string => typeof x === "string" && x.length > 0);
      } catch {
        return undefined;
      }
    })(),
    monitorExe: r.monitor_exe ? str(r.monitor_exe) : undefined,
  };
}

function rowToUser(r: Record<string, unknown>): AppUser {
  const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
  return {
    id: str(r.id),
    account: str(r.account),
    passwordHash: str(r.password_hash),
    name: str(r.name),
    level: typeof r.level === "number" ? r.level : Number(r.level) || 1,
    kind: str(r.kind),
    ipAddress: str(r.ip_address),
    createdAt: str(r.created_at),
    deletedAt: r.deleted_at ? str(r.deleted_at) : undefined,
  };
}
