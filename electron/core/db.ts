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
  sourceDatabasePath,
  runtimeDatabasePath,
} from "./paths";
import { sameFilePath, shouldSyncDatabase, type FileStamp } from "../../shared/librarySync";
import { parseStoredBatConsole } from "../../shared/launchPaths";
import type { AppUser, SessionUser, Game, LibraryStats } from "./models";

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
    intro TEXT,
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
    monitor_exe TEXT,
    -- 逐游戏"运行 .bat/.cmd 时显示控制台"的**三态**覆盖：
    --   NULL = 该游戏没配 → 跟随全局设置（config.json 的 showBatConsole）
    --   0 / 1 = 强制隐藏 / 强制显示
    -- 刻意**不给默认值**：NULL 必须与 0 区分开，否则"跟随全局"这个态就没了。
    -- 归并规则与两个会静默失效的写法见 shared/launchPaths.ts。
    show_bat_console INTEGER
);

-- 业务上游戏名唯一：与 Playnite 对齐（一个名字只能对应一个游戏），防止重名。
CREATE UNIQUE INDEX IF NOT EXISTS idx_games_name ON games(name);

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

CREATE TABLE IF NOT EXISTS platform (
    id TEXT PRIMARY KEY,
    name TEXT,
    specification_id TEXT,
    icon TEXT
);
`;

/**
 * 权威库 → 运行时副本：比"大小 + 修改时间"，**不一致就复制**（规则见 shared/librarySync.ts）。
 *
 * ⏱ 调用时机 = **应用启动**（`main.ts` 的 `app.whenReady()`，用户指定："启动就比较"），
 *    openDb() 里还会再调一次做幂等兜底（走到 enterSystem / 自检都拿得到最新副本）。
 *    为什么拆出来：这一步很轻（一次 stat；不一致时本机实测复制 7.7ms），
 *    真正拖慢启动的是"sql.js 初始化 + 把库读进内存"——那个仍然留在点"进入系统"时。
 *
 * 两条细节都是踩出来的：
 *   1) 判定为"大小 + 修改时间都相同才跳过"；权威库在 `//NAS` 上时省掉的是一次实打实的网络读。
 *      复制必须用 `cpSync` 的 `preserveTimestamps` 把权威库的 mtime 带过去 —— 否则副本会被打上
 *      "现在"的时间戳，两边永远不一致、判定永远为"要复制"（优化就白写了）。
 *   2) 复制走"临时文件 + rename"（原子）：避免中途被杀留下半截文件 —— 那正是下次启动打不开的根源。
 *
 * ⚠️ 方向**永远单向**：只读权威库、只写副本。客户端任何地方都不许写权威库
 *    （`persist()` 里有硬断言挡着，见 `sameFilePath`）。
 */
