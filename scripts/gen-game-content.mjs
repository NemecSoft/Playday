// 生成 / 补齐「游戏内容总表」 data/game-content.json —— 本项目的**人工内容源文件**。
//
// 这个文件的性质（别搞错）：
//   它是**人工维护、长期保留**的数据（简介/地区/标签），不是构建产物，所以放在仓库根
//   的 data/ 里并纳入 git（release/ 下的东西按 .gitignore 是"只放行 library/announcements/
//   config.json"的，放那儿等于随时会丢）。
//   脚本的职责只是**补空缺**：你手写的值永远优先，绝不被覆盖。
//
// 各字段来源（只在"文件里没有/为空"时才去取）：
//   name/gameid ← games.db（LiteDB）导出 dev-data/litedb-games.json
//                 （导出命令见 scripts/export-litedb-games.ps1 头部注释）
//   intro       ← 详情页 <gameDetailsDir>/<游戏名>/info.json 的 description
//   region/tags ← 权威库 dev-data/Admin/library.db 的同名列（库里是 JSON 数组文本）
//   savepaths   ← 同一份 LiteDB 导出里的 GameActions：指向 GameSaveHelper 的那条 action
//                 （名字通常叫"备份游戏存档"，识别按**工具路径**，见 scripts/playnite-savepaths.mjs），
//                 参数是「游戏名 + 若干带引号的路径」→ 取路径、分隔符统一成 `/`
//   gamelevel  ← YunGame_Gamelist.json（按 id 匹配，取不到 = 2）。它是"玩这个游戏
//                 需要的**权限等级**"：1 = 黄金版、2 = 钻石版（黄金用户只能玩 1，
//                 钻石用户 1/2 都能玩）—— **不是**关卡难度等级，别写错注释。
//   score      ← 权威库的 community_score（社区评分，**人工填**的字段，库里默认几乎全空）。
//                 卡片右上角"人气火爆"小火苗就是按它判的（> HOT_SCORE_MIN=100，见
//                 src/utils/hotBadge.ts）。没填过就不写出这个键，别往 1283 条里塞满 0。
//   batconsole ← 权威库的 show_bat_console（逐游戏"显示 bat 控制台"的**三态**覆盖，
//                 2026-09-15 加）：true/false = 覆盖、null = 跟随全局设置。
//                 ⚠️ 本脚本是**按固定键重建**内容表的 —— 下面 entry 组装里没带上它，
//                 下次生成就会把手写的值**悄悄抹掉**（不报错）。所以它必须一直留着。
//
// 文件里的书写格式（为手写方便，由本脚本统一写出）：
//   tags   = "#休闲#生存#卡通#烧脑"（# 分隔；空 = ""）
//   region = "国产"（单个值直写；多个才用 # 连成 "国产#日本"；空 = ""）
//
// 覆盖规则（重要）：
//   · intro / region / tags：文件里非空 → **原样保留**；空或缺失 → 用上面的来源补。
//   · gamelevel：默认也**保留**文件里的值；想按游戏列表重算，加 --refresh-level。
//   · savepaths：同上（手写优先）；想按 LiteDB 里的 action 重取一遍，加 --refresh-savepaths。
//   · batconsole：同上（手写优先，含显式写的 null）；文件里没有这个键时才从权威库取。
//   · 文件里有、但 games.db 里已不存在的条目：**保留**（那是你的编辑），并在报告里列出；
//     确认要清理时加 --drop-orphans。
//
// 用法：
//   node scripts/gen-game-content.mjs                    # 补齐并写回（不会覆盖已有值）
//   node scripts/gen-game-content.mjs --dry-run          # 只看报告，不写文件
//   node scripts/gen-game-content.mjs --refresh-level    # 用 gamelist 重算 gamelevel
//   node scripts/gen-game-content.mjs --drop-orphans     # 同时删掉已不在清单里的条目
import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";
import { collectSavePaths } from "./playnite-savepaths.mjs";
import { adminDbPath, devDataDir } from "./lib/devData.mjs";

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const root = process.cwd();
const CONTENT = argOf("--out", path.join(root, "data/game-content.json"));
// 数据根与权威库位置来自规则表（scripts/lib/devData.mjs），别硬写目录名。
const GAMES = argOf("--games", path.join(devDataDir(), "litedb-games.json"));
const GAMELIST = argOf("--gamelist", "D:/YunGame/PlayNite/YunGameConfig/YunGame_Gamelist.json");
const DETAILS_DIR = argOf("--details", "D:/Addons");
const ADMIN_DB = argOf("--db", adminDbPath());
const DRY = has("--dry-run");
const REFRESH_LEVEL = has("--refresh-level");
const REFRESH_SAVEPATHS = has("--refresh-savepaths");
const DROP_ORPHANS = has("--drop-orphans");

