// 一次性迁移脚本：把原 PlayniteTauri/release 的 SQLite 数据搬进新工程的库。
// 原库结构（games 整个序列化进 data 列）与新库结构（每个字段一列）不同，这里负责展平。
// 步骤：
//  1. 用 Python 把原库的 WAL 合并进主库（sql.js 不支持 WAL，否则会丢 185KB 未提交数据）。
//  2. sql.js 读合并后的源库，展平 games.data，写进新 schema 的 library.db。
//  3. 直接搬 users / platforms / library_plugins（列结构一致）。
// 目标库路径由 YUNGAME_DATA_DIR 决定（默认项目内 data/，已加 .gitignore）。

import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import initSqlJs from "sql.js";

const SRC_DIR = "D:/AI/Code/Playnite/PlayniteTauri/release/library";
const DATA_DIR = process.env.YUNGAME_DATA_DIR || path.join(process.cwd(), "data");
const OUT_DB = path.join(DATA_DIR, "library", "library.db");

// ---- 1. Python checkpoint 合并 WAL 到临时副本 ----
console.log("[1/4] 合并原库 WAL（checkpoint）…");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yungame-mig-"));
const tmpMain = path.join(tmpDir, "library.db");
fs.copyFileSync(path.join(SRC_DIR, "library.db"), tmpMain);
for (const ext of ["-wal", "-shm"]) {
  const f = path.join(SRC_DIR, "library.db" + ext);
  if (fs.existsSync(f)) fs.copyFileSync(f, tmpMain + ext);
}
// 用 Python 的 sqlite3 做 TRUNCATE checkpoint，把 WAL 写回主库文件。
execFileSync(
  "python",
  [
    "-c",
    "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute('PRAGMA wal_checkpoint(TRUNCATE)');c.close();print('checkpoint done')",
    tmpMain,
  ],
  { stdio: "inherit" }
);

// ---- 2. 打开源库（合并后） ----
console.log("[2/4] 读取源库…");
const SQL = await initSqlJs({ locateFile: (f) => path.join(process.cwd(), "node_modules", "sql.js", "dist", f) });
const src = new SQL.Database(new Uint8Array(fs.readFileSync(tmpMain)));

// ---- 3. 建目标库（用新 schema） ----
console.log("[3/4] 建新库并迁移数据…");
fs.mkdirSync(path.dirname(OUT_DB), { recursive: true });
const out = new SQL.Database();

const SCHEMA = `
CREATE TABLE games (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_name TEXT, localized_names TEXT,
  alternate_names TEXT, game_id TEXT, installed INTEGER, install_directory TEXT,
  play_task TEXT, other_tasks TEXT, last_played TEXT, play_count INTEGER,
  last_activity TEXT, playtime INTEGER, last_session_seconds INTEGER,
  last_session_ended_at TEXT, added TEXT, modified TEXT, category TEXT, genre TEXT,
  developer TEXT, publisher TEXT, tags TEXT, series TEXT, age_rating TEXT, region TEXT,
  source TEXT, features TEXT, release_date TEXT, community_score INTEGER,
  critic_score INTEGER, user_score INTEGER, hidden INTEGER, favorite INTEGER,
  background_image TEXT, cover_image TEXT, icon TEXT, description TEXT, notes TEXT,
  version TEXT, platform TEXT, emulator TEXT, completion_status TEXT,
  user_score_set INTEGER, manual_game INTEGER, plugin_id TEXT, links TEXT, actions TEXT,
  features_enabled INTEGER, guide TEXT, screenshots TEXT, videos TEXT, game_library TEXT,
  game_level INTEGER, pre_launch_script TEXT, pre_launch_enabled INTEGER,
  post_launch_script TEXT, post_launch_enabled INTEGER, post_exit_script TEXT,
  post_exit_enabled INTEGER
);
CREATE TABLE users (
  id TEXT PRIMARY KEY, account TEXT NOT NULL, password_hash TEXT NOT NULL, name TEXT,
  level INTEGER, kind TEXT, ip_address TEXT, created_at TEXT, deleted_at TEXT
);
CREATE TABLE platforms (
  id TEXT PRIMARY KEY, name TEXT, specification_id TEXT, icon TEXT
);
CREATE TABLE library_plugins (
  id TEXT PRIMARY KEY, name TEXT, icon TEXT, enabled INTEGER
);
`;
out.run(SCHEMA);