export function syncRuntimeDatabase(): void {
  const sourcePath = sourceDatabasePath();
  const runPath = runtimeDatabasePath();
  try {
    const srcStamp = fileStamp(sourcePath);
    const dstStamp = fileStamp(runPath);
    if (shouldSyncDatabase(srcStamp, dstStamp)) {
      const dir = path.dirname(runPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = `${runPath}.tmp`;
      fs.cpSync(sourcePath, tmp, { preserveTimestamps: true });
      fs.renameSync(tmp, runPath); // 同卷 rename 是原子的
      console.log(`[db] 已从权威库复制运行时副本（${srcStamp?.size ?? 0} 字节）`);
    } else if (srcStamp) {
      console.log("[db] 运行时副本与权威库一致（大小/时间相同），跳过复制");
    }
  } catch (e) {
    // 复制失败（如文件被占用）不致命：继续用现有运行时副本（打不开还有下面的自愈）。
    console.error("[db] 从权威库复制运行时副本失败:", e);
  }
}

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

  // 权威库 → 运行时副本：与"应用启动"那一步是**同一份实现**（用户指定：启动就比较、不一致就复制）。
  // 这里再调一次是幂等兜底 —— 直接调 openDb() 的入口（如 exe --check 自检）也能拿到最新副本。
  // 之后**所有读写都只在副本上**，重启即回到权威数据。
  // 为什么这么设计（核心原因）：玩家可能**正在游戏**，而存档操作要读库里的存档路径；
  //   此时一旦发生"更新"，library/library.db 可能被破坏 → 存档就做不了。
  //   副本可丢弃 + 每次启动重建，就能把"更新破坏"限制在临时文件上。
  syncRuntimeDatabase();

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(dbPath)) {
    db = openRuntimeOrRecover(dbPath);
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

/** 取文件的大小 + mtime（不存在或不可读返回 null）。 */
function fileStamp(p: string): FileStamp | null {
  try {
    const st = fs.statSync(p);
    return { size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return null;
  }
}

/**
 * 尝试打开一个 db 文件；**不可用返回 null**（不抛错）。
 *
 * ⚠️ 必须实测一句查询，不能只看构造函数：sql.js 对"非 SQLite 内容"**不抛错**
 * （实测：`new SQL.Database(垃圾)` 正常返回，要等第一次查询才报
 * `file is not a database`）。只靠 try/catch 会以为打开成功了，
 * 然后在后面的 `db.run(SCHEMA)` 才炸 —— 那时已经没法体面地自愈了。
 */
function tryOpenDatabase(p: string): Database | null {
  let candidate: Database;
  try {
    candidate = new SQL!.Database(new Uint8Array(fs.readFileSync(p)));
  } catch {
    return null;
  }
  try {
    candidate.exec("SELECT count(*) FROM sqlite_master");
    return candidate;
  } catch {
    return null;
  }
}

/**
 * 打开运行时副本；**不可用就自愈**（"副本可丢弃"设计的最后一道保险）。
 *
 * 场景：玩家正在游戏时发生更新/异常退出 → `library/library.db` 被写坏、被占用或只剩半截。
 * 正常情况下启动时那次"从权威库复制"已经把它覆盖成好文件；但那次复制也可能失败
 * （文件被占用等），此时不能因为一个临时文件坏掉就起不来：
 *   1) 坏文件**改名留档**（`library.db.corrupt-<时间戳>`，便于事后排查，不直接删）；
 *   2) 从权威库重新复制一份并复验；
 *   3) 连权威库都没有 → **明确报错**（不静默建空库，否则看起来像"数据全没了"）。
 */
function openRuntimeOrRecover(dbPath: string): Database {
  const direct = tryOpenDatabase(dbPath);
  if (direct) return direct;

  console.error("[db] 运行时副本不可用（可能被更新/异常退出写坏），尝试从权威库重建");
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const bak = `${dbPath}.corrupt-${stamp}`;
    fs.renameSync(dbPath, bak);
    console.error("[db] 损坏的运行时副本已留档:", bak);
  } catch {
    /* 改名失败也继续尝试重建 */
  }

  const sourcePath = sourceDatabasePath();
  if (!fs.existsSync(sourcePath)) {
    throw new Error(
      `运行时库已损坏，且权威库不存在，无法自动恢复。请把备份放回：${sourcePath}` +
        `（损坏副本已留档为 ${dbPath}.corrupt-*）`,
    );
  }
  fs.copyFileSync(sourcePath, dbPath);
  const rebuilt = tryOpenDatabase(dbPath);
  if (!rebuilt) {
    throw new Error(`从权威库重建运行时副本后仍无法打开：${dbPath}（权威库：${sourcePath}）`);
  }
  console.log("[db] 已从权威库重建运行时副本:", dbPath);
  return rebuilt;
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
    if (!cols.includes("show_bat_console")) {
      // 可空且**不加默认值** —— NULL 与 0 是两种不同含义（见 SCHEMA 里那段说明）。
      db.run("ALTER TABLE games ADD COLUMN show_bat_console INTEGER");
      persist();
    }
  } catch (e) {
    console.error("[db] 迁移 save_paths/monitor_exe/show_bat_console 列失败:", e);
  }
}