console.log("== 生成/补齐 游戏内容总表 ==");
console.log("内容文件:", path.relative(root, CONTENT));
console.log("游戏清单:", GAMES);
console.log("游戏列表:", GAMELIST);
console.log("详情页  :", DETAILS_DIR);
console.log("权威库  :", ADMIN_DB);
console.log(
  "模式    :",
  DRY ? "DRY-RUN（不写文件）" : "写文件",
  REFRESH_LEVEL ? "｜重算 gamelevel" : "｜保留已有 gamelevel",
  REFRESH_SAVEPATHS ? "｜重取 savepaths" : "｜保留已有 savepaths",
  "\n"
);

const normId = (s) => String(s ?? "").trim().toLowerCase().replace(/-/g, "");
const guidOf = (v) =>
  typeof v === "string" ? v : typeof v?.$guid === "string" ? v.$guid : "";
/** 名称归一化（仅匹配用）：去零宽字符、空白折叠、小写。不做模糊匹配。 */
const normName = (s) =>
  String(s ?? "")
    .replace(/[\u200b-\u200f\ufeff\u00a0]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
/**
 * 地区 / 标签的文本 → 字符串数组（文件里手写格式见下方 tagsText / regionText）。
 * 有 `#` 就只按 `#` 拆（标签本身可以含逗号/斜杠）；没有 `#` 时才按 `, ， 、 /` 拆。
 */
const asArr = (v) => {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return [];
  const parts = s.includes("#") ? s.split("#") : s.split(/[,，、/]/);
  return parts.map((x) => x.trim()).filter(Boolean);
};
/**
 * 写进文件的格式（与用户手写习惯一致）：
 *   标签 = `#休闲#生存`（前导 # 起手，多个标签连写）
 *   地区 = `国产`（单个值就写单个；多个才用 # 连：`国产#日本`）
 * 空值一律写 ""（比 [] 好读好写）。
 */
const tagsText = (arr) => (arr.length ? "#" + arr.join("#") : "");
const regionText = (arr) => arr.join("#");
const nonEmpty = (v) => (Array.isArray(v) ? v.length > 0 : String(v ?? "").trim() !== "");

// ---- 0. 读已有内容文件（不存在就是首次生成）----
let existing = [];
if (fs.existsSync(CONTENT)) {
  existing = JSON.parse(fs.readFileSync(CONTENT, "utf-8"));
  console.log(`已有内容文件: ${existing.length} 条（其中的非空值将被保留）`);
} else {
  console.log("已有内容文件: 不存在 → 首次生成");
}

// ---- 1. 游戏清单（games.db 导出）----
const games = JSON.parse(fs.readFileSync(GAMES, "utf-8"));

// ---- 1.5 存档路径（同一份导出里的 GameActions）----
// 识别/解析规则见 scripts/playnite-savepaths.mjs 的文件头
// （为什么按"工具路径"识别、为什么取"引号里的片段"而不是去掉第一个词）。
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

// ---- 2. gamelevel（YunGame_Gamelist.json）----
const levelById = new Map();
try {
  const list = JSON.parse(fs.readFileSync(GAMELIST, "utf-8"));
  for (const it of list) {
    const id = normId(it.GameId);
    if (id) levelById.set(id, Number(it.GameLevel) || 2);
  }
} catch (e) {
  console.error("读游戏列表失败（gamelevel 将沿用文件里的值 / 兜底 2）:", e.message);
}

// ---- 3. 详情页简介 ----
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

// ---- 4. 权威库的 region / tags（只在文件里为空时补）----
const regionTagsById = new Map();
const regionTagsByName = new Map();
const parseArrText = (s) => {
  try {
    const v = JSON.parse(String(s ?? "[]"));
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
};
if (fs.existsSync(ADMIN_DB)) {
  const SQL = await initSqlJs({
    locateFile: (f) => path.join(root, "node_modules", "sql.js", "dist", f),
  });
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(ADMIN_DB)));
  // 老库可能还没有 show_bat_console 这列（客户端只迁移运行时副本，Admin 由脚本维护）。
  // 缺了就用 NULL 顶上：等于"这些游戏还没配逐游戏覆盖"，而不是让整次生成崩掉。
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
      // 三态：库里 NULL = 没配（跟随全局）→ 这里用 null 表示；下面按"有值才写键"处理。
      batConsole:
        batConsole === null || batConsole === undefined ? null : Number(batConsole) ? true : false,
    };
    regionTagsByName.set(normName(name), rec);
    if (gameId) regionTagsById.set(normId(gameId), rec);
  }
  db.close();
} else {
  console.error(`权威库不存在（region/tags 无法补全）: ${ADMIN_DB}`);
}

