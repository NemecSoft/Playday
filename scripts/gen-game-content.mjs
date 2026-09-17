#!/usr/bin/env node
/**
 * gen-game-content.mjs — 给「整库 JSON」的 games.json **补空缺**（永不覆盖你手改过的值）。
 *
 * 2026-09-16 改造：以前它产出"人工内容表" data/game-content.json，再靠
 * apply-game-content-to-db.mjs 同步进库。那条链已退役（**按固定键重建** → 加一个字段要在
 * 生成脚本、apply 脚本、守卫的必需键列表里各改一处）。现在它直接作用于**整库 JSON 的
 * games.json**（data/library/games.json，由 npm run db:export 导出）：
 *     补空缺 → 你再跑 npm run db:import（或双击 libraryjson-importto-librarydb.bat）回写库。
 *
 * 各字段的来源（只在 JSON 里**没有 / 为空**时才去取）：
 *   intro            ← 详情页 <--details 目录>/<游戏名>/info.json 的 description
 *   region / tags    ← 权威库的同名列（库里是 JSON 数组文本）
 *   community_score  ← 权威库的 community_score（**人工填**的社区评分；
 *                       卡片右上角"人气火爆"小火苗按它判，阈值见 src/utils/hotBadge.ts）
 *   game_level       ← YunGame_Gamelist.json（按 game_id 匹配，取不到 = 2）。
 *                       它是"玩这个游戏需要的**权限等级**"：1 = 黄金版、2 = 钻石版
 *                       （黄金用户只能玩 1，钻石用户 1/2 都能玩）—— 不是关卡难度。
 *   save_paths       ← LiteDB 导出里的 GameActions：指向 GameSaveHelper 的那条 action
 *                       （识别/切分规则见 scripts/playnite-savepaths.mjs）
 *   show_bat_console ← 权威库的同名列（三态：NULL = 跟随全局设置 / 0 = 强制隐藏 / 1 = 强制显示）
 *                       ⚠️ 权威库**当前没有这一列**（实测），所以只有你在 games.json 里显式写了
 *                       这个键、并用 library-json.mjs --add-columns 建过列之后才会有值可补。
 *
 * ⚠️ 覆盖规则（重要）：**只补空** —— JSON 里非空的值永不被覆盖（手写优先）。
 *    唯一例外是两个显式开关：--refresh-level / --refresh-savepaths（按外部来源重算这两项）。
 *
 * 用法：
 *   node scripts/gen-game-content.mjs --dry-run            # 只看会补哪些，不写文件
 *   node scripts/gen-game-content.mjs                      # 写回 data/library/games.json
 *   node scripts/gen-game-content.mjs --refresh-level      # 按 YunGame_Gamelist 重算权限等级
 *   node scripts/gen-game-content.mjs --refresh-savepaths  # 按 LiteDB 重取存档路径
 *
 * （旧的 --drop-orphans 已去掉：当年"内容表里多出来的条目"要清理，而现在 games.json 就是
 *   游戏库本身 —— "外部清单里没有"的游戏是正常游戏，删它等于删游戏。要删请直接删那一行。）
 */
import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";
import { collectSavePaths } from "./playnite-savepaths.mjs";
import { LIBRARY_JSON_DIR } from "./lib/libraryJson.mjs";
import { adminDbPath, devDataDir } from "./lib/devData.mjs";

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const root = process.cwd();
// 目标：整库 JSON 里的 games.json（目录名唯一来源是 scripts/lib/libraryJson.mjs）
const JSON_FILE = argOf("--json", path.join(root, LIBRARY_JSON_DIR, "games.json"));
// 数据根与权威库位置来自规则表（scripts/lib/devData.mjs），别硬写目录名。
const GAMES = argOf("--games", path.join(devDataDir(), "litedb-games.json"));
const GAMELIST = argOf("--gamelist", "D:/YunGame/PlayNite/YunGameConfig/YunGame_Gamelist.json");
const DETAILS_DIR = argOf("--details", "D:/Addons");
const ADMIN_DB = argOf("--db", adminDbPath());
const DRY = has("--dry-run");
const REFRESH_LEVEL = has("--refresh-level");
const REFRESH_SAVEPATHS = has("--refresh-savepaths");

console.log("== 补齐 games.json 的空缺 ==");
console.log("目标    :", path.relative(root, JSON_FILE));
console.log("游戏清单:", GAMES);
console.log("游戏列表:", GAMELIST);
console.log("详情页  :", DETAILS_DIR);
console.log("权威库  :", ADMIN_DB);
console.log(
  "模式    :",
  DRY ? "DRY-RUN（不写文件）" : "写文件",
  REFRESH_LEVEL ? "｜重算 game_level" : "｜保留已有 game_level",
  REFRESH_SAVEPATHS ? "｜重取 save_paths" : "｜保留已有 save_paths",
  "\n",
);