// 把内存里的库导出成二进制并写回磁盘，实现"持久化"。
export function persist(): void {
  if (!db) return;
  const data = db.export();
  const dbPath = databasePath();

  // 硬保护（用户要求："客户端绝对不能回写权威库"）：写目标只能是运行时副本。
  // 不靠自觉 —— 以后谁改了路径解析、或误把写目标指到源库，这里当场抛错，
  // 而不是**静默覆盖**掉唯一的那份权威数据。判据是纯函数 sameFilePath（有单测）。
  const sourcePath = sourceDatabasePath();
  if (sameFilePath(dbPath, sourcePath)) {
    throw new Error(`[db] 拒绝写权威库（源库只读，客户端只许写运行时副本）：${dbPath}`);
  }

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// 关闭数据库连接（退出前调用）。
// ⚠️ **不写库**（2026-09-16 用户指定："退出应用，不能写库"）：每个写操作都在改完之后自己
//    `persist()` 落过盘了（见上面每个 CRUD 与 migrateAddColumns），退出时再整体导出一遍是
//    **纯多余的重写**；而且它会把运行时副本的 mtime 改成"退出时刻"，破坏"大小 + 修改时间一致
//    就跳过复制"的判定 —— 表现就是"明明什么都没改，下次启动还是复制一遍"。
export function closeDb(): void {
  if (db) {
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

export function upsertGame(game: Game): void {
  if (!db) throw new Error("数据库未打开");
  // 2026-09-16 起这里**不再改写路径**：以前会把 `{库名}\…` 统一规范成"占位符 + 反斜杠"格式
  // （normalizeLibPath），而库占位符随 game_libraries 一起废弃了 —— 现在路径按原样入库
  // （绝对路径 / `{InstallDir}\…` 两种形态都直接存）。
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
    // 注意：这里**没有** $cover_image —— games.cover_image 列已废弃（保留不删、不再写入）。
    // 封面是运行期按文件名匹配算出来的内存值（shared/coverMatch.ts），写回库没有意义，
    // 还会把"本次匹配结果"沉淀成脏数据。列保留只为旧库兼容。
    $icon: game.icon ?? null,
    $description: game.description ?? null,
    $intro: game.intro ?? null,
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
    // 三态：undefined（该游戏没配）必须落成 NULL，**不能落成 0** —— 落 0 会被读成
    // "强制隐藏"，这些游戏就再也不跟随全局开关了（见 shared/launchPaths.ts 的说明）。
    $show_bat_console: game.showBatConsole === undefined ? null : game.showBatConsole ? 1 : 0,
  };
  db.run(
    `INSERT INTO games (
      id, name, origin_name, localized_names, alternate_names, game_id, installed,
      install_directory, play_task, other_tasks, last_played, play_count, last_activity,
      playtime, last_session_seconds, last_session_ended_at, added, modified, category,
      genre, developer, publisher, tags, series, age_rating, region, source, features,
      release_date, community_score, critic_score, user_score, hidden, favorite,
      background_image, icon, description, intro, notes, version, platform,
      emulator, completion_status, user_score_set, manual_game, plugin_id, links,
      actions, features_enabled, guide, screenshots, videos, game_library, game_level,
      pre_launch_script, pre_launch_enabled, post_launch_script, post_launch_enabled,
      post_exit_script, post_exit_enabled, save_paths, monitor_exe, show_bat_console
    ) VALUES (
      $id, $name, $origin_name, $localized_names, $alternate_names, $game_id, $installed,
      $install_directory, $play_task, $other_tasks, $last_played, $play_count, $last_activity,
      $playtime, $last_session_seconds, $last_session_ended_at, $added, $modified, $category,
      $genre, $developer, $publisher, $tags, $series, $age_rating, $region, $source, $features,
      $release_date, $community_score, $critic_score, $user_score, $hidden, $favorite,
      $background_image, $icon, $description, $intro, $notes, $version, $platform,
      $emulator, $completion_status, $user_score_set, $manual_game, $plugin_id, $links,
      $actions, $features_enabled, $guide, $screenshots, $videos, $game_library, $game_level,
      $pre_launch_script, $pre_launch_enabled, $post_launch_script, $post_launch_enabled,
      $post_exit_script, $post_exit_enabled, $save_paths, $monitor_exe, $show_bat_console
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
      background_image=$background_image, icon=$icon,
      description=$description, intro=$intro, notes=$notes, version=$version, platform=$platform,
      emulator=$emulator, completion_status=$completion_status, user_score_set=$user_score_set,
      manual_game=$manual_game, plugin_id=$plugin_id, links=$links, actions=$actions,
      features_enabled=$features_enabled, guide=$guide, screenshots=$screenshots,
      videos=$videos, game_library=$game_library, game_level=$game_level,
      pre_launch_script=$pre_launch_script, pre_launch_enabled=$pre_launch_enabled,
      post_launch_script=$post_launch_script, post_launch_enabled=$post_launch_enabled,
      post_exit_script=$post_exit_script, post_exit_enabled=$post_exit_enabled,
      save_paths=$save_paths, monitor_exe=$monitor_exe,
      show_bat_console=$show_bat_console`,
    values as never
  );
  persist();
}

export function deleteGame(id: string): void {
  if (!db) throw new Error("数据库未打开");
  db.run("DELETE FROM games WHERE id = $id", { $id: id });
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
    intro: r.intro ? str(r.intro) : undefined,
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
    // 三态：可空列的 NULL 必须映射成 undefined（= 跟随全局）。
    // ⚠️ 不能写成 !!r.show_bat_console —— NULL 会变成 false（强制隐藏），
    // 等于给所有游戏强写了"总是隐藏"，全局开关就此变成死设置。
    showBatConsole: parseStoredBatConsole(r.show_bat_console),
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
