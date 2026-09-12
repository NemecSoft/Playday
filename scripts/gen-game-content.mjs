// 生成 / 补齐「游戏内容总表」 data/game-content.json —— 本项目的**人工内容源文件**。
//
// 这个文件的性质（别搞错）：
//   它是**人工维护、长期保留**的数据（简介/地区/标签），不是构建产物，所以放在仓库根
//   的 data/ 里并纳入 git（release/ 下的东西按 .gitignore 是"只放行 library/announcements/
//   config.json"的，放那儿等于随时会丢）。
//   脚本的职责只是**补空缺**：你手写的值永远优先，绝不被覆盖。
//
// 各字段来源（只在"文件里没有/为空"时才去取）：
//   name/gameid ← games.db（LiteDB）导出 release/data/litedb-games.json
//                 （导出命令见 scripts/export-litedb-games.ps1 头部注释）
//   intro       ← 详情页 <gameDetailsDir>/<游戏名>/info.json 的 description
//   region/tags ← 权威库 release/data/Admin/library.db 的同名列（库里是 JSON 数组文本）
//   gamelevel  ← YunGame_Gamelist.json（按 id 匹配，取不到 = 2）
//
// 文件里的书写格式（为手写方便，由本脚本统一写出）：
//   tags   = "#休闲#生存#卡通#烧脑"（# 分隔；空 = ""）
//   region = "国产"（单个值直写；多个才用 # 连成 "国产#日本"；空 = ""）
//
// 覆盖规则（重要）：
//   · intro / region / tags：文件里非空 → **原样保留**；空或缺失 → 用上面的来源补。
//   · gamelevel：默认也**保留**文件里的值；想按游戏列表重算，加 --refresh-level。
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

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const root = process.cwd();
const CONTENT = argOf("--out", path.join(root, "data/game-content.json"));
const GAMES = argOf("--games", path.join(root, "release/data/litedb-games.json"));
const GAMELIST = argOf("--gamelist", "D:/YunGame/PlayNite/YunGameConfig/YunGame_Gamelist.json");
const DETAILS_DIR = argOf("--details", "D:/Addons");
const ADMIN_DB = argOf("--db", path.join(root, "release/data/Admin/library.db"));
const DRY = has("--dry-run");
const REFRESH_LEVEL = has("--refresh-level");
const DROP_ORPHANS = has("--drop-orphans");

console.log("== 生成/补齐 游戏内容总表 ==");
console.log("内容文件:", path.relative(root, CONTENT));
console.log("游戏清单:", GAMES);
console.log("游戏列表:", GAMELIST);
console.log("详情页  :", DETAILS_DIR);
console.log("权威库  :", ADMIN_DB);
console.log("模式    :", DRY ? "DRY-RUN（不写文件）" : "写文件", REFRESH_LEVEL ? "｜重算 gamelevel" : "｜保留已有 gamelevel", "\n");

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
  for (const [gameId, name, region, tags] of db.exec("SELECT game_id, name, region, tags FROM games")[0]
    .values) {
    const rec = { region: parseArrText(region), tags: parseArrText(tags) };
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

  out.push({
    gameid: gameId || String(prev?.gameid ?? ""),
    name,
    intro,
    // 写文件时统一成手写友好的文本格式（标签 #分隔、地区单值直写）
    region: regionText(region),
    tags: tagsText(tags),
    gamelevel: Number.isFinite(level) ? level : 2,
  });
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
if (orphans.length) {
  console.log(
    `\n  清单里已没有、但内容文件里保留的条目 ${orphans.length} 个${DROP_ORPHANS ? "（已按 --drop-orphans 删除）" : "（默认保留你的编辑；确认要删加 --drop-orphans）"}：`,
  );
  for (const it of orphans) console.log(`    · ${it.name}`);
}