// ---- 5. 已有条目建索引 ----
const existingByKey = new Map(); // 归一化 gameid / 归一化 name → 条目
for (const it of existing) {
  if (it?.gameid) existingByKey.set(normId(it.gameid), it);
  if (it?.name) existingByKey.set(normName(it.name), it);
}

// ---- 6. 逐游戏组装（保留优先）----
const out = [];
const seen = new Set();
let keptIntro = 0;
let filledIntro = 0;
let keptRegion = 0;
let keptTags = 0;
let filledRegion = 0;
let filledTags = 0;
let keptLevel = 0;
let refreshedLevel = 0;
let keptScore = 0;
let filledScore = 0;
let keptSavePaths = 0;
let filledSavePaths = 0;

for (const g of games) {
  const name = String(g.Name ?? "").trim();
  const gameId = String(g.GameId ?? "").trim();
  const liteId = guidOf(g._id);
  const prev = existingByKey.get(normId(gameId)) ?? existingByKey.get(normName(name));

  const introPrev = String(prev?.intro ?? "").replace(/\s+/g, " ").trim();
  const introSrc = introByFolder.get(name) ?? introByFolderNorm.get(normName(name)) ?? "";
  const intro = introPrev || introSrc;
  if (introPrev) keptIntro++;
  else if (introSrc) filledIntro++;

  const rt = regionTagsById.get(normId(gameId)) ?? regionTagsByName.get(normName(name));
  const regionPrev = asArr(prev?.region);
  const tagsPrev = asArr(prev?.tags);
  const region = regionPrev.length ? regionPrev : (rt?.region ?? []);
  const tags = tagsPrev.length ? tagsPrev : (rt?.tags ?? []);
  if (regionPrev.length) keptRegion++;
  else if (region.length) filledRegion++;
  if (tagsPrev.length) keptTags++;
  else if (tags.length) filledTags++;

  // 社区评分（人工填）：文件里填过（> 0）就保留，否则取库里的值；两边都没有 = 没设过
  const scorePrev = Number(prev?.score) > 0 ? Number(prev.score) : 0;
  const score = scorePrev || Number(rt?.score) || 0;
  if (scorePrev) keptScore++;
  else if (score) filledScore++;

  let level;
  if (!REFRESH_LEVEL && prev && (typeof prev.gamelevel === "number" || prev.gamelevel != null)) {
    level = Number(prev.gamelevel);
    keptLevel++;
  } else {
    level =
      levelById.get(normId(gameId)) ??
      levelById.get(normId(liteId)) ??
      (Number(prev?.gamelevel) || 2);
    refreshedLevel++;
  }

  // 存档路径：文件里写过就保留（手写优先），否则用 LiteDB 里的那条 action 解析出来的。
  // --refresh-savepaths 时强制用 LiteDB 重取（比如工具里的备份路径改过之后）。
  const spPrev = Array.isArray(prev?.savepaths)
    ? prev.savepaths.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const spSrc = savedPaths.byGameId.get(normId(gameId)) ?? savedPaths.byName.get(name) ?? [];
  const savepaths = spPrev.length > 0 && !REFRESH_SAVEPATHS ? spPrev : spSrc;
  if (spPrev.length > 0 && !REFRESH_SAVEPATHS) keptSavePaths++;
  else if (savepaths.length > 0) filledSavePaths++;

  // 逐游戏"显示 bat 控制台"（三态）：文件里写过就保留（**含显式 null** = 回到跟随全局），
  // 没写过时才从权威库取；两边都没有 → 不写这个键（绝大多数游戏走这条，免得 1369 条塞满 null）。
  // ⚠️ 这个键必须一直留在这里 —— 本脚本是按固定键重建内容表的，删掉它就等于每次生成
  // 都把人工配好的逐游戏值抹掉（且不报错）。见文件头说明。
  const bcPrev =
    prev && Object.prototype.hasOwnProperty.call(prev, "batconsole") ? prev.batconsole : undefined;
  const batconsole = bcPrev !== undefined ? bcPrev : (rt?.batConsole ?? undefined);

  const entry = {
    gameid: gameId || String(prev?.gameid ?? ""),
    name,
    intro,
    // 写文件时统一成手写友好的文本格式（标签 #分隔、地区单值直写）
    region: regionText(region),
    tags: tagsText(tags),
    gamelevel: Number.isFinite(level) ? level : 2,
  };
  // 社区评分只在你填过时才写出这个键（0 / 空 = 没设过）
  if (score > 0) entry.score = score;
  // 存档路径同理：没有路径的游戏不写这个键（免得 1200 多条里塞一堆空数组）
  if (savepaths.length > 0) entry.savepaths = savepaths;
  // 三态覆盖：null 也要写出来（那是"回到跟随全局"的显式标记，见文件头说明）
  if (batconsole !== undefined) entry.batconsole = batconsole;
  out.push(entry);
  seen.add(normId(gameId));
  seen.add(normName(name));
}