const normId = (s) => String(s ?? "").trim().toLowerCase().replace(/-/g, "");
/** 名称归一化（仅匹配用）：去零宽字符、空白折叠、小写。不做模糊匹配。 */
const normName = (s) =>
  String(s ?? "")
    .replace(/[\u200b-\u200f\ufeff\u00a0]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const asArr = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
/** 库里 region/tags 这类列存 JSON 数组文本；解析不了当空（绝不因此打断整次补齐）。 */
const parseArrText = (s) => {
  try {
    const v = JSON.parse(String(s ?? "[]"));
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
};

// ---- 0. 读目标 games.json（不存在就明确报错：先导出一次）----
if (!fs.existsSync(JSON_FILE)) {
  console.error(
    `[错误] 找不到 ${path.relative(root, JSON_FILE)} —— 先导出整库 JSON：npm run db:export`,
  );
  process.exit(1);
}
const rows = JSON.parse(fs.readFileSync(JSON_FILE, "utf-8"));
if (!Array.isArray(rows)) {
  console.error(`[错误] ${path.relative(root, JSON_FILE)} 的顶层必须是数组（一行一个游戏）。`);
  process.exit(1);
}
console.log(`目标文件: ${rows.length} 行（其中的非空值将被保留）\n`);

// ---- 1. 游戏清单（LiteDB 导出）----
const games = JSON.parse(fs.readFileSync(GAMES, "utf-8"));

// ---- 2. 存档路径（同一份导出里的 GameActions）----
const savedPaths = collectSavePaths(games);
console.log(
  `存档路径: ${savedPaths.stats.withPaths}/${savedPaths.stats.games} 个游戏有路径（多路径 ${savedPaths.stats.multiPath} 个）`,
);
if (savedPaths.stats.oddActionNames.length) {
  console.log(
    `   注意：${savedPaths.stats.oddActionNames.length} 条的 action 名字不是"备份游戏存档"（按工具路径仍认了出来，供你确认）：`,
  );
  for (const s of savedPaths.stats.oddActionNames) console.log(`     · ${s}`);
}

// ---- 3. game_level（YunGame_Gamelist.json）----
const levelById = new Map();
try {
  const list = JSON.parse(fs.readFileSync(GAMELIST, "utf-8"));
  for (const it of list) {
    const id = normId(it.GameId);
    if (id) levelById.set(id, Number(it.GameLevel) || 2);
  }
} catch (e) {
  console.error("读游戏列表失败（game_level 将沿用 JSON 里的值 / 兜底 2）:", e.message);
}

// ---- 4. 详情页简介（<details>/<游戏名>/info.json）----
const introByFolder = new Map();
for (const e of fs.readdirSync(DETAILS_DIR, { withFileTypes: true })) {
  if (!e.isDirectory()) continue;
  const f = path.join(DETAILS_DIR, e.name, "info.json");
  if (!fs.existsSync(f)) continue;
  let desc = "";
  try {
    desc = String(JSON.parse(fs.readFileSync(f, "utf-8")).description ?? "");
  } catch {
    const m = fs.readFileSync(f, "utf-8").match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    desc = m ? m[1] : "";
  }
  desc = desc.replace(/\s+/g, " ").trim();
  if (desc) introByFolder.set(e.name, desc);
}
const introByFolderNorm = new Map();
for (const [k, v] of introByFolder) introByFolderNorm.set(normName(k), v);

// ---- 5. 权威库的 region / tags / community_score / show_bat_console（只补空）----
const dbRecById = new Map();
const dbRecByName = new Map();
if (fs.existsSync(ADMIN_DB)) {
  const SQL = await initSqlJs({
    locateFile: (f) => path.join(root, "node_modules", "sql.js", "dist", f),
  });
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(ADMIN_DB)));
  // 老库可能还没有 show_bat_console 这列（客户端只迁移运行时副本，权威库由脚本维护）。
  // 缺了就用 NULL 顶上：等于"这些游戏还没配逐游戏覆盖"，而不是让整次补齐崩掉。
  const hasBatCol =
    db
      .exec("PRAGMA table_info(games)")[0]
      ?.values.some((r) => r[1] === "show_bat_console") ?? false;
  for (const [gameId, name, region, tags, score, batConsole] of db.exec(
    hasBatCol
      ? "SELECT game_id, name, region, tags, community_score, show_bat_console FROM games"
      : "SELECT game_id, name, region, tags, community_score, NULL FROM games",
  )[0].values) {
    const rec = {
      region: parseArrText(region),
      tags: parseArrText(tags),
      score: Number(score) || 0,
      // 三态：库里 NULL = 没配（跟随全局）；下面按"有值才补"处理。
      batConsole:
        batConsole === null || batConsole === undefined ? null : Number(batConsole) ? true : false,
    };
    dbRecByName.set(normName(name), rec);
    if (gameId) dbRecById.set(normId(gameId), rec);
  }
  db.close();
} else {
  console.error(`权威库不存在（region/tags 无法补全）: ${ADMIN_DB}`);
}