// ---- 迁移 games：把 data JSON 展平成列 ----
const games = src.exec("SELECT id, name, data FROM games");
let gCount = 0;
if (games[0]) {
  const ins = out.prepare(`INSERT OR REPLACE INTO games (
    id,name,sort_name,localized_names,alternate_names,game_id,installed,install_directory,
    play_task,other_tasks,last_played,play_count,last_activity,playtime,last_session_seconds,
    last_session_ended_at,added,modified,category,genre,developer,publisher,tags,series,
    age_rating,region,source,features,release_date,community_score,critic_score,user_score,
    hidden,favorite,background_image,cover_image,icon,description,notes,version,platform,
    emulator,completion_status,user_score_set,manual_game,plugin_id,links,actions,
    features_enabled,guide,screenshots,videos,game_library,game_level,pre_launch_script,
    pre_launch_enabled,post_launch_script,post_launch_enabled,post_exit_script,post_exit_enabled
  ) VALUES (
    $id,$name,$sort_name,$localized_names,$alternate_names,$game_id,$installed,$install_directory,
    $play_task,$other_tasks,$last_played,$play_count,$last_activity,$playtime,$last_session_seconds,
    $last_session_ended_at,$added,$modified,$category,$genre,$developer,$publisher,$tags,$series,
    $age_rating,$region,$source,$features,$release_date,$community_score,$critic_score,$user_score,
    $hidden,$favorite,$background_image,$cover_image,$icon,$description,$notes,$version,$platform,
    $emulator,$completion_status,$user_score_set,$manual_game,$plugin_id,$links,$actions,
    $features_enabled,$guide,$screenshots,$videos,$game_library,$game_level,$pre_launch_script,
    $pre_launch_enabled,$post_launch_script,$post_launch_enabled,$post_exit_script,$post_exit_enabled
  )`);
  for (const row of games[0].values) {
    const d = JSON.parse(row[2]);
    const j = (v) => (v == null ? null : JSON.stringify(v));
    const n = (v) => (v == null ? 0 : v);
    const b = (v) => (v ? 1 : 0);
    const s = (v) => (v == null ? null : String(v));
    ins.run({
      $id: row[0],
      $name: row[1],
      $sort_name: s(d.sortName),
      $localized_names: j(d.localizedNames),
      $alternate_names: j(d.alternateNames),
      $game_id: s(d.gameId),
      $installed: b(d.installed),
      $install_directory: s(d.installDirectory),
      $play_task: s(d.playTask),
      $other_tasks: j(d.otherTasks),
      $last_played: s(d.lastPlayed),
      $play_count: n(d.playCount),
      $last_activity: s(d.lastActivity),
      $playtime: n(d.playtime),
      $last_session_seconds: n(d.lastSessionSeconds),
      $last_session_ended_at: s(d.lastSessionEndedAt),
      $added: s(d.added),
      $modified: s(d.modified),
      $category: j(d.category),
      $genre: j(d.genre),
      $developer: j(d.developer),
      $publisher: j(d.publisher),
      $tags: j(d.tags),
      $series: j(d.series),
      $age_rating: j(d.ageRating),
      $region: j(d.region),
      $source: j(d.source),
      $features: j(d.features),
      $release_date: s(d.releaseDate),
      $community_score: d.communityScore == null ? null : n(d.communityScore),
      $critic_score: d.criticScore == null ? null : n(d.criticScore),
      $user_score: d.userScore == null ? null : n(d.userScore),
      $hidden: b(d.hidden),
      $favorite: b(d.favorite),
      $background_image: s(d.backgroundImage),
      $cover_image: s(d.coverImage),
      $icon: s(d.icon),
      $description: s(d.description),
      $notes: s(d.notes),
      $version: s(d.version),
      $platform: j(d.platform),
      $emulator: s(d.emulator),
      $completion_status: s(d.completionStatus),
      $user_score_set: b(d.userScoreSet),
      $manual_game: b(d.manualGame),
      $plugin_id: s(d.pluginId),
      $links: j(d.links),
      $actions: j(d.actions),
      $features_enabled: b(d.featuresEnabled),
      $guide: s(d.guide),
      $screenshots: j(d.screenshots),
      $videos: j(d.videos),
      $game_library: null, // 原库 data 无此字段，留空
      $game_level: n(d.gameLevel) || 1,
      $pre_launch_script: s(d.preLaunchScript),
      $pre_launch_enabled: b(d.preLaunchEnabled),
      $post_launch_script: s(d.postLaunchScript),
      $post_launch_enabled: b(d.postLaunchEnabled),
      $post_exit_script: s(d.postExitScript),
      $post_exit_enabled: b(d.postExitEnabled),
    });
    gCount++;
  }
  ins.free();
}

// ---- 迁移 users / platforms / library_plugins（列结构一致，直接搬） ----
function copyTable(name, cols) {
  const r = src.exec(`SELECT ${cols.join(",")} FROM ${name}`);
  if (!r[0]) return 0;
  const ph = cols.map((c) => "$" + c).join(",");
  const stmt = out.prepare(`INSERT OR REPLACE INTO ${name} (${cols.join(",")}) VALUES (${ph})`);
  let n = 0;
  for (const row of r[0].values) {
    const bind = {};
    cols.forEach((c, i) => (bind["$" + c] = row[i]));
    stmt.run(bind);
    n++;
  }
  stmt.free();
  return n;
}
const uCount = copyTable("users", ["id", "account", "password_hash", "name", "level", "kind", "ip_address", "created_at", "deleted_at"]);
const pCount = copyTable("platforms", ["id", "name", "specification_id", "icon"]);
const lpCount = copyTable("library_plugins", ["id", "name", "icon", "enabled"]);

// ---- 4. 落盘 ----
console.log("[4/4] 写出新库…");
const data = out.export();
fs.writeFileSync(OUT_DB, Buffer.from(data));
console.log(`迁移完成 ✅`);
console.log(`  目标库: ${OUT_DB} (${data.length} bytes)`);
console.log(`  games: ${gCount} | users: ${uCount} | platforms: ${pCount} | library_plugins: ${lpCount}`);