// ---- 7. 内容文件里有、但清单里已没有的条目（默认保留并列出）----
const orphans = existing.filter(
  (it) => !seen.has(normId(it.gameid)) && !seen.has(normName(it.name)),
);
if (orphans.length && !DROP_ORPHANS) {
  // 保留的孤儿条目也顺手统一成同样的文本格式，避免文件里混着两种写法
  out.push(
    ...orphans.map((it) => ({
      ...it,
      region: regionText(asArr(it.region)),
      tags: tagsText(asArr(it.tags)),
    })),
  );
}

// ---- 8. 写出 ----
if (DRY) {
  console.log("（DRY-RUN：未写文件）");
} else {
  fs.mkdirSync(path.dirname(CONTENT), { recursive: true });
  fs.writeFileSync(CONTENT, JSON.stringify(out, null, 2), "utf-8");
  console.log(`已写出: ${path.relative(root, CONTENT)}（${out.length} 条）\n`);
}

console.log(`  intro : 保留 ${keptIntro} 条 / 新补 ${filledIntro} 条 / 仍为空 ${out.filter((x) => !x.intro).length} 条`);
console.log(`  region: 保留 ${keptRegion} 条 / 新补 ${filledRegion} 条 / 为空 ${out.filter((x) => !x.region?.length).length} 条`);
console.log(`  tags  : 保留 ${keptTags} 条 / 新补 ${filledTags} 条 / 为空 ${out.filter((x) => !x.tags?.length).length} 条`);
console.log(`  level : 保留 ${keptLevel} 条 / 重算 ${refreshedLevel} 条`);
console.log(
  `  savep.: 保留 ${keptSavePaths} 条 / 新补 ${filledSavePaths} 条 / 为空 ${out.filter((x) => !x.savepaths || x.savepaths.length === 0).length} 条`,
);
console.log(
  `  score : 保留 ${keptScore} 条 / 从库里补 ${filledScore} 条 / 未设置 ${out.filter((x) => !x.score).length} 条（未设置 = 卡片不亮火爆角标）`,
);
console.log(
  `  batcon: 逐游戏覆盖 ${out.filter((x) => x && "batconsole" in x).length} 条 / 其余跟随全局设置（设置界面的开关）`,
);
if (orphans.length) {
  console.log(
    `\n  清单里已没有、但内容文件里保留的条目 ${orphans.length} 个${DROP_ORPHANS ? "（已按 --drop-orphans 删除）" : "（默认保留你的编辑；确认要删加 --drop-orphans）"}：`,
  );
  for (const it of orphans) console.log(`    · ${it.name}`);
}