// ---- 6. 逐行补齐（只补空，绝不覆盖）----
const stat = {
  intro: 0,
  region: 0,
  tags: 0,
  community_score: 0,
  game_level: 0,
  save_paths: 0,
  show_bat_console: 0,
  unknownInLiteDb: [],
};
// 外部清单（LiteDB 导出）里出现过的键 —— 用来报"清单里没提到的行"（只报，不动它们）。
const liteKeys = new Set();
for (const g of games) {
  liteKeys.add(normId(String(g.GameId ?? "").trim()));
  liteKeys.add(normName(String(g.Name ?? "").trim()));
}

for (const row of rows) {
  if (!row || typeof row !== "object" || Array.isArray(row)) continue;
  const name = String(row.name ?? "").trim();
  if (!name) continue;
  const gameId = String(row.game_id ?? "").trim();
  if (!liteKeys.has(normId(gameId)) && !liteKeys.has(normName(name))) stat.unknownInLiteDb.push(name);

  // ---- intro：空才补（详情页来源）----
  const introNow = String(row.intro ?? "").replace(/\s+/g, " ").trim();
  if (!introNow) {
    const src =
      introByFolder.get(name) ?? introByFolderNorm.get(normName(name)) ?? "";
    if (src) {
      row.intro = src;
      stat.intro++;
    }
  }

  // ---- region / tags：空数组才补（权威库来源）----
  const rec = dbRecById.get(normId(gameId)) ?? dbRecByName.get(normName(name));
  if (row.region !== undefined && asArr(row.region).length === 0 && rec?.region.length) {
    row.region = rec.region;
    stat.region++;
  }
  if (row.tags !== undefined && asArr(row.tags).length === 0 && rec?.tags.length) {
    row.tags = rec.tags;
    stat.tags++;
  }

  // ---- community_score：没填（0 / 空）才补；**只在正数时写**（0 = 没设过，别把一片 NULL 刷成 0）----
  if (!(Number(row.community_score) > 0) && rec?.score > 0) {
    row.community_score = rec.score;
    stat.community_score++;
  }

  // ---- game_level：没值才补；--refresh-level 时按游戏列表重算 ----
  const levelNow = Number(row.game_level);
  const levelFromList = levelById.get(normId(gameId));
  if (REFRESH_LEVEL && levelFromList !== undefined && levelFromList !== levelNow) {
    row.game_level = levelFromList;
    stat.game_level++;
  } else if (!Number.isFinite(levelNow) && levelFromList !== undefined) {
    row.game_level = levelFromList;
    stat.game_level++;
  }

  // ---- save_paths：空数组才补；--refresh-savepaths 时强制按 LiteDB 重取 ----
  const spSrc = savedPaths.byGameId.get(normId(gameId)) ?? savedPaths.byName.get(name) ?? [];
  const spNow = asArr(row.save_paths);
  if (spSrc.length && (REFRESH_SAVEPATHS ? JSON.stringify(spSrc) !== JSON.stringify(spNow) : spNow.length === 0)) {
    row.save_paths = spSrc;
    stat.save_paths++;
  }

  // ---- show_bat_console：**只有 JSON 里显式写了这个键、但值是 null 时**才从库里补 ----
  // 刻意的：绝大多数游戏没配过，不该往 1285 行里塞满这个键（那个键本身就是"有配置"的标记）；
  // 而且权威库当前没有这列，乱塞会让 library-json.mjs 报"库里不存在的列"。
  if (Object.prototype.hasOwnProperty.call(row, "show_bat_console") && row.show_bat_console === null && rec?.batConsole !== null && rec?.batConsole !== undefined) {
    row.show_bat_console = rec.batConsole ? 1 : 0;
    stat.show_bat_console++;
  }
}

// ---- 7. 写出 ----
if (DRY) {
  console.log("（DRY-RUN：未写文件）");
} else {
  fs.writeFileSync(JSON_FILE, JSON.stringify(rows, null, 2) + "\n", "utf-8");
  console.log(`已写出: ${path.relative(root, JSON_FILE)}（${rows.length} 行）\n`);
}

console.log("本次补齐（只补空，非空值一律保留）：");
console.log(`  intro           ${stat.intro} 行`);
console.log(`  region          ${stat.region} 行`);
console.log(`  tags            ${stat.tags} 行`);
console.log(`  community_score ${stat.community_score} 行（未设置的行 = 卡片不亮火爆角标）`);
console.log(`  game_level      ${stat.game_level} 行`);
console.log(`  save_paths      ${stat.save_paths} 行`);
console.log(`  show_bat_console ${stat.show_bat_console} 行（只有显式写了这个键的行才可能被补）`);
if (stat.unknownInLiteDb.length) {
  console.log(
    `\n  外部清单里没提到的 ${stat.unknownInLiteDb.length} 行（保持原样，不删）：${stat.unknownInLiteDb
      .slice(0, 8)
      .join("、")}${stat.unknownInLiteDb.length > 8 ? " …" : ""}`,
  );
}
console.log(
  DRY
    ? "\n（DRY-RUN 结束。确认无误后去掉 --dry-run 真写；写完再 npm run db:import 回写库。）"
    : "\n下一步：npm run db:import（或双击 libraryjson-importto-librarydb.bat）把改动回写进库，然后重启客户端。",
);
